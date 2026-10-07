import { Router } from "express";
import { asyncHandler } from "../../utils/async-handler";
import { requireAuth } from "../../middleware/auth.middleware";
import * as ctrl from "./auth.controller";
import * as otpCtrl from "./otp.controller";
import { loginAttemptLimit, loginIdentifierLimit, otpAttemptLimit, otpInitiationLimit } from "../../middleware/auth-rate-limit.middleware";
import { getDevInbox } from "../../lib/notify";
import { devInboxEnabled } from "../../config/env";

const router = Router();

// ── Core auth ──────────────────────────────────────────────────────────────
router.post("/register",      asyncHandler(ctrl.register));
router.post("/login",         loginAttemptLimit, loginIdentifierLimit, asyncHandler(ctrl.login));
router.post("/login/verify",  otpAttemptLimit, asyncHandler(ctrl.loginVerify));
router.post("/refresh",       asyncHandler(ctrl.refresh));
router.post("/logout",        asyncHandler(ctrl.logout));

// ── Multi-role (require a valid access token) ──────────────────────────────
router.post("/roles", requireAuth, asyncHandler(ctrl.addRole));
router.post("/switch-role", requireAuth, asyncHandler(ctrl.switchRole));

// ── OTP / email+phone verification (authenticated) ────────────────────────
router.post("/verify/request", requireAuth, asyncHandler(otpCtrl.requestVerification));
router.post("/verify/resend",  requireAuth, asyncHandler(otpCtrl.requestVerification)); // alias
router.post("/verify/confirm", requireAuth, otpAttemptLimit, asyncHandler(otpCtrl.confirmVerification));

// ── Username availability (unauthenticated) ────────────────────────────────
router.get("/check-username", asyncHandler(ctrl.checkUsername));

// ── Password reset (unauthenticated) ──────────────────────────────────────
router.post("/password/forgot", otpInitiationLimit, asyncHandler(otpCtrl.forgotPassword));
router.post("/password/reset",  otpAttemptLimit, asyncHandler(otpCtrl.resetPassword));

// ── Dev inbox — returns mock emails/SMS sent during this server session ───
// Local development / test runtime only — never mounted when NODE_ENV=production.
if (devInboxEnabled) {
  router.get("/dev/inbox", (_req, res) => {
    res.json({ ok: true, data: { messages: getDevInbox() } });
  });
}

export default router;
