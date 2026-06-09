import type { Request, Response } from "express";
import { z } from "zod";
import { success } from "../../utils/response";
import { UnauthorizedError, ValidationError, BadRequestError } from "../../lib/errors";
import { generatePresignedUrl, buildFileKey, buildFileUrl, saveFile } from "../../lib/storage";
import { prisma } from "../../lib/prisma";
import { updateProfile } from "../users/user.service";
import type { DocumentType } from "@prisma/client";

const AVATAR_CONTENT_TYPES = ["image/jpeg", "image/png", "image/heic", "image/webp"] as const;

const presignQuerySchema = z.object({
  fileName:    z.string().min(1).max(255),
  contentType: z.string().min(1).max(120),
  category:    z.enum(["compliance", "avatars"]).default("compliance"),
});

const registerDocSchema = z.object({
  fileKey:         z.string().min(1).max(500),
  fileName:        z.string().min(1).max(255),
  mimeType:        z.string().min(1).max(120),
  sizeBytes:       z.number().int().positive(),
  docType:         z.string().min(1),
  referenceNumber: z.string().max(80).optional(),
  issueDate:       z.string().datetime({ offset: true }).optional(),
  expiryDate:      z.string().datetime({ offset: true }).optional(),
});

// GET /upload/presign
export async function presign(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();

  const parsed = presignQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.errors[0]?.message ?? "Invalid query",
      parsed.error.errors.map((e) => ({ path: e.path.join("."), message: e.message })),
    );
  }

  const { fileName, contentType, category } = parsed.data;

  if (category === "avatars" && !(AVATAR_CONTENT_TYPES as readonly string[]).includes(contentType)) {
    throw new BadRequestError(
      "Avatar uploads must be one of: " + AVATAR_CONTENT_TYPES.join(", "),
    );
  }

  const fileKey = buildFileKey({ originalName: fileName, userId: req.user.id, category });
  const presigned = generatePresignedUrl({ fileKey, contentType });

  if (!presigned) {
    throw new BadRequestError(
      "R2 storage is not configured. Use POST /upload/avatar (multipart) instead.",
    );
  }

  success(res, presigned);
}

// POST /upload/avatar -- multipart, saves to local disk; used when R2 is not configured
export async function uploadAvatar(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();

  const file = req.file;
  if (!file) throw new BadRequestError("No file provided");

  if (!(AVATAR_CONTENT_TYPES as readonly string[]).includes(file.mimetype)) {
    throw new BadRequestError(
      "Avatar must be one of: " + AVATAR_CONTENT_TYPES.join(", "),
    );
  }

  const saved = await saveFile({
    buffer:       file.buffer,
    originalName: file.originalname,
    mimeType:     file.mimetype,
    userId:       req.user.id,
    category:     "avatars",
  });

  const avatarUrl = buildFileUrl(saved.filePath);
  await updateProfile(req.user.id, { avatarUrl });
  success(res, { avatarUrl });
}

// POST /upload/register-document
export async function registerDocument(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();

  const parsed = registerDocSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.errors[0]?.message ?? "Invalid body",
      parsed.error.errors.map((e) => ({ path: e.path.join("."), message: e.message })),
    );
  }

  const { fileKey, fileName, mimeType, sizeBytes, docType, referenceNumber, issueDate, expiryDate } = parsed.data;

  const doc = await prisma.document.create({
    data: {
      userId:          req.user.id,
      docType:         docType as DocumentType,
      filePath:        fileKey,
      fileName,
      mimeType,
      sizeBytes,
      referenceNumber: referenceNumber ?? null,
      issueDate:       issueDate  ? new Date(issueDate)  : null,
      expiryDate:      expiryDate ? new Date(expiryDate) : null,
      status:          "UPLOADED",
    },
  });

  const { filePath: _fp, ...rest } = doc;
  success(res, { document: { ...rest, fileUrl: buildFileUrl(fileKey) } }, 201);
}
