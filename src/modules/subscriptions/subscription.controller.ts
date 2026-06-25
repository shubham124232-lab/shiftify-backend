import type { Request, Response } from "express";
import { success } from "../../utils/response";
import { UnauthorizedError } from "../../lib/errors";
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
