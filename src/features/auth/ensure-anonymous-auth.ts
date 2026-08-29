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
  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();

  if (sessionError) {
    throw new Error("Unable to check the contribution session.");
  }

  if (sessionData.session?.user) {
    return sessionData.session.user;
  }

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error || !data.user) {
    throw new Error("Unable to start an anonymous contribution session.");
  }

  return data.user;
}
