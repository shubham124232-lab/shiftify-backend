// subscription.service.ts — Phase 1 subscription + plan management.
//
// Plans live in the Plan table (seeded rows). In Phase 2 the Stripe price ID
// is populated and the activate flow calls Stripe instead of the mock path.
//
// activateAccount() is the SINGLE place that sets a user to ACTIVE.

import { randomUUID } from "crypto";
import { prisma } from "../../lib/prisma";
import { devCodesEnabled } from "../../config/env";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "../../lib/errors";
import type { UserRole } from "@prisma/client";

export const PLAN_REQUIRED_ROLES: UserRole[] = [
  "SUPPORT_WORKER",
  "PROVIDER",
  "COORDINATOR",
  "PLAN_MANAGER",
];

export const FREE_ROLES: UserRole[] = ["PARTICIPANT"];

// A subscription row only grants access while ACTIVE and not past its paid-through
// date. Cancelling (Pricing V2 §11.1) keeps status ACTIVE until `expiresAt`, so the
// user keeps access to the end of the paid period.
const activeNow = () => ({
  status: "ACTIVE" as const,
  OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
});

const isAnnualKey = (key: string) => key.endsWith("_ANNUAL");

// Mock-billing period end: the next monthly/annual anniversary of activation that is
// still in the future. Real renewal dates arrive with Stripe (Phase 2).
export function currentPeriodEnd(activatedAt: Date, planKey: string, now = new Date()): Date {
  const end = new Date(activatedAt);
  const step = () => (isAnnualKey(planKey) ? end.setFullYear(end.getFullYear() + 1) : end.setMonth(end.getMonth() + 1));
  step();
  while (end.getTime() <= now.getTime()) step();
  return end;
}

export function currentPeriodStart(activatedAt: Date, planKey: string, now = new Date()): Date {
  const start = new Date(currentPeriodEnd(activatedAt, planKey, now));
  if (isAnnualKey(planKey)) start.setFullYear(start.getFullYear() - 1);
  else start.setMonth(start.getMonth() - 1);
  return start;
}

function withBillingFields<T extends { activatedAt: Date; cancelledAt: Date | null; expiresAt: Date | null; plan: { key: string } }>(sub: T) {
  const cancelled = sub.cancelledAt !== null;
  return {
    ...sub,
    startedAt: sub.activatedAt,
    autoRenew: !cancelled,
    currentPeriodEnd: cancelled ? sub.expiresAt : currentPeriodEnd(sub.activatedAt, sub.plan.key),
  };
}

// ─── List plans ───────────────────────────────────────────────────────────────

export async function listPlans(role?: UserRole) {
  return (prisma as any).plan.findMany({
    where: {
      active: true,
      ...(role ? { role } : {}),
    },
    orderBy: [{ role: "asc" }, { amountAud: "asc" }],
    select: { id: true, key: true, role: true, name: true, amountAud: true, features: true, isAddOn: true },
  });
}

// ─── Get active subscriptions for current user (base plan + any add-ons) ──────

export async function getMySubscription(userId: string) {
  const sub = await (prisma as any).userSubscription.findFirst({
    where: { userId, ...activeNow(), plan: { isAddOn: false } },
    include: { plan: { select: { id: true, key: true, name: true, role: true, amountAud: true, features: true, isAddOn: true } } },
    orderBy: { activatedAt: "desc" },
  });
  return sub ? withBillingFields(sub) : null;
}

export async function getMyActiveSubscriptions(userId: string) {
  const subs = await (prisma as any).userSubscription.findMany({
    where: { userId, ...activeNow() },
    include: { plan: { select: { id: true, key: true, name: true, role: true, amountAud: true, features: true, isAddOn: true } } },
    orderBy: { activatedAt: "desc" },
  });
  return subs.map(withBillingFields);
}

// Pricing V2 §11.1 — cancellation takes effect at the end of the paid billing
// period; access continues until then. Cancels the base plan and any add-ons.
export async function cancelMySubscription(userId: string, role: UserRole) {
  const subs = await (prisma as any).userSubscription.findMany({
    where: { userId, ...activeNow(), cancelledAt: null, plan: { role } },
    include: { plan: { select: { key: true } } },
  });
  if (subs.length === 0) throw new NotFoundError("No active subscription to cancel");

  const now = new Date();
  await prisma.$transaction(
    subs.map((s: any) =>
      (prisma as any).userSubscription.update({
        where: { id: s.id },
        data: { cancelledAt: now, expiresAt: currentPeriodEnd(s.activatedAt, s.plan.key, now) },
      }),
    ),
  );
  return getMyActiveSubscriptions(userId);
}

// ─── activateAccount ──────────────────────────────────────────────────────────

