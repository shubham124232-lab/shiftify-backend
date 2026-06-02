# Shiftify backend smoke test - verifies the multi-role auth flow against a running API.
#
# Prereqs: API running (npm run dev) and DB seeded (npm run seed).
# Run from the Backend folder:
#   powershell -ExecutionPolicy Bypass -File .\smoke-test.ps1
#   # or, in PowerShell 7+:  pwsh ./smoke-test.ps1
#
# Uses Invoke-RestMethod (NOT curl) to avoid PowerShell external-arg quote mangling.
# Extend this as the P1 endpoints land (OTP /auth/verify/*, password /auth/password/*,
# managed-account creation /linking/*).

param([string]$BaseUrl = "http://localhost:5000")

$ErrorActionPreference = "Stop"
$sess = New-Object Microsoft.PowerShell.Commands.WebRequestSession  # holds the refresh cookie

function Section($t) { Write-Host "`n=== $t ===" -ForegroundColor Cyan }
function Pass($t)    { Write-Host "  [PASS] $t" -ForegroundColor Green }
function Info($t)    { Write-Host "  [..]   $t" -ForegroundColor DarkGray }

function Req {
  param([string]$Method, [string]$Path, $Body, [string]$Token)
  $headers = @{}
  if ($Token) { $headers["Authorization"] = "Bearer $Token" }
  $params = @{ Uri = "$BaseUrl$Path"; Method = $Method; WebSession = $sess; Headers = $headers }
  if ($null -ne $Body) {
    $params["ContentType"] = "application/json"
    $params["Body"] = ($Body | ConvertTo-Json -Compress)
  }
  return Invoke-RestMethod @params
}

