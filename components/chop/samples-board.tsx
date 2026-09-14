"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { SampleEngine, type TriggerSource } from "@/lib/audio/engine";
import { keyForIndex, shouldTrigger, indexForKey } from "@/lib/audio/keys";
import { posthog } from "@/lib/analytics/posthog-client";
import { EVENTS } from "@/lib/analytics/events";
import { SampleCard, type SampleRow } from "./sample-card";

/**
 * Screen 05. Owns one SampleEngine for the lifetime of the page and the
 * keyboard listener that drives it.
 */
export function SamplesBoard({
  samples,
  bpm,
  musicKey,
  zipUrl,
  jobId,
}: {
  samples: SampleRow[];
  bpm: number | null;
  musicKey: string | null;
  zipUrl: string | null;
  jobId: string;
}) {
  // How far into each playing sample we are, 0 to 1. Absent means
  // stopped, which is also what drives the play/pause glyph.
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [ready, setReady] = useState(false);

  const engine = useMemo(() => {
    return new SampleEngine({
      onPlay: (sampleId, trigger: TriggerSource) => {
        posthog.capture?.(EVENTS.samplePlayed, {
          job_id: jobId,
          sample_id: sampleId,
          trigger,
        });
      },
    });
  }, [jobId]);

  // Decode every sample up front. A producer hitting a pad expects sound
  // immediately, not a fetch.
  useEffect(() => {
    let cancelled = false;
    Promise.allSettled(
      samples.map((sample) => engine.load(sample.id, sample.url)),
    ).then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [engine, samples]);

  // The context is created suspended during preload and resume() is
  // async, so the first pad hit would otherwise wait on it. Any earlier
  // gesture on the page pays that cost instead.
  useEffect(() => {
    const warm = () => engine.warm();
    window.addEventListener("pointerdown", warm, { once: true });
    window.addEventListener("keydown", warm, { once: true });
    return () => {
      window.removeEventListener("pointerdown", warm);
      window.removeEventListener("keydown", warm);
    };
  }, [engine]);

  // Keyed on the engine, not empty: if jobId changes the previous
  // engine is the one that must be disposed.
  useEffect(() => () => engine.dispose(), [engine]);

  // One frame loop for every card, reading the position straight off the
  // audio clock. Per-sample timers would drift against it.
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      setProgress((current) => {
        let changed = false;
        const next: Record<string, number> = {};
        for (const sample of samples) {
          const at = engine.progress(sample.id);
          if (at === null) {
            if (current[sample.id] !== undefined) changed = true;
            continue;
          }
          next[sample.id] = at;
          if (current[sample.id] !== at) changed = true;
        }
        return changed ? next : current;
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [engine, samples]);

  /** A pad hit. Always fires, never stops: tapping a pad twice is two
   *  hits, not a hit and a mute. */
  const trigger = useCallback(
    (sample: SampleRow, source: TriggerSource) => {
      engine.play(sample.id, source);
    },
    [engine],
  );

  /** The card's transport button, which says play or pause and means it. */
  const toggle = useCallback(
    (sample: SampleRow) => {
      if (engine.isPlaying(sample.id)) {
        engine.stop(sample.id);
        return;
      }
      engine.play(sample.id, "click");
    },
    [engine],
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!shouldTrigger(event)) return;
      const index = indexForKey(event.key);
      const sample = samples[index];
      if (!sample) return;
      event.preventDefault();
      trigger(sample, "keyboard");
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [samples, trigger]);

  return (
    <div className="flex w-full flex-1 flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="relative w-fit">
          <h1 className="font-display text-4xl font-bold tracking-[-0.02em] text-chop-ink md:text-5xl">
            samples
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <span className="font-sans text-base text-chop-muted-strong">
            play with your keys
          </span>
          <div className="flex gap-2">
            {samples.slice(0, 8).map((sample, i) => (
              <span
                key={sample.id}
                className="flex size-9 items-center justify-center rounded-button bg-chop-accent font-sans text-sm font-medium text-chop-on-accent"
              >
                {keyForIndex(i)}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-6">
        {samples.map((sample, i) => (
          <SampleCard
            key={sample.id}
            sample={sample}
            bpm={bpm}
            musicKey={musicKey}
            keyBinding={keyForIndex(i)}
            playing={progress[sample.id] !== undefined}
            highlighted={progress[sample.id] !== undefined}
            progress={progress[sample.id] ?? null}
            onToggle={() => toggle(sample)}
          />
        ))}
      </div>

      <div className="mt-auto flex items-center gap-4">
        <a
          href={zipUrl ?? "#"}
          aria-disabled={!zipUrl}
          onClick={() => {
            if (zipUrl) {
              posthog.capture?.(EVENTS.exportClicked, {
                job_id: jobId,
                sample_count: samples.length,
              });
            }
          }}
          className={`inline-flex h-10 items-center gap-2 rounded-button px-5 font-sans text-[15px] font-medium ${
            zipUrl
              ? "bg-chop-accent text-chop-on-accent hover:bg-[#ffeb4d]"
              : "pointer-events-none bg-chop-option text-chop-muted"
          }`}
        >
          <Download size={16} strokeWidth={2} />
          export chops
        </a>
        <span className="font-sans text-sm text-chop-muted">
          chop-ai-samples.zip · 24-bit wav
          {!ready && " · loading"}
        </span>
      </div>
    </div>
  );
}
