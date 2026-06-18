import { z } from "zod";

export const availabilitySlotSchema = z.object({
  dayOfWeek: z.enum(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "startTime must be HH:MM"),
  endTime:   z.string().regex(/^\d{2}:\d{2}$/, "endTime must be HH:MM"),
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

const weekendNightRatesSchema = z.object({
  weekendRate:       z.number().min(0).max(9999).optional(),
  nightRate:         z.number().min(0).max(9999).optional(),
  publicHolidayRate: z.number().min(0).max(9999).optional(),
});

export const workerProfileSchema = z.object({
  profileStep:               z.number().int().min(0).max(20).optional(),
  // Personal
  dob:                       z.string().datetime({ offset: true }).optional(),
  gender:                    z.string().max(40).optional(),
  suburb:                    z.string().max(100).optional(),
  postcode:                  z.string().max(10).optional(),
  state:                     z.string().max(10).optional(),
  // Work rights
  rightToWork:               z.enum(["CITIZEN", "PR", "VISA_HOLDER"]).optional(),
  visaType:                  z.string().max(60).optional(),
  visaExpiry:                z.string().datetime({ offset: true }).optional(),
  workType:                  z.enum(["CONTRACTOR", "AGENCY"]).optional(),
  abn:                       z.string().max(20).optional(),
  gstRegistered:             z.boolean().optional(),
  // Insurance
  publicLiabilityInsurance:      z.boolean().optional(),
  publicLiabilityPolicyNumber:   z.string().max(80).optional(),
  publicLiabilityExpiry:         z.string().datetime({ offset: true }).optional(),
  personalAccidentInsurance:     z.boolean().optional(),
  personalAccidentPolicyNumber:  z.string().max(80).optional(),
  personalAccidentExpiry:        z.string().datetime({ offset: true }).optional(),
  driversLicenceType:            z.enum(["C", "R", "HR", "HC", "MR"]).optional(),
  // Services & skills
  servicesOffered:           z.array(z.string()).optional(),
  subServices:               z.array(z.string()).optional(),
  highIntensitySkills:       z.array(z.string()).optional(),
  experienceLevel:           z.enum(["BEGINNER", "INTERMEDIATE", "EXPERIENCED", "EXPERT"]).optional(),
  disabilityExperience:      z.array(z.string()).optional(),
  // Availability
  availabilityType:          z.enum(["CASUAL", "PART_TIME", "FULL_TIME", "ON_DEMAND"]).optional(),
  emergencyAvailability:     z.boolean().optional(),
  canTransportParticipants:  z.boolean().optional(),
  sleeperAvailability:       z.boolean().optional(),
  // Location
  serviceAreas:              z.array(z.string()).optional(),
  lat:                       z.number().min(-90).max(90).optional(),
  lng:                       z.number().min(-180).max(180).optional(),
  travelRadiusKm:            z.number().int().min(0).max(500).optional(),
  hasVehicle:                z.boolean().optional(),
  vehicleDetails:            vehicleDetailsSchema.optional(),
  insuranceValid:            z.boolean().optional(),
  // Financials
  hourlyRate:                z.number().min(0).max(9999).optional(),
  hourlyRateType:            z.string().max(40).optional(),
  weekendNightRates:         weekendNightRatesSchema.optional(),
  travelCharges:             z.string().max(40).optional(),
  // Preferences
  preferredParticipantType:  z.array(z.string()).optional(),
  genderPreference:          z.string().max(40).optional(),
  languagesSpoken:           z.array(z.string()).optional(),
  bio:                       z.string().max(2000).optional(),
  preferences:               z.string().max(1000).optional(),
  isAvailableNow:            z.boolean().optional(),
  seekingPlanManager:        z.boolean().optional(),
  // Documents / compliance
  manualHandlingCompleted:   z.boolean().optional(),
  firstAidCertType:          z.string().max(40).optional(),
  // Declarations
  termsAccepted:             z.boolean().optional(),
  ndisCodeAccepted:          z.boolean().optional(),
  privacyPolicyAccepted:     z.boolean().optional(),
  declarationStatement:      z.boolean().optional(),
  // References
  references:                z.array(referenceSchema).max(3).optional(),
  // Availability slots
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
