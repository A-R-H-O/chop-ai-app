"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * "this wasn't it" on a finished chop.
 *
 * Deliberately quiet: a small link rather than a button competing with
 * export. Somebody who wants it will find it, and it should not read as
 * an invitation to everybody who is merely undecided.
 *
 * Asking why is optional. Making it required would cost us the refunds
 * people cannot be bothered to explain, and those are exactly the ones
 * that turn into chargebacks.
 */
export function RejectChop({ jobId }: { jobId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const router = useRouter();

  async function reject() {
    setPending(true);
    setNotice(null);
    try {
      const response = await fetch(`/api/jobs/${jobId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "could not do that");

      setDone(true);
      setOpen(false);
      router.refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "could not do that");
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <span role="status" className="font-sans text-sm text-chop-muted">
        credits returned. sorry about that.
      </span>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="cursor-pointer font-sans text-sm text-chop-muted underline underline-offset-4 transition-colors duration-150 ease-out hover:text-chop-ink"
      >
        this wasn&apos;t it
      </button>
    );
  }

  return (
    <div className="flex w-full max-w-[520px] flex-col gap-3 rounded-button bg-chop-surface p-4">
      <p className="font-sans text-sm text-chop-ink">
        we&apos;ll put the credits back. what were you after?
      </p>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        placeholder="optional, but it is how the chops get better"
        aria-label="what you were after"
        className="w-full resize-none bg-transparent font-sans text-sm leading-6 text-chop-ink placeholder:text-chop-ink/50 focus:outline-none"
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={reject}
          disabled={pending}
          className="inline-flex h-9 cursor-pointer items-center rounded-button bg-chop-accent px-4 font-sans text-sm font-medium text-chop-on-accent disabled:cursor-not-allowed disabled:bg-chop-option disabled:text-chop-muted"
        >
          {pending ? "sending" : "give my credits back"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="cursor-pointer font-sans text-sm text-chop-muted hover:text-chop-ink"
        >
          never mind
        </button>
      </div>
      {notice && (
        <p role="status" className="font-sans text-sm text-chop-accent">
          {notice}
        </p>
      )}
    </div>
  );
}
