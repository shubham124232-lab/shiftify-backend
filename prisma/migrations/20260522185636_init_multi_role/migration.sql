-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('PARTICIPANT', 'SUPPORT_WORKER', 'PROVIDER', 'COORDINATOR', 'PLAN_MANAGER', 'ADMIN');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('SELF', 'MANAGED');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "AdminTier" AS ENUM ('SUPER_ADMIN', 'REVIEWER');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('POLICE_CHECK', 'NDIS_SCREENING', 'WWCC', 'FIRST_AID', 'CPR', 'MANUAL_HANDLING', 'INFECTION_CONTROL', 'DRIVERS_LICENCE', 'VEHICLE_INSURANCE', 'PUBLIC_LIABILITY_INSURANCE', 'PROFESSIONAL_INDEMNITY', 'WORKERS_COMP', 'NDIS_AUDIT', 'PERSONAL_ACCIDENT_INSURANCE', 'QUALIFICATION_CERTIFICATE', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('UPLOADED', 'VERIFIED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "JobCategory" AS ENUM ('PERSONAL_CARE', 'COMMUNITY_ACCESS', 'DOMESTIC_ASSISTANCE', 'TRANSPORT', 'SOCIAL_RECREATIONAL', 'NURSING_COMPLEX_CARE', 'THERAPY_ASSISTANCE', 'OVERNIGHT_SUPPORT', 'BEHAVIOUR_SUPPORT', 'HIGH_INTENSITY', 'SIL_SUPPORT', 'RESPITE', 'COMPANIONSHIP', 'MEDICATION_ASSISTANCE', 'MEAL_PREPARATION', 'SHOPPING_ERRANDS', 'APPOINTMENT_SUPPORT', 'OTHER');

-- CreateEnum
CREATE TYPE "JobUrgency" AS ENUM ('EMERGENCY', 'SAME_DAY', 'SCHEDULED');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('DRAFT', 'OPEN', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('INTERESTED', 'SHORTLISTED', 'SELECTED', 'DECLINED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "WeekDay" AS ENUM ('MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN');

-- CreateEnum
CREATE TYPE "PmConnectionStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');

-- CreateEnum
CREATE TYPE "PmInitiator" AS ENUM ('CLIENT', 'PLAN_MANAGER');

-- CreateEnum
CREATE TYPE "OtpChannel" AS ENUM ('EMAIL', 'PHONE');

-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('VERIFY_EMAIL', 'VERIFY_PHONE', 'PASSWORD_RESET');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('REGISTRATION_APPROVED', 'REGISTRATION_REJECTED', 'DOC_VERIFIED', 'DOC_REJECTED', 'NEW_JOB_NEARBY', 'EMERGENCY_NEARBY', 'JOB_APPLICATION_RECEIVED', 'JOB_SHORTLISTED', 'JOB_SELECTED', 'JOB_ASSIGNED', 'JOB_PRESTART_REMINDER', 'JOB_STARTED', 'JOB_COMPLETED', 'JOB_CONFIRMED', 'JOB_CANCELLED', 'JOB_PROMOTED_EMERGENCY', 'NEW_MESSAGE', 'INVOICE_RECEIVED', 'PM_CONNECTION_REQUEST', 'PM_CONNECTION_ACCEPTED', 'GUEST_EXPIRY_REMINDER', 'GUEST_EXPIRED');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('USER_APPROVED', 'USER_REJECTED', 'USER_SUSPENDED', 'USER_REACTIVATED', 'USER_EDITED', 'DOC_VERIFIED', 'DOC_REJECTED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "username" TEXT,
    "passwordHash" TEXT,
    "name" TEXT NOT NULL,
    "accountType" "AccountType" NOT NULL DEFAULT 'SELF',
    "status" "UserStatus" NOT NULL DEFAULT 'PENDING',
    "adminTier" "AdminTier",
    "rejectionReason" TEXT,
    "avatarUrl" TEXT,
    "defaultSuburb" TEXT,
    "defaultState" TEXT,
    "defaultPostcode" TEXT,
    "parentUserId" TEXT,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "phoneVerified" BOOLEAN NOT NULL DEFAULT false,
    "guestUntil" TIMESTAMP(3),
    "lastGuestReminderAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRoleAssignment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "isActiveDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserRoleAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParticipantProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "preferredName" TEXT,
    "ageGroup" TEXT,
    "gender" TEXT,
    "ndisNumber" TEXT,
    "fundingManagementType" TEXT,
    "primaryDisability" TEXT,
    "mobilitySupportNeeds" JSONB,
    "communicationNeeds" JSONB,
    "behaviourSensoryNotes" JSONB,
    "medicalConsiderations" JSONB,
    "riskSafetyNotes" TEXT,
    "supportPreferences" JSONB,
    "emergencyContactName" TEXT,
    "emergencyContactPhone" TEXT,
    "emergencyContactRelationship" TEXT,
    "seekingPlanManager" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParticipantProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dob" TIMESTAMP(3),
    "gender" TEXT,
    "rightToWork" TEXT,
    "visaType" TEXT,
    "visaExpiry" TIMESTAMP(3),
    "workType" TEXT,
    "abn" TEXT,
    "gstRegistered" BOOLEAN NOT NULL DEFAULT false,
    "servicesOffered" JSONB,
    "subServices" JSONB,
    "highIntensitySkills" JSONB,
    "experienceLevel" TEXT,
    "disabilityExperience" JSONB,
    "availabilityType" TEXT,
    "emergencyAvailability" BOOLEAN NOT NULL DEFAULT false,
    "serviceAreas" JSONB,
    "travelRadiusKm" INTEGER,
    "hasVehicle" BOOLEAN NOT NULL DEFAULT false,
    "insuranceValid" BOOLEAN NOT NULL DEFAULT false,
    "hourlyRate" DECIMAL(10,2),
    "bio" TEXT,
    "isAvailableNow" BOOLEAN NOT NULL DEFAULT false,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalReviews" INTEGER NOT NULL DEFAULT 0,
    "seekingPlanManager" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "legalEntityName" TEXT,
    "abn" TEXT NOT NULL,
    "businessStructure" TEXT,
    "ndisRegistered" BOOLEAN NOT NULL DEFAULT false,
    "ndisProviderNumber" TEXT,
    "gstRegistered" BOOLEAN NOT NULL DEFAULT false,
    "yearsInOperation" TEXT,
    "primaryContactName" TEXT,
    "primaryContactRole" TEXT,
    "primaryContactPhone" TEXT,
    "primaryContactEmail" TEXT,
    "accountsContactName" TEXT,
    "accountsContactEmail" TEXT,
    "coreServices" JSONB,
    "offersSil" BOOLEAN NOT NULL DEFAULT false,
    "offersSda" BOOLEAN NOT NULL DEFAULT false,
    "silDetails" JSONB,
    "sdaDetails" JSONB,
    "serviceAreas" JSONB,
    "serviceMode" TEXT,
    "workforceSize" TEXT,
    "participantTypes" JSONB,
    "pricingModel" TEXT,
    "billingMethod" TEXT,
    "businessDescription" TEXT,
    "logoUrl" TEXT,
    "websiteUrl" TEXT,
    "seekingPlanManager" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoordinatorProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleType" TEXT,
    "organisationName" TEXT,
    "abn" TEXT,
    "ndisRegistered" BOOLEAN NOT NULL DEFAULT false,
    "ndisProviderNumber" TEXT,
    "yearsExperience" TEXT,
    "supportCoordinationLevel" JSONB,
    "participantComplexityExperience" JSONB,
    "servicesOfferedBeyondCoordination" JSONB,
    "serviceAreas" JSONB,
    "serviceMode" TEXT,
    "currentCapacityStatus" TEXT,
    "maxParticipantLoad" INTEGER,
    "participantTypesAccepted" JSONB,
    "billingMethodPreference" TEXT,
    "hourlyRate" DECIMAL(10,2),
    "bio" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoordinatorProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanManagerProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "abn" TEXT,
    "ndisRegistered" BOOLEAN NOT NULL DEFAULT false,
    "yearsInOperation" TEXT,
    "serviceAreas" JSONB,
    "acceptingClients" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanManagerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Address" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "unitApartment" TEXT,
    "street" TEXT NOT NULL,
    "suburb" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "postcode" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Address_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerAvailability" (
    "id" TEXT NOT NULL,
    "workerProfileId" TEXT NOT NULL,
    "dayOfWeek" "WeekDay" NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkerAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerUnavailability" (
    "id" TEXT NOT NULL,
    "workerProfileId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkerUnavailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "docType" "DocumentType" NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "referenceNumber" TEXT,
    "issueDate" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3),
    "status" "DocumentStatus" NOT NULL DEFAULT 'UPLOADED',
    "rejectionReason" TEXT,
    "verifiedByAdminId" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportRequest" (
    "id" TEXT NOT NULL,
    "postedByUserId" TEXT NOT NULL,
    "forParticipantUserId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "JobCategory" NOT NULL,
    "subcategory" TEXT,
    "urgency" "JobUrgency" NOT NULL DEFAULT 'SCHEDULED',
    "status" "JobStatus" NOT NULL DEFAULT 'DRAFT',
    "suburb" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "postcode" TEXT,
    "serviceDeliveryMode" TEXT,
    "scheduledStartAt" TIMESTAMP(3) NOT NULL,
    "scheduledEndAt" TIMESTAMP(3) NOT NULL,
    "totalHours" DECIMAL(6,2),
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "recurrencePattern" JSONB,
    "workerPreferences" JSONB,
    "selectedApplicantUserId" TEXT,
    "assignedWorkerUserId" TEXT,
    "selectedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelledByUserId" TEXT,
    "cancelReason" TEXT,
    "promotedFromCancellation" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobApplication" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "applicantUserId" TEXT NOT NULL,
    "applicantRole" "UserRole" NOT NULL,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'INTERESTED',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobMessage" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "senderUserId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "senderUserId" TEXT NOT NULL,
    "planManagerUserId" TEXT NOT NULL,
    "participantUserId" TEXT NOT NULL,
    "hours" DECIMAL(6,2),
    "note" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanManagerConnection" (
    "id" TEXT NOT NULL,
    "planManagerUserId" TEXT NOT NULL,
    "clientUserId" TEXT NOT NULL,
    "status" "PmConnectionStatus" NOT NULL DEFAULT 'PENDING',
    "initiatedBy" "PmInitiator" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanManagerConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "data" JSONB,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "targetUserId" TEXT,
    "targetDocumentId" TEXT,
    "reason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "userAgent" TEXT,
    "ip" TEXT,
    "activeRole" "UserRole",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "channel" "OtpChannel" NOT NULL,
    "purpose" "OtpPurpose" NOT NULL,
    "destination" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_status_idx" ON "User"("status");

-- CreateIndex
CREATE INDEX "User_accountType_idx" ON "User"("accountType");

-- CreateIndex
CREATE INDEX "User_parentUserId_idx" ON "User"("parentUserId");

-- CreateIndex
CREATE INDEX "User_guestUntil_idx" ON "User"("guestUntil");

-- CreateIndex
CREATE INDEX "UserRoleAssignment_role_idx" ON "UserRoleAssignment"("role");

-- CreateIndex
CREATE UNIQUE INDEX "UserRoleAssignment_userId_role_key" ON "UserRoleAssignment"("userId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "ParticipantProfile_userId_key" ON "ParticipantProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkerProfile_userId_key" ON "WorkerProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderProfile_userId_key" ON "ProviderProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderProfile_abn_key" ON "ProviderProfile"("abn");

-- CreateIndex
CREATE UNIQUE INDEX "CoordinatorProfile_userId_key" ON "CoordinatorProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PlanManagerProfile_userId_key" ON "PlanManagerProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Address_userId_key" ON "Address"("userId");

-- CreateIndex
CREATE INDEX "WorkerAvailability_workerProfileId_dayOfWeek_idx" ON "WorkerAvailability"("workerProfileId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "WorkerUnavailability_workerProfileId_date_idx" ON "WorkerUnavailability"("workerProfileId", "date");

-- CreateIndex
CREATE INDEX "Document_userId_idx" ON "Document"("userId");

-- CreateIndex
CREATE INDEX "Document_status_idx" ON "Document"("status");

-- CreateIndex
CREATE INDEX "Document_expiryDate_idx" ON "Document"("expiryDate");

-- CreateIndex
CREATE INDEX "SupportRequest_status_idx" ON "SupportRequest"("status");

-- CreateIndex
CREATE INDEX "SupportRequest_urgency_idx" ON "SupportRequest"("urgency");

-- CreateIndex
CREATE INDEX "SupportRequest_suburb_idx" ON "SupportRequest"("suburb");

-- CreateIndex
CREATE INDEX "SupportRequest_category_idx" ON "SupportRequest"("category");

-- CreateIndex
CREATE INDEX "SupportRequest_postedByUserId_idx" ON "SupportRequest"("postedByUserId");

-- CreateIndex
CREATE INDEX "SupportRequest_forParticipantUserId_idx" ON "SupportRequest"("forParticipantUserId");

-- CreateIndex
CREATE INDEX "SupportRequest_selectedApplicantUserId_idx" ON "SupportRequest"("selectedApplicantUserId");

-- CreateIndex
CREATE INDEX "SupportRequest_assignedWorkerUserId_idx" ON "SupportRequest"("assignedWorkerUserId");

-- CreateIndex
CREATE INDEX "JobApplication_jobId_status_idx" ON "JobApplication"("jobId", "status");

-- CreateIndex
CREATE INDEX "JobApplication_applicantUserId_idx" ON "JobApplication"("applicantUserId");

-- CreateIndex
CREATE UNIQUE INDEX "JobApplication_jobId_applicantUserId_key" ON "JobApplication"("jobId", "applicantUserId");

-- CreateIndex
CREATE INDEX "JobMessage_jobId_createdAt_idx" ON "JobMessage"("jobId", "createdAt");

-- CreateIndex
CREATE INDEX "Invoice_planManagerUserId_sentAt_idx" ON "Invoice"("planManagerUserId", "sentAt");

-- CreateIndex
CREATE INDEX "Invoice_senderUserId_idx" ON "Invoice"("senderUserId");

-- CreateIndex
CREATE INDEX "Invoice_jobId_idx" ON "Invoice"("jobId");

-- CreateIndex
CREATE INDEX "PlanManagerConnection_planManagerUserId_status_idx" ON "PlanManagerConnection"("planManagerUserId", "status");

-- CreateIndex
CREATE INDEX "PlanManagerConnection_clientUserId_status_idx" ON "PlanManagerConnection"("clientUserId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PlanManagerConnection_planManagerUserId_clientUserId_key" ON "PlanManagerConnection"("planManagerUserId", "clientUserId");

-- CreateIndex
CREATE INDEX "Notification_userId_read_idx" ON "Notification"("userId", "read");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_adminUserId_createdAt_idx" ON "AuditLog"("adminUserId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_targetUserId_idx" ON "AuditLog"("targetUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_refreshTokenHash_key" ON "Session"("refreshTokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "VerificationCode_userId_idx" ON "VerificationCode"("userId");

-- CreateIndex
CREATE INDEX "VerificationCode_destination_purpose_idx" ON "VerificationCode"("destination", "purpose");

-- CreateIndex
CREATE INDEX "VerificationCode_expiresAt_idx" ON "VerificationCode"("expiresAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_parentUserId_fkey" FOREIGN KEY ("parentUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRoleAssignment" ADD CONSTRAINT "UserRoleAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParticipantProfile" ADD CONSTRAINT "ParticipantProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerProfile" ADD CONSTRAINT "WorkerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderProfile" ADD CONSTRAINT "ProviderProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoordinatorProfile" ADD CONSTRAINT "CoordinatorProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanManagerProfile" ADD CONSTRAINT "PlanManagerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Address" ADD CONSTRAINT "Address_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerAvailability" ADD CONSTRAINT "WorkerAvailability_workerProfileId_fkey" FOREIGN KEY ("workerProfileId") REFERENCES "WorkerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerUnavailability" ADD CONSTRAINT "WorkerUnavailability_workerProfileId_fkey" FOREIGN KEY ("workerProfileId") REFERENCES "WorkerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_verifiedByAdminId_fkey" FOREIGN KEY ("verifiedByAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportRequest" ADD CONSTRAINT "SupportRequest_postedByUserId_fkey" FOREIGN KEY ("postedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportRequest" ADD CONSTRAINT "SupportRequest_forParticipantUserId_fkey" FOREIGN KEY ("forParticipantUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportRequest" ADD CONSTRAINT "SupportRequest_selectedApplicantUserId_fkey" FOREIGN KEY ("selectedApplicantUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportRequest" ADD CONSTRAINT "SupportRequest_assignedWorkerUserId_fkey" FOREIGN KEY ("assignedWorkerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportRequest" ADD CONSTRAINT "SupportRequest_cancelledByUserId_fkey" FOREIGN KEY ("cancelledByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobApplication" ADD CONSTRAINT "JobApplication_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "SupportRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobApplication" ADD CONSTRAINT "JobApplication_applicantUserId_fkey" FOREIGN KEY ("applicantUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobMessage" ADD CONSTRAINT "JobMessage_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "SupportRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobMessage" ADD CONSTRAINT "JobMessage_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "SupportRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_planManagerUserId_fkey" FOREIGN KEY ("planManagerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_participantUserId_fkey" FOREIGN KEY ("participantUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanManagerConnection" ADD CONSTRAINT "PlanManagerConnection_planManagerUserId_fkey" FOREIGN KEY ("planManagerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanManagerConnection" ADD CONSTRAINT "PlanManagerConnection_clientUserId_fkey" FOREIGN KEY ("clientUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationCode" ADD CONSTRAINT "VerificationCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
