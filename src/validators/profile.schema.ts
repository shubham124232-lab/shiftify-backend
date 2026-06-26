import { z } from "zod";
import { phoneRequired } from "./shared";

// All fields optional - PATCH semantics (only update what is sent).
export const updateProfileSchema = z.object({
  name:            z.string().min(1).max(120).optional(),
  email:           z.string().email().max(255).optional(),
  username:        z.string().min(3).max(40).optional(),
  phone:           phoneRequired.optional(),
  avatarUrl:       z.string().url("Must be a valid URL").max(1000).optional(),
  defaultSuburb:   z.string().max(80).optional(),
  defaultState:    z.string().max(40).optional(),
  defaultPostcode: z.string().max(10).optional(),
  address: z
    .object({
      unitApartment: z.string().max(20).nullable().optional(),
      street:        z.string().min(1).max(120),
      suburb:        z.string().min(1).max(80),
      state:         z.string().min(1).max(40),
      postcode:      z.string().min(4).max(10),
      notes:         z.string().max(255).nullable().optional(),
    })
    .optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
