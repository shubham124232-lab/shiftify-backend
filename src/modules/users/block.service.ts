import { prisma } from "../../lib/prisma";
import { NotFoundError, BadRequestError } from "../../lib/errors";
import type { BlockUserInput } from "../../validators/block.schema";

// SW doc Window 44 — worker account protection: block messages and/or hide
// the blocker's own profile from a specific user, with an optional report reason.

export async function blockUser(blockerUserId: string, blockedUserId: string, input: BlockUserInput) {
  if (blockerUserId === blockedUserId) throw new BadRequestError("You can't block yourself.");
  const target = await prisma.user.findUnique({ where: { id: blockedUserId } });
  if (!target) throw new NotFoundError("We couldn't find that user.");

  return prisma.userBlock.upsert({
    where:  { blockerUserId_blockedUserId: { blockerUserId, blockedUserId } },
    create: {
      blockerUserId, blockedUserId,
      blockMessages: input.blockMessages ?? true,
      hideProfile:   input.hideProfile ?? true,
      reportReason:  input.reportReason ?? null,
    },
    update: {
      blockMessages: input.blockMessages ?? true,
      hideProfile:   input.hideProfile ?? true,
      reportReason:  input.reportReason ?? null,
    },
  });
}

export async function unblockUser(blockerUserId: string, blockedUserId: string) {
  await prisma.userBlock.deleteMany({ where: { blockerUserId, blockedUserId } });
  return { ok: true };
}

export async function listBlocks(blockerUserId: string) {
  return prisma.userBlock.findMany({
    where:   { blockerUserId },
    include: { blocked: { select: { id: true, name: true, avatarUrl: true } } },
    orderBy: { createdAt: "desc" },
  });
}

// Used by job.service.ts's sendMessage — true if anyone who has this user
// blocked (with blockMessages on) is a party to the conversation.
export async function isBlockedFromMessaging(senderUserId: string, partyUserIds: string[]) {
  const others = partyUserIds.filter((id) => id !== senderUserId);
  if (others.length === 0) return false;
  const block = await prisma.userBlock.findFirst({
    where: { blockerUserId: { in: others }, blockedUserId: senderUserId, blockMessages: true },
  });
  return !!block;
}

