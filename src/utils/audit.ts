// Audit-log helper — call from every admin action.
import { prisma } from "../lib/prisma";
import type { AuditAction } from "@prisma/client";

export async function writeAudit(input: {
  adminUserId: string;
  action: AuditAction;
  targetUserId?: string;
  targetDocumentId?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      adminUserId: input.adminUserId,
      action: input.action,
      targetUserId: input.targetUserId,
      targetDocumentId: input.targetDocumentId,
      reason: input.reason,
      metadata: input.metadata as object,
    },
  });
}
