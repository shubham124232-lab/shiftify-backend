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
  dob:                       z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date").optional(),
  gender:                    z.string().max(40).optional(),
  suburb:                    z.string().max(100).optional(),
  postcode:                  z.string().max(10).optional(),
  state:                     z.string().max(10).optional(),
  // Work rights
  rightToWork:               z.enum(["CITIZEN", "PR", "VISA_HOLDER"]).optional(),
  visaType:                  z.string().max(60).optional(),
  visaExpiry:                z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date").optional(),
  workType:                  z.enum(["CONTRACTOR", "AGENCY"]).optional(),
  abn:                       z.string().max(20).optional(),
  gstRegistered:             z.boolean().optional(),
  // Insurance
  publicLiabilityInsurance:      z.boolean().optional(),
  publicLiabilityPolicyNumber:   z.string().max(80).optional(),
  publicLiabilityExpiry:         z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date").optional(),
  personalAccidentInsurance:     z.boolean().optional(),
  personalAccidentPolicyNumber:  z.string().max(80).optional(),
  personalAccidentExpiry:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date").optional(),
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
  hourlyRateType:            z.enum(["FIXED", "NDIS_PRICE_GUIDE", "NEGOTIABLE"]).optional(),
  weekendNightRates:         weekendNightRatesSchema.optional(),
  travelCharges:             z.enum(["NONE", "INCLUDED", "CHARGED_SEPARATELY"]).optional(),
  // Preferences
  preferredParticipantType:  z.array(z.string()).optional(),
  genderPreference:          z.string().max(40).optional(),
  languagesSpoken:           z.array(z.string()).optional(),
  bio:                       z.string().max(2000).optional(),
  preferences:               z.string().max(1000).optional(),
  isAvailableNow:            z.boolean().optional(),
  seekingPlanManager:        z.boolean().optional(),
  // Compliance metadata
  ndisScreeningNumber:       z.string().max(80).optional(),
  ndisScreeningExpiry:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date").optional(),
  policeCheckIssueDate:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date").optional(),
  policeCheckExpiry:         z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date").optional(),
  wwccNumber:                z.string().max(80).optional(),
  wwccExpiry:                z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date").optional(),
  firstAidExpiry:            z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date").optional(),
  firstAidCertType:          z.enum(["HLTAID011", "HLTAID009", "OTHER"]).optional(),
  cprExpiry:                 z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date").optional(),
  driversLicenceExpiry:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date").optional(),
  infectionControlCompleted: z.boolean().optional(),
  manualHandlingCompleted:   z.boolean().optional(),
  // Availability schedule
  availableDays:             z.array(z.enum(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"])).optional(),
  timeBlocks:                z.array(z.enum(["MORNING", "AFTERNOON", "EVENING", "OVERNIGHT"])).optional(),
  minimumShiftHours:         z.number().min(0).max(24).optional(),
  // References
  references:                z.array(referenceSchema).optional(),
  // Declarations
  termsAccepted:             z.boolean().optional(),
  privacyPolicyAccepted:     z.boolean().optional(),
  ndisCodeAccepted:          z.boolean().optional(),
  declarationStatement:      z.boolean().optional(),
});

export type WorkerProfileInput  = z.infer<typeof workerProfileSchema>;
export type AvailabilitySlotInput = z.infer<typeof availabilitySlotSchema>;
