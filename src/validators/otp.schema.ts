import { z } from "zod";

// Channel accepted by all OTP endpoints.
const channelSchema = z.enum(["email", "phone"], {
  errorMap: () => ({ message: 'channel must be "email" or "phone"' }),
});

// POST /auth/verify/request  — ask for a new OTP on the authenticated account.
export const verifyRequestSchema = z.object({
  channel: channelSchema,
});
export type VerifyRequestInput = z.infer<typeof verifyRequestSchema>;

// POST /auth/verify/confirm  — submit the received code to verify email / phone.
export const verifyConfirmSchema = z.object({
  channel: channelSchema,
  code: z.string().length(6, "Code must be 6 digits").regex(/^\d{6}$/, "Code must be numeric"),
});
export type VerifyConfirmInput = z.infer<typeof verifyConfirmSchema>;

// POST /auth/password/forgot  — request a password-reset code (unauthenticated).
export const forgotPasswordSchema = z.object({
  identifier: z.string().min(1, "Enter your email or phone number"),
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

// POST /auth/password/reset  — consume the code + set a new password (unauthenticated).
export const resetPasswordSchema = z.object({
  identifier: z.string().min(1, "Enter your email or phone number"),
  code: z.string().length(6, "Code must be 6 digits").regex(/^\d{6}$/, "Code must be numeric"),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
