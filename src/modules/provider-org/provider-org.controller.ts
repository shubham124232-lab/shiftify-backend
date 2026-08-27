import type { Request, Response } from "express";
import { UnauthorizedError } from "../../lib/errors";
import { success } from "../../utils/response";
import { parse } from "../../utils/validate";
import * as svc from "./provider-org.service";
import {
  createBranchSchema,
  createAdministratorSchema,
  createTeamMemberSchema,
  confirmTeamMemberVerificationSchema,
} from "../../validators/provider-org.schema";

// ─── Branches ───────────────────────────────────────────────────────────────

export async function createBranch(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const data = parse(createBranchSchema, req.body);
  const branch = await svc.createBranch(req.user.id, data);
  success(res, { branch }, 201);
}

export async function listBranches(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const branches = await svc.listBranches(req.user.id);
  success(res, { branches });
}

export async function deleteBranch(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  await svc.deleteBranch(req.user.id, req.params.id);
  success(res, { message: "Branch removed" });
}

// ─── Administrators ─────────────────────────────────────────────────────────

export async function createAdministrator(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const data = parse(createAdministratorSchema, req.body);
  const administrator = await svc.createAdministrator(req.user.id, data);
  success(res, { administrator }, 201);
}

export async function listAdministrators(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const administrators = await svc.listAdministrators(req.user.id);
  success(res, { administrators });
}

export async function removeAdministrator(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  await svc.removeAdministrator(req.user.id, req.params.id);
  success(res, { message: "Administrator removed" });
}

// ─── Team Members ───────────────────────────────────────────────────────────

export async function createTeamMember(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const data = parse(createTeamMemberSchema, req.body);
  const teamMember = await svc.createTeamMember(req.user.id, data);
  success(res, { teamMember }, 201);
}

export async function listTeamMembers(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const teamMembers = await svc.listTeamMembers(req.user.id);
  success(res, { teamMembers });
}

export async function removeTeamMember(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  await svc.removeTeamMember(req.user.id, req.params.id);
  success(res, { message: "Team Member removed" });
}

export async function resendTeamMemberVerification(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const result = await svc.resendTeamMemberVerification(req.user.id, req.params.id);
  success(res, result);
}

export async function confirmTeamMemberVerification(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const data = parse(confirmTeamMemberVerificationSchema, req.body);
  const teamMember = await svc.confirmTeamMemberVerification(req.user.id, req.params.id, data);
  success(res, { teamMember });
}
