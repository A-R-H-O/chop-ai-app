"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  STAGES,
  stageStates,
  isStale,
  failureMessage,
  type JobStatus,
  type StageId,
} from "@/lib/jobs/stages";

export interface JobSnapshot {
  id: string;
  status: JobStatus;
  stage: StageId | null;
  error: string | null;
  created_at: string;
}

/** The spinning arc from the handoff's loader. */
function Spinner() {
  return (
    <span className="flex size-6 shrink-0 animate-spin items-center justify-center text-chop-accent">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M20 12a8 8 0 1 1-2.34-5.66"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <path
          d="M20 3.5V8.5H15"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

/** The stacked, rotating records from the handoff's loader artwork. */
function RecordStack() {
  return (
    <div
      aria-hidden="true"
      className="relative hidden size-[300px] shrink-0 md:block"
      style={{
        perspective: "760px",
        perspectiveOrigin: "50% 40%",
        transformStyle: "preserve-3d",
      }}
    >
      {[0, 0.6, 1.2, 1.8].map((delay, i) => {
        // Alternating records. The yellow ones are inked dark and the
        // dark ones inked light, so the grooves read on both.
        const yellow = i % 2 === 0;
        const ink = yellow ? "24 22 1" : "254 252 236";

        return (
          <div
            key={delay}
            className="absolute top-1/2 left-1/2 size-[220px] rounded-full motion-safe:animate-chop-stack"
            style={{
              transform: "translate(-50%, -50%) rotateX(66deg)",
              transformStyle: "preserve-3d",
              animationDelay: `${delay}s`,
              background: yellow ? "var(--color-chop-accent)" : "#1A0E33",
              boxShadow: `inset 0 0 0 1px rgb(${ink} / ${yellow ? 0.35 : 0.3})`,
            }}
          >
            {/* The two grooves. Without them a record is just a disc, and
                the stack reads as stacked blobs. */}
            <span
              className="absolute inset-5 rounded-full"
              style={{
                boxShadow: `inset 0 0 0 1px rgb(${ink} / ${yellow ? 0.25 : 0.18})`,
              }}
            />
            <span
              className="absolute inset-[42px] rounded-full"
              style={{
                boxShadow: `inset 0 0 0 1px rgb(${ink} / ${yellow ? 0.2 : 0.14})`,
              }}
            />
            <span
              className="absolute top-1/2 left-1/2 size-[66px] -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                background: yellow
                  ? "var(--color-chop-ground)"
                  : "var(--color-chop-accent)",
              }}
            />
            {/* The spindle pin the stack is threaded on. */}
            <span
              className="absolute top-1/2 left-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                background: yellow
                  ? "var(--color-chop-accent)"
                  : "var(--color-chop-ground)",
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

export function JobLoader({ initial }: { initial: JobSnapshot }) {
  const [job, setJob] = useState<JobSnapshot>(initial);
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`job:${initial.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "jobs",
          filter: `id=eq.${initial.id}`,
        },
        (payload) => setJob(payload.new as JobSnapshot),
      )
      .subscribe();

    // Realtime is the fast path, not the only path. If the socket never
    // connects or silently drops, this keeps the loader honest.
    const poll = setInterval(async () => {
      const { data } = await supabase
        .from("jobs")
        .select("id,status,stage,error,created_at")
        .eq("id", initial.id)
        .single();
      if (data) setJob(data as JobSnapshot);
    }, 4000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
    };
  }, [initial.id]);

  useEffect(() => {
    if (job.status === "done") router.refresh();
  }, [job.status, router]);

  const stale = isStale(job.created_at, job.status);
  const states = stageStates(job.stage, job.status);

  if (job.status === "failed" || stale) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="font-display text-4xl font-bold tracking-[-0.02em] text-chop-ink md:text-[56px] md:leading-[60px]">
          that did not work
        </h1>
        <p className="max-w-[460px] font-sans text-lg leading-7 text-chop-muted">
          {failureMessage(job.error, stale)}
        </p>
        <Link
          href="/"
          className="mt-2 inline-flex h-10 w-fit items-center rounded-lg bg-chop-accent px-5 font-sans text-[15px] font-medium text-chop-on-accent"
        >
          try another
        </Link>
      </div>
    );
  }

  return (
    <div className="flex w-full items-center justify-center gap-10 md:gap-[160px]">
      <RecordStack />

      <div className="flex max-w-[460px] flex-col gap-6">
        <h1 className="font-display text-4xl font-bold tracking-[-0.02em] text-chop-ink md:text-[56px] md:leading-[60px]">
          chopping
        </h1>

        <ol className="flex flex-col gap-4">
          {STAGES.map((stage) => {
            const state = states[stage.id];
            return (
              <li key={stage.id} className="flex items-center gap-3">
                {state === "done" && (
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-chop-accent text-chop-on-accent">
                    <Check size={14} strokeWidth={3} />
                  </span>
                )}
                {state === "active" && <Spinner />}
                {state === "pending" && (
                  <span className="flex size-6 shrink-0 items-center justify-center">
                    <span className="size-2 rounded-full bg-chop-ink opacity-40" />
                  </span>
                )}
                <span
                  className={`font-sans text-lg leading-7 ${
                    state === "active"
                      ? "font-medium text-chop-accent"
                      : state === "pending"
                        ? "text-chop-muted"
                        : "text-chop-ink"
                  }`}
                >
                  {stage.label}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
