import { z } from "zod";

const environmentSchema = z
  .object({
    NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    NEXT_PUBLIC_MAP_TILE_URL: z.string().min(1),
    NEXT_PUBLIC_MAP_ATTRIBUTION: z.string().min(1),
    INATURALIST_BASE_URL: z.string().url().default("https://api.inaturalist.org/v1"),
    EXTERNAL_API_TIMEOUT_MS: z.literal("5000").default("5000"),
    INATURALIST_CACHE_TTL_SECONDS: z.literal("86400").default("86400"),
  })
  .superRefine((values, context) => {
    const hasMapUrl = values.NEXT_PUBLIC_MAP_TILE_URL.length > 0;
    const hasAttribution = values.NEXT_PUBLIC_MAP_ATTRIBUTION.length > 0;

    if (hasMapUrl !== hasAttribution) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Map tile URL and attribution must be configured together.",
        path: ["NEXT_PUBLIC_MAP_ATTRIBUTION"],
      });
    }
  });

const parsedEnvironment = environmentSchema.safeParse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  NEXT_PUBLIC_MAP_TILE_URL: process.env.NEXT_PUBLIC_MAP_TILE_URL,
  NEXT_PUBLIC_MAP_ATTRIBUTION: process.env.NEXT_PUBLIC_MAP_ATTRIBUTION,
  INATURALIST_BASE_URL: process.env.INATURALIST_BASE_URL,
  EXTERNAL_API_TIMEOUT_MS: process.env.EXTERNAL_API_TIMEOUT_MS,
  INATURALIST_CACHE_TTL_SECONDS:
    process.env.INATURALIST_CACHE_TTL_SECONDS,
});

if (!parsedEnvironment.success) {
  console.error(
    "Invalid environment configuration:",
    parsedEnvironment.error.flatten().fieldErrors,
  );
  throw new Error("Invalid environment configuration.");
}

export const env = parsedEnvironment.data;
