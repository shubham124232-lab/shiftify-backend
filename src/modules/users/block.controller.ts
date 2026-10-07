import type { Request, Response } from "express";
import { UnauthorizedError } from "../../lib/errors";
import { success } from "../../utils/response";
import { parse } from "../../utils/validate";
import * as svc from "./block.service";
import { blockUserSchema } from "../../validators/block.schema";

// POST /users/blocks
export async function blockUser(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const data  = parse(blockUserSchema, req.body);
  const block = await svc.blockUser(req.user.id, data.blockedUserId, data);
  success(res, { block }, 201);
}

// DELETE /users/blocks/:blockedUserId
export async function unblockUser(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const result = await svc.unblockUser(req.user.id, req.params.blockedUserId);
  success(res, result);
}

// GET /users/blocks
export async function listBlocks(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const blocks = await svc.listBlocks(req.user.id);
  success(res, { blocks });
}
