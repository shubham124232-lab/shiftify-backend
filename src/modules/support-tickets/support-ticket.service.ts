import { randomInt } from "crypto";
import { prisma } from "../../lib/prisma";

export const TICKET_CATEGORIES = ["Account access", "Billing and plan", "Organisation and access", "Staffing requests", "Listings and enquiries", "Documents and compliance", "Something else"] as const;
export const TICKET_IMPACTS = ["General question", "Minor problem", "Blocking my work", "Urgent"] as const;
export const TICKET_STATUSES = ["OPEN", "AWAITING_SUPPORT", "RESOLVED", "CLOSED"] as const;

interface CreateTicketInput { subject: string; category: string; impact: string; relatedRef?: string | null; description: string }

export async function createTicket(userId: string, input: CreateTicketInput) {
  // Short human-readable reference the person can quote to support, e.g. TKT-482913.
  for (let attempt = 0; attempt < 5; attempt++) {
    const reference = `TKT-${randomInt(100000, 1000000)}`;
    const clash = await prisma.supportTicket.findUnique({ where: { reference }, select: { id: true } });
    if (clash) continue;
    return prisma.supportTicket.create({
      data: { reference, userId, subject: input.subject, category: input.category, impact: input.impact, relatedRef: input.relatedRef ?? null, description: input.description },
    });
  }
  throw new Error("Could not allocate a ticket reference");
}

export function listTickets(userId: string, status?: string) {
  return prisma.supportTicket.findMany({
    where: { userId, ...(status ? { status } : {}) },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}