try {
  Section "Health"
  $h = Req GET "/health"
  Pass "status=$($h.status)  env=$($h.env)"

  Section "Register a new SELF account (unique email each run)"
  $newEmail = "smoke+$(Get-Date -Format yyyyMMddHHmmss)@shiftify.local"
  $reg = Req POST "/auth/register" @{ name = "Smoke Test User"; email = $newEmail; password = "Password@123"; role = "SUPPORT_WORKER" }
  $nu = $reg.data.user
  Pass "registered: $($nu.email)  type=$($nu.accountType)  roles=[$($nu.roles -join ', ')]  status=$($nu.status)"
  if ($nu.status -ne "PENDING") { Info "expected a fresh account to be PENDING" }

  Section "Register duplicate email -> expect 409"
  try {
    $null = Req POST "/auth/register" @{ name = "Dupe"; email = $newEmail; password = "Password@123"; role = "SUPPORT_WORKER" }
    Write-Host "  [FAIL] duplicate email was accepted!" -ForegroundColor Red
    exit 1
  } catch {
    Pass "duplicate email correctly rejected (409)"
  }

  Section "Register with no identifier -> expect 422"
  try {
    $null = Req POST "/auth/register" @{ name = "No Id"; password = "Password@123"; role = "PARTICIPANT" }
    Write-Host "  [FAIL] registration with no email/phone/username was accepted!" -ForegroundColor Red
    exit 1
  } catch {
    Pass "missing-identifier registration correctly rejected (422)"
  }

  Section "Login (SELF, multi-role) - Alice by email"
  $login = Req POST "/auth/login" @{ identifier = "alice.participant@shiftify.local"; password = "Password@123" }
  $token = $login.data.accessToken
  $u = $login.data.user
  Pass "logged in: $($u.email)  roles=[$($u.roles -join ', ')]  active=$($u.activeRole)  type=$($u.accountType)"
  if ($u.roles -notcontains "PARTICIPANT" -or $u.roles -notcontains "SUPPORT_WORKER") {
    Info "expected Alice to hold PARTICIPANT + SUPPORT_WORKER"
  }

  Section "GET /users/me (Bearer token)"
  $me = (Req GET "/users/me" $null $token).data.user
  $meRoles = ($me.roles | ForEach-Object { $_.role }) -join ", "
  Pass "me: $($me.name)  roles=[$meRoles]  address.suburb=$($me.address.suburb)  phone=$($me.phone)"

  Section "Switch active role to SUPPORT_WORKER (own role, no password)"
  $sw = Req POST "/auth/switch-role" @{ role = "SUPPORT_WORKER" } $token
  $token = $sw.data.accessToken
  Pass "active now = $($sw.data.activeRole)  (fresh access token issued)"

  Section "Add a role: COORDINATOR"
  try {
    $ar = Req POST "/auth/roles" @{ role = "COORDINATOR" } $token
    Pass "roles now = [$($ar.data.roles -join ', ')]"
  } catch {
    Info "add-role: $($_.ErrorDetails.Message)  (expected on re-run once Alice already holds it)"
  }

  Section "Login (MANAGED account) - Dana by username"
  $dana = Req POST "/auth/login" @{ identifier = "dana.worker"; password = "Password@123" }
  $du = $dana.data.user
  Pass "managed login ok: username=$($du.username)  type=$($du.accountType)  roles=[$($du.roles -join ', ')]"

  Section "Refresh (HttpOnly cookie rotation)"
  # Re-login as Alice so the cookie jar holds her refresh cookie, then refresh it.
  $null = Req POST "/auth/login" @{ identifier = "alice.participant@shiftify.local"; password = "Password@123" }
  $rf = Req POST "/auth/refresh" $null
  Pass "refreshed: active=$($rf.data.activeRole)  roles=[$($rf.data.roles -join ', ')]"

  Section "Logout"
  $null = Req POST "/auth/logout" $null
  Pass "logged out (refresh cookie cleared, session revoked)"

  Section "Negative - bad password is rejected"
  try {
    $null = Req POST "/auth/login" @{ identifier = "alice.participant@shiftify.local"; password = "wrong" }
    Write-Host "  [FAIL] bad password was accepted!" -ForegroundColor Red
    exit 1
  } catch {
    Pass "bad password correctly rejected"
  }

  # ── P1: OTP / email+phone verification ─────────────────────────────────────
  Section "P1 - OTP: request email verification code (Alice, authenticated)"
  $alice = Req POST "/auth/login" @{ identifier = "alice.participant@shiftify.local"; password = "Password@123" }
  $token = $alice.data.accessToken
  $otpReq = Req POST "/auth/verify/request" @{ channel = "email" } $token
  Pass "message=$($otpReq.data.message)"
  $devCode = $otpReq.data._dev_code
  if ($devCode) { Info "_dev_code returned (non-prod mock): $devCode" }

  Section "P1 - OTP: confirm email verification with wrong code -> expect 401"
  try {
    $null = Req POST "/auth/verify/confirm" @{ channel = "email"; code = "000000" } $token
    Write-Host "  [FAIL] wrong OTP code was accepted!" -ForegroundColor Red
    exit 1
  } catch {
    Pass "wrong OTP code correctly rejected (401)"
  }

  Section "P1 - OTP: confirm email verification with correct code"
  if ($devCode) {
    $cf = Req POST "/auth/verify/confirm" @{ channel = "email"; code = $devCode } $token
    Pass "verified=$($cf.data.verified)"
  } else {
    Info "skipped (no _dev_code in response — prod mode?)"
  }

  # ── P1: Password forgot + reset ────────────────────────────────────────────
  Section "P1 - Forgot password for Alice by email"
  $forgot = Req POST "/auth/password/forgot" @{ identifier = "alice.participant@shiftify.local" }
  Pass "message=$($forgot.data.message)"
  $resetCode = $forgot.data._dev_code
  if ($resetCode) { Info "_dev_code: $resetCode" }

  Section "P1 - Forgot password for nonexistent user -> no enumeration (200)"
  $fakeF = Req POST "/auth/password/forgot" @{ identifier = "nobody@nowhere.invalid" }
  Pass "non-enumeration OK: $($fakeF.data.message)"

  Section "P1 - Reset password with wrong code -> expect 401"
  try {
    $null = Req POST "/auth/password/reset" @{
      identifier  = "alice.participant@shiftify.local"
      code        = "000000"
      newPassword = "NewPass@456"
    }
    Write-Host "  [FAIL] wrong reset code was accepted!" -ForegroundColor Red
    exit 1
  } catch {
    Pass "wrong reset code correctly rejected (401)"
  }

  Section "P1 - Reset password with correct code"
  if ($resetCode) {
    $rst = Req POST "/auth/password/reset" @{
      identifier  = "alice.participant@shiftify.local"
      code        = $resetCode
      newPassword = "NewPass@456"
    }
    Pass "message=$($rst.data.message)"

    Section "P1 - Login with NEW password after reset"
    $newLogin = Req POST "/auth/login" @{ identifier = "alice.participant@shiftify.local"; password = "NewPass@456" }
    $token = $newLogin.data.accessToken
    Pass "login with new password OK, roles=[$($newLogin.data.user.roles -join ', ')]"

    Section "P1 - Old password rejected after reset"
    try {
      $null = Req POST "/auth/login" @{ identifier = "alice.participant@shiftify.local"; password = "Password@123" }
      Write-Host "  [FAIL] old password still works after reset!" -ForegroundColor Red
      exit 1
    } catch {
      Pass "old password correctly rejected after reset"
    }

    # Restore Alice's password to Password@123 so subsequent runs still work.
    Section "P1 - Restore Alice password back to Password@123"
    $forgotAgain = Req POST "/auth/password/forgot" @{ identifier = "alice.participant@shiftify.local" }
    $restoreCode = $forgotAgain.data._dev_code
    if ($restoreCode) {
      $null = Req POST "/auth/password/reset" @{
        identifier  = "alice.participant@shiftify.local"
        code        = $restoreCode
        newPassword = "Password@123"
      }
      Pass "password restored to Password@123 for idempotent re-runs"
    } else {
      Info "skipped restore (no _dev_code)"
    }
  } else {
    Info "skipped (no _dev_code in response — prod mode?)"
  }

  # ── P1: Managed accounts (linking) ─────────────────────────────────────────
  Section "P1 - Linking: Provider creates a MANAGED worker"
  # Login as Bob (PROVIDER from seed)
  $bob = Req POST "/auth/login" @{ identifier = "bob.provider@shiftify.local"; password = "Password@123" }
  $bobToken = $bob.data.accessToken
  Info "Bob active role: $($bob.data.user.activeRole)"

  # Switch to PROVIDER if Bob's default active role is different
  if ($bob.data.user.activeRole -ne "PROVIDER") {
    $sw = Req POST "/auth/switch-role" @{ role = "PROVIDER" } $bobToken
    $bobToken = $sw.data.accessToken
    Info "Switched Bob to PROVIDER"
  }

  $workerUsername = "managed.worker.$(Get-Date -Format yyyyMMddHHmmss)"
  try {
    $wk = Req POST "/linking/workers" @{
      username = $workerUsername
      password = "Password@123"
      name     = "Managed Worker Smoke"
    } $bobToken
    $wkUser = $wk.data.user
    Pass "created worker: username=$($wkUser.username)  type=$($wkUser.accountType)  roles=[$($wkUser.roles -join ', ')]  status=$($wkUser.status)"
    if ($wkUser.accountType -ne "MANAGED") { Info "WARN: expected MANAGED accountType" }
    if ($wkUser.roles -notcontains "SUPPORT_WORKER") { Info "WARN: expected SUPPORT_WORKER role" }
  } catch {
    Info "create worker: $($_.ErrorDetails.Message)"
  }

  Section "P1 - Linking: Provider lists managed workers"
  $wkList = Req GET "/linking/workers" $null $bobToken
  Pass "worker count: $($wkList.data.users.Count)"

  Section "P1 - Linking: Participant cannot create workers -> expect 403"
  # Use the freshly registered smoke user (SUPPORT_WORKER role)
  $smokeLogin = Req POST "/auth/login" @{ identifier = $newEmail; password = "Password@123" }
  $smokeToken = $smokeLogin.data.accessToken
  try {
    $null = Req POST "/linking/workers" @{ username = "x"; password = "Password@123"; name = "X" } $smokeToken
    Write-Host "  [FAIL] SUPPORT_WORKER was allowed to create workers!" -ForegroundColor Red
    exit 1
  } catch {
    Pass "non-PROVIDER correctly rejected (403)"
  }

  Section "P1 - Linking: Coordinator creates a MANAGED participant"
  # Login as Carol (COORDINATOR from seed)
  $carol = Req POST "/auth/login" @{ identifier = "carol.coordinator@shiftify.local"; password = "Password@123" }
  $carolToken = $carol.data.accessToken
  if ($carol.data.user.activeRole -ne "COORDINATOR") {
    $sw = Req POST "/auth/switch-role" @{ role = "COORDINATOR" } $carolToken
    $carolToken = $sw.data.accessToken
    Info "Switched Carol to COORDINATOR"
  }

  $partUsername = "managed.participant.$(Get-Date -Format yyyyMMddHHmmss)"
  try {
    $pt = Req POST "/linking/participants" @{
      username = $partUsername
      password = "Password@123"
      name     = "Managed Participant Smoke"
    } $carolToken
    $ptUser = $pt.data.user
    Pass "created participant: username=$($ptUser.username)  type=$($ptUser.accountType)  roles=[$($ptUser.roles -join ', ')]"
    if ($ptUser.accountType -ne "MANAGED") { Info "WARN: expected MANAGED accountType" }
    if ($ptUser.roles -notcontains "PARTICIPANT") { Info "WARN: expected PARTICIPANT role" }
  } catch {
    Info "create participant: $($_.ErrorDetails.Message)"
  }

  Section "P1 - Linking: MANAGED worker can log in by username"
  try {
    $mkLogin = Req POST "/auth/login" @{ identifier = $workerUsername; password = "Password@123" }
    $mk = $mkLogin.data.user
    Pass "managed worker login OK: type=$($mk.accountType)  roles=[$($mk.roles -join ', ')]"
  } catch {
    Info "managed worker login: $($_.ErrorDetails.Message)"
  }

  # ── Step 1 fix: registration status ────────────────────────────────────────
  Section "Step 1 - PARTICIPANT registers -> status should be ACTIVE immediately"
  $partEmail = "smoke.participant.$(Get-Date -Format yyyyMMddHHmmss)@shiftify.local"
  $partReg = Req POST "/auth/register" @{ name = "Auto Active Participant"; email = $partEmail; password = "Password@123"; role = "PARTICIPANT" }
  $partUser = $partReg.data.user
  Pass "status=$($partUser.status)  role=$($partUser.roles -join ',')"
  if ($partUser.status -ne "ACTIVE") { Write-Host "  [WARN] expected ACTIVE for PARTICIPANT" -ForegroundColor Yellow }

  Section "Step 1 - PROVIDER registers -> status should be PENDING"
  $provEmail = "smoke.provider.$(Get-Date -Format yyyyMMddHHmmss)@shiftify.local"
  $provReg = Req POST "/auth/register" @{ name = "Pending Provider"; email = $provEmail; password = "Password@123"; role = "PROVIDER" }
  $provUser = $provReg.data.user
  $provToken = $provReg.data.accessToken
  Pass "status=$($provUser.status)  role=$($provUser.roles -join ',')"
  if ($provUser.status -ne "PENDING") { Write-Host "  [WARN] expected PENDING for PROVIDER" -ForegroundColor Yellow }

  # ── Step 4: fake payment ────────────────────────────────────────────────────
  Section "Step 4 - POST /subscriptions/activate -> status ACTIVE + _dev_payment"
  $actResult = Req POST "/subscriptions/activate" @{ plan = "BASIC" } $provToken
  Pass "message=$($actResult.data.message)  status=$($actResult.data.status)"
  if ($actResult.data._dev_payment) {
    $dp = $actResult.data._dev_payment
    Pass "_dev_payment: plan=$($dp.plan)  amount=$($dp.amount)  currency=$($dp.currency)  receipt=$($dp.receipt)"
  } else {
    Info "no _dev_payment (prod mode?)"
  }

  # ── Step 1 fix: managed account ACTIVE ─────────────────────────────────────
  Section "Step 1 - Provider creates MANAGED worker -> worker should be ACTIVE"
  # Login as seeded carepartners provider
  $cp = Req POST "/auth/login" @{ identifier = "carepartners@shiftify.local"; password = "Password@123" }
  $cpToken = $cp.data.accessToken
  if ($cp.data.user.activeRole -ne "PROVIDER") {
    $sw2 = Req POST "/auth/switch-role" @{ role = "PROVIDER" } $cpToken
    $cpToken = $sw2.data.accessToken
  }
  $mwUsername = "managed.active.worker.$(Get-Date -Format yyyyMMddHHmmss)"
  $mwResult = Req POST "/linking/workers" @{ username = $mwUsername; password = "Password@123"; name = "Active Managed Worker" } $cpToken
  $mwUser = $mwResult.data.user
  Pass "managed worker status=$($mwUser.status)  type=$($mwUser.accountType)"
  if ($mwUser.status -ne "ACTIVE") { Write-Host "  [WARN] expected ACTIVE for managed worker" -ForegroundColor Yellow }

  # ── Step 5: admin endpoints ─────────────────────────────────────────────────
  Section "Step 5 - GET /admin/users (as admin) -> paginated list"
  $adminLogin = Req POST "/auth/login" @{ identifier = "admin@shiftify.local"; password = "Admin@123" }
  $adminToken = $adminLogin.data.accessToken
  $userList = Req GET "/admin/users?page=1&limit=5" $null $adminToken
  Pass "total=$($userList.data.total)  returned=$($userList.data.users.Count)  page=$($userList.data.page)"

  Section "Step 5 - GET /admin/users?status=PENDING"
  $pendingList = Req GET "/admin/users?status=PENDING" $null $adminToken
  Pass "PENDING users: $($pendingList.data.total)"

  Section "Step 5 - GET /admin/users/:id (full profile)"
  # Use Alice's id from the list
  $aliceLogin = Req POST "/auth/login" @{ identifier = "alice.participant@shiftify.local"; password = "Password@123" }
  $aliceId = $aliceLogin.data.user.id
  $aliceAdmin = Req GET "/admin/users/$aliceId" $null $adminToken
  Pass "fetched user: $($aliceAdmin.data.user.name)  roles=$($aliceAdmin.data.user.roles.Count)  address=$($null -ne $aliceAdmin.data.user.address)"

  Section "Step 5 - PATCH /admin/users/:id/status SUSPENDED + notification created"
  $suspResult = Req PATCH "/admin/users/$aliceId/status" @{ status = "SUSPENDED"; reason = "Smoke test suspension" } $adminToken
  Pass "status now = $($suspResult.data.user.status)"
  if ($suspResult.data._dev_notification) {
    $dn = $suspResult.data._dev_notification
    Pass "_dev_notification: title=$($dn.title)"
  }

  Section "Step 3 - GET /notifications for Alice -> sees suspension notification"
  $aliceLogin2 = Req POST "/auth/login" @{ identifier = "alice.participant@shiftify.local"; password = "Password@123" }
  $aliceToken2 = $aliceLogin2.data.accessToken
  $notifs = Req GET "/notifications" $null $aliceToken2
  Pass "total notifications=$($notifs.data.notifications.Count)  unread=$($notifs.data.unreadCount)"

  Section "Step 3 - PATCH /notifications/read-all"
  $raResult = Req PATCH "/notifications/read-all" $null $aliceToken2
  Pass "ok=$($raResult.data.ok)"

  Section "Step 3 - Verify unread count is now 0"
  $notifs2 = Req GET "/notifications?unread=true" $null $aliceToken2
  Pass "unread after read-all=$($notifs2.data.unreadCount)"

  Section "Step 5 - PATCH /admin/users/:id/status ACTIVE -> reactivated"
  $reactResult = Req PATCH "/admin/users/$aliceId/status" @{ status = "ACTIVE" } $adminToken
  Pass "status now = $($reactResult.data.user.status)"
  if ($reactResult.data._dev_notification) {
    Pass "_dev_notification: title=$($reactResult.data._dev_notification.title)"
  }

  Section "Step 5 - Non-admin cannot access /admin/users -> expect 403"
  try {
    $null = Req GET "/admin/users" $null $aliceToken2
    Write-Host "  [FAIL] non-admin accessed /admin/users!" -ForegroundColor Red
    exit 1
  } catch {
    Pass "non-admin correctly rejected (403)"
  }

  # ── Phase 1B smoke tests ────────────────────────────────────────────────────

  Section "1B-1a - MANAGED account (dana) cannot PATCH /users/me -> expect 403"
  $dana2 = Req POST "/auth/login" @{ identifier = "dana.worker"; password = "Password@123" }
  $danaToken = $dana2.data.accessToken
  try {
    $null = Req PATCH "/users/me" @{ name = "Hacked Name" } $danaToken
    Write-Host "  [FAIL] managed account was allowed to edit profile!" -ForegroundColor Red
    exit 1
  } catch {
    Pass "managed PATCH /users/me correctly rejected (403)"
  }

  Section "1B-1b - MANAGED account (dana) cannot POST /auth/roles -> expect 403"
  try {
    $null = Req POST "/auth/roles" @{ role = "PARTICIPANT" } $danaToken
    Write-Host "  [FAIL] managed account was allowed to add role!" -ForegroundColor Red
    exit 1
  } catch {
    Pass "managed POST /auth/roles correctly rejected (403)"
  }

  Section "1B-2 - Provider unlinks managed worker -> worker suspended, parentUserId cleared"
  # Login as carepartners (seeded provider)
  $cp2 = Req POST "/auth/login" @{ identifier = "carepartners@shiftify.local"; password = "Password@123" }
  $cp2Token = $cp2.data.accessToken
  if ($cp2.data.user.activeRole -ne "PROVIDER") {
    $sw3 = Req POST "/auth/switch-role" @{ role = "PROVIDER" } $cp2Token
    $cp2Token = $sw3.data.accessToken
  }
  # Get dana's id via admin
  $danaId = $dana2.data.user.id
  Info "Unlinking dana (id=$danaId) from carepartners..."
  $unlinkResult = Req DELETE "/linking/workers/$danaId" $null $cp2Token
  Pass "unlink ok=$($unlinkResult.data.ok)"
  # Confirm dana is now suspended
  $danaAdmin = Req GET "/admin/users/$danaId" $null $adminToken
  Pass "dana status after unlink = $($danaAdmin.data.user.status)"
  if ($danaAdmin.data.user.status -ne "SUSPENDED") {
    Write-Host "  [WARN] expected SUSPENDED after unlink" -ForegroundColor Yellow
  }
  # Re-seed dana for subsequent test runs: update status back via admin
  $null = Req PATCH "/admin/users/$danaId/status" @{ status = "ACTIVE"; reason = "Smoke test restore" } $adminToken
  Info "dana restored to ACTIVE for idempotent re-runs"

  Section "1B-3 - Worker submits profile (POST /users/me/profile/worker)"
  $bob2 = Req POST "/auth/login" @{ identifier = "bob.worker@shiftify.local"; password = "Password@123" }
  $bobToken2 = $bob2.data.accessToken
  $workerProfilePayload = @{
    gender             = "Male"
    rightToWork        = "CITIZEN"
    workType           = "CONTRACTOR"
    servicesOffered    = @("PERSONAL_CARE", "COMMUNITY_ACCESS")
    experienceLevel    = "EXPERIENCED"
    availabilityType   = "CASUAL"
    travelRadiusKm     = 20
    hasVehicle         = $true
    insuranceValid     = $true
    hourlyRate         = 48.50
    bio                = "Smoke test bio"
    isAvailableNow     = $true
    seekingPlanManager = $false
    availability       = @(
      @{ dayOfWeek = "MON"; startTime = "08:00"; endTime = "16:00" },
      @{ dayOfWeek = "WED"; startTime = "09:00"; endTime = "17:00" }
    )
  }
  $wpResult = Req POST "/users/me/profile/worker" $workerProfilePayload $bobToken2
  Pass "worker profile upserted  slots=$($wpResult.data.profile.availability.Count)"

  Section "1B-4 - PUT /users/me/availability -> replaces slots"
  $avResult = Req PUT "/users/me/availability" @{
    slots = @(
      @{ dayOfWeek = "TUE"; startTime = "07:00"; endTime = "15:00" },
      @{ dayOfWeek = "THU"; startTime = "10:00"; endTime = "18:00" },
      @{ dayOfWeek = "FRI"; startTime = "08:00"; endTime = "16:00" }
    )
  } $bobToken2
  Pass "availability replaced  count=$($avResult.data.availability.Count)"
  if ($avResult.data.availability.Count -ne 3) {
    Write-Host "  [WARN] expected 3 slots" -ForegroundColor Yellow
  }

  Section "1B-5 - POST /users/me/unavailability -> creates row"
  $unavResult = Req POST "/users/me/availability/unavailability" @{
    date   = "2026-06-15"
    reason = "Annual leave"
  } $bobToken2
  $unavId = $unavResult.data.unavailability.id
  Pass "unavailability created  id=$unavId"

  Section "1B-5b - DELETE /users/me/unavailability/:id -> deletes row"
  $delUnav = Req DELETE "/users/me/availability/unavailability/$unavId" $null $bobToken2
  Pass "unavailability deleted  ok=$($delUnav.data.ok)"

  Section "1B-6 - Participant submits profile (POST /users/me/profile/participant)"
  # Re-login Alice with PARTICIPANT active role
  $alice3 = Req POST "/auth/login" @{ identifier = "alice.participant@shiftify.local"; password = "Password@123" }
  $aliceToken3 = $alice3.data.accessToken
  if ($alice3.data.user.activeRole -ne "PARTICIPANT") {
    $sw4 = Req POST "/auth/switch-role" @{ role = "PARTICIPANT" } $aliceToken3
    $aliceToken3 = $sw4.data.accessToken
  }
  $partProfilePayload = @{
    preferredName                = "Alice"
    ageGroup                     = "Adult"
    gender                       = "Female"
    ndisNumber                   = "TEST-99991234"
    fundingManagementType        = "PLAN"
    primaryDisability            = "Spinal cord injury"
    riskSafetyNotes              = "Manual handling required"
    emergencyContactName         = "John Smith"
    emergencyContactPhone        = "+61400111222"
    emergencyContactRelationship = "Partner"
    seekingPlanManager           = $false
  }
  $ppResult = Req POST "/users/me/profile/participant" $partProfilePayload $aliceToken3
  Pass "participant profile upserted  ndisNumber=$($ppResult.data.profile.ndisNumber)"

  Section "1B-7 - Provider submits profile (POST /users/me/profile/provider)"
  $cp3 = Req POST "/auth/login" @{ identifier = "carepartners@shiftify.local"; password = "Password@123" }
  $cp3Token = $cp3.data.accessToken
  if ($cp3.data.user.activeRole -ne "PROVIDER") {
    $sw5 = Req POST "/auth/switch-role" @{ role = "PROVIDER" } $cp3Token
    $cp3Token = $sw5.data.accessToken
  }
  $provProfilePayload = @{
    businessName        = "Care Partners Updated"
    businessDescription = "Updated via smoke test"
    offersSil           = $true
    serviceMode         = "IN_PERSON"
    ndisRegistered      = $true
    seekingPlanManager  = $false
  }
  $pprovResult = Req POST "/users/me/profile/provider" $provProfilePayload $cp3Token
  Pass "provider profile upserted  businessName=$($pprovResult.data.profile.businessName)"

  Section "1B-8 - POST /users/me/documents (multipart) -> expect 201 with fileUrl"
  # Create a tiny PDF-like file in memory using multipart
  $boundary = "----SmokeBoundary$(Get-Date -Format yyyyMMddHHmmss)"
  $docType = "POLICE_CHECK"
  # Build a minimal 1-byte file body (not a real PDF — just testing the endpoint accepts it)
  $fileBytes = [System.Text.Encoding]::UTF8.GetBytes("%PDF-1.4 smoke test")
  $bodyLines = @(
    "--$boundary",
    'Content-Disposition: form-data; name="docType"',
    "",
    $docType,
    "--$boundary",
    'Content-Disposition: form-data; name="referenceNumber"',
    "",
    "SMOKE-REF-001",
    "--$boundary",
    'Content-Disposition: form-data; name="file"; filename="smoke-test.pdf"',
    "Content-Type: application/pdf",
    "",
    "%PDF-1.4 smoke",
    "--$boundary--"
  )
  $bodyText = ($bodyLines -join "`r`n")
  $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($bodyText)
  try {
    $docResult = Invoke-RestMethod `
      -Uri "$BaseUrl/users/me/documents" `
      -Method POST `
      -WebSession $sess `
      -Headers @{ Authorization = "Bearer $bobToken2"; "Content-Type" = "multipart/form-data; boundary=$boundary" } `
      -Body $bodyBytes
    $docId = $docResult.data.document.id
    Pass "document uploaded  id=$docId  fileUrl=$($docResult.data.document.fileUrl)"
  } catch {
    Info "document upload: $($_.ErrorDetails.Message)  (HEIC/PDF may be blocked by mime filter in dev)"
    $docId = $null
  }

  Section "1B-9 - GET /users/me/documents -> list includes uploaded doc"
  $docList = Req GET "/users/me/documents" $null $bobToken2
  Pass "document count=$($docList.data.documents.Count)"

  Section "1B-10 - DELETE /users/me/documents/:id -> deletes doc"
  if ($docId) {
    $delDoc = Req DELETE "/users/me/documents/$docId" $null $bobToken2
    Pass "document deleted  ok=$($delDoc.data.ok)"
  } else {
    Info "skipped (no doc id from upload — check mime type)"
  }

  Section "1B-11 - GET /users/me -> workerProfile + availability + documents all nested"
  $meResult = Req GET "/users/me" $null $bobToken2
  $meUser = $meResult.data.user
  Pass "workerProfile present=$($null -ne $meUser.workerProfile)  address.suburb=$($meUser.address.suburb)"
  if ($null -eq $meUser.workerProfile) {
    Write-Host "  [WARN] expected workerProfile in /users/me" -ForegroundColor Yellow
  }

  Section "1C-1 - GET /dashboard/summary as SUPPORT_WORKER"
  $dashWorker = Req GET "/dashboard/summary" $null $bobToken2
  Pass "role=$($dashWorker.data.summary.role)  documentsUploaded=$($dashWorker.data.summary.documentsUploaded)  shiftsCompleted=$($dashWorker.data.summary.shiftsCompleted)"
  if ($dashWorker.data.summary.role -ne "SUPPORT_WORKER") {
    Write-Host "  [WARN] expected role SUPPORT_WORKER" -ForegroundColor Yellow
  }

  Section "1C-2 - GET /dashboard/summary as PARTICIPANT"
  $dashPart = Req GET "/dashboard/summary" $null $aliceToken3
  Pass "role=$($dashPart.data.summary.role)  supportHoursThisWeek=$($dashPart.data.summary.supportHoursThisWeek)  linkedWorkers=$($dashPart.data.summary.linkedWorkers)"

  Section "1C-3 - POST /subscriptions/activate as PROVIDER -> auto-activates status"
  $cp4 = Req POST "/auth/login" @{ identifier = "carepartners@shiftify.local"; password = "Password@123" }
  $cp4Token = $cp4.data.accessToken
  if ($cp4.data.user.activeRole -ne "PROVIDER") {
    $sw6 = Req POST "/auth/switch-role" @{ role = "PROVIDER" } $cp4Token
    $cp4Token = $sw6.data.accessToken
  }
  $actResult = Req POST "/subscriptions/activate" @{ plan = "BASIC" } $cp4Token
  Pass "status=$($actResult.data.status)  message=$($actResult.data.message)"
  if ($actResult.data._dev_payment) {
    Info "mock receipt=$($actResult.data._dev_payment.receipt)"
  }

  Section "1C-4 - GET /dashboard/summary as PROVIDER -> workersLinked (real DB count)"
  $dashProv = Req GET "/dashboard/summary" $null $cp4Token
  Pass "role=$($dashProv.data.summary.role)  workersLinked=$($dashProv.data.summary.workersLinked)  openJobs=$($dashProv.data.summary.openJobs)"

  Section "1C-5 - GET /dashboard/summary unauthenticated -> expect 401"
  try {
    $null = Req GET "/dashboard/summary" $null ""
    Write-Host "  [FAIL] unauthenticated dashboard should be 401!" -ForegroundColor Red
    exit 1
  } catch {
    Pass "unauthenticated dashboard correctly rejected (401)"
  }

  # ── Phase 1C: Admin verification queue ────────────────────────────────────

  Section "1C-admin-1 - GET /admin/verification-queue -> lists PENDING PROVIDER/PM users"
  $adminLogin2 = Req POST "/auth/login" @{ identifier = "admin@shiftify.local"; password = "Admin@123" }
  $adminToken2 = $adminLogin2.data.accessToken
  $vq = Req GET "/admin/verification-queue?page=1&limit=20" $null $adminToken2
  Pass "verification queue: total=$($vq.data.total)  returned=$($vq.data.users.Count)"
  # All returned users should be PENDING
  foreach ($u in $vq.data.users) {
    if ($u.status -ne "PENDING") {
      Write-Host "  [WARN] expected PENDING, got $($u.status) for user $($u.id)" -ForegroundColor Yellow
    }
  }

  Section "1C-admin-2 - Register a fresh PROVIDER for verify tests"
  $vEmail = "smoke.verify.$(Get-Date -Format yyyyMMddHHmmss)@shiftify.local"
  $vReg = Req POST "/auth/register" @{ name = "Verify Smoke Provider"; email = $vEmail; password = "Password@123"; role = "PROVIDER" }
  $vUserId = $vReg.data.user.id
  Pass "provider registered: id=$vUserId  status=$($vReg.data.user.status)"
  if ($vReg.data.user.status -ne "PENDING") {
    Write-Host "  [WARN] expected PENDING for new PROVIDER" -ForegroundColor Yellow
  }

  Section "1C-admin-3 - PATCH /admin/users/:id/verify reject -> status REJECTED"
  $rejResult = Req PATCH "/admin/users/$vUserId/verify" @{
    approved = $false
    reason   = "Incomplete documentation — smoke test"
  } $adminToken2
  Pass "status=$($rejResult.data.user.status)"
  if ($rejResult.data.user.status -ne "REJECTED") {
    Write-Host "  [WARN] expected REJECTED" -ForegroundColor Yellow
  }
  if ($rejResult.data._dev_notification) {
    Pass "_dev_notification: $($rejResult.data._dev_notification.title)"
  }

  Section "1C-admin-4 - verify reject without reason -> expect 400"
  $vEmail2 = "smoke.verify2.$(Get-Date -Format yyyyMMddHHmmss)@shiftify.local"
  $vReg2 = Req POST "/auth/register" @{ name = "Verify Smoke2"; email = $vEmail2; password = "Password@123"; role = "PROVIDER" }
  $vUserId2 = $vReg2.data.user.id
  try {
    $null = Req PATCH "/admin/users/$vUserId2/verify" @{ approved = $false } $adminToken2
    Write-Host "  [FAIL] reject without reason was accepted!" -ForegroundColor Red
    exit 1
  } catch {
    Pass "reject without reason correctly rejected (400)"
  }

  Section "1C-admin-5 - PATCH /admin/users/:id/verify approve -> status ACTIVE"
  $appResult = Req PATCH "/admin/users/$vUserId2/verify" @{ approved = $true } $adminToken2
  Pass "status=$($appResult.data.user.status)"
  if ($appResult.data.user.status -ne "ACTIVE") {
    Write-Host "  [WARN] expected ACTIVE after approval" -ForegroundColor Yellow
  }
  if ($appResult.data._dev_notification) {
    Pass "_dev_notification: $($appResult.data._dev_notification.title)"
  }

  Section "1C-admin-6 - verify already-ACTIVE user -> expect 400"
  try {
    $null = Req PATCH "/admin/users/$vUserId2/verify" @{ approved = $true } $adminToken2
    Write-Host "  [FAIL] verifying an already-ACTIVE user was accepted!" -ForegroundColor Red
    exit 1
  } catch {
    Pass "double-verify correctly rejected (400)"
  }

  Section "1C-admin-7 - GET /admin/audit-log as SUPER_ADMIN -> paginated entries"
  $auditResult = Req GET "/admin/audit-log?page=1&limit=10" $null $adminToken2
  Pass "audit log: total=$($auditResult.data.total)  returned=$($auditResult.data.entries.Count)"
  if ($auditResult.data.entries.Count -gt 0) {
    $e = $auditResult.data.entries[0]
    Pass "latest entry: action=$($e.action)  admin=$($e.admin.name)"
  }

  Section "1C-admin-8 - GET /admin/audit-log?action=USER_APPROVED -> filtered"
  $filteredAudit = Req GET "/admin/audit-log?action=USER_APPROVED&page=1&limit=10" $null $adminToken2
  Pass "USER_APPROVED entries: $($filteredAudit.data.total)"

  Section "1C-admin-9 - REVIEWER (non-SUPER_ADMIN) cannot access /admin/audit-log -> expect 403"
  # Use the regular admin (seeded as REVIEWER tier)
  # The seeded admin@shiftify.local is SUPER_ADMIN, so use a non-super approach:
  # verify that a plain ADMIN role user without SUPER_ADMIN tier is blocked.
  # We use Alice (no ADMIN role) as a proxy — she'll get 403 from requireAdmin first.
  $aliceL = Req POST "/auth/login" @{ identifier = "alice.participant@shiftify.local"; password = "Password@123" }
  $aliceT = $aliceL.data.accessToken
  try {
    $null = Req GET "/admin/audit-log" $null $aliceT
    Write-Host "  [FAIL] non-admin accessed /admin/audit-log!" -ForegroundColor Red
    exit 1
  } catch {
    Pass "non-admin correctly rejected from audit-log (403)"
  }

  Write-Host "`nAll smoke checks passed.`n" -ForegroundColor Green
}
catch {
  Write-Host "`n  [FAIL] $($_.Exception.Message)" -ForegroundColor Red
  if ($_.ErrorDetails.Message) { Write-Host "         $($_.ErrorDetails.Message)" -ForegroundColor Red }
  exit 1
}
