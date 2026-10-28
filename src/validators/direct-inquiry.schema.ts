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
  DIRECT:      ["NEW", "RESPONDED", "FOLLOW_UP", "ASSESSMENT", "CONFIRMED", "CONVERTED", "UNSUITABLE", "CLOSED", "ARCHIVED"],
  CAPACITY:    ["NEW", "RESPONDED", "FOLLOW_UP", "ASSESSMENT", "CONFIRMED", "CONVERTED", "UNSUITABLE", "CLOSED", "ARCHIVED"],
  HOME_LIVING: ["NEW", "QUALIFIED", "INSPECTION", "COMPATIBILITY", "IN_PROGRESS", "CONFIRMED", "UNSUITABLE", "CLOSED", "ARCHIVED"],
} as const;

export const updateInquiryStatusSchema = z.object({ status: z.string().min(1).max(30) }).strict();
export const saveIntakeSchema = z.object({
  ownerUserId:     z.string().uuid().nullable().optional(),
  internalNote:    z.string().max(2000).optional(),
  status:          z.string().min(1).max(30).optional(),
  appointmentAt:   z.string().datetime({ offset: true }).nullable().optional(),
  appointmentType: z.enum(["INTAKE_CALL", "PROPERTY_INSPECTION", "COMPATIBILITY_MEETING"]).nullable().optional(),
}).strict();
export const replyInquirySchema = z.object({ body: z.string().trim().min(1, "Message can't be empty").max(2000) }).strict();

export type SendDirectInquiryInput = z.infer<typeof sendDirectInquirySchema>;
