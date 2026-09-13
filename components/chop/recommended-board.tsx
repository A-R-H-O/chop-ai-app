"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, RotateCw } from "lucide-react";
import { SampleEngine, type TriggerSource } from "@/lib/audio/engine";
import { posthog } from "@/lib/analytics/posthog-client";
import { EVENTS } from "@/lib/analytics/events";
import { CHOP_COST } from "@/lib/credits/constants";
import { SampleCard, type SampleRow } from "./sample-card";
import { TopUpDialog } from "./top-up-dialog";

/**
 * Screen 04. The three top-ranked samples, with a retry that reruns only
 * selection and cutting, and a per-card note that steers that retry.
 */
export function RecommendedBoard({
  samples,
  bpm,
  musicKey,
  jobId,
  sourceLabel,
  balance,
}: {
  samples: SampleRow[];
  bpm: number | null;
  musicKey: string | null;
  jobId: string;
  sourceLabel: string;
  balance: number;
}) {
  const [playing, setPlaying] = useState<string | null>(null);
  const [context, setContext] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const engineRef = useRef<SampleEngine | null>(null);

  const engine = useMemo(() => {
    const instance = new SampleEngine({
      onPlay: (sampleId, trigger: TriggerSource) =>
        posthog.capture?.(EVENTS.samplePlayed, {
          job_id: jobId,
          sample_id: sampleId,
          trigger,
          screen: "recommended",
        }),
    });
    engineRef.current = instance;
    return instance;
  }, [jobId]);

  useEffect(() => {
    void Promise.allSettled(
      samples.map((sample) => engine.load(sample.id, sample.url)),
    );
  }, [engine, samples]);

  useEffect(() => () => engineRef.current?.dispose(), []);

  function toggle(sample: SampleRow) {
    if (engine.isPlaying(sample.id)) {
      engine.stop(sample.id);
      setPlaying(null);
      return;
    }
    if (playing) engine.stop(playing);
    if (engine.play(sample.id, "click")) setPlaying(sample.id);
  }

  async function retry() {
    if (balance < CHOP_COST) {
      setTopUpOpen(true);
      return;
    }

    setPending(true);
    setError(null);

    try {
      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentJobId: jobId, extraContext: context }),
      });
      const body = await response.json();

      if (response.status === 402) {
        setTopUpOpen(true);
        return;
      }
      if (!response.ok) throw new Error(body.error ?? "could not retry");

      router.push(`/jobs/${body.jobId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "could not retry");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex w-full flex-1 flex-col gap-6">
      <div className="relative w-fit">
        <h1 className="font-display text-4xl font-bold tracking-[-0.02em] text-chop-ink md:text-5xl">
          recommended samples
        </h1>
      </div>

      <p className="font-sans text-base text-chop-muted">{sourceLabel}</p>

      <div className="mt-4 flex flex-wrap gap-6">
        {samples.map((sample) => (
          <SampleCard
            key={sample.id}
            sample={sample}
            bpm={bpm}
            musicKey={musicKey}
            playing={playing === sample.id}
            highlighted={playing === sample.id}
            onToggle={() => toggle(sample)}
            onAddContext={() =>
              setEditing(editing === sample.id ? null : sample.id)
            }
          />
        ))}
      </div>

      {editing && (
        <p className="font-sans text-[13px] text-chop-muted">
          adding context for{" "}
          <span className="text-chop-ink">
            {samples.find((s) => s.id === editing)?.name}
          </span>
          . describe what to change below, then retry.
        </p>
      )}

      <div className="mt-auto flex justify-center">
        <div className="flex w-full max-w-[720px] items-center gap-4 rounded-[20px] bg-chop-surface py-4 pr-4 pl-6 shadow-surface">
          <input
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder="make adjustments or tweak audio"
            aria-label="adjustments for the retry"
            className="min-w-0 flex-1 bg-transparent font-sans text-xl leading-7 text-chop-ink placeholder:text-chop-muted focus:outline-none"
          />

          <button
            type="button"
            onClick={retry}
            disabled={pending}
            aria-label="try again"
            title={`retry costs ${CHOP_COST} credits`}
            className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-chop-ink shadow-[inset_0_0_0_1px_var(--color-chop-hairline-hover)] disabled:opacity-50"
          >
            <RotateCw size={20} strokeWidth={2.4} />
          </button>

          <a
            href={`/jobs/${jobId}/samples`}
            className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-chop-accent px-5 font-sans text-sm font-medium text-chop-on-accent hover:bg-[#ffeb4d]"
          >
            continue
            <ArrowRight size={16} strokeWidth={2} />
          </a>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-center font-sans text-[13px] text-chop-accent">
          {error}
        </p>
      )}

      <TopUpDialog open={topUpOpen} onOpenChange={setTopUpOpen} />
    </div>
  );
}
