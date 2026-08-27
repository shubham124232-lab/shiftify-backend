// subscription.service.ts — Phase 1 subscription + plan management.
//
// Plans live in the Plan table (seeded rows). In Phase 2 the Stripe price ID
// is populated and the activate flow calls Stripe instead of the mock path.
//
// activateAccount() is the SINGLE place that sets a user to ACTIVE.

import { randomUUID } from "crypto";
import { prisma } from "../../lib/prisma";
import { BadRequestError, NotFoundError } from "../../lib/errors";
import type { UserRole } from "@prisma/client";

export const PLAN_REQUIRED_ROLES: UserRole[] = [
  "SUPPORT_WORKER",
  "PROVIDER",
  "COORDINATOR",
  "PLAN_MANAGER",
];

export const FREE_ROLES: UserRole[] = ["PARTICIPANT"];

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
  return (prisma as any).userSubscription.findFirst({
    where: { userId, status: "ACTIVE", plan: { isAddOn: false } },
    include: { plan: { select: { id: true, key: true, name: true, role: true, amountAud: true, features: true, isAddOn: true } } },
    orderBy: { activatedAt: "desc" },
  });
}

export async function getMyActiveSubscriptions(userId: string) {
  return (prisma as any).userSubscription.findMany({
    where: { userId, status: "ACTIVE" },
    include: { plan: { select: { id: true, key: true, name: true, role: true, amountAud: true, features: true, isAddOn: true } } },
    orderBy: { activatedAt: "desc" },
  });
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

    subscriptionRow = await (prisma as any).userSubscription.create({
      data: {
        userId,
        planId,
        status:         "ACTIVE",
        mockReceiptRef,
        activatedAt:    new Date(),
      },
    });

    for (const addOnId of addOnPlanIds) {
      const addOnPlan = await (prisma as any).plan.findFirst({
        where: { id: addOnId, role: activeRole, active: true, isAddOn: true },
      });
      if (!addOnPlan) throw new NotFoundError(`Add-on plan not found or not valid for role ${activeRole}`);

      const addOnReceiptRef = `DEV-${randomUUID().toUpperCase()}`;
      const addOnRow = await (prisma as any).userSubscription.create({
        data: {
          userId,
          planId: addOnId,
          status:      "ACTIVE",
          mockReceiptRef: addOnReceiptRef,
          activatedAt: new Date(),
        },
      });
      addOnRows.push({ ...addOnRow, plan: addOnPlan });
    }
  }

  await prisma.user.update({ where: { id: userId }, data: { status: "ACTIVE" } });

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
    where: { userId, status: "ACTIVE", plan: { role } },
  });
  return sub !== null;
}

// ─── Active base-plan key (free-tier detection) ──────────────────────────────
// Returns the plan key (e.g. WORKER_FREE, COORDINATOR_BASIC) of the user's
// active non-add-on subscription for the given role, or null if none.

export async function getActiveBasePlanKey(userId: string, role: UserRole): Promise<string | null> {
  const sub = await (prisma as any).userSubscription.findFirst({
    where:   { userId, status: "ACTIVE", plan: { role, isAddOn: false } },
    include: { plan: { select: { key: true } } },
    orderBy: { activatedAt: "desc" },
  });
  return sub?.plan?.key ?? null;
}

// ─── hasActiveAddOn ───────────────────────────────────────────────────────────
// Checks for a specific active add-on plan (e.g. "COORDINATOR_GROWTH",
// "WORKER_AVAILABLE_NOW") — unlike subscriptionGated, which only confirms the
// user holds *any* active plan for the role.

export async function hasActiveAddOn(userId: string, role: UserRole, planKey: string): Promise<boolean> {
  const sub = await (prisma as any).userSubscription.findFirst({
    where: { userId, status: "ACTIVE", plan: { role, isAddOn: true, key: planKey } },
  });
  return sub !== null;
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
}

export async function getActiveProviderOrgCaps(providerUserId: string): Promise<ProviderOrgCaps | null> {
  const sub = await (prisma as any).userSubscription.findFirst({
    where: {
      userId: providerUserId,
      status: "ACTIVE",
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
  };
}
