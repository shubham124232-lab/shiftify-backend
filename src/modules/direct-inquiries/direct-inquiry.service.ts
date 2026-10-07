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
import { INQUIRY_STATUSES, type SendDirectInquiryInput } from "../../validators/direct-inquiry.schema";

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

  // PR-CP02: an enquiry about a capacity or Home and Living listing is tied to that listing.
  let kind: "DIRECT" | "CAPACITY" | "HOME_LIVING" = "DIRECT";
  if (input.listingId) {
    const listing = await prisma.providerListing.findUnique({ where: { id: input.listingId }, select: { providerUserId: true, listingCategory: true, status: true } });
    if (!listing || listing.providerUserId !== input.recipientUserId) throw new BadRequestError("That listing does not belong to this provider");
    kind = listing.listingCategory === "HOUSING" ? "HOME_LIVING" : "CAPACITY";
  }

  const inquiry = await prisma.directInquiry.create({
    data: {
      senderUserId,
      recipientUserId: input.recipientUserId,
      participantConnectionId: input.participantConnectionId,
      body: input.body,
      kind,
      listingId: input.listingId,
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

// The listing an enquiry is about (PR-CP02), looked up in one query for the whole page of results.
async function withListingTitles<T extends { listingId: string | null }>(rows: T[]): Promise<(T & { listingTitle: string | null })[]> {
  const ids = [...new Set(rows.map((r) => r.listingId).filter((x): x is string => !!x))];
  const listings = ids.length ? await prisma.providerListing.findMany({ where: { id: { in: ids } }, select: { id: true, title: true } }) : [];
  const titles = new Map(listings.map((l) => [l.id, l.title]));
  return rows.map((r) => ({ ...r, listingTitle: r.listingId ? titles.get(r.listingId) ?? null : null }));
}

export async function listSentInquiries(userId: string) {
  const rows = await prisma.directInquiry.findMany({
    where: { senderUserId: userId },
    orderBy: { createdAt: "desc" },
    include: { recipient: { select: { id: true, name: true, avatarUrl: true } } },
  });
  return withListingTitles(rows);
}

export async function listReceivedInquiries(userId: string) {
  const rows = await prisma.directInquiry.findMany({
    where: { recipientUserId: userId },
    orderBy: { createdAt: "desc" },
    include: { sender: { select: { id: true, name: true, avatarUrl: true } } },
  });
  return withListingTitles(rows);
}

// A recipient-side status change (PR-M02). Answering or progressing a direct enquiry never uses a Provider Action.
export async function updateInquiryStatus(inquiryId: string, userId: string, status: string) {
  const inquiry = await prisma.directInquiry.findUnique({ where: { id: inquiryId } });
  if (!inquiry) throw new NotFoundError("Inquiry not found");
  if (inquiry.recipientUserId !== userId) throw new ForbiddenError("Only the recipient can change the status");
  const allowed = (INQUIRY_STATUSES as Record<string, readonly string[]>)[inquiry.kind] ?? INQUIRY_STATUSES.DIRECT;
  if (!allowed.includes(status)) throw new BadRequestError(`Status must be one of: ${allowed.join(", ")}`);
  return prisma.directInquiry.update({ where: { id: inquiryId }, data: { status, readAt: inquiry.readAt ?? new Date() } });
}

// Reply to an enquiry — sent as a new row to the original sender, linked to the first message.
export async function replyToInquiry(inquiryId: string, userId: string, body: string) {
  const parent = await prisma.directInquiry.findUnique({ where: { id: inquiryId } });
  if (!parent) throw new NotFoundError("Inquiry not found");
  if (parent.recipientUserId !== userId) throw new ForbiddenError("Only the recipient can reply");
  if (await isBlockedFromMessaging(userId, [parent.senderUserId])) {
    throw new ForbiddenError("You can't message this person.");
  }
  const rootId = parent.parentInquiryId ?? parent.id;
  const reply = await prisma.directInquiry.create({
    data: {
      senderUserId: userId, recipientUserId: parent.senderUserId, body, kind: parent.kind,
      listingId: parent.listingId, parentInquiryId: rootId, status: "RESPONDED",
    },
    include: { sender: { select: { id: true, name: true, avatarUrl: true } } },
  });
  await prisma.directInquiry.update({
    where: { id: rootId },
    data: { status: parent.kind === "HOME_LIVING" ? "QUALIFIED" : "RESPONDED", readAt: parent.readAt ?? new Date() },
  });
  await notify.sendPushNotification(parent.senderUserId, "New reply", `${reply.sender.name} replied to your enquiry.`, { directInquiryId: reply.id }, "DIRECT_INQUIRY_RECEIVED");
  return reply;
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
