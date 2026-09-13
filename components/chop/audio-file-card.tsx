"use client";

import { Upload, X } from "lucide-react";

/** Deterministic bar heights for the file card's mini waveform. */
const UPLOAD_BARS = Array.from({ length: 34 }, (_, i) => {
  const a = Math.sin((i / 34) * Math.PI * 5);
  const b = Math.sin((i / 34) * Math.PI * 11 + 0.9);
  return 0.25 + ((a + b + 2) / 4) * 0.75;
});

function formatDuration(seconds: number | null) {
  if (seconds === null) return null;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatSize(bytes: number) {
  const mb = bytes / 1_000_000;
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(bytes / 1000)} KB`;
}

export function AudioFileCard({
  file,
  durationSeconds,
  onRemove,
}: {
  file: File;
  durationSeconds: number | null;
  onRemove: () => void;
}) {
  const duration = formatDuration(durationSeconds);

  return (
    <div className="flex items-center gap-4 rounded-option bg-chop-ground p-4 shadow-[inset_0_0_0_1px_rgb(254_252_236/0.12)]">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-chop-accent text-chop-on-accent">
        <Upload size={22} strokeWidth={2} />
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate font-display text-lg leading-6 font-semibold text-chop-ink">
          {file.name}
        </span>
        <span className="font-sans text-sm leading-5 text-chop-muted">
          {[duration, formatSize(file.size)].filter(Boolean).join(" · ")}
        </span>
      </div>

      <div
        aria-hidden="true"
        className="hidden h-8 w-[200px] shrink-0 items-center gap-[3px] sm:flex"
      >
        {UPLOAD_BARS.map((h, i) => (
          <span
            key={i}
            className="min-w-[2px] flex-auto rounded-[2px] bg-chop-accent opacity-80"
            style={{ height: `${(h * 100).toFixed(1)}%` }}
          />
        ))}
      </div>

      <button
        type="button"
        aria-label="remove file"
        onClick={onRemove}
        className="inline-flex size-10 shrink-0 items-center justify-center rounded-button text-chop-ink transition-colors duration-150 ease-out hover:bg-chop-surface"
      >
        <X size={16} strokeWidth={2} />
      </button>
    </div>
  );
}
