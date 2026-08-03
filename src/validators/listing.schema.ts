// Provider listing validation — mirrors the Web post-service and sil-vacancy forms.
import { z } from "zod";

export const LISTING_CATEGORIES = ["SERVICE", "HOUSING"] as const;

export const createListingSchema = z
  .object({
    listingCategory: z.enum(LISTING_CATEGORIES),
    title:       z.string().min(5).max(200),
    description: z.string().min(10).max(5000),
    suburb:      z.string().min(2).max(120),
    state:       z.string().max(10).optional(),
    postcode:    z.string().max(10).optional(),

    // SERVICE listings (post-service form)
    listingType: z
      .enum([
        "IMMEDIATE_INTAKE",
        "RECURRING_CAPACITY",
        "ONE_TIME_SLOT",
        "SHORT_TERM",
        "URGENT_FILL",
        "WAITLIST_OPENING",
        "ONGOING_REFERRALS",
      ])
      .optional(),
    serviceCategory: z.string().max(120).optional(),
    serviceMode:     z.enum(["IN_PERSON", "REMOTE", "BOTH"]).optional(),
    fundingTypes:    z.array(z.string().max(60)).max(10).optional(),

    // HOUSING vacancies (sil-vacancy form)
    vacancyCategory: z
      .enum(["SIL", "SDA", "SIL_SDA", "RESPITE", "MEDIUM_TERM", "SHORT_TERM", "OTHER"])
      .optional(),
    propertyType: z.string().max(120).optional(),
    vacancyCount: z.number().int().min(1).max(50).optional(),
    supportModel: z.string().max(120).optional(),
    suitableFor:  z.array(z.string().max(80)).max(15).optional(),
    fundingRoutes: z.array(z.string().max(60)).max(10).optional(),
    urgency: z
      .enum(["AVAILABLE_NOW", "AVAILABLE_SOON", "FUTURE", "EXPRESSION_OF_INTEREST"])
      .optional(),

    // Sent by the Web forms; accepted but not persisted.
    acknowledgement: z.boolean().optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (val.listingCategory === "SERVICE") {
      if (!val.listingType) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["listingType"], message: "listingType is required for SERVICE listings" });
      }
      if (!val.serviceCategory) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["serviceCategory"], message: "serviceCategory is required for SERVICE listings" });
      }
    }
    if (val.listingCategory === "HOUSING" && !val.vacancyCategory) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["vacancyCategory"], message: "vacancyCategory is required for HOUSING listings" });
    }
  });

export type CreateListingInput = z.infer<typeof createListingSchema>;

export const listListingsQuerySchema = z.object({
  category: z.enum(LISTING_CATEGORIES).optional(),
  status:   z.enum(["ACTIVE", "PAUSED", "FILLED", "CLOSED"]).optional(),
});

export type ListListingsQuery = z.infer<typeof listListingsQuerySchema>;

// ─── Update (edit fields / pause / close / reactivate) ────────────────────────

export const updateListingSchema = z.object({
  status:          z.enum(["ACTIVE", "PAUSED", "FILLED", "CLOSED"]).optional(),
  title:           z.string().min(5).max(200).optional(),
  description:     z.string().min(10).max(5000).optional(),
  suburb:          z.string().min(2).max(120).optional(),
  state:           z.string().max(10).optional(),
  postcode:        z.string().max(10).optional(),
  listingType: z
    .enum([
      "IMMEDIATE_INTAKE",
      "RECURRING_CAPACITY",
      "ONE_TIME_SLOT",
      "SHORT_TERM",
      "URGENT_FILL",
      "WAITLIST_OPENING",
      "ONGOING_REFERRALS",
    ])
    .optional(),
  serviceCategory: z.string().max(120).optional(),
  serviceMode:     z.enum(["IN_PERSON", "REMOTE", "BOTH"]).optional(),
  fundingTypes:    z.array(z.string().max(60)).max(10).optional(),
  vacancyCategory: z
    .enum(["SIL", "SDA", "SIL_SDA", "RESPITE", "MEDIUM_TERM", "SHORT_TERM", "OTHER"])
    .optional(),
  propertyType: z.string().max(120).optional(),
  vacancyCount: z.number().int().min(1).max(50).optional(),
  supportModel: z.string().max(120).optional(),
  suitableFor:  z.array(z.string().max(80)).max(15).optional(),
  fundingRoutes: z.array(z.string().max(60)).max(10).optional(),
  urgency: z
    .enum(["AVAILABLE_NOW", "AVAILABLE_SOON", "FUTURE", "EXPRESSION_OF_INTEREST"])
    .optional(),
}).strict();

export type UpdateListingInput = z.infer<typeof updateListingSchema>;
