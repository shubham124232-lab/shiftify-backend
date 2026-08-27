import type { Request, Response } from "express";
import { UnauthorizedError } from "../../lib/errors";
import { success } from "../../utils/response";
import { parse } from "../../utils/validate";
import * as svc from "./availability-listing.service";
import { createAvailabilityListingSchema, updateAvailabilityListingSchema } from "../../validators/availability-listing.schema";

// POST /availability-listings
export async function createAvailabilityListing(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const data = parse(createAvailabilityListingSchema, req.body);
  const listing = await svc.createAvailabilityListing(req.user.id, data);
  success(res, { listing }, 201);
}

// GET /availability-listings/mine
export async function listMyAvailabilityListings(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const listings = await svc.listMyAvailabilityListings(req.user.id);
  success(res, { listings });
}

// GET /availability-listings
export async function browseAvailabilityListings(req: Request, res: Response): Promise<void> {
  const { category, suburb, state } = req.query;
  const listings = await svc.browseAvailabilityListings({
    category: typeof category === "string" ? category : undefined,
    suburb:   typeof suburb   === "string" ? suburb   : undefined,
    state:    typeof state    === "string" ? state    : undefined,
  });
  success(res, { listings });
}

// PATCH /availability-listings/:id
export async function updateAvailabilityListing(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const data = parse(updateAvailabilityListingSchema, req.body);
  const listing = await svc.updateAvailabilityListing(req.user.id, req.params.id, data);
  success(res, { listing });
}

// DELETE /availability-listings/:id
export async function deleteAvailabilityListing(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  await svc.deleteAvailabilityListing(req.user.id, req.params.id);
  success(res, { deleted: true });
}
