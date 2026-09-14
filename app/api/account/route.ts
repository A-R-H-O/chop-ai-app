import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/** Buckets holding anything owned by a person, each keyed by uid folder. */
const BUCKETS = ["sources", "samples"] as const;

/**
 * Close an account.
 *
 * Order matters. Files go first, through the storage API, because
 * deleting the rows in storage.objects orphans the underlying objects
 * rather than freeing them and the folder listing is what tells us the
 * paths. Then the database rows, which cascade from the profile. Then
 * the auth user, so the session cannot outlive the data.
 *
 * Requires the account's own email typed back, because this is not
 * reversible and a misclick should not be enough to do it.
 */
export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "not signed in" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    confirm?: string;
  } | null;

  if (
    !body?.confirm ||
    body.confirm.trim().toLowerCase() !== (user.email ?? "").toLowerCase()
  ) {
    return NextResponse.json(
      { error: "type your email address to confirm" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // Files first, and report a failure rather than pressing on. Deleting
  // the rows while the audio survives is the one outcome that would look
  // like success and not be.
  for (const bucket of BUCKETS) {
    const { data: files, error: listError } = await admin.storage
      .from(bucket)
      .list(user.id, { limit: 1000 });

    if (listError) {
      return NextResponse.json({ error: listError.message }, { status: 500 });
    }
    if (!files?.length) continue;

    // Each job writes its samples into a folder of its own, so the top
    // level is folders rather than files and has to be walked.
    const paths: string[] = [];
    for (const entry of files) {
      if (entry.id === null) {
        const { data: nested } = await admin.storage
          .from(bucket)
          .list(`${user.id}/${entry.name}`, { limit: 1000 });
        for (const file of nested ?? []) {
          paths.push(`${user.id}/${entry.name}/${file.name}`);
        }
      } else {
        paths.push(`${user.id}/${entry.name}`);
      }
    }

    if (paths.length) {
      const { error: removeError } = await admin.storage
        .from(bucket)
        .remove(paths);
      if (removeError) {
        return NextResponse.json(
          { error: removeError.message },
          { status: 500 },
        );
      }
    }
  }

  const { data, error } = await admin.rpc("delete_account", {
    p_user: user.id,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { error: authError } = await admin.auth.admin.deleteUser(user.id);
  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 500 });
  }

  await supabase.auth.signOut();

  return NextResponse.json({ deleted: true, ...(data as object) });
}