export interface ActivateResult {
  message: string;
  status: "ACTIVE";
  subscription?: {
    id: string;
    planKey: string;
    planName: string;
    amountAud: string;
  };
  addOns?: {
    id: string;
    planKey: string;
    planName: string;
    amountAud: string;
  }[];
  _dev_payment?: {
    plan: string;
    amount: number;
    currency: string;
    receipt: string;
  };
}

export async function activateAccount(
  userId: string,
  activeRole: UserRole,
  planId?: string,
  addOnPlanIds: string[] = [],
): Promise<ActivateResult> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError("User not found");

  // Activation may only move a not-yet-active account forward; it must never
  // lift a suspension/rejection.
  if (user.status === "SUSPENDED" || user.status === "REJECTED") {
    throw new ForbiddenError("This account cannot be activated. Contact support.");
  }

  // #68 — Plan Managers must verify their phone before activation (no free path exists for PM).
  if (activeRole === "PLAN_MANAGER" && !user.phoneVerified) {
    throw new BadRequestError("Verify your phone number before activating a Plan Manager account.");
  }

  const needsPlan = PLAN_REQUIRED_ROLES.includes(activeRole);

  let subscriptionRow: { id: string; mockReceiptRef: string | null } | null = null;
  let plan: { key: string; name: string; amountAud: unknown } | null = null;
  const addOnRows: { id: string; mockReceiptRef: string | null; plan: { key: string; name: string; amountAud: unknown } }[] = [];

  if (needsPlan) {
    if (!planId) {
      throw new BadRequestError(
        `A plan is required to activate a ${activeRole} account. Call GET /subscriptions/plans?role=${activeRole} to see options.`,
      );
    }

    plan = await (prisma as any).plan.findFirst({
      where: { id: planId, role: activeRole, active: true, isAddOn: false },
    });
    if (!plan) throw new NotFoundError(`Plan not found or not valid for role ${activeRole}`);

    const mockReceiptRef = `DEV-${randomUUID().toUpperCase()}`;

    // Re-activating the same plan must not stack duplicate ACTIVE rows.
    subscriptionRow =
      (await (prisma as any).userSubscription.findFirst({ where: { userId, planId, status: "ACTIVE" } })) ??
      (await (prisma as any).userSubscription.create({
        data: {
          userId,
          planId,
          status:         "ACTIVE",
          mockReceiptRef,
          activatedAt:    new Date(),
        },
      }));

    for (const addOnId of addOnPlanIds) {
      const addOnPlan = await (prisma as any).plan.findFirst({
        where: { id: addOnId, role: activeRole, active: true, isAddOn: true },
      });
      if (!addOnPlan) throw new NotFoundError(`Add-on plan not found or not valid for role ${activeRole}`);

      const addOnReceiptRef = `DEV-${randomUUID().toUpperCase()}`;
      const addOnRow =
        (await (prisma as any).userSubscription.findFirst({ where: { userId, planId: addOnId, status: "ACTIVE" } })) ??
        (await (prisma as any).userSubscription.create({
          data: {
            userId,
            planId: addOnId,
            status:      "ACTIVE",
            mockReceiptRef: addOnReceiptRef,
            activatedAt: new Date(),
          },
        }));
      addOnRows.push({ ...addOnRow, plan: addOnPlan });
    }
  }

  if (user.status !== "ACTIVE" && user.status !== "APPROVED") {
    await prisma.user.update({ where: { id: userId }, data: { status: "ACTIVE" } });
  }

  const result: ActivateResult = {
    message: "Account activated successfully",
    status:  "ACTIVE",
  };

  if (subscriptionRow && plan) {
    result.subscription = {
      id:        subscriptionRow.id,
      planKey:   (plan as any).key,
      planName:  (plan as any).name,
      amountAud: String((plan as any).amountAud),
    };
    if (addOnRows.length > 0) {
      result.addOns = addOnRows.map((row) => ({
        id:        row.id,
        planKey:   row.plan.key,
        planName:  row.plan.name,
        amountAud: String(row.plan.amountAud),
      }));
    }
    if (process.env.NODE_ENV !== "production") {
      result._dev_payment = {
        plan:     (plan as any).key,
        amount:   Number((plan as any).amountAud),
        currency: "AUD",
        receipt:  subscriptionRow.mockReceiptRef!,
      };
    }
  }

  return result;
}

// ─── subscriptionGated ────────────────────────────────────────────────────────

export async function subscriptionGated(userId: string, role: UserRole): Promise<boolean> {
  if (FREE_ROLES.includes(role)) return true;

  const sub = await (prisma as any).userSubscription.findFirst({
    where: { userId, ...activeNow(), plan: { role } },
  });
  return sub !== null;
}

