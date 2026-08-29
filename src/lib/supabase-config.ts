const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function getPublicSupabaseConfig() {
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error("Public Supabase configuration is unavailable.");
  }

  return { supabaseUrl, supabasePublishableKey };
}
