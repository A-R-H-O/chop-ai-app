import { createAdminClient } from "@/lib/supabase/admin";
import type { SampleRow } from "@/components/chop/sample-card";

/** How long a sample URL stays valid. Long enough to play through a
 *  session, short enough that a copied link is not a permanent share. */
const SIGNED_URL_TTL_SECONDS = 60 * 60;

interface DbSample {
  id: string;
  name: string;
  stem: string;
  bars: number | null;
  reason: string;
  tags: string[] | null;
  peaks: unknown;
  rank: number;
  recommended: boolean;
  storage_path: string;
}

/**
 * Signed URLs for a job's samples.
 *
 * Signed rather than public because the spec is explicit that chopped
 * audio is private to the user who made it. A public bucket would turn a
 * private-use tool into a distribution platform, which is a different
 * product with a different copyright posture.
 *
 * Seeded development samples live in public/seed-samples and are served
 * directly, since local storage has no object behind those paths.
 */
export async function signSamples(samples: DbSample[]): Promise<SampleRow[]> {
  const admin = createAdminClient();

  const signed = await Promise.all(
    samples.map(async (sample) => {
      let url = "";

      if (sample.storage_path.startsWith("seed-samples/")) {
        url = `/${sample.storage_path}`;
      } else {
        const { data } = await admin.storage
          .from("samples")
          .createSignedUrl(sample.storage_path, SIGNED_URL_TTL_SECONDS);
        url = data?.signedUrl ?? "";
      }

      return {
        id: sample.id,
        name: sample.name,
        stem: sample.stem,
        bars: sample.bars,
        reason: sample.reason,
        tags: sample.tags ?? [],
        peaks: Array.isArray(sample.peaks) ? (sample.peaks as number[]) : [],
        rank: sample.rank,
        recommended: sample.recommended,
        url,
      };
    }),
  );

  return signed;
}

export async function signZip(zipPath: string | null): Promise<string | null> {
  if (!zipPath) return null;
  if (zipPath.startsWith("seed-samples/")) return `/${zipPath}`;

  const admin = createAdminClient();
  const { data } = await admin.storage
    .from("samples")
    .createSignedUrl(zipPath, SIGNED_URL_TTL_SECONDS);

  return data?.signedUrl ?? null;
}
