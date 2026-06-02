// Shared constants — single source for things referenced across modules.

export const USER_ROLES = [
  "PARTICIPANT",
  "SUPPORT_WORKER",
  "PROVIDER",
  "COORDINATOR",
  "PLAN_MANAGER",
] as const;
export type UserRoleSignup = (typeof USER_ROLES)[number];

export const ALL_USER_ROLES = [...USER_ROLES, "ADMIN"] as const;

export const USER_STATUSES = ["PENDING", "ACTIVE", "APPROVED", "REJECTED", "SUSPENDED"] as const;

export const ADMIN_TIERS = ["SUPER_ADMIN", "REVIEWER"] as const;

export const JOB_CATEGORIES = [
  "PERSONAL_CARE",
  "COMMUNITY_ACCESS",
  "DOMESTIC_ASSISTANCE",
  "TRANSPORT",
  "SOCIAL_RECREATIONAL",
  "NURSING_COMPLEX_CARE",
  "THERAPY_ASSISTANCE",
  "OVERNIGHT_SUPPORT",
  "BEHAVIOUR_SUPPORT",
  "HIGH_INTENSITY",
  "SIL_SUPPORT",
  "RESPITE",
  "COMPANIONSHIP",
  "MEDICATION_ASSISTANCE",
  "MEAL_PREPARATION",
  "SHOPPING_ERRANDS",
  "APPOINTMENT_SUPPORT",
  "OTHER",
] as const;

export const JOB_URGENCY = ["EMERGENCY", "SAME_DAY", "SCHEDULED"] as const;

export const JOB_STATUSES = [
  "DRAFT",
  "OPEN",
  "ASSIGNED",
  "IN_PROGRESS",
  "COMPLETED",
  "CONFIRMED",
  "CANCELLED",
] as const;

export const APPLICATION_STATUSES = [
  "INTERESTED",
  "SHORTLISTED",
  "SELECTED",
  "DECLINED",
  "WITHDRAWN",
] as const;

// File upload allowlist
export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
] as const;

// Magic-link guest window (15 days)
export const GUEST_WINDOW_DAYS = 15;
export const GUEST_REMINDER_DAYS = [8, 13, 14] as const; // days since signup

// Reminder for the dashboard banner — show countdown from day 0
export const GUEST_TOTAL_DAYS = GUEST_WINDOW_DAYS;
