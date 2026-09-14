import Image from "next/image";
import Link from "next/link";
import { HeaderCredits } from "./header-credits";
import { SignInButton } from "./sign-in-button";

/**
 * Presentational. The balance is read once by the page and passed in,
 * rather than fetched here, so a page render calls apply_daily_grant once
 * instead of once per component that wants the number.
 *
 * Absent from the loader screen by design, per the handoff.
 */
export function AppHeader({ balance }: { balance: number | null }) {
  return (
    <header className="relative flex shrink-0 items-center justify-between gap-4 px-6 py-5 md:gap-6 md:px-[85px]">
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
        <div className="flex items-center gap-4 md:gap-6">
          <Link
            href="/account"
            className="font-sans text-sm text-chop-muted transition-colors duration-150 ease-out hover:text-chop-ink"
          >
            account
          </Link>
          <HeaderCredits balance={balance} />
        </div>
      )}
    </header>
  );
}
