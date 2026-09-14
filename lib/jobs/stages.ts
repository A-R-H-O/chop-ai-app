/**
 * The five pipeline stages, in order, with the labels the handoff's
 * loader screen shows. Shared between the loader UI and the worker so a
 * renamed stage cannot drift between the two.
 */
export const STAGES = [
  { id: "pulled_audio", label: "pulled audio" },
  { id: "separated_stems", label: "separated stems" },
  { id: "reading_instruments", label: "reading instruments" },
  { id: "finding_chops", label: "finding chops" },
  { id: "cutting", label: "cutting on the grid" },
] as const;

export type StageId = (typeof STAGES)[number]["id"];
export type JobStatus = "queued" | "running" | "done" | "failed";

export type StageState = "done" | "active" | "pending";

/**
 * Everything before the current stage is done, the current one is active,
 * the rest are pending. A job that has not reported a stage yet shows all
 * five pending rather than pretending the first has started.
 */
export function stageStates(
  current: StageId | null,
  status: JobStatus,
): Record<StageId, StageState> {
  const index = current ? STAGES.findIndex((s) => s.id === current) : -1;

  return Object.fromEntries(
    STAGES.map((stage, i) => {
      if (status === "done") return [stage.id, "done"];
      if (index === -1) return [stage.id, "pending"];
      if (i < index) return [stage.id, "done"];
      if (i === index) return [stage.id, "active"];
      return [stage.id, "pending"];
    }),
  ) as Record<StageId, StageState>;
}

/** A job stuck queued or running this long is treated as failed by the
 *  client, so a worker that died silently does not spin forever. */
export const STALE_AFTER_MS = 15 * 60 * 1000;

export function isStale(createdAt: string, status: JobStatus): boolean {
  if (status === "done" || status === "failed") return false;
  return Date.now() - new Date(createdAt).getTime() > STALE_AFTER_MS;
}

const GENERIC_FAILURE =
  "something went wrong on our side. your credits have been returned.";

const TIMED_OUT =
  "this chop took too long and was given up on. your credits have been returned.";

/**
 * What the failure screen says.
 *
 * The worker decides what is safe to show and writes that to jobs.error,
 * but the column is free text written by another process, so a stack
 * trace or a stringified API body can still land in it. Anything with the
 * punctuation of machine output gets the generic line instead.
 */
export function failureMessage(error: string | null, stale: boolean): string {
  if (stale) return TIMED_OUT;

  const message = error?.trim();
  if (!message) return GENERIC_FAILURE;

  const looksMachineWritten =
    /[{}<>[\]]|Traceback|Error:|\bstatusCode\b|https?:\/\//.test(message) ||
    message.length > 160;

  return looksMachineWritten ? GENERIC_FAILURE : message;
}
