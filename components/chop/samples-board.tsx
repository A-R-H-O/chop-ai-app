"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  const [playing, setPlaying] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);
  const engineRef = useRef<SampleEngine | null>(null);

  const engine = useMemo(() => {
    const instance = new SampleEngine({
      onPlay: (sampleId, trigger: TriggerSource) => {
        posthog.capture?.(EVENTS.samplePlayed, {
          job_id: jobId,
          sample_id: sampleId,
          trigger,
        });
      },
    });
    engineRef.current = instance;
    return instance;
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

  useEffect(() => () => engineRef.current?.dispose(), []);

  const toggle = useCallback(
    (sample: SampleRow, trigger: TriggerSource) => {
      if (engine.isPlaying(sample.id)) {
        engine.stop(sample.id);
        setPlaying((current) => {
          const next = new Set(current);
          next.delete(sample.id);
          return next;
        });
        return;
      }

      if (!engine.play(sample.id, trigger)) return;

      setPlaying((current) => new Set(current).add(sample.id));
      // Clear the indicator when the voice finishes. Polling is simpler
      // here than threading an onended callback through the engine, and a
      // 120ms tick is imperceptible on a transport indicator.
      const poll = setInterval(() => {
        if (!engine.isPlaying(sample.id)) {
          clearInterval(poll);
          setPlaying((current) => {
            const next = new Set(current);
            next.delete(sample.id);
            return next;
          });
        }
      }, 120);
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
      toggle(sample, "keyboard");
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [samples, toggle]);

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
            playing={playing.has(sample.id)}
            highlighted={playing.has(sample.id)}
            onToggle={() => toggle(sample, "click")}
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
