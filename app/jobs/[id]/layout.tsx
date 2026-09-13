import Image from "next/image";

/**
 * The loader screen has a header with the wordmark but no credit
 * balance, per the handoff. This layout provides that, so the job route
 * does not reuse AppHeader and then have to hide half of it.
 */
export default function JobLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex shrink-0 items-center px-6 py-5 md:px-[85px]">
        <Image
          src="/logo/chop-ai-wordmark.png"
          alt="chop.ai"
          width={120}
          height={22}
          priority
          className="h-[18px] w-auto invert md:h-[22px]"
        />
      </header>
      {children}
    </div>
  );
}
