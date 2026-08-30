import type { User } from "@supabase/supabase-js";

import { createBrowserSupabaseClient } from "@/lib/supabase-browser";

let pendingAuthentication: Promise<User> | undefined;

export function ensureAnonymousAuth(): Promise<User> {
  if (!pendingAuthentication) {
    pendingAuthentication = authenticate().finally(() => {
      pendingAuthentication = undefined;
    });
  }

  return pendingAuthentication;
}

async function authenticate(): Promise<User> {
  const supabase = createBrowserSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  if (userData.user) {
    return userData.user;
  }

  await supabase.auth.signOut({ scope: "local" });

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error || !data.user) {
    throw new Error("Unable to start an anonymous contribution session.");
  }

  return data.user;
}
