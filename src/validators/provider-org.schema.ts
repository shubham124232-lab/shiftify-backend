import { z } from "zod";

export const createBranchSchema = z.object({
  name: z.string().min(1).max(120),
  region: z.string().max(120).optional(),
  timezone: z.string().max(60).optional(),
  managerUserId: z.string().uuid().nullable().optional(),
  serviceLines: z.array(z.string().max(60)).max(20).optional(),
  address: z.string().max(300).nullable().optional(),
  escalationContact: z.string().max(200).nullable().optional(),
  contact: z.string().max(200).nullable().optional(),
  serviceRadiusKm: z.number().int().min(1).max(500).nullable().optional(),
}).strict();
export type CreateBranchInput = z.infer<typeof createBranchSchema>;

export const updateBranchSchema = createBranchSchema.partial().extend({
  isActive: z.boolean().optional(),
  // Deactivating a Branch with active work: move its active requests and Team Members here first (doc P15).
  transferToBranchId: z.string().uuid().optional(),
}).strict();
export type UpdateBranchInput = z.infer<typeof updateBranchSchema>;

export const ADMIN_ROLE_PRESETS = ["ADMINISTRATOR", "BRANCH_MANAGER", "INTAKE", "WORKFORCE", "READ_ONLY"] as const;

export const createAdministratorSchema = z.object({
  email: z.string().email(),
  branchIds: z.array(z.string().uuid()).optional(),
  rolePreset: z.enum(ADMIN_ROLE_PRESETS).optional(),
  billingAccess: z.boolean().optional(),
  referralCode: z.string().trim().max(40).optional(),
}).strict();
export type CreateAdministratorInput = z.infer<typeof createAdministratorSchema>;

export const updateAdministratorSchema = z.object({
  rolePreset: z.enum(ADMIN_ROLE_PRESETS).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  billingAccess: z.boolean().optional(),
  branchIds: z.array(z.string().uuid()).optional(),
}).strict();
export type UpdateAdministratorInput = z.infer<typeof updateAdministratorSchema>;

export const createTeamMemberSchema = z.object({
  name: z.string().min(1).max(120),
  mobile: z.string().min(6).max(20),
  skills: z.array(z.string().max(60)).max(20).optional(),
  // Required: the verification code is emailed (no phone OTP).
  email: z.string().email("Enter the Team Member's email address"),
  relationshipType: z.enum(["EMPLOYEE", "CONTRACTOR", "OTHER"]),
  locations: z.array(z.string().max(80)).max(20).optional(),
  languages: z.array(z.string().max(40)).max(20).optional(),
  credentialStatus: z.enum(["CURRENT", "NEEDS_REVIEW", "NOT_PROVIDED"]).optional(),
  experienceYears: z.number().int().min(0).max(60).nullable().optional(),
  accessLevel: z.enum(["STANDARD", "LIMITED"]).optional(),
  profileVisibility: z.enum(["ORGANISATION_ONLY", "VISIBLE_TO_PARTICIPANTS"]).optional(),
  consentAcknowledged: z.literal(true, { message: "Confirm the worker has agreed to be linked to your organisation" }),
  branchId: z.string().uuid(),
}).strict();
export type CreateTeamMemberInput = z.infer<typeof createTeamMemberSchema>;

export const updateTeamMemberSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  skills: z.array(z.string().max(60)).max(20).optional(),
  email: z.string().email().nullable().optional(),
  relationshipType: z.enum(["EMPLOYEE", "CONTRACTOR", "OTHER"]).optional(),
  locations: z.array(z.string().max(80)).max(20).optional(),
  languages: z.array(z.string().max(40)).max(20).optional(),
  credentialStatus: z.enum(["CURRENT", "NEEDS_REVIEW", "NOT_PROVIDED"]).optional(),
  experienceYears: z.number().int().min(0).max(60).nullable().optional(),
  accessLevel: z.enum(["STANDARD", "LIMITED"]).optional(),
  profileVisibility: z.enum(["ORGANISATION_ONLY", "VISIBLE_TO_PARTICIPANTS"]).optional(),
  branchId: z.string().uuid().optional(),
}).strict();
export type UpdateTeamMemberInput = z.infer<typeof updateTeamMemberSchema>;

export const confirmTeamMemberVerificationSchema = z.object({
  code: z.string().min(4).max(10),
}).strict();
export type ConfirmTeamMemberVerificationInput = z.infer<typeof confirmTeamMemberVerificationSchema>;


// Provider demo "Service capability": one popup per service line (category).
export const saveServiceLineSchema = z.object({
  capabilityLimits: z.string().trim().min(1, "Describe your capability and limits").max(2000),
  competencies: z.array(z.string().max(60)).max(30).optional(),
  branchIds: z.array(z.string().uuid()).max(50).optional(),
  managerUserId: z.string().uuid().nullable().optional(),
}).strict();
export type SaveServiceLineInput = z.infer<typeof saveServiceLineSchema>;
