// SC-F06 "Message first" (Journey 9) — send a one-shot pre-connection
// message to a worker/provider before any job/connection exists. Deliberately
// flat/no-threading, see DirectInquiry model comment in schema.prisma.
import { z } from "zod";

export const sendDirectInquirySchema = z.object({
  recipientUserId: z.string().uuid(),
  body: z.string().trim().min(1, "Message can't be empty").max(2000),
  // Set when sent from SC Journey 9's participant-context selector.
  participantConnectionId: z.string().uuid().optional(),
  // PR-CP02 — the capacity or Home and Living listing the enquiry is about.
  listingId: z.string().uuid().optional(),
});

export const INQUIRY_STATUSES = {
  DIRECT:      ["NEW", "RESPONDED", "FOLLOW_UP", "CONVERTED", "CLOSED"],
  CAPACITY:    ["NEW", "RESPONDED", "FOLLOW_UP", "CONVERTED", "CLOSED"],
  HOME_LIVING: ["NEW", "QUALIFIED", "INSPECTION", "IN_PROGRESS", "CLOSED"],
} as const;

export const updateInquiryStatusSchema = z.object({ status: z.string().min(1).max(30) }).strict();
export const replyInquirySchema = z.object({ body: z.string().trim().min(1, "Message can't be empty").max(2000) }).strict();

export type SendDirectInquiryInput = z.infer<typeof sendDirectInquirySchema>;
