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
  branchId: z.string().uuid(),
}).strict();
export type CreateTeamMemberInput = z.infer<typeof createTeamMemberSchema>;

export const confirmTeamMemberVerificationSchema = z.object({
  code: z.string().min(4).max(10),
}).strict();
export type ConfirmTeamMemberVerificationInput = z.infer<typeof confirmTeamMemberVerificationSchema>;
