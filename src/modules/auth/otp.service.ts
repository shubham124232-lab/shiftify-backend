// OTP service — owns all one-time-code logic:
//   Email / phone verification (VERIFY_EMAIL, VERIFY_PHONE)
//   Password reset (PASSWORD_RESET)
//   Login OTP — 2FA step after credential check (LOGIN)
//
// Codes are 6-digit numerics, SHA-256 hashed at rest, valid for OTP_TTL_MINUTES.
// In non-prod the plaintext code is returned in the API response (_dev_code).

import crypto from "node:crypto";
import { prisma } from "../../lib/prisma";
import { hashPassword, assertPasswordStrength } from "../../lib/hash";
import { BadRequestError, NotFoundError, UnauthorizedError } from "../../lib/errors";
import { notify } from "../../lib/notify";
import { env } from "../../config/env";
import { verifyEmail as tmplVerifyEmail, passwordReset as tmplPasswordReset } from "../../lib/email-templates";
import type { OtpChannel, OtpPurpose } from "@prisma/client";

// Constant-time sleep — prevents enumeration via response timing.
const FORGOT_MIN_MS = 800;
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── In-memory rate limit: max 3 sends per (userId+purpose) per 10 min ────────

const _rateBuckets = new Map<string, { count: number; windowStart: number }>();
const RATE_WINDOW_MS = 10 * 60 * 1_000;
const RATE_MAX = 3;

