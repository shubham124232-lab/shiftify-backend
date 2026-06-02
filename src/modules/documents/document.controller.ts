import type { Request, Response } from "express";
import { success } from "../../utils/response";
import { UnauthorizedError, ValidationError, BadRequestError } from "../../lib/errors";
import * as documentService from "./document.service";
import { uploadDocumentSchema } from "../../validators/document.schema";

export async function uploadDocument(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  if (!req.file) throw new BadRequestError("No file uploaded");

  // Multer (multipart form) puts text fields in req.body
  const parsed = uploadDocumentSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.errors[0]?.message ?? "Invalid input",
      parsed.error.errors.map((e) => ({ path: e.path.join("."), message: e.message })),
    );
  }

  const doc = await documentService.uploadDocument(req.user.id, req.file, parsed.data);
  success(res, { document: doc }, 201);
}

export async function listDocuments(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const documents = await documentService.listDocuments(req.user.id);
  success(res, { documents });
}

export async function deleteDocument(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  await documentService.deleteDocument(req.user.id, req.params.id);
  success(res, { ok: true });
}
