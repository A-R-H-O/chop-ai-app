"use client";

import { Pencil } from "lucide-react";

export interface SampleRow {
  id: string;
  name: string;
  stem: string;
  bars: number | null;
  reason: string;
  tags: string[];
  peaks: number[];
  rank: number;
  recommended: boolean;
  url: string;
}

/**
 * The waveform, doubling as the transport.
 *
 * Bars behind the playhead are full strength and the ones ahead are
 * dimmed, so the position is readable at a glance without staring at a
 * one pixel line. The line is there too, because on a two second chop the
 * bar-by-bar fill is coarse.
 */
function Waveform({
  peaks,
  dark,
  progress,
}: {
  peaks: number[];
  dark: boolean;
  progress: number | null;
}) {
  const playing = progress !== null;

  return (
    <div aria-hidden="true" className="relative flex h-11 items-center gap-[3px]">
      {peaks.map((peak, i) => {
        const played = playing && i / peaks.length <= progress;
        return (
          <span
            key={i}
            className={`min-w-[2px] flex-auto rounded-[2px] ${
              dark ? "bg-chop-on-accent" : "bg-chop-accent"
            }`}
            // A floor of 6% so a silent bucket is still a visible tick
            // rather than a gap in the waveform.
            style={{
              height: `${Math.max(6, peak * 100)}%`,
              opacity: playing ? (played ? 1 : 0.3) : dark ? 0.9 : 0.85,
            }}
          />
        );
      })}

      {playing && (
        <span
          className={`pointer-events-none absolute inset-y-0 w-[2px] rounded-full ${
            dark ? "bg-chop-on-accent" : "bg-chop-ink"
          }`}
          style={{ left: `${progress * 100}%` }}
        />
      )}
    </div>
  );
}

function PlayGlyph({ dark }: { dark: boolean }) {
  return (
    <span
      className="ml-[3px] size-0 border-y-[7px] border-l-[12px] border-y-transparent"
      style={{ borderLeftColor: dark ? "var(--color-chop-accent)" : "#181601" }}
    />
  );
}

function PauseGlyph({ dark }: { dark: boolean }) {
  const color = dark ? "var(--color-chop-accent)" : "#181601";
  return (
    <span className="flex items-center gap-1">
      <span className="h-3.5 w-1 rounded-[2px]" style={{ background: color }} />
      <span className="h-3.5 w-1 rounded-[2px]" style={{ background: color }} />
    </span>
  );
}

/**
 * One sample. `highlighted` renders the inverted accent card the handoff
 * uses for the active sample; every other card is a surface.
 */
export function SampleCard({
  sample,
  bpm,
  musicKey,
  keyBinding,
  playing,
  highlighted,
  progress = null,
  onToggle,
  onAddContext,
}: {
  sample: SampleRow;
  bpm: number | null;
  musicKey: string | null;
  keyBinding?: string | null;
  playing: boolean;
  highlighted: boolean;
  /** Position within the sample, 0 to 1, or null when stopped. */
  progress?: number | null;
  onToggle: () => void;
  onAddContext?: () => void;
}) {
  const meta = [
    bpm ? `${bpm} bpm` : null,
    musicKey,
    sample.bars ? `${sample.bars} ${sample.bars === 1 ? "bar" : "bars"}` : null,
    sample.stem,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className={`flex w-full flex-col gap-4 rounded-button p-[17px] transition-colors duration-150 ease-out sm:w-[320px] ${
        highlighted
          ? "bg-chop-accent text-chop-on-accent"
          : "bg-chop-surface text-chop-ink shadow-surface"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onToggle}
          aria-label={`${playing ? "pause" : "play"} ${sample.name}`}
          className={`inline-flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full ${
            highlighted ? "bg-chop-ground" : "bg-chop-accent"
          }`}
        >
          {playing ? (
            <PauseGlyph dark={highlighted} />
          ) : (
            <PlayGlyph dark={highlighted} />
          )}
        </button>

        {keyBinding ? (
          <span
            className={`flex size-9 items-center justify-center rounded-button font-sans text-sm font-medium ${
              highlighted
                ? "bg-chop-on-accent text-chop-accent"
                : "bg-chop-accent text-chop-on-accent"
            }`}
          >
            {keyBinding}
          </span>
        ) : onAddContext ? (
          <button
            type="button"
            onClick={onAddContext}
            aria-label={`add context to ${sample.name}`}
            className="inline-flex size-10 cursor-pointer items-center justify-center rounded-button"
          >
            <Pencil size={16} strokeWidth={2} />
          </button>
        ) : null}
      </div>

      <Waveform peaks={sample.peaks} dark={highlighted} progress={progress} />

      <div className="flex flex-col gap-1">
        <span className="font-display text-base leading-6 font-semibold">
          {sample.name}
        </span>
        <span
          className={`font-sans text-xs leading-[18px] ${
            highlighted ? "opacity-72" : "opacity-64"
          }`}
        >
          {meta}
        </span>
      </div>

      {sample.reason && (
        <p
          className={`font-sans text-xs leading-[18px] ${
            highlighted ? "opacity-72" : "opacity-56"
          }`}
        >
          {sample.reason}
        </p>
      )}
    </div>
  );
}
