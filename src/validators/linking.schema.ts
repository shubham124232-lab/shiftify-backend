import { z } from "zod";

// Shared shape for both /linking/workers and /linking/participants.
// MANAGED accounts have username + password only — no email, no phone.
const managedAccountSchema = z.object({
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(40, "Username must be at most 40 characters")
    .regex(/^[a-zA-Z0-9._-]+$/, "Use letters, numbers, dot, dash, or underscore"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1).max(120),
});

// POST /linking/workers — Provider creates a MANAGED SUPPORT_WORKER.
export const createWorkerSchema = managedAccountSchema;
export type CreateWorkerInput = z.infer<typeof createWorkerSchema>;

// POST /linking/participants — Coordinator creates a MANAGED PARTICIPANT.
export const createParticipantSchema = managedAccountSchema;
export type CreateParticipantInput = z.infer<typeof createParticipantSchema>;
