import { randomBytes } from "crypto";
import { prisma } from "../../lib/prisma";
import { getProfileProgress } from "../profiles/profile.service";

export const REFERRAL_TARGET = 10;
const COUNTED_ROLES = ["PROVIDER", "SUPPORT_WORKER", "COORDINATOR"] as const;

const ROLE_LABEL: Record<string, string> = { PROVIDER: "Provider", SUPPORT_WORKER: "Independent Support Worker", COORDINATOR: "Support Coordinator" };

// Codes avoid look-alike characters so they can be read out over the phone.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function newCode(): string {
  const bytes = randomBytes(6);
  return "SHF-" + Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

export async function getOrCreateCode(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { referralCode: true } });
  if (user?.referralCode) return user.referralCode;
  for (let i = 0; i < 5; i++) {
    const code = newCode();
    try {
      const updated = await prisma.user.update({ where: { id: userId }, data: { referralCode: code }, select: { referralCode: true } });
      return updated.referralCode as string;
    } catch {
      // unique clash: try another code
    }
  }
  throw new Error("Could not allocate a referral code");
}

// Called at registration. An unknown code never blocks sign-up; it is simply ignored.
export async function recordReferral(referredUserId: string, rawCode?: string | null): Promise<void> {
  const code = rawCode?.trim().toUpperCase();
  if (!code) return;
  const referrer = await prisma.user.findUnique({ where: { referralCode: code }, select: { id: true } });
  if (!referrer || referrer.id === referredUserId) return;
  await prisma.referral.upsert({
    where: { referredUserId },
    update: {},
    create: { referrerUserId: referrer.id, referredUserId, code },
  });
}

// Decides one pending referral. Qualified once: genuinely new SELF account, contact verified, relevant profile complete.
async function evaluate(referral: { id: string; referrerUserId: string; referredUserId: string }) {
  const referred = await prisma.user.findUnique({
    where: { id: referral.referredUserId },
    include: { roles: { select: { role: true } } },
  });
  const notEligible = (reason: string) =>
    prisma.referral.update({ where: { id: referral.id }, data: { status: "NOT_ELIGIBLE", reason } });
  if (!referred) return notEligible("Account no longer exists");
  if (referred.accountType !== "SELF") return notEligible("Provider-managed accounts do not count");
  const roles = referred.roles.map((r) => r.role as string);
  const counted = roles.find((r) => (COUNTED_ROLES as readonly string[]).includes(r));
  if (!counted) return notEligible("Only Providers, Independent Support Workers and Support Coordinators count");
  const sameOrg = await prisma.providerAdministrator.findFirst({ where: { providerUserId: referral.referrerUserId, userId: referred.id }, select: { id: true } });
  if (sameOrg) return notEligible("Additional administrators of the same Provider organisation do not count");

  if (!referred.emailVerified && !referred.phoneVerified) return null; // still waiting
  const progress = await getProfileProgress(referred.id, counted);
  if (!progress.isComplete) return null; // still waiting
  return prisma.referral.update({ where: { id: referral.id }, data: { status: "QUALIFIED", reason: null, qualifiedAt: new Date() } });
}

function waitingReason(emailOrPhone: boolean): string {
  return emailOrPhone ? "Waiting for the profile to be completed" : "Waiting for contact verification";
}

export async function myReferrals(userId: string) {
  // Eligible referrer: an active subscribed Provider organisation (free-action and pay-as-you-go accounts earn nothing).
  const now = new Date();
  const sub = await prisma.userSubscription.findFirst({
    where: {
      userId, status: "ACTIVE", plan: { role: "PROVIDER", isAddOn: false, amountAud: { gt: 0 } },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    orderBy: { activatedAt: "desc" },
    include: { plan: { select: { key: true, name: true } } },
  });
  const eligible = !!sub;
  const code = await getOrCreateCode(userId);

  const pending = await prisma.referral.findMany({ where: { referrerUserId: userId, status: "PENDING" } });
  for (const p of pending) await evaluate(p);

  const rows = await prisma.referral.findMany({ where: { referrerUserId: userId }, orderBy: { createdAt: "desc" }, take: 100 });
  const people = await prisma.user.findMany({
    where: { id: { in: rows.map((r) => r.referredUserId) } },
    select: { id: true, name: true, emailVerified: true, phoneVerified: true, roles: { select: { role: true } } },
  });
  const byId = new Map(people.map((p) => [p.id, p]));
  const qualified = rows.filter((r) => r.status === "QUALIFIED").length;

  return {
    eligible,
    ineligibleReason: eligible ? null : "Refer & Earn rewards are available exclusively to active subscribers. Free-action and pay-as-you-go accounts do not earn rewards.",
    code,
    target: REFERRAL_TARGET,
    qualified,
    rewardUnlocked: eligible && qualified >= REFERRAL_TARGET,
    // The free month covers the next monthly invoice after the current paid period.
    rewardCovers: eligible && qualified >= REFERRAL_TARGET ? (sub?.expiresAt ?? null) : null,
    referrals: rows.map((r) => {
      const person = byId.get(r.referredUserId);
      const role = person?.roles.map((x) => x.role as string).find((x) => (COUNTED_ROLES as readonly string[]).includes(x));
      const first = (person?.name ?? "New user").split(" ")[0];
      return {
        id: r.id,
        name: first,
        role: role ? ROLE_LABEL[role] : "Other role",
        status: r.status,
        reason: r.status === "NOT_ELIGIBLE" ? r.reason : r.status === "PENDING" ? waitingReason(!!(person?.emailVerified || person?.phoneVerified)) : null,
        createdAt: r.createdAt,
      };
    }),
  };
}
