// Shared zod-safeParse -> ValidationError adapter used by controllers.
import { ValidationError } from "../lib/errors";

export function parse<T>(
  schema: { safeParse(v: unknown): { success: boolean; data?: T; error?: { errors: { path: (string | number)[]; message: string }[] } } },
  body: unknown,
): T {
  const r = schema.safeParse(body);
  if (!r.success) {
    throw new ValidationError(
      r.error!.errors[0]?.message ?? "Invalid input",
      r.error!.errors.map((e) => ({ path: e.path.join("."), message: e.message })),
    );
  }
  return r.data!;
}
