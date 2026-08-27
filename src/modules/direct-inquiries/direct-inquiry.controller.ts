import type { Request, Response } from "express";
import { UnauthorizedError } from "../../lib/errors";
import { success } from "../../utils/response";
import { parse } from "../../utils/validate";
import * as svc from "./direct-inquiry.service";
import { sendDirectInquirySchema } from "../../validators/direct-inquiry.schema";

// POST /direct-inquiries
export async function send(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const data = parse(sendDirectInquirySchema, req.body);
  const inquiry = await svc.sendDirectInquiry(req.user.id, data);
  success(res, { inquiry }, 201);
}

// GET /direct-inquiries/sent
export async function listSent(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const inquiries = await svc.listSentInquiries(req.user.id);
  success(res, { inquiries });
}

// GET /direct-inquiries/received
export async function listReceived(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const inquiries = await svc.listReceivedInquiries(req.user.id);
  success(res, { inquiries });
}

// PATCH /direct-inquiries/:id/read
export async function markRead(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const inquiry = await svc.markInquiryRead(req.params.id, req.user.id);
  success(res, { inquiry });
}
