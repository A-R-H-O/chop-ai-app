"use client";

import { useState } from "react";
import { ChopForm } from "./chop-form";
import { UnderlinedHeading } from "./underlined-heading";
import { UploadBackdrop } from "./upload-backdrop";
import { WaveformBackdrop } from "./waveform-backdrop";

/**
 * Screens 01 and 02, which are one form in two states.
 *
 * This wrapper exists so the backdrop can follow the form's state: the
 * waveform stands in for audio you have not supplied, and is replaced by
 * the hand-drawn marks once you have. The form owns whether a file is
 * chosen, so the swap has to live on the client side of the boundary.
 */
export function HomeStage({ balance }: { balance: number | null }) {
  const [hasFile, setHasFile] = useState(false);

  return (
    <>
      {hasFile ? <UploadBackdrop /> : <WaveformBackdrop />}
      <main className="relative flex flex-1 flex-col items-center justify-center gap-8 px-6 pb-16 md:px-[85px]">
        <UnderlinedHeading className="text-4xl leading-[1.15] md:text-[60px] md:leading-[72px]">
          what&apos;s the sample?
        </UnderlinedHeading>
        <ChopForm balance={balance} onFileChange={setHasFile} />
      </main>
    </>
  );
}
