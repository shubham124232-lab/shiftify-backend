import { z } from "zod";

// Loose AU-friendly phone format: optional leading +, 8-15 digits, spaces/dashes allowed.
const PHONE_REGEX = /^\+?[\d\s-]{8,15}$/;

export const phoneOptional = z
  .string()
  .max(30)
  .regex(PHONE_REGEX, "Enter a valid phone number")
  .optional()
  .or(z.literal(""));

export const emailOptional = z
  .string()
  .email("Enter a valid email address")
  .optional()
  .or(z.literal(""));
