/* eslint-disable no-console */
// Shiftify API smoke suite — hits a RUNNING server (dev/test DB only!).
//
//   npm run smoke                      # all sections
//   npm run smoke -- --only=jobs,auth  # selected sections
//   SMOKE_BASE_URL=http://host:5000 npm run smoke
//
// Sections: health, auth, roles, profile, dashboard, jobs, counters,
//           notifications, subscriptions, listings, gates
//
// Creates throwaway users (…@smoke.test) and jobs titled "[SMOKE] …".
// Never point this at production.

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:5000";
const ONLY = (process.argv.find((a) => a.startsWith("--only="))?.split("=")[1] ?? "")
  .split(",").map((s) => s.trim()).filter(Boolean);

const SUF = String(Math.floor(100000 + Math.random() * 900000));
const PASSWORD = "Passw0rd!23";

let passCount = 0;
let failCount = 0;

function report(ok: boolean, name: string, extra = ""): boolean {
  if (ok) { passCount++; console.log(`PASS | ${name}`); }
  else    { failCount++; console.log(`FAIL | ${name} | ${extra}`); }
  return ok;
}

interface Res { status: number; body: any }

async function req(method: string, path: string, body?: unknown, token?: string): Promise<Res> {
  try {
    const r = await fetch(BASE + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await r.text();
    let parsed: any = {};
    try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = { raw: text }; }
    return { status: r.status, body: parsed };
  } catch (err) {
    return { status: 0, body: { error: String(err) } };
  }
}

const data = (r: Res) => r.body?.data ?? r.body;
const errCode = (r: Res) => r.body?.error?.code;

// ─── Actors ───────────────────────────────────────────────────────────────────

interface Actor { token: string; id?: string; email: string; phone: string; devCode?: string }
const actors: Record<string, Actor> = {};

async function register(role: string, tag: string): Promise<Actor | null> {
  const email = `${tag}${SUF}@smoke.test`;
  const phone = `+6140${Math.floor(1000000 + Math.random() * 8999999)}`;
  const r = await req("POST", "/auth/register", { email, phone, password: PASSWORD, name: `Smoke ${tag}`, role });
  if (!report(r.status === 201, `register ${tag} (${role})`, JSON.stringify(r.body).slice(0, 200))) return null;
  const d = data(r);
  return {
    token: d.accessToken ?? d.tokens?.accessToken,
    id: d.user?.id,
    email, phone,
    devCode: String(d._dev_code ?? d._dev?.code ?? ""),
  };
}

async function verifyPhone(a: Actor, tag: string): Promise<void> {
  const r = await req("POST", "/auth/verify/confirm", { channel: "phone", code: a.devCode }, a.token);
  report(r.status === 200, `verify phone ${tag}`, JSON.stringify(r.body).slice(0, 150));
}

async function activate(a: Actor, tag: string, planKey?: string, role?: string): Promise<void> {
  let planId: string | undefined;
  if (planKey && role) {
    const r = await req("GET", `/subscriptions/plans?role=${role}`, undefined, a.token);
    const plans = Array.isArray(data(r)) ? data(r) : data(r).plans ?? [];
    planId = plans.find((p: any) => p.key === planKey)?.id;
  }
  const r = await req("POST", "/subscriptions/activate", planId ? { planId } : {}, a.token);
  report(r.status === 200, `activate ${tag}${planKey ? ` (${planKey})` : ""}`, JSON.stringify(r.body).slice(0, 150));
}

async function workerProfile(a: Actor, tag: string): Promise<void> {
  await req("PATCH", "/users/me", { defaultSuburb: "Parramatta", defaultState: "NSW" }, a.token);
  const r = await req("POST", "/users/me/profile/worker",
    { rightToWork: "CITIZEN", servicesOffered: ["PERSONAL_CARE"], experienceLevel: "EXPERIENCED", suburb: "Parramatta", serviceAreas: ["Parramatta"] }, a.token);
  report(r.status === 200, `worker profile ${tag}`, JSON.stringify(r.body).slice(0, 150));
}

