import type { Request, Response } from "express";
import {
  verifyRequestSchema,
  verifyConfirmSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "../../validators/otp.schema";
import * as otpService from "./otp.service";
import { success } from "../../utils/response";
import { UnauthorizedError } from "../../lib/errors";
import { signAccessToken } from "../../lib/jwt";

// POST /auth/verify/request — send an OTP to the caller's email or phone.
export async function requestVerification(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const body = verifyRequestSchema.parse(req.body);
  const result = await otpService.requestVerification({
    userId: req.user.id,
    channel: body.channel,
  });
  success(res, result);
}

// POST /auth/verify/confirm — submit the OTP to mark email/phone verified.
// Returns a fresh access token so Flutter/mobile clients can continue immediately
// without a separate /auth/refresh call (which requires HttpOnly cookie support).
export async function confirmVerification(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const body = verifyConfirmSchema.parse(req.body);
  const result = await otpService.confirmVerification({
    userId: req.user.id,
    channel: body.channel,
    code: body.code,
  });
  const accessToken = signAccessToken({
    sub:        req.user.id,
    activeRole: req.activeRole ?? req.user.status,
    roles:      req.roles ?? [],
    status:     req.user.status,
  });
  success(res, {
    verified:      true,
    phoneVerified: result.phoneVerified,
    emailVerified: result.emailVerified,
    accessToken,
  });
}

// POST /auth/password/forgot — request a password-reset code (unauthenticated).
export async function forgotPassword(req: Request, res: Response): Promise<void> {
  const body = forgotPasswordSchema.parse(req.body);
  const result = await otpService.forgotPassword({ identifier: body.identifier });
  success(res, result);
}

// POST /auth/password/reset — consume the reset code and set a new password.
export async function resetPassword(req: Request, res: Response): Promise<void> {
  const body = resetPasswordSchema.parse(req.body);
  await otpService.resetPassword({
    identifier: body.identifier,
    code: body.code,
    newPassword: body.newPassword,
  });
  success(res, { message: "Password reset successfully. Please log in again." });
}
