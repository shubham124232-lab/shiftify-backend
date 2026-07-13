import type { Request, Response } from "express";
import { z } from "zod";
import { success } from "../../utils/response";
import { UnauthorizedError, ValidationError, BadRequestError, NotFoundError, ForbiddenError } from "../../lib/errors";
import { generatePresignedUrl, buildFileKey, buildFileUrl, saveFile, deleteFile } from "../../lib/storage";
import { prisma } from "../../lib/prisma";
import { updateProfile } from "../users/user.service";
import type { DocumentType, UserRole } from "@prisma/client";

const AVATAR_CONTENT_TYPES = ["image/jpeg", "image/png", "image/heic", "image/webp"] as const;

const presignQuerySchema = z.object({
  fileName:    z.string().min(1).max(255),
  contentType: z.string().min(1).max(120),
  category:    z.enum(["compliance", "avatars"]).default("compliance"),
});

// Document date fields arrive as plain <input type="date"> values (YYYY-MM-DD),
// not full ISO datetimes — matches the date convention used everywhere else
// in the codebase (e.g. profile-coordinator.schema.ts's optDate).
const docDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date").optional();

const registerDocSchema = z.object({
  fileKey:         z.string().min(1).max(500),
  fileName:        z.string().min(1).max(255),
  mimeType:        z.string().min(1).max(120),
  sizeBytes:       z.number().int().positive(),
  docType:         z.string().min(1),
  referenceNumber: z.string().max(80).optional(),
  issueDate:       docDate,
  expiryDate:      docDate,
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

// POST /upload/avatar
export async function uploadAvatar(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();

  const file = req.file;
  if (!file) throw new BadRequestError("No file provided");

  if (!(AVATAR_CONTENT_TYPES as readonly string[]).includes(file.mimetype)) {
    throw new BadRequestError("Avatar must be one of: " + AVATAR_CONTENT_TYPES.join(", "));
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
  const fileUrl = buildFileUrl(fileKey);
  success(res, { document: { ...rest, fileUrl } }, 201);
}

// ── Document presign / confirm / list / delete (R2 flow) ─────────────────────

const MULTI_UPLOAD_TYPES: DocumentType[] = ["QUALIFICATION_CERTIFICATE", "POLICIES_PROCEDURES"];

const ROLE_DOC_ALLOWLIST: Record<string, DocumentType[]> = {
  SUPPORT_WORKER: [
    "POLICE_CHECK", "NDIS_SCREENING", "WWCC", "FIRST_AID", "CPR",
    "MANUAL_HANDLING", "DRIVERS_LICENCE", "PUBLIC_LIABILITY_INSURANCE",
    "PERSONAL_ACCIDENT_INSURANCE", "QUALIFICATION_CERTIFICATE",
  ],
  COORDINATOR: [
    "POLICE_CHECK", "WWCC", "NDIS_SCREENING", "PROFESSIONAL_INDEMNITY",
    "PUBLIC_LIABILITY_INSURANCE", "QUALIFICATION_CERTIFICATE",
  ],
  PROVIDER: [
    "PUBLIC_LIABILITY_INSURANCE", "PROFESSIONAL_INDEMNITY",
    "WORKERS_COMP", "POLICIES_PROCEDURES", "NDIS_AUDIT",
  ],
  PLAN_MANAGER: [
    "ABN_CONFIRMATION", "NDIS_REGISTRATION_PROOF", "BUSINESS_REP_PROOF",
    "BUSINESS_ADDRESS_EVIDENCE", "CONTACT_IDENTITY_EVIDENCE", "BANK_FINANCE_EVIDENCE",
    "PROFESSIONAL_INDEMNITY", "POLICIES_PROCEDURES",
  ],
};

// Compliance doc types whose reference/expiry also live as shadow columns on the
// profile itself (read by the profile-completion calculator) — kept in sync here
// so completion checks see what the user actually uploaded.
interface DocSyncFields { number?: string; issueDate?: string; expiry: string }

const WORKER_DOC_SYNC: Partial<Record<DocumentType, DocSyncFields>> = {
  POLICE_CHECK:    { issueDate: "policeCheckIssueDate", expiry: "policeCheckExpiry" },
  NDIS_SCREENING:  { number: "ndisScreeningNumber", expiry: "ndisScreeningExpiry" },
  WWCC:            { number: "wwccNumber", expiry: "wwccExpiry" },
  FIRST_AID:       { expiry: "firstAidExpiry" },
  CPR:             { expiry: "cprExpiry" },
  DRIVERS_LICENCE: { expiry: "driversLicenceExpiry" },
};

const COORDINATOR_DOC_SYNC: Partial<Record<DocumentType, DocSyncFields>> = {
  POLICE_CHECK:   { expiry: "policeCheckExpiry" },
  WWCC:           { number: "wwccNumber", expiry: "wwccExpiry" },
  NDIS_SCREENING: { number: "ndisScreeningNumber", expiry: "ndisScreeningExpiry" },
};

async function syncDocMetadataToProfile(
  userId: string,
  role: string | undefined,
  dt: DocumentType,
  referenceNumber: string | undefined,
  issueDate: string | undefined,
  expiryDate: string | undefined,
): Promise<void> {
  const syncMap = role === "SUPPORT_WORKER" ? WORKER_DOC_SYNC : role === "COORDINATOR" ? COORDINATOR_DOC_SYNC : undefined;
  const fields = syncMap?.[dt];
  if (!fields) return;

  const data: Record<string, unknown> = {};
  if (fields.number && referenceNumber) data[fields.number] = referenceNumber;
  if (fields.issueDate && issueDate) data[fields.issueDate] = new Date(issueDate);
  if (expiryDate) data[fields.expiry] = new Date(expiryDate);
  if (Object.keys(data).length === 0) return;

  try {
    if (role === "SUPPORT_WORKER") {
      await prisma.workerProfile.upsert({ where: { userId }, create: { userId, ...data }, update: data });
    } else {
      await prisma.coordinatorProfile.upsert({ where: { userId }, create: { userId, ...data }, update: data });
    }
  } catch {
    // Best-effort sync — the Document row above is already the source of truth
    // and has already saved successfully; don't fail the request over this.
  }
}

const docPresignBodySchema = z.object({
  docType:     z.string().min(1),
  fileName:    z.string().min(1).max(255),
  contentType: z.string().min(1).max(120),
});

// A confirm call is either a real file upload (key/publicUrl/etc. required) or a
// metadata-only edit of an already-uploaded document (e.g. renewing an expiry
// date) — the latter must not touch the stored file at all.
const docConfirmFileSchema = z.object({
  metadataOnly:    z.literal(false).optional().default(false),
  key:             z.string().min(1).max(500),
  publicUrl:       z.string().url(),
  docType:         z.string().min(1),
  fileName:        z.string().min(1).max(255),
  mimeType:        z.string().min(1).max(120),
  sizeBytes:       z.number().int().positive(),
  referenceNumber: z.string().max(100).optional(),
  issueDate:       docDate,
  expiryDate:      docDate,
  metadata:        z.record(z.string()).optional(),
});

const docConfirmMetadataOnlySchema = z.object({
  metadataOnly:    z.literal(true),
  docType:         z.string().min(1),
  referenceNumber: z.string().max(100).optional(),
  issueDate:       docDate,
  expiryDate:      docDate,
  metadata:        z.record(z.string()).optional(),
});

const docConfirmBodySchema = z.union([docConfirmMetadataOnlySchema, docConfirmFileSchema]);

// POST /upload/document/presign
export async function documentPresign(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();

  const parsed = docPresignBodySchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.errors[0]?.message ?? "Invalid body",
      parsed.error.errors.map((e) => ({ path: e.path.join("."), message: e.message })),
    );
  }

  const { docType, fileName, contentType } = parsed.data;
  const role = req.activeRole as UserRole | undefined;
  if (!role) throw new BadRequestError("No active role on session");

  const allowed = ROLE_DOC_ALLOWLIST[role] ?? [];
  if (!allowed.includes(docType as DocumentType)) {
    throw new BadRequestError(`Document type ${docType} is not allowed for role ${role}`);
  }

  const fileKey = buildFileKey({ originalName: fileName, userId: req.user.id, category: "compliance" });
  const presigned = generatePresignedUrl({ fileKey, contentType });
  if (!presigned) throw new BadRequestError("R2 storage is not configured");

  success(res, { presignedUrl: presigned.uploadUrl, publicUrl: presigned.publicUrl, key: presigned.fileKey });
}

// POST /upload/document/confirm
export async function documentConfirm(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();

  const parsed = docConfirmBodySchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.errors[0]?.message ?? "Invalid body",
      parsed.error.errors.map((e) => ({ path: e.path.join("."), message: e.message })),
    );
  }

  const { docType, referenceNumber, issueDate, expiryDate } = parsed.data;
  const dt = docType as DocumentType;
  const isMulti = MULTI_UPLOAD_TYPES.includes(dt);

  let doc;
  if (parsed.data.metadataOnly) {
    const existing = await prisma.document.findFirst({ where: { userId: req.user.id, docType: dt } });
    if (!existing) throw new NotFoundError("No existing document to update — upload a file first");
    doc = await prisma.document.update({
      where: { id: existing.id },
      data: {
        referenceNumber: referenceNumber ?? null,
        issueDate:  issueDate  ? new Date(issueDate)  : null,
        expiryDate: expiryDate ? new Date(expiryDate) : null,
        updatedAt: new Date(),
      },
    });
  } else if (isMulti) {
    const { key, publicUrl: pubUrl, fileName, mimeType, sizeBytes } = parsed.data;
    doc = await prisma.document.create({
      data: {
        userId: req.user.id, docType: dt, filePath: key, publicUrl: pubUrl,
        fileName, mimeType, sizeBytes,
        referenceNumber: referenceNumber ?? null,
        issueDate:  issueDate  ? new Date(issueDate)  : null,
        expiryDate: expiryDate ? new Date(expiryDate) : null,
        status: "UPLOADED",
      },
    });
  } else {
    const { key, publicUrl: pubUrl, fileName, mimeType, sizeBytes } = parsed.data;
    const existing = await prisma.document.findFirst({ where: { userId: req.user.id, docType: dt } });
    if (existing) {
      if (existing.filePath && existing.filePath !== key) {
        await deleteFile(existing.filePath).catch(() => null);
      }
      doc = await prisma.document.update({
        where: { id: existing.id },
        data: {
          filePath: key, publicUrl: pubUrl, fileName, mimeType, sizeBytes,
          referenceNumber: referenceNumber ?? null,
          issueDate:  issueDate  ? new Date(issueDate)  : null,
          expiryDate: expiryDate ? new Date(expiryDate) : null,
          status: "UPLOADED", updatedAt: new Date(),
        },
      });
    } else {
      doc = await prisma.document.create({
        data: {
          userId: req.user.id, docType: dt, filePath: key, publicUrl: pubUrl,
          fileName, mimeType, sizeBytes,
          referenceNumber: referenceNumber ?? null,
          issueDate:  issueDate  ? new Date(issueDate)  : null,
          expiryDate: expiryDate ? new Date(expiryDate) : null,
          status: "UPLOADED",
        },
      });
    }
  }

  await syncDocMetadataToProfile(req.user.id, req.activeRole, dt, referenceNumber, issueDate, expiryDate);

  const { filePath: _fp, ...rest } = doc;
  success(res, { document: rest }, 201);
}

// GET /upload/document
export async function listUserDocuments(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const docs = await prisma.document.findMany({
    where:   { userId: req.user.id },
    orderBy: { uploadedAt: "desc" },
    select: {
      id: true, userId: true, docType: true, publicUrl: true, fileName: true,
      mimeType: true, sizeBytes: true, referenceNumber: true,
      issueDate: true, expiryDate: true, status: true, uploadedAt: true, updatedAt: true,
    },
  });
  success(res, { documents: docs });
}

// DELETE /upload/document/:id
export async function deleteUserDocument(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const doc = await prisma.document.findUnique({ where: { id: req.params.id } });
  if (!doc) throw new NotFoundError("Document not found");
  if (doc.userId !== req.user.id) throw new ForbiddenError("Not your document");
  await deleteFile(doc.filePath).catch(() => null);
  await prisma.document.delete({ where: { id: doc.id } });
  success(res, { ok: true });
}
