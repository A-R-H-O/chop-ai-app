import Image from "next/image";

/**
 * The hand-drawn marks behind screen 02.
 *
 * The handoff swaps the waveform for these once a file is chosen: the
 * waveform stands in for audio you have not given it yet, so once you
 * have, it stops being the right metaphor. Both are inverted because the
 * source art is dark-on-light.
 */
export function UploadBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 select-none"
    >
      <Image
        src="/illustrations/spiral-4.svg"
        alt=""
        width={130}
        height={130}
        className="absolute bottom-20 left-6 hidden h-auto w-[130px] opacity-20 invert md:block"
      />
      <Image
        src="/illustrations/doodle-2.svg"
        alt=""
        width={180}
        height={180}
        className="absolute right-10 bottom-14 hidden h-auto w-[180px] opacity-[0.22] invert md:block"
      />
    </div>
  );
}
