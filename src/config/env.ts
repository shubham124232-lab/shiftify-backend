import "dotenv/config";
import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(5000),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  // Neon (or any pooled Postgres): direct, non-pooled URL used by prisma migrate.
  // Optional at runtime — only `prisma migrate`/`db push` read it. For local Postgres
  // set it equal to DATABASE_URL.
  DIRECT_URL: z.string().optional(),

  JWT_ACCESS_SECRET: z.string().min(16, "JWT_ACCESS_SECRET must be at least 16 chars"),
  JWT_REFRESH_SECRET: z.string().min(16, "JWT_REFRESH_SECRET must be at least 16 chars"),
  JWT_ACCESS_EXPIRES_IN: z.string().default("1d"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("30d"),

  CORS_ORIGIN: z.string().default(
    "http://localhost:3000,https://shiftify-ebon.vercel.app"
  ),

  UPLOAD_DIR: z.string().default("./uploads"),
  MAX_FILE_SIZE_BYTES: z.coerce.number().int().positive().default(26214400),

  // Cloudflare R2 (optional — falls back to local disk if absent)
  R2_ACCOUNT_ID:        z.string().optional(),
  R2_ACCESS_KEY_ID:     z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET_NAME:       z.string().optional(),
  R2_PUBLIC_URL:        z.string().url().optional(),

  // Staging escape hatch: return OTP codes in API responses while no real
  // SMS/email provider is wired up. Must be removed/false once Twilio/Resend go live.
  RETURN_DEV_OTP: z
    .string()
    .optional()
    .transform((v) => v === "true"),

  SEED_ADMIN_EMAIL: z.string().email().optional(),
  SEED_ADMIN_PASSWORD: z.string().optional(),
  SEED_ADMIN_NAME: z.string().optional(),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("[shiftify-backend] Invalid environment configuration:");
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
