import type { Request, Response } from "express";
import { success } from "../../utils/response";
import { UnauthorizedError } from "../../lib/errors";
import * as notificationService from "./notification.service";

export async function listNotifications(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const unreadOnly = req.query.unread === "true";
  const result = await notificationService.getNotifications(req.user.id, unreadOnly);
  success(res, result);
}

export async function readOne(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  await notificationService.markOneRead(req.user.id, req.params.id);
  success(res, { ok: true });
}

export async function readAll(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  await notificationService.markAllRead(req.user.id);
  success(res, { ok: true });
}