// ─── Active base-plan key (free-tier detection) ──────────────────────────────
// Returns the plan key (e.g. WORKER_FREE, COORDINATOR_BASIC) of the user's
// active non-add-on subscription for the given role, or null if none.

export async function getActiveBasePlanKey(userId: string, role: UserRole): Promise<string | null> {
  const sub = await (prisma as any).userSubscription.findFirst({
    where:   { userId, ...activeNow(), plan: { role, isAddOn: false } },
    include: { plan: { select: { key: true } } },
    orderBy: { activatedAt: "desc" },
  });
  return sub?.plan?.key ?? null;
}

// ─── hasActiveAddOn ───────────────────────────────────────────────────────────
// Checks for a specific active add-on plan (e.g. "COORDINATOR_GROWTH",
// "WORKER_AVAILABLE_NOW") — unlike subscriptionGated, which only confirms the
// user holds *any* active plan for the role.

// Pricing V2 §3.5/§3.6 — Available Now / Growth / Speed require an active paid
// base plan (Basic / Pro), and the annual variant of an add-on counts the same
// as the monthly one.
export async function hasActiveAddOn(userId: string, role: UserRole, planKey: string): Promise<boolean> {
  const sub = await (prisma as any).userSubscription.findFirst({
    where: { userId, ...activeNow(), plan: { role, isAddOn: true, key: { in: [planKey, `${planKey}_ANNUAL`] } } },
  });
  if (sub === null) return false;

  if (role === "SUPPORT_WORKER" || role === "COORDINATOR") {
    const baseKey = await getActiveBasePlanKey(userId, role);
    if (!baseKey || baseKey.endsWith("_FREE")) return false;
  }
  return true;
}

// ─── Single Shift Pass (Pricing V2 §6) ─────────────────────────────────────────
// A flat one-time credit — "one new Participant support request or agreed
// chargeable action" — for a role that's used up its 10 free introductory
// actions and doesn't want to subscribe. Role-priced, no add-on bundle.

const SHIFT_PASS_PRICE_AUD: Partial<Record<UserRole, number>> = {
  SUPPORT_WORKER: 9.99,
  COORDINATOR:    19.99,
  PROVIDER:       19.99,
};

export async function purchaseShiftPass(userId: string, role: UserRole) {
  const priceAud = SHIFT_PASS_PRICE_AUD[role];
  if (priceAud === undefined) {
    throw new BadRequestError(`Single Shift Pass is not available for role ${role}`);
  }
  const mockReceiptRef = `DEV-${randomUUID().toUpperCase()}`;
  return prisma.shiftPassPurchase.create({
    data: { userId, role, priceAud, status: "ACTIVE", mockReceiptRef },
  });
}

// Finds and consumes one unconsumed Shift Pass for this user+role, tying it to
// the job it unlocked. Returns the consumed row, or null if none available.
export async function consumeShiftPass(userId: string, role: UserRole, jobId: string) {
  const pass = await prisma.shiftPassPurchase.findFirst({
    where: { userId, role, status: "ACTIVE" },
    orderBy: { purchasedAt: "asc" },
  });
  if (!pass) return null;
  return prisma.shiftPassPurchase.update({
    where: { id: pass.id },
    data:  { status: "CONSUMED", consumedAt: new Date(), consumedByJobId: jobId },
  });
}

export async function hasUnconsumedShiftPass(userId: string, role: UserRole): Promise<boolean> {
  const pass = await prisma.shiftPassPurchase.findFirst({ where: { userId, role, status: "ACTIVE" } });
  return pass !== null;
}

// ─── Provider organisation capacity (Pricing V2 §4/§5) ─────────────────────────
// Caps live on the Provider's active org-tier Plan (maxAdministrators/
// maxTeamMembers/maxBranches). A Provider with no active org-tier plan has no
// caps to check against, so capacity actions require one.

export interface ProviderOrgCaps {
  maxAdministrators: number | null;
  maxTeamMembers: number | null;
  maxBranches: number | null;
  planKey: string;
  /** Start of the current mock billing period (capacity is counted from here). */
  periodStart: Date;
}

export async function getActiveProviderOrgCaps(providerUserId: string): Promise<ProviderOrgCaps | null> {
  const sub = await (prisma as any).userSubscription.findFirst({
    where: {
      userId: providerUserId,
      ...activeNow(),
      plan: { role: "PROVIDER", isAddOn: false, maxBranches: { not: null } },
    },
    include: { plan: { select: { key: true, maxAdministrators: true, maxTeamMembers: true, maxBranches: true } } },
    orderBy: { activatedAt: "desc" },
  });
  if (!sub) return null;
  return {
    maxAdministrators: sub.plan.maxAdministrators,
    maxTeamMembers: sub.plan.maxTeamMembers,
    maxBranches: sub.plan.maxBranches,
    planKey: sub.plan.key,
    periodStart: currentPeriodStart(sub.activatedAt, sub.plan.key),
  };
}

