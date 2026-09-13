"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { GoogleLogo } from "./google-logo";

/**
 * Google's branded sign-in button, built to their identity guidelines:
 * the unaltered four-colour mark, 40px minimum height, an 18px logo with
 * at least 8px of clear space, and the exact string "Sign in with Google".
 *
 * This is the one place the handoff's all-lowercase copy rule does not
 * apply. The label is a Google brand asset and their terms do not permit
 * altering it, so "sign in with google" would be non-compliant.
 */
export function SignInButton() {
  const [pending, setPending] = useState(false);

  async function signIn() {
    setPending(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    // On success the browser navigates away, so this only runs on failure.
    if (error) setPending(false);
  }

  return (
    <button
      type="button"
      onClick={signIn}
      disabled={pending}
      // Google's metrics: 40px height, 12px symmetric padding, 10px gap
      // beside an 18px mark, 14px medium at 0.25px tracking.
      className="inline-flex h-10 items-center justify-center gap-2.5 rounded-button bg-white px-3 font-sans text-sm font-medium tracking-[0.25px] whitespace-nowrap text-[#1f1f1f] transition-[background-color,box-shadow] duration-150 ease-out hover:bg-[#f7f8f8] hover:shadow-[0_1px_3px_rgb(0_0_0/0.3)] focus-visible:ring-2 focus-visible:ring-chop-accent focus-visible:ring-offset-2 focus-visible:ring-offset-chop-ground focus-visible:outline-none disabled:opacity-60"
    >
      <GoogleLogo />
      Sign in with Google
    </button>
  );
}
