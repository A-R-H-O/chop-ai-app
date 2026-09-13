import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { JobLoader, type JobSnapshot } from "@/components/chop/job-loader";

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
    .select("id,status,stage,error,created_at")
    .eq("id", id)
    .single();

  if (!job) notFound();

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 pb-16 md:px-[85px]">
      <JobLoader initial={job as JobSnapshot} />
    </main>
  );
}