// ─── Introductory allowance (Pricing V2 §3) ────────────────────────────────────
// 10 once-only introductory actions per role; never resets or expires.

export const INTRODUCTORY_ACTION_LIMIT = 10;

export async function introductoryActionsUsed(userId: string, role: UserRole): Promise<number> {
  if (role === "SUPPORT_WORKER") {
    return (await prisma.workerProfile.findUnique({ where: { userId }, select: { introductoryActionsUsed: true } }))?.introductoryActionsUsed ?? 0;
  }
  if (role === "COORDINATOR") {
    return (await prisma.coordinatorProfile.findUnique({ where: { userId }, select: { introductoryActionsUsed: true } }))?.introductoryActionsUsed ?? 0;
  }
  if (role === "PROVIDER") {
    return (await prisma.providerProfile.findUnique({ where: { userId }, select: { introductoryActionsUsed: true } }))?.introductoryActionsUsed ?? 0;
  }
  return 0;
}

// Atomic, capped increment — never goes past the once-only limit.
export async function incrementIntroductoryActions(userId: string, role: UserRole): Promise<void> {
  const where = { userId, introductoryActionsUsed: { lt: INTRODUCTORY_ACTION_LIMIT } };
  const data = { introductoryActionsUsed: { increment: 1 } };
  if (role === "SUPPORT_WORKER") await prisma.workerProfile.updateMany({ where, data });
  else if (role === "COORDINATOR") await prisma.coordinatorProfile.updateMany({ where, data });
  else if (role === "PROVIDER") await prisma.providerProfile.updateMany({ where, data });
}

export async function getIntroductoryAllowance(userId: string, role: UserRole) {
  if (role !== "SUPPORT_WORKER" && role !== "COORDINATOR" && role !== "PROVIDER") {
    return { applies: false, limit: 0, used: 0, remaining: 0, exhausted: false, unconsumedShiftPass: false, shiftPassPriceAud: null };
  }
  const used = await introductoryActionsUsed(userId, role);
  const unconsumedShiftPass = await hasUnconsumedShiftPass(userId, role);
  return {
    applies: true,
    limit: INTRODUCTORY_ACTION_LIMIT,
    used,
    remaining: Math.max(0, INTRODUCTORY_ACTION_LIMIT - used),
    exhausted: used >= INTRODUCTORY_ACTION_LIMIT,
    unconsumedShiftPass,
    shiftPassPriceAud: SHIFT_PASS_PRICE_AUD[role] ?? null,
  };
}

// ─── Add-ons (Pricing V2 §3.5/§3.6) ────────────────────────────────────────────
// Available Now (SW) and Growth/Speed (SC) stack on top of an active paid base plan
// (Basic / Pro) — they cannot be bought on the free tier.

const ADD_ON_BASE_NAME: Partial<Record<UserRole, string>> = {
  SUPPORT_WORKER: "Shiftify Basic",
  COORDINATOR: "Shiftify Pro",
};

export async function activateAddOn(userId: string, role: UserRole, planId: string) {
  const addOn = await (prisma as any).plan.findFirst({ where: { id: planId, role, active: true, isAddOn: true } });
  if (!addOn) throw new NotFoundError("Add-on plan not found or not valid for your role");

  const baseKey = await getActiveBasePlanKey(userId, role);
  if (!baseKey || baseKey.endsWith("_FREE")) {
    const baseName = ADD_ON_BASE_NAME[role] ?? "a paid plan";
    throw new BadRequestError(`${addOn.name} requires an active ${baseName} subscription.`);
  }

  const stem = String(addOn.key).replace(/_ANNUAL$/, "");
  const existing = await (prisma as any).userSubscription.findFirst({
    where: { userId, ...activeNow(), cancelledAt: null, plan: { role, isAddOn: true, key: { in: [stem, `${stem}_ANNUAL`] } } },
  });
  if (existing) throw new ConflictError(`${addOn.name} is already active on your account.`);

  const row = await (prisma as any).userSubscription.create({
    data: { userId, planId, status: "ACTIVE", mockReceiptRef: `DEV-${randomUUID().toUpperCase()}`, activatedAt: new Date() },
    include: { plan: { select: { id: true, key: true, name: true, role: true, amountAud: true, features: true, isAddOn: true } } },
  });
  return withBillingFields(row);
}