// Mirrors Backend/src/middleware/marketplace.middleware.ts REQUIRED_DOCS_BY_ROLE.
// The doc-submission gate blocks canApply/canPost until these exist, so any
// actor exercising apply/post must submit them first — otherwise every job
// application in this suite fails on missing docs before it ever reaches the
// gate the test actually means to check (subscription, limits, etc).
const REQUIRED_DOCS: Record<string, string[]> = {
  SUPPORT_WORKER: [
    "POLICE_CHECK", "NDIS_SCREENING", "FIRST_AID", "CPR", "MANUAL_HANDLING",
    "DRIVERS_LICENCE", "PUBLIC_LIABILITY_INSURANCE", "PERSONAL_ACCIDENT_INSURANCE",
    "QUALIFICATION_CERTIFICATE",
  ],
  COORDINATOR: [
    "POLICE_CHECK", "PROFESSIONAL_INDEMNITY", "PUBLIC_LIABILITY_INSURANCE",
    "QUALIFICATION_CERTIFICATE",
  ],
  PROVIDER: ["PUBLIC_LIABILITY_INSURANCE", "PROFESSIONAL_INDEMNITY", "NDIS_AUDIT"],
  PLAN_MANAGER: [
    "ABN_CONFIRMATION", "NDIS_REGISTRATION_PROOF", "BUSINESS_REP_PROOF",
    "BUSINESS_ADDRESS_EVIDENCE", "CONTACT_IDENTITY_EVIDENCE", "BANK_FINANCE_EVIDENCE",
  ],
};

async function submitRequiredDocs(a: Actor, role: string, tag: string): Promise<void> {
  const docTypes = REQUIRED_DOCS[role];
  if (!docTypes) return;
  let allOk = true;
  for (const docType of docTypes) {
    const form = new FormData();
    form.append("docType", docType);
    form.append("file", new Blob([`smoke test document — ${docType}`], { type: "application/pdf" }), `${docType}.pdf`);
    const r = await fetch(BASE + "/users/me/documents", {
      method: "POST",
      headers: { Authorization: `Bearer ${a.token}` },
      body: form,
    });
    if (r.status !== 201) allOk = false;
  }
  report(allOk, `submit required docs (${tag})`, `types=${docTypes.length}`);
}

async function ensureParticipant(): Promise<Actor> {
  if (actors.participant) return actors.participant;
  const a = (await register("PARTICIPANT", "part"))!;
  await verifyPhone(a, "participant");
  await req("PATCH", "/users/me", { defaultSuburb: "Parramatta", defaultState: "NSW" }, a.token);
  await activate(a, "participant");
  actors.participant = a;
  return a;
}

async function ensureWorker(): Promise<Actor> {
  if (actors.worker) return actors.worker;
  const a = (await register("SUPPORT_WORKER", "work"))!;
  await verifyPhone(a, "worker");
  await workerProfile(a, "worker");
  await submitRequiredDocs(a, "SUPPORT_WORKER", "worker");
  await activate(a, "worker", "WORKER_BASIC", "SUPPORT_WORKER");
  actors.worker = a;
  return a;
}

function jobBody(title: string) {
  const start = new Date(Date.now() + 24 * 3600 * 1000);
  const end = new Date(Date.now() + 25 * 3600 * 1000);
  return {
    title: `[SMOKE] ${title}`, description: "Automated smoke test job — safe to delete.",
    category: "PERSONAL_CARE", urgency: "SCHEDULED",
    suburb: "Parramatta", state: "NSW", postcode: "2150",
    scheduledStartAt: start.toISOString(), scheduledEndAt: end.toISOString(),
    totalHours: 1, budgetType: "FIXED_HOURLY", budgetPerHour: 55.5,
    visibilityTarget: "ALL", asDraft: false,
  };
}

// ─── Sections ────────────────────────────────────────────────────────────────

