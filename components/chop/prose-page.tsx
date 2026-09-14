import Image from "next/image";
import Link from "next/link";

/**
 * The frame every written page sits in: terms, privacy, refunds, dmca.
 *
 * Plain column, generous measure, no backdrop. These are pages somebody
 * reads when they are worried about something, so nothing here competes
 * with the words.
 */
export function ProsePage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-col">
      <header className="flex shrink-0 items-center px-6 py-5 md:px-[85px]">
        <Link href="/">
          <Image
            src="/logo/chop-ai-wordmark.png"
            alt="chop.ai"
            width={120}
            height={22}
            className="h-[18px] w-auto invert md:h-[22px]"
          />
        </Link>
      </header>

      <main className="mx-auto w-full max-w-[720px] flex-1 px-6 pb-20">
        <h1 className="font-display text-4xl font-bold tracking-[-0.02em] text-chop-ink md:text-5xl">
          {title}
        </h1>
        <p className="mt-3 font-sans text-sm text-chop-muted">
          last updated {updated}
        </p>

        <div className="mt-10 flex flex-col gap-6 font-sans text-base leading-7 text-chop-ink/80 [&_a]:text-chop-accent [&_a]:underline [&_h2]:mt-6 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-chop-ink [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-chop-ink">
          {children}
        </div>
      </main>

      <LegalFooter />
    </div>
  );
}

/** The same four links at the bottom of every page that has them. */
export function LegalFooter() {
  return (
    <footer className="mt-auto flex flex-wrap items-center gap-x-6 gap-y-2 px-6 py-8 font-sans text-sm text-chop-muted md:px-[85px]">
      <Link href="/terms" className="hover:text-chop-ink">
        terms
      </Link>
      <Link href="/privacy" className="hover:text-chop-ink">
        privacy
      </Link>
      <Link href="/refunds" className="hover:text-chop-ink">
        refunds
      </Link>
      <Link href="/dmca" className="hover:text-chop-ink">
        copyright
      </Link>
    </footer>
  );
}
