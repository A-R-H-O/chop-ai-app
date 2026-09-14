import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Everything this account holds, as one downloadable file.
 *
 * Always the caller's own id, never one from the request: an export
 * endpoint that takes a user id as a parameter is a way to read anybody's
 * account.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "not signed in" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("export_account", {
    p_user: user.id,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const today = new Date().toISOString().slice(0, 10);

  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="chop-ai-${today}.json"`,
      // Somebody's whole account. Not for any cache between here and them.
      "Cache-Control": "no-store, private",
    },
  });
}
