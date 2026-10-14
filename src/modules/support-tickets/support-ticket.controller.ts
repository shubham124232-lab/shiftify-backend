import type { Request, Response } from "express";
import { z } from "zod";
import { UnauthorizedError } from "../../lib/errors";
import { success } from "../../utils/response";
import { parse } from "../../utils/validate";
import * as svc from "./support-ticket.service";

const createTicketSchema = z.object({
  subject: z.string().trim().min(3, "Add a short subject").max(150),
  category: z.enum(svc.TICKET_CATEGORIES),
  impact: z.enum(svc.TICKET_IMPACTS),
  relatedRef: z.string().trim().max(100).nullable().optional(),
  description: z.string().trim().min(10, "Describe what happened so support can help").max(4000),
}).strict();

export async function createTicket(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const ticket = await svc.createTicket(req.user.id, parse(createTicketSchema, req.body));
  success(res, { ticket }, 201);
}

export async function listTickets(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const status = typeof req.query.status === "string" && (svc.TICKET_STATUSES as readonly string[]).includes(req.query.status) ? req.query.status : undefined;
  success(res, { tickets: await svc.listTickets(req.user.id, status), categories: svc.TICKET_CATEGORIES, impacts: svc.TICKET_IMPACTS });
}
