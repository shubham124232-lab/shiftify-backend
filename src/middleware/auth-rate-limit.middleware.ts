// Server-side brute-force protection for the credential / OTP endpoints.
// In-memory per process (same trade-off as the existing OTP send limiter and
// the public shiftboard limiter) — resets on restart, not shared across instances.
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import type { Request, Response } from "express";

const WINDOW_MS = 15 * 60 * 1000;

function identifierOf(req: Request): string {
  const raw = (req.body as { identifier?: unknown } | undefined)?.identifier;
  return typeof raw === "string" ? raw.trim().toLowerCase().slice(0, 120) : "";
}

// Same response for every identifier, so the limiter never reveals whether an account exists.
function tooMany(_req: Request, res: Response): void {
  res.status(429).json({
    error: {
      code: "RATE_LIMITED",
      message: "Too many attempts. Please wait a few minutes and try again.",
    },
  });
}

const base = { windowMs: WINDOW_MS, standardHeaders: true, legacyHeaders: false, handler: tooMany } as const;

// Failed password attempts per (IP + identifier). Successful logins do not count.
export const loginAttemptLimit = rateLimit({
  ...base,
  limit: 10,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `${ipKeyGenerator(req.ip ?? "")}|${identifierOf(req)}`,
});

// Failed attempts per identifier across all IPs (distributed guessing against one account).
export const loginIdentifierLimit = rateLimit({
  ...base,
  limit: 30,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `id|${identifierOf(req)}`,
});

// Wrong OTP codes on login/verify and password reset: per IP.
export const otpAttemptLimit = rateLimit({
  ...base,
  limit: 15,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? ""),
});

// Every request counts: forgot-password / OTP initiation sends an SMS or email.
export const otpInitiationLimit = rateLimit({
  ...base,
  limit: 8,
  keyGenerator: (req) => `${ipKeyGenerator(req.ip ?? "")}|${identifierOf(req)}`,
});
