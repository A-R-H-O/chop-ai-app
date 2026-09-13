import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { readBalance } from "@/lib/credits/read";
import { signSamples } from "@/lib/jobs/samples";
import { JobLoader, type JobSnapshot } from "@/components/chop/job-loader";
import { RecommendedBoard } from "@/components/chop/recommended-board";

export default async function JobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  // RLS restricts this to the caller's own jobs, so another user's id
  // returns nothing rather than leaking that the job exists.
  const { data: job } = await supabase
    .from("jobs")
    .select("id,status,stage,error,created_at,bpm,music_key,source_type,source_path,source_url")
    .eq("id", id)
    .single();

  if (!job) notFound();

  // Still working: the loader owns the screen and drives itself over
  // Realtime until the row says done.
  if (job.status !== "done") {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-6 pb-16 md:px-[85px]">
        <JobLoader initial={job as JobSnapshot} />
      </main>
    );
  }

  const { data: rows } = await supabase
    .from("samples")
    .select("id,name,stem,bars,reason,tags,peaks,rank,recommended,storage_path")
    .eq("job_id", id)
    .eq("recommended", true)
    .order("rank");

  const samples = await signSamples(rows ?? []);
  const balance = await readBalance(user.id);

  const sourceName =
    job.source_path?.split("/").pop() ?? job.source_url ?? "your audio";
  const sourceLabel = [
    `${samples.length} chops from ${sourceName}`,
    job.bpm ? `${job.bpm} bpm` : null,
    job.music_key,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <main className="flex flex-1 flex-col px-6 pb-14 md:px-[85px]">
      <RecommendedBoard
        samples={samples}
        bpm={job.bpm}
        musicKey={job.music_key}
        jobId={id}
        sourceLabel={sourceLabel}
        balance={balance}
      />
    </main>
  );
}
