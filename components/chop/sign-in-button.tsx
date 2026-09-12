"use client";

import { createClient } from "@/lib/supabase/client";

export function SignInButton() {
  async function signIn() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  return (
    <button
      type="button"
      onClick={signIn}
      className="inline-flex h-10 items-center justify-center rounded-button bg-chop-accent px-5 font-sans text-[15px] font-medium text-chop-on-accent"
    >
      sign in with google
    </button>
  );
}
