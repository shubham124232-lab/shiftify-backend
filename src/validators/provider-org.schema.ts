import { z } from "zod";

export const createBranchSchema = z.object({
  name: z.string().min(1).max(120),
  region: z.string().max(120).optional(),
  timezone: z.string().max(60).optional(),
  managerUserId: z.string().uuid().nullable().optional(),
  serviceLines: z.array(z.string().max(60)).max(20).optional(),
}).strict();
export type CreateBranchInput = z.infer<typeof createBranchSchema>;

export const updateBranchSchema = createBranchSchema.partial().extend({
  isActive: z.boolean().optional(),
}).strict();
export type UpdateBranchInput = z.infer<typeof updateBranchSchema>;

export const ADMIN_ROLE_PRESETS = ["ADMINISTRATOR", "BRANCH_MANAGER", "INTAKE", "WORKFORCE", "READ_ONLY"] as const;

export const createAdministratorSchema = z.object({
  email: z.string().email(),
  branchIds: z.array(z.string().uuid()).optional(),
  rolePreset: z.enum(ADMIN_ROLE_PRESETS).optional(),
}).strict();
export type CreateAdministratorInput = z.infer<typeof createAdministratorSchema>;

export const updateAdministratorSchema = z.object({
  rolePreset: z.enum(ADMIN_ROLE_PRESETS).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  branchIds: z.array(z.string().uuid()).optional(),
}).strict();
export type UpdateAdministratorInput = z.infer<typeof updateAdministratorSchema>;

export const createTeamMemberSchema = z.object({
  name: z.string().min(1).max(120),
  mobile: z.string().min(6).max(20),
  skills: z.array(z.string().max(60)).max(20).optional(),
  email: z.string().email().optional(),
  relationshipType: z.enum(["EMPLOYEE", "CONTRACTOR", "OTHER"]),
  locations: z.array(z.string().max(80)).max(20).optional(),
  accessLevel: z.enum(["STANDARD", "LIMITED"]).optional(),
  profileVisibility: z.enum(["ORGANISATION_ONLY", "VISIBLE_TO_PARTICIPANTS"]).optional(),
  consentAcknowledged: z.literal(true, { errorMap: () => ({ message: "Confirm the worker has agreed to be linked to your organisation" }) }),
  branchId: z.string().uuid(),
}).strict();
export type CreateTeamMemberInput = z.infer<typeof createTeamMemberSchema>;

export const updateTeamMemberSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  skills: z.array(z.string().max(60)).max(20).optional(),
  email: z.string().email().nullable().optional(),
  relationshipType: z.enum(["EMPLOYEE", "CONTRACTOR", "OTHER"]).optional(),
  locations: z.array(z.string().max(80)).max(20).optional(),
  accessLevel: z.enum(["STANDARD", "LIMITED"]).optional(),
  profileVisibility: z.enum(["ORGANISATION_ONLY", "VISIBLE_TO_PARTICIPANTS"]).optional(),
  branchId: z.string().uuid().optional(),
}).strict();
export type UpdateTeamMemberInput = z.infer<typeof updateTeamMemberSchema>;

export const confirmTeamMemberVerificationSchema = z.object({
  code: z.string().min(4).max(10),
}).strict();
export type ConfirmTeamMemberVerificationInput = z.infer<typeof confirmTeamMemberVerificationSchema>;
