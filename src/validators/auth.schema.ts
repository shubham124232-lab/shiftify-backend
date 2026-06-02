import { z } from "zod";
import { USER_ROLES, ALL_USER_ROLES } from "../config/constants";

// Login accepts a SINGLE identifier — email, phone, or username — plus password.
// The backend resolves which kind it is (see auth.service.login).
export const loginSchema = z.object({
  identifier: z.string().min(1, "Enter your email, phone, or username"),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

// Self-registration. Pick ONE initial role; more can be added later via /auth/roles.
// Phone is required for SELF accounts (primary identity gate). Email is optional.
export const baseRegisterSchema = z.object({
  email: z.string().email().optional(),
  phone: z
    .string()
    .min(5)
    .max(20)
    .regex(/^\+?[0-9]+$/, "Phone must be digits, optionally starting with +"),
  username: z
    .string()
    .min(3)
    .max(40)
    .regex(/^[a-zA-Z0-9._-]+$/, "Use letters, numbers, dot, dash, underscore")
    .optional(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1).max(120),
  role: z.enum(USER_ROLES),
});
export type BaseRegisterInput = z.infer<typeof baseRegisterSchema>;

// Add a role to the current account (self-service — ADMIN not grantable here).
export const addRoleSchema = z.object({ role: z.enum(USER_ROLES) });
export type AddRoleInput = z.infer<typeof addRoleSchema>;

// Switch active role. `password` only needed when switching into a managed/separate
// account (deferred); switching your own roles ignores it.
export const switchRoleSchema = z.object({
  role: z.enum(ALL_USER_ROLES),
  password: z.string().optional(),
});
export type SwitchRoleInput = z.infer<typeof switchRoleSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(1).optional(), // also read from the cookie
});
