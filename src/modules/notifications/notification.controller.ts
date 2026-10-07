import type { Request, Response } from "express";
import { success } from "../../utils/response";
import { UnauthorizedError } from "../../lib/errors";
import { parse } from "../../utils/validate";
import * as notificationService from "./notification.service";
import { updateNotificationPreferenceSchema } from "../../validators/notification-preference.schema";

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

// GET /notifications/preferences
export async function getPreference(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const preference = await notificationService.getNotificationPreference(req.user.id);
  success(res, { preference });
}

// PATCH /notifications/preferences
export async function updatePreference(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const data = parse(updateNotificationPreferenceSchema, req.body);
  const preference = await notificationService.updateNotificationPreference(req.user.id, data);
  success(res, { preference });
}
