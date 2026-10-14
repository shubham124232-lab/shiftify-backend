import { prisma } from "../../lib/prisma";
import { saveFile, deleteFile, buildFileUrl } from "../../lib/storage";
import { NotFoundError, ForbiddenError } from "../../lib/errors";
import type { DocumentType } from "@prisma/client";
import type { UploadDocumentInput } from "../../validators/document.schema";

function sanitizeDoc(doc: {
  id: string;
  userId: string;
  docType: DocumentType;
  filePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  referenceNumber: string | null;
  issueDate: Date | null;
  expiryDate: Date | null;
  status: string;
  uploadedAt: Date;
  title?: string | null;
  issuer?: string | null;
  visibility?: string | null;
  replacesId?: string | null;
  supersededAt?: Date | null;
}) {
  const { filePath, ...rest } = doc; // never expose raw filePath
  return { ...rest, fileUrl: buildFileUrl(filePath) };
}

export async function uploadDocument(
  userId: string,
  file: Express.Multer.File,
  input: UploadDocumentInput,
) {
  // A renewal replaces an earlier record of the same owner; the earlier one stays as history.
  if (input.replacesId) {
    const old = await prisma.document.findUnique({ where: { id: input.replacesId }, select: { userId: true } });
    if (!old || old.userId !== userId) throw new NotFoundError("Document to renew not found");
  }

  const saved = await saveFile({
    buffer:       file.buffer,
    originalName: file.originalname,
    mimeType:     file.mimetype,
    userId,
    category:     "compliance",
  });

  const doc = await prisma.document.create({
    data: {
      userId,
      docType:         input.docType as DocumentType,
      filePath:        saved.filePath,
      fileName:        saved.fileName,
      mimeType:        saved.mimeType,
      sizeBytes:       saved.sizeBytes,
      referenceNumber: input.referenceNumber ?? null,
      issueDate:       input.issueDate  ? new Date(input.issueDate)  : null,
      expiryDate:      input.expiryDate ? new Date(input.expiryDate) : null,
      status:          "UPLOADED",
      title:           input.title ?? null,
      issuer:          input.issuer ?? null,
      visibility:      input.visibility ?? null,
      replacesId:      input.replacesId ?? null,
    },
  });
  if (input.replacesId) await prisma.document.update({ where: { id: input.replacesId }, data: { supersededAt: new Date() } });

  return sanitizeDoc(doc);
}

const DOC_SELECT = {
  id: true, userId: true, docType: true, filePath: true, fileName: true,
  mimeType: true, sizeBytes: true, referenceNumber: true,
  issueDate: true, expiryDate: true, status: true, uploadedAt: true,
  title: true, issuer: true, visibility: true, replacesId: true, supersededAt: true,
} as const;

// Renewed (superseded) records are history, not part of the current list.
export async function listDocuments(userId: string) {
  const docs = await prisma.document.findMany({
    where:   { userId, supersededAt: null },
    orderBy: { uploadedAt: "desc" },
    select: DOC_SELECT,
  });
  return docs.map(sanitizeDoc);
}

// Provider doc P72: organisation evidence plus the evidence of the Provider's own managed workers, with history.
export async function listOrganisationDocuments(providerUserId: string) {
  const workers = await prisma.user.findMany({
    where: { parentUserId: providerUserId },
    select: { id: true, name: true },
  });
  const owners = new Map<string, string>([[providerUserId, "Organisation"], ...workers.map((w) => [w.id, w.name] as [string, string])]);
  const docs = await prisma.document.findMany({
    where: { userId: { in: [...owners.keys()] } },
    orderBy: { uploadedAt: "desc" },
    select: DOC_SELECT,
  });
  return {
    workers,
    documents: docs.map((d) => ({ ...sanitizeDoc(d), ownerName: owners.get(d.userId) ?? "Organisation", ownerKind: d.userId === providerUserId ? "ORGANISATION" : "WORKER" })),
  };
}

export async function deleteDocument(userId: string, documentId: string) {
  const doc = await prisma.document.findUnique({ where: { id: documentId } });
  if (!doc) throw new NotFoundError("Document not found");
  if (doc.userId !== userId) throw new ForbiddenError("Not your document");

  await deleteFile(doc.filePath, userId).catch(() => null);
  await prisma.document.delete({ where: { id: documentId } });
}
