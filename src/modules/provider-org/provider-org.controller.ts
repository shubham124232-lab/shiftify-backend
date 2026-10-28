import type { Request, Response } from "express";
import { BadRequestError, UnauthorizedError } from "../../lib/errors";
import { success } from "../../utils/response";
import { parse } from "../../utils/validate";
import { prisma } from "../../lib/prisma";
import * as svc from "./provider-org.service";
import {
  createBranchSchema,
  updateBranchSchema,
  createAdministratorSchema,
  updateAdministratorSchema,
  createTeamMemberSchema,
  updateTeamMemberSchema,
  confirmTeamMemberVerificationSchema,
  saveServiceLineSchema,
} from "../../validators/provider-org.schema";

export async function requestToJoin(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const abn = String((req.body as { abn?: string })?.abn ?? "");
  if (!/^\d{11}$/.test(abn.replace(/\s/g, ""))) throw new BadRequestError("Enter the 11-digit ABN.");
  success(res, await svc.requestToJoin(req.user.id, abn));
}

// ─── Branches ───────────────────────────────────────────────────────────────

export async function createBranch(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const data = parse(createBranchSchema, req.body);
  const branch = await svc.createBranch(req.user.id, data);
  success(res, { branch }, 201);
}

export async function listBranches(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const branches = await svc.listBranches(req.user.id, branchScope(req));
  success(res, { branches });
}

export async function getBranch(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  success(res, { branch: await svc.getBranch(req.user.id, req.params.id, branchScope(req)) });
}

export async function updateBranch(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const data = parse(updateBranchSchema, req.body);
  success(res, { branch: await svc.updateBranch(req.user.id, req.params.id, data, branchScope(req)) });
}

export async function deleteBranch(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  await svc.deleteBranch(req.user.id, req.params.id, branchScope(req));
  success(res, { message: "Branch removed" });
}

// An Administrator is limited to their authorised Branches; an Owner has no restriction (null).
// An Administrator with no Branches assigned keeps organisation-wide access (the form says "access applies to all").
const branchScope = (req: Request): string[] | null => (req.providerAdmin?.branchIds.length ? req.providerAdmin.branchIds : null);

// ─── Administrators ─────────────────────────────────────────────────────────

export async function createAdministrator(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const data = parse(createAdministratorSchema, req.body);
  const administrator = await svc.createAdministrator(req.user.id, data);
  success(res, { administrator }, 201);
}

export async function listAdministrators(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const [administrators, owner] = await Promise.all([
    svc.listAdministrators(req.user.id),
    prisma.user.findUnique({ where: { id: req.user.id }, select: { name: true, email: true } }),
  ]);
  success(res, { administrators, owner, viewerIsOwner: !req.providerAdmin });
}

export async function updateAdministrator(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const data = parse(updateAdministratorSchema, req.body);
  success(res, { administrator: await svc.updateAdministrator(req.user.id, req.params.id, data) });
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
  const teamMember = await svc.createTeamMember(req.user.id, data, branchScope(req));
  success(res, { teamMember }, 201);
}

export async function listTeamMembers(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const teamMembers = await svc.listTeamMembers(req.user.id, branchScope(req));
  success(res, { teamMembers });
}

export async function updateTeamMember(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const data = parse(updateTeamMemberSchema, req.body);
  success(res, { teamMember: await svc.updateTeamMember(req.user.id, req.params.id, data, branchScope(req)) });
}

export async function removeTeamMember(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  await svc.removeTeamMember(req.user.id, req.params.id, branchScope(req));
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

// GET /provider-org/capacity
export async function getCapacity(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  success(res, { capacity: await svc.getCapacitySummary(req.user.id) });
}

// GET /provider-org/inbox
export async function getInbox(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  success(res, await svc.getInbox(req.user.id));
}

// Provider doc P12/section 2: the header states the acting organisation and the person's capacity in it.
export async function getIdentity(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const org = await prisma.providerProfile.findUnique({ where: { userId: req.user.id }, select: { businessName: true } });
  success(res, { organisation: org?.businessName ?? null, capacity: req.providerAdmin ? "ADMINISTRATOR" : "OWNER", rolePreset: req.providerAdmin?.rolePreset ?? null });
}

// ─── Administrator invitations (Provider doc P16) ────────────────────────────

export async function resendAdministratorInvite(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  success(res, { administrator: await svc.resendAdministratorInvite(req.user.id, req.params.id) });
}

export async function revokeAdministratorInvite(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  await svc.revokeAdministratorInvite(req.user.id, req.params.id);
  success(res, { message: "Invitation revoked" });
}

// The invited person acts as themselves here (they may not be an Administrator yet), never as an organisation.
export async function listMyInvitations(req: Request, res: Response): Promise<void> {
  if (!req.actorUserId) throw new UnauthorizedError();
  success(res, { invitations: await svc.listMyAdministratorInvitations(req.actorUserId) });
}

export async function acceptInvitation(req: Request, res: Response): Promise<void> {
  if (!req.actorUserId) throw new UnauthorizedError();
  success(res, await svc.acceptAdministratorInvitation(req.actorUserId, req.params.id));
}

export async function declineInvitation(req: Request, res: Response): Promise<void> {
  if (!req.actorUserId) throw new UnauthorizedError();
  await svc.declineAdministratorInvitation(req.actorUserId, req.params.id);
  success(res, { message: "Invitation declined" });
}


// ─── Service lines ──────────────────────────────────────────────────────────

export async function listServiceLines(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  success(res, { serviceLines: await svc.listServiceLines(req.user.id) });
}

export async function saveServiceLine(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const data = parse(saveServiceLineSchema, req.body);
  success(res, { serviceLine: await svc.saveServiceLine(req.user.id, req.params.category, data, branchScope(req)) });
}
