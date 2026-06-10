import { z } from "zod";

export const planManagerProfileSchema = z.object({
  profileStep:      z.number().int().min(0).max(4).optional(),
  businessName:    z.string().max(120).optional(),
  abn:             z.string().max(20).optional(),
  ndisRegistered:  z.boolean().optional(),
  yearsInOperation: z.string().max(20).optional(),
  serviceAreas:    z.array(z.string()).optional(),
  acceptingClients: z.boolean().optional(),
});

export type PlanManagerProfileInput = z.infer<typeof planManagerProfileSchema>;
