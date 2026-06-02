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
}) {
  const { filePath, ...rest } = doc; // never expose raw filePath
  return { ...rest, fileUrl: buildFileUrl(filePath) };
}

export async function uploadDocument(
  userId: string,
  file: Express.Multer.File,
  input: UploadDocumentInput,
) {
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
    },
  });

  return sanitizeDoc(doc);
}

export async function listDocuments(userId: string) {
  const docs = await prisma.document.findMany({
    where:   { userId },
    orderBy: { uploadedAt: "desc" },
    select: {
      id: true, userId: true, docType: true, filePath: true, fileName: true,
      mimeType: true, sizeBytes: true, referenceNumber: true,
      issueDate: true, expiryDate: true, status: true, uploadedAt: true,
    },
  });
  return docs.map(sanitizeDoc);
}

export async function deleteDocument(userId: string, documentId: string) {
  const doc = await prisma.document.findUnique({ where: { id: documentId } });
  if (!doc) throw new NotFoundError("Document not found");
  if (doc.userId !== userId) throw new ForbiddenError("Not your document");

  await deleteFile(doc.filePath);
  await prisma.document.delete({ where: { id: documentId } });
}
