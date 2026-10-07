import { z } from "zod";
import { phoneOptional } from "./shared";

const participantProfileBaseSchema = z.object({
  profileStep:                  z.number().int().min(0).max(20).optional(),
  // Personal
  preferredName:                z.string().max(80).optional(),
  ageGroup:                     z.enum(["CHILD", "ADULT", "SENIOR"]).optional(),
  gender:                       z.string().max(40).nullable().optional(),
  participantType:              z.enum(["SELF", "PARENT", "GUARDIAN", "CARER", "NOMINEE"]).optional(),
  suburb:                       z.string().max(100).optional(),
  postcode:                     z.string().max(10).optional(),
  state:                        z.string().max(10).optional(),
  fullAddress:                  z.string().max(300).optional(),
  // NDIS
  ndisNumber:                   z.string().max(20).optional(),
  fundingManagementType:        z.enum(["SELF_MANAGED", "PLAN_MANAGED", "NDIA_MANAGED"]).optional(),
  supportCoordinationFunding:   z.enum(["NONE", "LEVEL_1", "LEVEL_2", "LEVEL_3"]).optional(),
  ndisStartDate:                z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date").optional(),
  ndisEndDate:                  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date").optional(),
  // Support needs
  primaryDisability:            z.string().max(120).optional(),
  primarySupportNeeds:          z.array(z.string()).nullable().optional(),
  mobilitySupportNeeds:         z.array(z.string()).nullable().optional(),
  communicationNeeds:           z.array(z.string()).nullable().optional(),
  behaviourSensoryNotes:        z.array(z.string()).nullable().optional(),
  medicalConsiderations:        z.array(z.string()).nullable().optional(),
  riskSafetyNotes:              z.string().max(1000).optional(),
  skillsRequired:               z.array(z.string()).nullable().optional(),
  personalCareSupportLevel:     z.string().max(60).optional(),
  // Preferences
  supportPreferences:           z.array(z.string()).nullable().optional(),
  preferredSupportType:         z.enum(["ONE_TIME", "ONGOING", "BOTH"]).optional(),
  preferredWorkerGender:        z.string().max(40).optional(),
  languagePreference:           z.array(z.string()).nullable().optional(),
  culturalPreference:           z.array(z.string()).nullable().optional(),
  preferredDays:                z.array(z.string()).nullable().optional(),
  preferredTime:                z.array(z.string()).nullable().optional(),
  // Emergency contact
  emergencyContactName:         z.string().max(120).optional(),
  emergencyContactPhone:        phoneOptional,
  emergencyContactRelationship: z.string().max(80).optional(),
  // Declarations
  seekingPlanManager:           z.boolean().optional(),
  privacyPolicyAccepted:        z.boolean().optional(),
  termsAccepted:                z.boolean().optional(),
  ndisCodeAccepted:             z.boolean().optional(),
});

export const participantProfileSchema = participantProfileBaseSchema.strict().superRefine((data, ctx) => {
  // Final-submission checks — only enforced once the applicant reaches the declaration step,
  // so in-progress step-by-step saves are never blocked.
  if (data.termsAccepted === true) {
    if (!data.fundingManagementType) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["fundingManagementType"], message: "Plan Management Type is required" });
    }
    if (!data.supportCoordinationFunding) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["supportCoordinationFunding"], message: "Support Coordination Funding is required" });
    }
  }
});

export type ParticipantProfileInput = z.infer<typeof participantProfileSchema>;