const sections: Record<string, () => Promise<void>> = {

  async health() {
    const r = await req("GET", "/health");
    report(r.status === 200 && r.body?.status === "ok", "health endpoint", JSON.stringify(r.body).slice(0, 100));
  },

  async auth() {
    const a = await register("PARTICIPANT", "auth");
    if (!a) return;
    await verifyPhone(a, "auth-user");

    // login (handles both direct-token and OTP flows)
    let r = await req("POST", "/auth/login", { identifier: a.email, password: PASSWORD });
    let d = data(r);
    if (d.pendingToken) {
      const code = String(d._dev_code ?? d._dev?.code ?? "");
      r = await req("POST", "/auth/login/verify", { pendingToken: d.pendingToken, code });
      d = data(r);
    }
    const loginTok: string | undefined = d.accessToken ?? d.tokens?.accessToken;
    report(!!loginTok, "login returns access token", JSON.stringify(r.body).slice(0, 200));

    if (loginTok) {
      r = await req("GET", "/users/me", undefined, loginTok);
      report(r.status === 200 && !!data(r).user, "GET /users/me after login", JSON.stringify(r.body).slice(0, 150));
    }

    r = await req("POST", "/auth/password/forgot", { identifier: a.email });
    report(r.status === 200, "forgot password (no-enum)", JSON.stringify(r.body).slice(0, 120));

    r = await req("GET", `/auth/check-username?username=smoke_${SUF}`);
    report(r.status === 200, "check-username", JSON.stringify(r.body).slice(0, 120));

    actors.authUser = a;
  },

  async roles() {
    const a = actors.authUser ?? (await register("PARTICIPANT", "role"))!;
    let r = await req("POST", "/auth/roles", { role: "SUPPORT_WORKER" }, a.token);
    report(r.status === 200 || r.status === 201, "add second role (SUPPORT_WORKER)", JSON.stringify(r.body).slice(0, 150));

    r = await req("POST", "/auth/switch-role", { role: "SUPPORT_WORKER" }, a.token);
    const d = data(r);
    const newTok = d.accessToken ?? d.tokens?.accessToken;
    report(r.status === 200 && !!newTok, "switch role re-mints token", JSON.stringify(r.body).slice(0, 150));

    if (newTok) {
      // activeRole is carried in the JWT, not on /users/me — decode the payload.
      const payload = JSON.parse(Buffer.from(newTok.split(".")[1], "base64url").toString());
      report(payload.activeRole === "SUPPORT_WORKER", "activeRole switched (JWT claim)", `activeRole=${payload.activeRole}`);
    }
  },

  async profile() {
    const w = await ensureWorker();
    let r = await req("POST", "/users/me/profile/worker", { bio: "Updated by smoke suite", hourlyRate: 52 }, w.token);
    report(r.status === 200, "profile update (worker bio/rate)", JSON.stringify(r.body).slice(0, 150));

    r = await req("GET", "/users/me/profile/worker", undefined, w.token);
    const prof = data(r).profile ?? data(r);
    report(r.status === 200 && prof?.bio === "Updated by smoke suite", "profile GET reflects update", JSON.stringify(prof).slice(0, 150));

    r = await req("GET", "/users/me/profile/progress", undefined, w.token);
    report(r.status === 200, "profile progress endpoint", JSON.stringify(r.body).slice(0, 120));

    r = await req("PATCH", "/users/me", { name: "Smoke Worker Renamed" }, w.token);
    report(r.status === 200, "PATCH /users/me (name)", JSON.stringify(r.body).slice(0, 120));
  },

  async dashboard() {
    const p = await ensureParticipant();
    const w = await ensureWorker();
    for (const [tag, a] of [["participant", p], ["worker", w]] as const) {
      const r = await req("GET", "/dashboard/summary", undefined, a.token);
      const s = data(r).summary ?? data(r);
      report(r.status === 200 && !!s.role && !!s.stats, `dashboard summary (${tag})`, `role=${s.role} keys=${Object.keys(s).length}`);
    }
  },

  async jobs() {
    const p = await ensureParticipant();
    const w = await ensureWorker();

    let r = await req("POST", "/jobs", jobBody("Lifecycle"), p.token);
    if (!report(r.status === 201, "post job", JSON.stringify(r.body).slice(0, 200))) return;
    const jid = (data(r).job ?? data(r)).id;

    r = await req("GET", `/jobs/${jid}`, undefined, p.token);
    const jd = data(r).job ?? data(r);
    report(String(jd.budgetPerHour).startsWith("55.5"), "budget persisted", `budgetPerHour=${jd.budgetPerHour}`);

    r = await req("GET", "/jobs?suburb=Parramatta&limit=50", undefined, w.token);
    const found = (data(r).jobs ?? []).some((x: any) => x.id === jid);
    report(r.status === 200 && found, "job visible on load board", `found=${found}`);

    r = await req("POST", `/jobs/${jid}/apply`,
      { note: "smoke", availabilityType: "YES_EXACT", rateResponse: "ACCEPT", introduction: "Smoke suite application.", applicationData: { documentsConfirmed: true } }, w.token);
    report(r.status === 201 || r.status === 200, "worker applies (structured)", JSON.stringify(r.body).slice(0, 200));

    r = await req("GET", `/jobs/${jid}`, undefined, p.token);
    const apps = (data(r).job ?? data(r)).applications ?? [];
    const appId = apps[0]?.id;
    report(!!appId && apps[0]?.rateResponse === "ACCEPT", "application embedded + structured", JSON.stringify(apps).slice(0, 150));
    if (!appId) return;

    for (const [name, method, path, tok, want] of [
      ["shortlist", "PATCH", `/jobs/${jid}/applications/${appId}/shortlist`, p.token, 200],
      ["select → ASSIGNED", "PATCH", `/jobs/${jid}/applications/${appId}/select`, p.token, 200],
      ["start", "PATCH", `/jobs/${jid}/start`, w.token, 200],
      ["complete", "PATCH", `/jobs/${jid}/complete`, w.token, 200],
      ["confirm", "PATCH", `/jobs/${jid}/confirm`, p.token, 200],
    ] as const) {
      const rr = await req(method, path, {}, tok);
      report(rr.status === want, name, JSON.stringify(rr.body).slice(0, 200));
    }

    r = await req("GET", `/jobs/${jid}`, undefined, p.token);
    const st = (data(r).job ?? data(r)).status;
    report(st === "CONFIRMED", "final status CONFIRMED", `status=${st}`);

    // messages on a fresh open job
    r = await req("POST", "/jobs", jobBody("Messages"), p.token);
    const mjid = (data(r).job ?? data(r)).id;
    await req("POST", `/jobs/${mjid}/apply`, { note: "msg test" }, w.token);
    r = await req("POST", `/jobs/${mjid}/messages`, { body: "Hello from smoke suite" }, w.token);
    report(r.status === 201 || r.status === 200, "send job message", JSON.stringify(r.body).slice(0, 150));
    r = await req("GET", `/jobs/${mjid}/messages`, undefined, p.token);
    report(r.status === 200, "list job messages", JSON.stringify(r.body).slice(0, 120));
    (actors as any)._msgJobId = mjid;
  },

  async counters() {
    // Self-sufficient: baseline → own confirm flow → assert increments.
    const w = await ensureWorker();
    let r = await req("GET", "/users/me/profile/worker", undefined, w.token);
    let prof = data(r).profile ?? data(r);
    const baseCompleted = prof?.totalCompleted ?? 0;

    // #66: run a full mini lifecycle and confirm it
    const p0 = await ensureParticipant();
    r = await req("POST", "/jobs", jobBody("CounterConfirm"), p0.token);
    const cjid = (data(r).job ?? data(r)).id;
    await req("POST", `/jobs/${cjid}/apply`, { note: "counter test" }, w.token);
    r = await req("GET", `/jobs/${cjid}`, undefined, p0.token);
    const capp = ((data(r).job ?? data(r)).applications ?? [])[0]?.id;
    await req("PATCH", `/jobs/${cjid}/applications/${capp}/select`, {}, p0.token);
    await req("PATCH", `/jobs/${cjid}/start`, {}, w.token);
    await req("PATCH", `/jobs/${cjid}/complete`, {}, w.token);
    await req("PATCH", `/jobs/${cjid}/confirm`, {}, p0.token);

    r = await req("GET", "/users/me/profile/worker", undefined, w.token);
    prof = data(r).profile ?? data(r);
    report((prof?.totalCompleted ?? 0) === baseCompleted + 1, "#66 totalCompleted incremented on confirm", `before=${baseCompleted} after=${prof?.totalCompleted}`);

    // #65: participant cancels an ASSIGNED job → totalCancelledByClient++
    const p = await ensureParticipant();
    r = await req("POST", "/jobs", jobBody("CancelAttribution"), p.token);
    const jid = (data(r).job ?? data(r)).id;
    await req("POST", `/jobs/${jid}/apply`, { note: "cancel test" }, w.token);
    r = await req("GET", `/jobs/${jid}`, undefined, p.token);
    const appId = ((data(r).job ?? data(r)).applications ?? [])[0]?.id;
    await req("PATCH", `/jobs/${jid}/applications/${appId}/select`, {}, p.token);
    r = await req("PATCH", `/jobs/${jid}/cancel`, { reason: "smoke cancel attribution" }, p.token);
    report(r.status === 200, "cancel ASSIGNED job", JSON.stringify(r.body).slice(0, 150));

    r = await req("GET", `/jobs/${jid}`, undefined, p.token);
    const jd = data(r).job ?? data(r);
    report(jd.cancelledByRole === "PARTICIPANT", "#65 cancelledByRole recorded", `cancelledByRole=${jd.cancelledByRole}`);

    r = await req("GET", "/users/me/profile/worker", undefined, w.token);
    prof = data(r).profile ?? data(r);
    report((prof?.totalCancelledByClient ?? 0) >= 1, "#65 totalCancelledByClient incremented", `totalCancelledByClient=${prof?.totalCancelledByClient}`);
  },

  async notifications() {
    const w = await ensureWorker();
    let r = await req("GET", "/notifications", undefined, w.token);
    const list = data(r).notifications ?? (Array.isArray(data(r)) ? data(r) : []);
    report(r.status === 200, "list notifications", `count=${list.length}`);

    if (list.length) {
      r = await req("PATCH", `/notifications/${list[0].id}/read`, {}, w.token);
      report(r.status === 200, "mark one read", JSON.stringify(r.body).slice(0, 120));
    }
    r = await req("PATCH", "/notifications/read-all", {}, w.token);
    report(r.status === 200, "mark all read", JSON.stringify(r.body).slice(0, 120));
  },

  async subscriptions() {
    const r = await req("GET", "/subscriptions/plans");
    const plans = Array.isArray(data(r)) ? data(r) : data(r).plans ?? [];
    report(r.status === 200 && plans.length >= 10, "plan catalogue seeded", `count=${plans.length}`);

    const w = await ensureWorker();
    const me = await req("GET", "/subscriptions/me", undefined, w.token);
    report(me.status === 200, "GET /subscriptions/me", JSON.stringify(me.body).slice(0, 150));

    // #68 — PM must verify phone BEFORE activation
    const pm = await register("PLAN_MANAGER", "pm");
    if (pm) {
      const plansR = await req("GET", "/subscriptions/plans?role=PLAN_MANAGER", undefined, pm.token);
      const pl = (Array.isArray(data(plansR)) ? data(plansR) : data(plansR).plans ?? []);
      const basic = pl.find((x: any) => x.key === "PLAN_MANAGER_BASIC");
      let rr = await req("POST", "/subscriptions/activate", { planId: basic?.id }, pm.token);
      report(rr.status === 400, "#68 PM activation blocked without phone verify", `status=${rr.status} ${JSON.stringify(rr.body).slice(0, 120)}`);
      await verifyPhone(pm, "pm");
      rr = await req("POST", "/subscriptions/activate", { planId: basic?.id }, pm.token);
      report(rr.status === 200, "#68 PM activation OK after phone verify", JSON.stringify(rr.body).slice(0, 120));
    }
  },

  async listings() {
    const pr = await register("PROVIDER", "prov");
    if (!pr) return;
    await verifyPhone(pr, "provider");
    await activate(pr, "provider", "PROVIDER_BASIC", "PROVIDER");

    let r = await req("POST", "/provider/listings",
      { listingCategory: "SERVICE", listingType: "IMMEDIATE_INTAKE", title: "[SMOKE] Service Listing", serviceCategory: "Personal Care", description: "Smoke test listing — safe to delete.", suburb: "Parramatta", serviceMode: "IN_PERSON", fundingTypes: ["Plan-managed"], acknowledgement: true }, pr.token);
    report(r.status === 201, "create SERVICE listing", JSON.stringify(r.body).slice(0, 200));

    r = await req("POST", "/provider/listings",
      { listingCategory: "HOUSING", vacancyCategory: "SIL", title: "[SMOKE] SIL Vacancy", description: "Smoke test vacancy — safe to delete.", suburb: "Liverpool", vacancyCount: 2, urgency: "AVAILABLE_NOW", acknowledgement: true }, pr.token);
    report(r.status === 201, "create HOUSING listing", JSON.stringify(r.body).slice(0, 200));

    r = await req("GET", "/provider/listings", undefined, pr.token);
    report(r.status === 200 && (data(r).listings ?? []).length >= 2, "list own listings", `count=${(data(r).listings ?? []).length}`);
  },

  async gates() {
    const p = await ensureParticipant();
    const g = await register("SUPPORT_WORKER", "gate");
    if (!g) return;
    await workerProfile(g, "gate-worker"); // profiled + docs submitted, but NOT subscribed
    await submitRequiredDocs(g, "SUPPORT_WORKER", "gate-worker");

    const r = await req("POST", "/jobs", jobBody("GateTest"), p.token);
    const jid = (data(r).job ?? data(r)).id;
    const rr = await req("POST", `/jobs/${jid}/apply`, { note: "gate" }, g.token);
    report(rr.status === 403 && errCode(rr) === "SUBSCRIPTION_REQUIRED",
      "unsubscribed worker blocked (SUBSCRIPTION_REQUIRED)", `status=${rr.status} code=${errCode(rr)}`);
  },
};

// ─── Runner ──────────────────────────────────────────────────────────────────

(async () => {
  console.log(`Smoke suite → ${BASE}  (suffix ${SUF})`);
  const names = ONLY.length ? ONLY : Object.keys(sections);
  for (const n of names) {
    if (!sections[n]) { console.log(`SKIP | unknown section "${n}"`); continue; }
    console.log(`\n── ${n} ──`);
    try { await sections[n](); }
    catch (e) { report(false, `${n} section crashed`, String(e)); }
  }
  console.log(`\n==== ${passCount} passed, ${failCount} failed ====`);
  process.exit(failCount ? 1 : 0);
})();
