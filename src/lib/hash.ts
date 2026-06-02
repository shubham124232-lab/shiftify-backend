import bcrypt from "bcrypt";
import { BadRequestError } from "./errors";

const SALT_ROUNDS = 10;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * Enforces password strength:
 *   - Minimum 8 characters
 *   - At least one uppercase letter
 *   - At least one lowercase letter
 *   - At least one digit
 *   - At least one special character
 * Throws BadRequestError if any rule is violated.
 */
export function assertPasswordStrength(password: string): void {
  if (password.length < 8)
    throw new BadRequestError("Password must be at least 8 characters.");
  if (!/[A-Z]/.test(password))
    throw new BadRequestError("Password must contain at least one uppercase letter.");
  if (!/[a-z]/.test(password))
    throw new BadRequestError("Password must contain at least one lowercase letter.");
  if (!/[0-9]/.test(password))
    throw new BadRequestError("Password must contain at least one digit.");
  if (!/[^A-Za-z0-9]/.test(password))
    throw new BadRequestError("Password must contain at least one special character.");
}
