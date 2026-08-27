// SC-F06 "Message first" (Journey 9) — send a one-shot pre-connection
// message to a worker/provider before any job/connection exists. Deliberately
// flat/no-threading, see DirectInquiry model comment in schema.prisma.
import { z } from "zod";

export const sendDirectInquirySchema = z.object({
  recipientUserId: z.string().uuid(),
  body: z.string().trim().min(1, "Message can't be empty").max(2000),
  // Set when sent from SC Journey 9's participant-context selector.
  participantConnectionId: z.string().uuid().optional(),
});

export type SendDirectInquiryInput = z.infer<typeof sendDirectInquirySchema>;
