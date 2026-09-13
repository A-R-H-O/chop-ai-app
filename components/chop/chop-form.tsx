"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Link2, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { CHOP_COST, isBlocked } from "@/lib/credits/constants";
import { AudioFileCard } from "./audio-file-card";
import { TopUpDialog } from "./top-up-dialog";

const ACCEPT = "audio/*,.wav,.mp3,.flac,.aiff,.m4a,.ogg";

/** Rejects a non-YouTube URL before we ever spend a credit on it. */
function youtubeVideoId(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(
      /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`,
    );
    const host = url.hostname.replace(/^www\./, "");
    if (host === "youtu.be") return url.pathname.slice(1) || null;
    if (host === "youtube.com" || host === "m.youtube.com") {
      if (url.pathname === "/watch") return url.searchParams.get("v");
      if (url.pathname.startsWith("/shorts/")) {
        return url.pathname.split("/")[2] ?? null;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function ChopForm({ balance }: { balance: number | null }) {
  const [link, setLink] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [prompt, setPrompt] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);

  const signedOut = balance === null;
  const blocked = !signedOut && isBlocked(balance);
  const linkId = youtubeVideoId(link);
  const hasSource = file !== null || linkId !== null;
  const linkLooksWrong = link.trim().length > 0 && linkId === null;

  function pickFile(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0] ?? null;
    setFile(picked);
    setDuration(null);
    setNotice(null);
    if (!picked) return;

    // Read the real duration off the file so the card is not showing a lie.
    const audio = document.createElement("audio");
    const url = URL.createObjectURL(picked);
    audio.addEventListener("loadedmetadata", () => {
      setDuration(Number.isFinite(audio.duration) ? audio.duration : null);
      URL.revokeObjectURL(url);
    });
    audio.addEventListener("error", () => URL.revokeObjectURL(url));
    audio.src = url;
  }

  function removeFile() {
    setFile(null);
    setDuration(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  async function chop() {
    // The handoff specifies that attempting a chop below the cost opens
    // the top up dialog rather than just refusing.
    if (blocked) {
      setTopUpOpen(true);
      return;
    }

    setPending(true);
    setNotice(null);

    try {
      let sourcePath: string | null = null;

      if (file) {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error("sign in to chop");

        // Uploaded under the caller's own uid, which is the prefix the
        // storage policy and the jobs route both enforce.
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_");
        sourcePath = `${user.id}/${Date.now()}_${safeName}`;

        const { error: uploadError } = await supabase.storage
          .from("sources")
          .upload(sourcePath, file, { upsert: false });
        if (uploadError) throw new Error(uploadError.message);
      }

      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceType: file ? "upload" : "youtube",
          sourceUrl: file ? null : link.trim(),
          sourcePath,
          prompt,
        }),
      });

      const body = await response.json();

      if (response.status === 402) {
        setTopUpOpen(true);
        return;
      }
      if (!response.ok) throw new Error(body.error ?? "could not start the chop");

      router.push(`/jobs/${body.jobId}`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "could not start the chop");
    } finally {
      setPending(false);
    }
  }

  const disabledReason = signedOut
    ? "sign in to chop"
    : blocked
      ? `you need ${CHOP_COST} credits to chop`
      : !hasSource
        ? "paste a youtube link or upload audio first"
        : null;

  return (
    <div className="mt-4 flex w-full max-w-[720px] flex-col gap-4 rounded-dialog bg-chop-surface p-5 shadow-surface">
      {file ? (
        <AudioFileCard
          file={file}
          durationSeconds={duration}
          onRemove={removeFile}
        />
      ) : (
        <label className="flex min-h-14 items-center gap-3">
          <span className="flex shrink-0 text-chop-accent">
            <Link2 size={24} strokeWidth={2} />
          </span>
          <input
            type="url"
            inputMode="url"
            value={link}
            onChange={(e) => {
              setLink(e.target.value);
              setNotice(null);
            }}
            placeholder="paste a youtube link"
            aria-label="youtube link"
            className="min-w-0 flex-1 bg-transparent font-sans text-lg leading-7 text-chop-ink placeholder:text-chop-accent focus:outline-none"
          />
        </label>
      )}

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={2}
        placeholder="name the song, the emotion, and the chops you want"
        aria-label="describe the chops you want"
        className="min-h-14 w-full resize-none bg-transparent font-sans text-lg leading-7 text-chop-ink placeholder:text-chop-ink/60 focus:outline-none"
      />

      {linkLooksWrong && (
        <p className="font-sans text-[13px] leading-[18px] text-chop-accent">
          that does not look like a youtube link
        </p>
      )}

      <div className="flex items-center justify-between gap-4">
        {file ? (
          <span />
        ) : (
          <>
            <input
              ref={fileInput}
              type="file"
              accept={ACCEPT}
              onChange={pickFile}
              className="hidden"
              id="audio-upload"
            />
            <label
              htmlFor="audio-upload"
              className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg pr-3 pl-2.5 font-sans text-sm text-chop-ink transition-colors duration-150 ease-out hover:bg-chop-option"
            >
              <Upload size={16} strokeWidth={2} />
              upload audio
            </label>
          </>
        )}

        <button
          type="button"
          onClick={chop}
          // A credit-blocked user stays clickable on purpose, so the
          // click can open the top up dialog rather than doing nothing.
          disabled={pending || (disabledReason !== null && !blocked)}
          title={disabledReason ?? undefined}
          // Disabled state is a flat muted surface rather than a faded
          // accent: the accent at 40% over the card reads as a muddy
          // olive, which looks like a rendering fault rather than a
          // deliberate state.
          className="inline-flex h-10 items-center justify-center rounded-lg bg-chop-accent px-5 font-sans text-[15px] font-medium text-chop-on-accent transition-colors duration-150 ease-out hover:bg-[#ffeb4d] disabled:cursor-not-allowed disabled:bg-chop-option disabled:text-chop-muted"
        >
          {pending ? "chopping" : "chop it"}
        </button>
      </div>

      {(notice ?? disabledReason) && (
        <p
          role="status"
          className="font-sans text-[13px] leading-[18px] text-chop-muted-soft"
        >
          {notice ?? disabledReason}
        </p>
      )}

      <TopUpDialog open={topUpOpen} onOpenChange={setTopUpOpen} />
    </div>
  );
}
