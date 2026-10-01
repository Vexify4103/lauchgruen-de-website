import { z } from "zod";

export const applicationSchema = z
	.object({
		displayName: z.string().trim().min(2).max(60),
		mainRole: z.string().trim().min(1).max(20),
		preferredRoles: z.array(z.string().trim().min(1)).min(1).max(6),
		availableAllDates: z.literal(true),
		notes: z.string().trim().max(1500).optional().default(""),
		acceptedRules: z.literal(true),
		acceptedDataStorage: z.literal(true),
		discordDmOptIn: z.boolean().default(true),
		hasCompetitiveExperience: z.boolean().default(false),
		competitiveExperience: z.string().trim().max(1500).default(""),
	})
	.refine((data) => !data.hasCompetitiveExperience || data.competitiveExperience.length > 0, {
		path: ["competitiveExperience"],
		message: "Bitte beschreibe deine Competitive-Erfahrung oder entferne den Haken.",
	})
	.transform((data) => ({
		...data,
		competitiveExperience: data.hasCompetitiveExperience ? data.competitiveExperience : "",
	}));
