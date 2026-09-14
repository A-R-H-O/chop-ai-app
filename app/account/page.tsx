import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { readBalance } from "@/lib/credits/read";
import { AccountPanel } from "@/components/chop/account-panel";
import { LegalFooter } from "@/components/chop/prose-page";

export const metadata: Metadata = {
  title: "account · chop.ai",
};

export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/");

  const balance = await readBalance(user.id);

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex shrink-0 items-center justify-between px-6 py-5 md:px-[85px]">
        <Link href="/">
          <Image
            src="/logo/chop-ai-wordmark.png"
            alt="chop.ai"
            width={120}
            height={22}
            className="h-[18px] w-auto invert md:h-[22px]"
          />
        </Link>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="cursor-pointer font-sans text-sm text-chop-muted hover:text-chop-ink"
          >
            sign out
          </button>
        </form>
      </header>

      <main className="mx-auto w-full max-w-[720px] flex-1 px-6 pb-20">
        <h1 className="font-display text-4xl font-bold tracking-[-0.02em] text-chop-ink md:text-5xl">
          account
        </h1>
        <p className="mt-3 font-sans text-base text-chop-muted">
          {user.email} · {balance} credits
        </p>

        <div className="mt-12">
          <AccountPanel email={user.email ?? ""} />
        </div>
      </main>

      <LegalFooter />
    </div>
  );
}
