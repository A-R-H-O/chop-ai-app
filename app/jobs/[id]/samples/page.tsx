import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signSamples, signZip } from "@/lib/jobs/samples";
import { SamplesBoard } from "@/components/chop/samples-board";
import { RejectChop } from "@/components/chop/reject-chop";

export default async function SamplesPage({
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

  const { data: job } = await supabase
    .from("jobs")
    .select("id,status,bpm,music_key,zip_path,rejected_at")
    .eq("id", id)
    .single();

  if (!job) notFound();
  if (job.status !== "done") redirect(`/jobs/${id}`);

  const { data: rows } = await supabase
    .from("samples")
    .select("id,name,stem,bars,reason,tags,peaks,rank,recommended,storage_path")
    .eq("job_id", id)
    .order("rank");

  const samples = await signSamples(rows ?? []);
  const zipUrl = await signZip(job.zip_path);

  return (
    <main className="flex flex-1 flex-col px-6 pb-14 md:px-[85px]">
      <SamplesBoard
        samples={samples}
        bpm={job.bpm}
        musicKey={job.music_key}
        zipUrl={zipUrl}
        jobId={id}
      />

      {/* Under the export, because this is the thing you reach for after
          listening and finding it was not what you asked for. */}
      <div className="mt-6">
        {job.rejected_at ? (
          <span className="font-sans text-sm text-chop-muted">
            credits returned for this chop
          </span>
        ) : (
          <RejectChop jobId={id} />
        )}
      </div>
    </main>
  );
}
