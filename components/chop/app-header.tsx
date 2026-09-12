import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { readBalance } from "@/lib/credits/read";
import { HeaderCredits } from "./header-credits";
import { SignInButton } from "./sign-in-button";

/**
 * Server Component. Reads the session, and for a signed-in user reads the
 * balance, which is also what applies today's daily grant.
 *
 * Absent from the loader screen by design, per the handoff.
 */
export async function AppHeader() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const balance = user ? await readBalance(user.id) : null;

  return (
    <header className="flex shrink-0 items-center justify-between gap-4 px-6 py-5 md:gap-6 md:px-[85px]">
      <Image
        src="/logo/chop-ai-wordmark.png"
        alt="chop.ai"
        width={120}
        height={22}
        priority
        className="h-[18px] w-auto invert md:h-[22px]"
      />
      {balance === null ? (
        <SignInButton />
      ) : (
        <HeaderCredits balance={balance} />
      )}
    </header>
  );
}
