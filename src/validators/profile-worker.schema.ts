import { z } from "zod";

const availabilitySlotSchema = z.object({
  dayOfWeek: z.enum(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]),
  startTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "startTime must be HH:MM"),
  endTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "endTime must be HH:MM"),
});

const vehicleDetailsSchema = z.object({
  make:   z.string().max(60).optional(),
  model:  z.string().max(60).optional(),
  year:   z.number().int().min(1950).max(2099).optional(),
  rego:   z.string().max(20).optional(),
  colour: z.string().max(40).optional(),
});

const referenceSchema = z.object({
  name:         z.string().max(100),
  relationship: z.string().max(60),
  phone:        z.string().max(30).optional(),
  email:        z.string().email().optional(),
});

export const workerProfileSchema = z.object({
  profileStep:               z.number().int().min(0).max(9).optional(),
  dob:                       z.string().datetime({ offset: true }).optional(),
  gender:                    z.string().max(40).optional(),
  rightToWork:               z.enum(["CITIZEN", "PR", "VISA_HOLDER"]).optional(),
  visaType:                  z.string().max(60).optional(),
  visaExpiry:                z.string().datetime({ offset: true }).optional(),
  workType:                  z.enum(["CONTRACTOR", "AGENCY"]).optional(),
  abn:                       z.string().max(20).optional(),
  gstRegistered:             z.boolean().optional(),
  servicesOffered:           z.array(z.string()).optional(),
  subServices:               z.array(z.string()).optional(),
  highIntensitySkills:       z.array(z.string()).optional(),
  experienceLevel:           z.enum(["BEGINNER", "INTERMEDIATE", "EXPERIENCED", "EXPERT"]).optional(),
  disabilityExperience:      z.array(z.string()).optional(),
  availabilityType:          z.enum(["CASUAL", "PART_TIME", "FULL_TIME", "ON_DEMAND"]).optional(),
  emergencyAvailability:     z.boolean().optional(),
  serviceAreas:              z.array(z.string()).optional(),
  lat:                       z.number().min(-90).max(90).optional(),
  lng:                       z.number().min(-180).max(180).optional(),
  travelRadiusKm:            z.number().int().min(0).max(500).optional(),
  hasVehicle:                z.boolean().optional(),
  vehicleDetails:            vehicleDetailsSchema.optional(),
  insuranceValid:            z.boolean().optional(),
  publicLiabilityInsurance:  z.boolean().optional(),
  personalAccidentInsurance: z.boolean().optional(),
  hourlyRate:                z.number().min(0).max(9999).optional(),
  bio:                       z.string().max(2000).optional(),
  preferences:               z.string().max(1000).optional(),
  isAvailableNow:            z.boolean().optional(),
  references:                z.array(referenceSchema).max(3).optional(),
  seekingPlanManager:        z.boolean().optional(),
  // Availability slots — replaces all existing slots if provided
  availability:              z.array(availabilitySlotSchema).optional(),
});

export const availabilitySlotsSchema = z.object({
  slots: z.array(availabilitySlotSchema).min(0).max(50),
});

export const unavailabilitySchema = z.object({
  date:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
  reason: z.string().max(255).optional(),
});

export type WorkerProfileInput  = z.infer<typeof workerProfileSchema>;
export type AvailabilitySlots   = z.infer<typeof availabilitySlotsSchema>;
export type UnavailabilityInput = z.infer<typeof unavailabilitySchema>;
