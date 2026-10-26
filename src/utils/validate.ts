// Shared zod-safeParse -> ValidationError adapter used by controllers.
import { ValidationError } from "../lib/errors";

export function parse<T>(
  schema: { safeParse(v: unknown): { success: boolean; data?: T; error?: { issues: { path: PropertyKey[]; message: string }[] } } },
  body: unknown,
): T {
  const r = schema.safeParse(body);
  if (!r.success) {
    throw new ValidationError(
      r.error!.issues[0]?.message ?? "Invalid input",
      r.error!.issues.map((e) => ({ path: e.path.map(String).join("."), message: e.message })),
    );
  }
  return r.data!;
}
