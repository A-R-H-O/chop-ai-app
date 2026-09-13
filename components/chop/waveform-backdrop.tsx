/**
 * The idle waveform behind screen 01. From the handoff: full-bleed row of
 * bars, 440px tall on desktop and 340px on mobile, accent at 16% opacity.
 *
 * The handoff prototype drove these from JS via a ref. This uses CSS
 * keyframes instead, which needs no client component and no animation
 * frame loop, and honours reduced-motion for free.
 *
 * Each bar carries its own --bar-base, and the keyframe animates relative
 * to that, so the row keeps its uneven waveform shape while breathing.
 * A single shared keyframe scaling 0.3 to 1 would flatten every bar to the
 * same height at the midpoint. Heights are deterministic rather than
 * random so server and client markup match.
 */
const DESKTOP_BARS = 64;


function baseScale(index: number, total: number) {
  // Two offset sine waves, so the row reads as an uneven waveform rather
  // than a repeating pattern.
  //
  // Kept short on purpose. The handoff's resting state is scaleY(0.2);
  // an earlier pass ranged up to 0.6 and animated to 0.96, which made the
  // backdrop tall enough to fight the heading for attention instead of
  // sitting behind it. Range here is 0.10 to 0.32, peaking at 0.45.
  const a = Math.sin((index / total) * Math.PI * 6);
  const b = Math.sin((index / total) * Math.PI * 13 + 1.7);
  return 0.1 + ((a + b + 2) / 4) * 0.22;
}

function Bars({ count, gap }: { count: number; gap: string }) {
  return (
    <div aria-hidden="true" className="flex h-full items-center" style={{ gap }}>
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className="h-full flex-auto origin-center rounded-[4px] bg-chop-accent opacity-[0.16] motion-safe:animate-chop-eq"
          style={
            {
              "--bar-base": baseScale(i, count).toFixed(3),
              transform: `scaleY(${baseScale(i, count).toFixed(3)})`,
              animationDelay: `${((i * 97) % 2400) / 1000}s`,
              animationDuration: `${2.4 + ((i * 31) % 900) / 1000}s`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

/**
 * Desktop only. The handoff shows a 26-bar version on mobile, but at
 * 390px the form card covers all but ~24px of gutter either side, so it
 * renders as two orphaned stubs that read as a rendering fault rather
 * than a backdrop. Nothing is lost by dropping it at that width.
 */
export function WaveformBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-1/2 hidden -translate-y-1/2 select-none md:block">
      <div className="h-[440px] px-10">
        <Bars count={DESKTOP_BARS} gap="6px" />
      </div>
    </div>
  );
}
