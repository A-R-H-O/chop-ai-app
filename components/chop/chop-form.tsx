"use client";

import { useRef, useState } from "react";
import { Link2, Upload } from "lucide-react";
import { CHOP_COST, isBlocked } from "@/lib/credits/constants";
import { AudioFileCard } from "./audio-file-card";

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

  function chop() {
    // Stub. The pipeline lands in the next plan; deliberately does not
    // create a job, because spending credits on work nothing can process
    // would need a refund path that does not exist yet.
    setNotice("the chopping pipeline is not wired up yet");
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
          disabled={disabledReason !== null}
          title={disabledReason ?? undefined}
          // Disabled state is a flat muted surface rather than a faded
          // accent: the accent at 40% over the card reads as a muddy
          // olive, which looks like a rendering fault rather than a
          // deliberate state.
          className="inline-flex h-10 items-center justify-center rounded-lg bg-chop-accent px-5 font-sans text-[15px] font-medium text-chop-on-accent transition-colors duration-150 ease-out hover:bg-[#ffeb4d] disabled:cursor-not-allowed disabled:bg-chop-option disabled:text-chop-muted"
        >
          chop it
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
    </div>
  );
}
