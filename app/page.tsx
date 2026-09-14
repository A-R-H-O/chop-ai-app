import { createClient } from "@/lib/supabase/server";
import { readBalance } from "@/lib/credits/read";
import { AppHeader } from "@/components/chop/app-header";
import { HomeStage } from "@/components/chop/home-stage";
import { LegalFooter } from "@/components/chop/prose-page";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Reading the balance is also what applies today's grant. Done once
  // here and passed down, so the header and the form share one read.
  const balance = user ? await readBalance(user.id) : null;

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      <AppHeader balance={balance} />
      <HomeStage balance={balance} />
      <div className="relative">
        <LegalFooter />
      </div>
    </div>
  );
}
