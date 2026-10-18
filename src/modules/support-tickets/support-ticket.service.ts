import { randomInt } from "crypto";
import { prisma } from "../../lib/prisma";
import { BadRequestError, NotFoundError } from "../../lib/errors";

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

async function ownTicket(userId: string, ticketId: string) {
  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
  if (!ticket || ticket.userId !== userId) throw new NotFoundError("Ticket not found");
  return ticket;
}

export async function getTicket(userId: string, ticketId: string) {
  const ticket = await ownTicket(userId, ticketId);
  const messages = await prisma.ticketMessage.findMany({ where: { ticketId }, orderBy: { createdAt: "asc" } });
  return { ticket, messages };
}

// The person replies: the ticket now waits on support. Closed tickets must be reopened by support; resolved ones by the person.
export async function replyToTicket(userId: string, ticketId: string, body: string) {
  const ticket = await ownTicket(userId, ticketId);
  if (ticket.status === "CLOSED") throw new BadRequestError("This ticket is closed. Raise a new ticket if you still need help.");
  if (ticket.status === "RESOLVED") throw new BadRequestError("This ticket is resolved. Reopen it to reply.");
  const [message] = await prisma.$transaction([
    prisma.ticketMessage.create({ data: { ticketId, authorUserId: userId, authorKind: "USER", body } }),
    prisma.supportTicket.update({ where: { id: ticketId }, data: { status: "AWAITING_SUPPORT" } }),
  ]);
  return message;
}

export async function setTicketState(userId: string, ticketId: string, action: "resolve" | "reopen") {
  const ticket = await ownTicket(userId, ticketId);
  if (action === "resolve") {
    if (ticket.status === "CLOSED" || ticket.status === "RESOLVED") throw new BadRequestError("This ticket is already resolved or closed.");
    return prisma.supportTicket.update({ where: { id: ticketId }, data: { status: "RESOLVED" } });
  }
  if (ticket.status !== "RESOLVED") throw new BadRequestError("Only a resolved ticket can be reopened.");
  return prisma.supportTicket.update({ where: { id: ticketId }, data: { status: "OPEN" } });
}
