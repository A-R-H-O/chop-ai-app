"use client";

import { useState } from "react";
import { Download, Trash2 } from "lucide-react";

/**
 * Export and deletion.
 *
 * The delete path asks for the account's email typed back rather than a
 * yes/no, because it removes every chop and every sample and cannot be
 * undone. A confirm dialog is one misclick; typing your own address is a
 * decision.
 */
export function AccountPanel({ email }: { email: string }) {
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState<"export" | "delete" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const armed = confirm.trim().toLowerCase() === email.toLowerCase();

  async function exportData() {
    setBusy("export");
    setNotice(null);
    try {
      const response = await fetch("/api/account/export");
      if (!response.ok) throw new Error("could not build your export");

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `chop-ai-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "could not build your export",
      );
    } finally {
      setBusy(null);
    }
  }

  async function deleteAccount() {
    setBusy("delete");
    setNotice(null);
    try {
      const response = await fetch("/api/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "could not delete");

      // Hard navigation rather than a router push, deliberately. The
      // router cache may hold a prefetched payload for "/" from while
      // this account existed, and a soft navigation would render it:
      // a signed-in header with a balance, for a deleted account. A
      // full document load is the only thing that leaves nothing.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/";
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "could not delete");
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-3">
        <h2 className="font-display text-xl font-semibold text-chop-ink">
          your data
        </h2>
        <p className="font-sans text-base leading-7 text-chop-ink/70">
          One file with your account, your credit ledger, every chop and
          every sample record. The audio itself is on the samples screen
          for each chop.
        </p>
        <button
          type="button"
          onClick={exportData}
          disabled={busy !== null}
          className="inline-flex h-10 w-fit cursor-pointer items-center gap-2 rounded-button bg-chop-accent px-5 font-sans text-[15px] font-medium text-chop-on-accent transition-colors duration-150 ease-out hover:bg-[#ffeb4d] disabled:cursor-not-allowed disabled:bg-chop-option disabled:text-chop-muted"
        >
          <Download size={16} strokeWidth={2} />
          {busy === "export" ? "building" : "download my data"}
        </button>
      </section>

      <section className="flex flex-col gap-3 border-t border-chop-ink/10 pt-10">
        <h2 className="font-display text-xl font-semibold text-chop-ink">
          close your account
        </h2>
        <p className="font-sans text-base leading-7 text-chop-ink/70">
          Removes your uploads, your samples, your chops, your credits and
          your login. Unspent credits are not refunded. This cannot be
          undone, so export first if you want anything.
        </p>
        <p className="font-sans text-base leading-7 text-chop-ink/70">
          The record that a purchase happened is kept without your name on
          it, so a chargeback or a tax question has an answer.
        </p>

        <label className="mt-2 flex flex-col gap-2">
          <span className="font-sans text-sm text-chop-muted">
            type {email} to confirm
          </span>
          <input
            type="email"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="off"
            className="h-11 w-full max-w-[360px] rounded-lg bg-chop-surface px-4 font-sans text-base text-chop-ink outline-none focus:ring-1 focus:ring-chop-accent"
          />
        </label>

        <button
          type="button"
          onClick={deleteAccount}
          disabled={!armed || busy !== null}
          className="mt-2 inline-flex h-10 w-fit cursor-pointer items-center gap-2 rounded-button bg-[#d13b3b] px-5 font-sans text-[15px] font-medium text-white transition-colors duration-150 ease-out hover:bg-[#b93030] disabled:cursor-not-allowed disabled:bg-chop-option disabled:text-chop-muted"
        >
          <Trash2 size={16} strokeWidth={2} />
          {busy === "delete" ? "deleting" : "delete everything"}
        </button>
      </section>

      {notice && (
        <p role="status" className="font-sans text-sm text-chop-accent">
          {notice}
        </p>
      )}
    </div>
  );
}
