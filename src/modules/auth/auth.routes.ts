import { Router } from "express";
import { asyncHandler } from "../../utils/async-handler";
import { requireAuth } from "../../middleware/auth.middleware";
import * as ctrl from "./auth.controller";
import * as otpCtrl from "./otp.controller";
import { getDevInbox } from "../../lib/notify";
import { env } from "../../config/env";

const router = Router();

// ── Core auth ──────────────────────────────────────────────────────────────
router.post("/register",      asyncHandler(ctrl.register));
router.post("/login",         asyncHandler(ctrl.login));
router.post("/login/verify",  asyncHandler(ctrl.loginVerify));
router.post("/refresh",       asyncHandler(ctrl.refresh));
router.post("/logout",        asyncHandler(ctrl.logout));

// ── Multi-role (require a valid access token) ──────────────────────────────
router.post("/roles", requireAuth, asyncHandler(ctrl.addRole));
router.post("/switch-role", requireAuth, asyncHandler(ctrl.switchRole));

// ── OTP / email+phone verification (authenticated) ────────────────────────
router.post("/verify/request", requireAuth, asyncHandler(otpCtrl.requestVerification));
router.post("/verify/resend",  requireAuth, asyncHandler(otpCtrl.requestVerification)); // alias
router.post("/verify/confirm", requireAuth, asyncHandler(otpCtrl.confirmVerification));

// ── Username availability (unauthenticated) ────────────────────────────────
router.get("/check-username", asyncHandler(ctrl.checkUsername));

// ── Password reset (unauthenticated) ──────────────────────────────────────
router.post("/password/forgot", asyncHandler(otpCtrl.forgotPassword));
router.post("/password/reset",  asyncHandler(otpCtrl.resetPassword));

// ── Dev inbox — returns mock emails/SMS sent during this server session ───
// Disabled in production unless RETURN_DEV_OTP=true (staging without real SMS).
if (env.NODE_ENV !== "production" || env.RETURN_DEV_OTP) {
  router.get("/dev/inbox", (_req, res) => {
    res.json({ ok: true, data: { messages: getDevInbox() } });
  });
}

export default router;
