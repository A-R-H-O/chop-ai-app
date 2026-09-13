import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CHOP_COST } from "@/lib/credits/constants";
import { capture } from "@/lib/analytics/posthog-server";
import { EVENTS } from "@/lib/analytics/events";

interface CreateJobBody {
  sourceType?: string;
  sourceUrl?: string | null;
  sourcePath?: string | null;
  prompt?: string;
  parentJobId?: string | null;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "not signed in" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as CreateJobBody | null;

  if (body?.sourceType !== "youtube" && body?.sourceType !== "upload") {
    return NextResponse.json(
      { error: "sourceType must be youtube or upload" },
      { status: 400 },
    );
  }

  const prompt = (body.prompt ?? "").trim();
  if (!prompt) {
    return NextResponse.json({ error: "a prompt is required" }, { status: 400 });
  }

  // An upload path must sit under the caller's own uid. Without this a
  // signed-in user could point a job at somebody else's uploaded file and
  // have the worker, which runs as service-role, happily read it.
  if (body.sourceType === "upload") {
    const path = body.sourcePath ?? "";
    if (!path.startsWith(`${user.id}/`)) {
      return NextResponse.json(
        { error: "sourcePath must be under your own folder" },
        { status: 403 },
      );
    }
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .rpc("create_job", {
      p_user: user.id,
      p_source_type: body.sourceType,
      p_source_url: body.sourceUrl ?? null,
      p_source_path: body.sourcePath ?? null,
      p_prompt: prompt,
      p_parent_job_id: body.parentJobId ?? null,
    })
    .single();

  if (error) {
    // create_job raises rather than returning a code, so the message is
    // the only signal. Insufficient credits is a 402 so the client can
    // open the top up dialog instead of showing a generic failure.
    if (error.message.includes("insufficient credits")) {
      await capture(user.id, EVENTS.insufficientCredits, {
        needed: CHOP_COST,
      });
      return NextResponse.json(
        { error: "insufficient credits", needed: CHOP_COST },
        { status: 402 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const result = data as { job_id: string; balance: number };

  await capture(
    user.id,
    body.parentJobId ? EVENTS.retryStarted : EVENTS.chopStarted,
    {
      source_type: body.sourceType,
      prompt_length: prompt.length,
      balance_after: result.balance,
    },
  );

  return NextResponse.json({
    jobId: result.job_id,
    balance: result.balance,
  });
}
