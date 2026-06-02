// Standard JSON response shape so every endpoint looks the same.
import type { Response } from "express";

export function success<T>(res: Response, data: T, status = 200): Response {
  return res.status(status).json({ data });
}

export function errorJson(
  res: Response,
  status: number,
  code: string,
  message: string,
  details?: unknown,
): Response {
  return res.status(status).json({ error: { code, message, details } });
}
