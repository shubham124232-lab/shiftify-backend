import type { Request, Response } from "express";
import { success } from "../../utils/response";
import { BadRequestError, UnauthorizedError } from "../../lib/errors";
import * as svc from "./subscription.service";
import type { UserRole } from "@prisma/client";

// POST /subscriptions/activate
export async function activateSubscription(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const { planId, addOnPlanIds } = req.body as { planId?: string; addOnPlanIds?: string[] };
  const role = req.activeRole;
  if (!role) throw new UnauthorizedError("No active role");

  const result = await svc.activateAccount(req.user.id, role as UserRole, planId, addOnPlanIds ?? []);
  success(res, result);
}

// GET /subscriptions/plans?role=SUPPORT_WORKER
export async function listPlans(req: Request, res: Response): Promise<void> {
  const role = req.query.role as UserRole | undefined;
  const plans = await svc.listPlans(role);
  success(res, { plans });
}

// GET /subscriptions/me
export async function getMySubscription(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const subscription = await svc.getMySubscription(req.user.id);
  success(res, { subscription });
}

// GET /subscriptions/me/all — base plan + any active add-ons
export async function getMyActiveSubscriptions(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const subscriptions = await svc.getMyActiveSubscriptions(req.user.id);
  success(res, { subscriptions });
}

// POST /subscriptions/shift-pass — Pricing V2 §6 Single Shift Pass purchase
export async function purchaseShiftPass(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const role = req.activeRole;
  if (!role) throw new UnauthorizedError("No active role");
  const pass = await svc.purchaseShiftPass(req.user.id, role as UserRole);
  success(res, { pass }, 201);
}

// POST /subscriptions/cancel — Pricing V2 §11.1: effective at the end of the paid period
export async function cancelSubscription(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const role = req.activeRole;
  if (!role) throw new UnauthorizedError("No active role");
  const subscriptions = await svc.cancelMySubscription(req.user.id, role as UserRole);
  success(res, { subscriptions });
}

// GET /subscriptions/me/allowance — introductory-action usage for the active role
export async function getIntroductoryAllowance(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const role = req.activeRole;
  if (!role) throw new UnauthorizedError("No active role");
  const allowance = await svc.getIntroductoryAllowance(req.user.id, role as UserRole);
  success(res, { allowance });
}

// POST /subscriptions/add-on — Available Now / Growth / Speed on top of a paid base plan
export async function activateAddOn(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const role = req.activeRole;
  if (!role) throw new UnauthorizedError("No active role");
  const { planId } = req.body as { planId?: string };
  if (!planId) throw new BadRequestError("planId is required");
  const subscription = await svc.activateAddOn(req.user.id, role as UserRole, planId);
  success(res, { subscription }, 201);
}
