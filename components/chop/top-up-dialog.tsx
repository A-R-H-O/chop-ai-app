"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { CHOP_COST, PACKS, type PackId } from "@/lib/credits/constants";

function formatPrice(cents: number) {
  return `$${(cents / 100).toFixed(2).replace(/\.00$/, "")}`;
}

/**
 * Screen 06 from the handoff.
 *
 * Built on the shadcn Radix dialog so focus trapping, escape, scrim
 * dismissal, and returning focus to the trigger all come from the
 * library rather than hand-written listeners.
 */
export function TopUpDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [selected, setSelected] = useState<PackId>(
    PACKS.find((p) => p.preselected)!.id,
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pack = PACKS.find((p) => p.id === selected)!;

  async function buy() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pack: selected }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "checkout failed");
      window.location.href = body.url;
    } catch (e) {
      // The handoff is explicit: on error keep the dialog open and show
      // the message inline under the CTA.
      setError(e instanceof Error ? e.message : "checkout failed");
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        aria-label="top up credits"
        className="w-[calc(100%-32px)] gap-0 rounded-dialog border-0 bg-chop-surface p-5 shadow-dialog sm:max-w-[460px] sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <DialogTitle className="font-display text-[26px] leading-8 font-bold tracking-[-0.02em] text-chop-ink sm:text-[30px] sm:leading-[38px]">
            top up
          </DialogTitle>
          <DialogClose
            aria-label="close"
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-button text-chop-ink opacity-[0.56] transition-opacity duration-150 ease-out hover:opacity-100"
          >
            <X size={18} strokeWidth={2} />
          </DialogClose>
        </div>

        <div className="mt-[18px] flex flex-col gap-2.5 sm:mt-[22px]">
          {PACKS.map((option) => {
            const isSelected = option.id === selected;
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => setSelected(option.id)}
                className={`flex w-full cursor-pointer items-center gap-3.5 rounded-option px-4 py-3.5 text-left transition-shadow duration-150 ease-out sm:px-[18px] sm:py-4 ${
                  isSelected
                    ? "bg-chop-accent/14 shadow-[inset_0_0_0_2px_var(--color-chop-accent)]"
                    : "bg-chop-option shadow-[inset_0_0_0_1px_var(--color-chop-hairline)] hover:shadow-[inset_0_0_0_1px_var(--color-chop-hairline-hover)]"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`inline-flex size-[22px] shrink-0 items-center justify-center rounded-full ${
                    isSelected
                      ? "bg-chop-accent text-chop-on-accent"
                      : "shadow-[inset_0_0_0_1.5px_var(--color-chop-hairline-radio)]"
                  }`}
                >
                  {isSelected && <Check size={14} strokeWidth={3} />}
                </span>

                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="font-display text-[17px] leading-[26px] font-semibold text-chop-ink sm:text-lg">
                    {option.credits} credits
                  </span>
                  <span className="font-sans text-[13px] leading-[18px] text-chop-muted">
                    {option.secondaryLine}
                  </span>
                </span>

                <span className="shrink-0 font-display text-[17px] leading-[26px] font-semibold text-chop-ink sm:text-lg">
                  {formatPrice(option.priceCents)}
                </span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={buy}
          disabled={pending}
          className="mt-[18px] flex h-[52px] w-full cursor-pointer items-center justify-center rounded-button bg-chop-accent font-sans text-base font-semibold text-chop-on-accent transition-colors duration-150 ease-out hover:bg-[#ffeb4d] disabled:opacity-60 sm:mt-[22px]"
        >
          {pending
            ? "opening checkout"
            : `buy ${pack.credits} credits for ${formatPrice(pack.priceCents)}`}
        </button>

        {error && (
          <p
            role="alert"
            className="mt-3 text-center font-sans text-[13px] leading-[18px] text-chop-accent"
          >
            {error}
          </p>
        )}

        <p className="mt-3 text-center font-sans text-[13px] leading-[18px] text-chop-muted-soft">
          {CHOP_COST} credits a chop. credits do not expire.
        </p>
      </DialogContent>
    </Dialog>
  );
}
