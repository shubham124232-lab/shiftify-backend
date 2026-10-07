import { z } from "zod";

export const createBranchSchema = z.object({
  name: z.string().min(1).max(120),
}).strict();
export type CreateBranchInput = z.infer<typeof createBranchSchema>;

export const createAdministratorSchema = z.object({
  email: z.string().email(),
  branchIds: z.array(z.string().uuid()).optional(),
}).strict();
export type CreateAdministratorInput = z.infer<typeof createAdministratorSchema>;

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

export const confirmTeamMemberVerificationSchema = z.object({
  code: z.string().min(4).max(10),
}).strict();
export type ConfirmTeamMemberVerificationInput = z.infer<typeof confirmTeamMemberVerificationSchema>;
