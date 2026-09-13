import { createClient } from "@/lib/supabase/server";
import { readBalance } from "@/lib/credits/read";
import { AppHeader } from "@/components/chop/app-header";
import { ChopForm } from "@/components/chop/chop-form";
import { UnderlinedHeading } from "@/components/chop/underlined-heading";
import { WaveformBackdrop } from "@/components/chop/waveform-backdrop";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Reading the balance is also what applies today's grant. Done once here
  // and passed down, so the header and the form share one read.
  const balance = user ? await readBalance(user.id) : null;

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      <WaveformBackdrop />
      <AppHeader balance={balance} />
      <main className="relative flex flex-1 flex-col items-center justify-center gap-8 px-6 pb-16 md:px-[85px]">
        <UnderlinedHeading className="text-4xl leading-[1.15] md:text-[60px] md:leading-[72px]">
          what&apos;s the sample?
        </UnderlinedHeading>
        <ChopForm balance={balance} />
      </main>
    </div>
  );
}
