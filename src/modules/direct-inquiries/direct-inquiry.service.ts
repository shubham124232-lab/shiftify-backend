// SC-F06 "Message first" (Journey 9) — a genuinely new, minimal
// pre-connection messaging concept, deliberately NOT built on JobMessage.
// See the DirectInquiry model comment in schema.prisma for why: JobMessage
// only exists attached to an existing SupportRequest, gated to that job's
// parties — there's no job-less/pre-connection thread there.
//
// This is a flat, one-shot "send an initial message" feature — no threading,
// no replies. Once the recipient wants to respond for real, that happens
// through the normal channels (accepting an invite, starting a job, etc.)
// which then get a real JobMessage thread.
import { prisma } from "../../lib/prisma";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../lib/errors";
import { isBlockedFromMessaging } from "../users/block.service";
import { notify } from "../../lib/notify";
import type { SendDirectInquiryInput } from "../../validators/direct-inquiry.schema";

export async function sendDirectInquiry(senderUserId: string, input: SendDirectInquiryInput) {
  if (input.recipientUserId === senderUserId) {
    throw new BadRequestError("You can't send a direct inquiry to yourself");
  }

  const recipient = await prisma.user.findUnique({
    where: { id: input.recipientUserId },
    select: { id: true, name: true },
  });
  if (!recipient) throw new NotFoundError("Recipient not found");

  if (await isBlockedFromMessaging(senderUserId, [input.recipientUserId])) {
    throw new ForbiddenError("You can't message this person — they've blocked messages from you.");
  }

  const inquiry = await prisma.directInquiry.create({
    data: {
      senderUserId,
      recipientUserId: input.recipientUserId,
      participantConnectionId: input.participantConnectionId,
      body: input.body,
    },
    include: { sender: { select: { id: true, name: true, avatarUrl: true } } },
  });

  await notify.sendPushNotification(
    input.recipientUserId,
    "New message",
    `${inquiry.sender.name} sent you a message.`,
    { directInquiryId: inquiry.id },
    "DIRECT_INQUIRY_RECEIVED",
  );

  return inquiry;
}

export async function listSentInquiries(userId: string) {
  return prisma.directInquiry.findMany({
    where: { senderUserId: userId },
    orderBy: { createdAt: "desc" },
    include: { recipient: { select: { id: true, name: true, avatarUrl: true } } },
  });
}

export async function listReceivedInquiries(userId: string) {
  return prisma.directInquiry.findMany({
    where: { recipientUserId: userId },
    orderBy: { createdAt: "desc" },
    include: { sender: { select: { id: true, name: true, avatarUrl: true } } },
  });
}

export async function markInquiryRead(inquiryId: string, userId: string) {
  const inquiry = await prisma.directInquiry.findUnique({ where: { id: inquiryId } });
  if (!inquiry) throw new NotFoundError("Inquiry not found");
  if (inquiry.recipientUserId !== userId) {
    throw new ForbiddenError("Only the recipient can mark this inquiry read");
  }
  if (inquiry.readAt) return inquiry;
  return prisma.directInquiry.update({
    where: { id: inquiryId },
    data: { readAt: new Date() },
  });
}