function checkRateLimit(key: string): void {
  const now = Date.now();
  const bucket = _rateBuckets.get(key);
  if (!bucket || now - bucket.windowStart > RATE_WINDOW_MS) {
    _rateBuckets.set(key, { count: 1, windowStart: now });
    return;
  }
  if (bucket.count >= RATE_MAX) {
    throw new BadRequestError("Too many code requests — please wait before retrying.");
  }
  bucket.count += 1;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const OTP_TTL_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;

// Plaintext codes are echoed in responses outside production, or in production
// when RETURN_DEV_OTP=true (staging without a real SMS/email provider).
const returnDevCode = (): boolean => env.NODE_ENV !== "production" || env.RETURN_DEV_OTP;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateCode(): string {
  return String(crypto.randomInt(100_000, 1_000_000));
}

function hashCode(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

function channelEnum(channel: "email" | "phone"): OtpChannel {
  return channel === "email" ? "EMAIL" : "PHONE";
}

function purposeForChannel(ch: OtpChannel): OtpPurpose {
  return ch === "EMAIL" ? "VERIFY_EMAIL" : "VERIFY_PHONE";
}

async function issueCode(
  userId: string,
  channel: OtpChannel,
  purpose: OtpPurpose,
  destination: string,
): Promise<string> {
  await prisma.verificationCode.updateMany({
    where: { userId, purpose, consumedAt: null, expiresAt: { gt: new Date() } },
    data:  { consumedAt: new Date() },
  });

  const code = generateCode();
  await prisma.verificationCode.create({
    data: {
      userId,
      channel,
      purpose,
      destination,
      codeHash:  hashCode(code),
      expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1_000),
    },
  });

  return code;
}

async function consumeCode(
  userId: string,
  channel: OtpChannel,
  purpose: OtpPurpose,
  submittedCode: string,
): Promise<void> {
  const record = await prisma.verificationCode.findFirst({
    where: { userId, channel, purpose, consumedAt: null, expiresAt: { gt: new Date() } },
  });

  if (!record) throw new UnauthorizedError("No active verification code — request a new one.");
  if (record.attempts >= OTP_MAX_ATTEMPTS) {
    throw new UnauthorizedError("Too many failed attempts — request a new code.");
  }

  await prisma.verificationCode.update({
    where: { id: record.id },
    data:  { attempts: { increment: 1 } },
  });

  if (hashCode(submittedCode) !== record.codeHash) {
    throw new UnauthorizedError("Incorrect code.");
  }

  await prisma.verificationCode.update({
    where: { id: record.id },
    data:  { consumedAt: new Date() },
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

// POST /auth/verify/request
export async function requestVerification(input: {
  userId: string;
  channel: "email" | "phone";
}): Promise<{ message: string; _dev_code?: string }> {
  const user = await prisma.user.findUnique({ where: { id: input.userId } });
  if (!user) throw new NotFoundError("User not found");

  const ch = channelEnum(input.channel);
  const destination = ch === "EMAIL" ? user.email : user.phone;

  if (!destination) {
    throw new BadRequestError(
      `No ${input.channel} address on this account. Add one first.`,
    );
  }

  checkRateLimit(`${user.id}:${ch}`);
  const code = await issueCode(user.id, ch, purposeForChannel(ch), destination);

  if (ch === "EMAIL") {
    const tmpl = tmplVerifyEmail(code, OTP_TTL_MINUTES);
    await notify.sendEmail(destination, tmpl.subject, tmpl.text, tmpl.html);
  } else {
    await notify.sendSms(
      destination,
      `[Shiftify] Your verification code is ${code}. Valid for ${OTP_TTL_MINUTES} minutes. Do not share this code.`,
    );
  }

  return {
    message: `A verification code has been sent to your ${input.channel}.`,
    ...(returnDevCode() ? { _dev_code: code } : {}),
  };
}

// POST /auth/verify/confirm
export async function confirmVerification(input: {
  userId: string;
  channel: "email" | "phone";
  code: string;
}): Promise<{ phoneVerified: boolean; emailVerified: boolean }> {
  const ch = channelEnum(input.channel);
  await consumeCode(input.userId, ch, purposeForChannel(ch), input.code);
  const update = ch === "EMAIL" ? { emailVerified: true } : { phoneVerified: true };
  const user = await prisma.user.update({
    where: { id: input.userId },
    data: update,
    select: { phoneVerified: true, emailVerified: true },
  });
  return user;
}

// POST /auth/password/forgot — constant-time response to prevent enumeration.
export async function forgotPassword(input: {
  identifier: string;
}): Promise<{ message: string; _dev_code?: string }> {
  const start = Date.now();
  const MSG = "If an account with that identifier exists, a reset code has been sent.";

  try {
    const id = input.identifier.trim();
    const isEmail = id.includes("@");
    const user = await prisma.user.findFirst({
      where: isEmail ? { email: id.toLowerCase() } : { phone: id },
    });

    if (!user) return { message: MSG };

    const ch: OtpChannel = isEmail ? "EMAIL" : "PHONE";
    const destination = isEmail ? user.email : user.phone;
    if (!destination) return { message: MSG };

    checkRateLimit(`${user.id}:RESET`);
    const code = await issueCode(user.id, ch, "PASSWORD_RESET", destination);

    if (ch === "EMAIL") {
      const tmpl = tmplPasswordReset(code, OTP_TTL_MINUTES);
      await notify.sendEmail(destination, tmpl.subject, tmpl.text, tmpl.html);
    } else {
      await notify.sendSms(
        destination,
        `[Shiftify] Password reset code: ${code}. Valid ${OTP_TTL_MINUTES} mins. If you did not request this, ignore.`,
      );
    }

    const result: { message: string; _dev_code?: string } = { message: MSG };
    if (returnDevCode()) result._dev_code = code;
    return result;
  } finally {
    const elapsed = Date.now() - start;
    if (elapsed < FORGOT_MIN_MS) await sleep(FORGOT_MIN_MS - elapsed);
  }
}

// POST /auth/password/reset
export async function resetPassword(input: {
  identifier: string;
  code: string;
  newPassword: string;
}): Promise<void> {
  const id = input.identifier.trim();
  const isEmail = id.includes("@");

  const user = await prisma.user.findFirst({
    where: isEmail ? { email: id.toLowerCase() } : { phone: id },
  });

  if (!user) throw new UnauthorizedError("Invalid or expired reset code.");

  assertPasswordStrength(input.newPassword);

  const ch: OtpChannel = isEmail ? "EMAIL" : "PHONE";
  await consumeCode(user.id, ch, "PASSWORD_RESET", input.code);

  const passwordHash = await hashPassword(input.newPassword);

  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
    prisma.session.deleteMany({ where: { userId: user.id } }),
  ]);
}

// ─── Login OTP ────────────────────────────────────────────────────────────────

function maskPhone(phone: string): string {
  if (phone.length <= 4) return phone;
  const visible = phone.slice(-2);
  return phone.slice(0, 4) + "*".repeat(phone.length - 6) + visible;
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  const maskedLocal = local.length <= 2 ? local[0] + "*" : local[0] + "*".repeat(local.length - 2) + local.slice(-1);
  const [host, ...tlds] = domain.split(".");
  const maskedHost = host.length <= 2 ? host[0] + "*" : host[0] + "*".repeat(host.length - 2) + host.slice(-1);
  return `${maskedLocal}@${maskedHost}.${tlds.join(".")}`;
}

export async function sendLoginOtp(input: {
  userId: string;
  channel: "email" | "phone";
}): Promise<{ maskedContact: string; channel: string; _dev_code?: string }> {
  const user = await prisma.user.findUnique({ where: { id: input.userId } });
  if (!user) throw new NotFoundError("User not found");

  const ch = channelEnum(input.channel);
  const destination = ch === "EMAIL" ? user.email : user.phone;
  if (!destination) {
    throw new BadRequestError(`No ${input.channel} address on this account.`);
  }

  checkRateLimit(`${user.id}:LOGIN`);
  const code = await issueCode(user.id, ch, "LOGIN", destination);

  if (ch === "EMAIL") {
    await notify.sendEmail(
      destination,
      "[Shiftify] Your login code",
      `Your Shiftify login code is ${code}. It expires in ${OTP_TTL_MINUTES} minutes. Do not share this code.`,
      `<p>Your Shiftify login code is <strong>${code}</strong>.</p><p>It expires in ${OTP_TTL_MINUTES} minutes. Do not share this code.</p>`,
    );
  } else {
    await notify.sendSms(
      destination,
      `[Shiftify] Your login code is ${code}. Valid ${OTP_TTL_MINUTES} mins. Do not share.`,
    );
  }

  const maskedContact = ch === "EMAIL" ? maskEmail(destination) : maskPhone(destination);
  return {
    maskedContact,
    channel: input.channel,
    ...(returnDevCode() ? { _dev_code: code } : {}),
  };
}

export async function verifyLoginOtp(input: {
  userId: string;
  channel: "email" | "phone";
  code: string;
}): Promise<void> {
  const ch = channelEnum(input.channel);
  await consumeCode(input.userId, ch, "LOGIN", input.code);
}
