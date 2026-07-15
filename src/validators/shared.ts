import { z } from "zod";

// Australian phone formats: mobile (04...), landline (02/03/07/08...), and
// business/service numbers (1300..., 1800..., 13xx). Spaces are ignored; a
// leading +61 may replace the trunk 0 for mobile/landline. No other
// characters (letters, dashes, parens) are permitted.
const AU_PHONE_REGEX = /^(?:(?:\+?61|0)[23478]\d{8}|1300\d{6}|1800\d{6}|13\d{4})$/;
const isValidAuPhone = (v: string) => AU_PHONE_REGEX.test(v.trim().replace(/\s+/g, ""));

// Required phone: accepts human-formatted input, normalizes to digits (+ optional leading +) for storage.
export const phoneRequired = z
  .string()
  .refine(isValidAuPhone, "Enter a valid Australian phone number")
  .transform((v) => v.trim().replace(/\s+/g, ""));

export const phoneOptional = z
  .string()
  .max(30)
  .refine(isValidAuPhone, "Enter a valid Australian phone number")
  .optional()
  .or(z.literal(""));

export const emailOptional = z
  .string()
  .email("Enter a valid email address")
  .optional()
  .or(z.literal(""));
