import type { Request, Response } from "express";
import { success } from "../../utils/response";
import { ValidationError, UnauthorizedError } from "../../lib/errors";
import { createListingSchema, listListingsQuerySchema, updateListingSchema } from "../../validators/listing.schema";
import * as svc from "./listing.service";

export async function createListing(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  if (!req.activeRole) throw new UnauthorizedError("No active role");

  const parsed = createListingSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ValidationError("Invalid listing payload", parsed.error.flatten().fieldErrors);
  }

  const listing = await svc.createListing(req.user.id, req.activeRole, parsed.data);
  return success(res, { listing }, 201);
}

export async function listMyListings(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();

  const parsed = listListingsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new ValidationError("Invalid query", parsed.error.flatten().fieldErrors);
  }

  const listings = await svc.listMyListings(req.user.id, parsed.data);
  return success(res, { listings });
}

export async function updateListing(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();

  const parsed = updateListingSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ValidationError("Invalid listing payload", parsed.error.flatten().fieldErrors);
  }

  const listing = await svc.updateListing(req.user.id, req.params.id, parsed.data);
  return success(res, { listing });
}
