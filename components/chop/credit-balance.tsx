"use client";

import { isBlocked } from "@/lib/credits/constants";
import { NoteGlyph } from "./note-glyph";

interface CreditBalanceProps {
  balance: number;
  onTopUp: () => void;
  /** Mobile variant: tighter gap, smaller glyph, number without the word. */
  compact?: boolean;
}

export function CreditBalance({
  balance,
  onTopUp,
  compact = false,
}: CreditBalanceProps) {
  const blocked = isBlocked(balance);

  return (
    <div className={`flex items-center ${compact ? "gap-2" : "gap-[10px]"}`}>
      <NoteGlyph size={compact ? 14 : 16} />
      <span
        data-testid="balance-label"
        className={`font-sans font-semibold ${
          compact ? "text-sm leading-5" : "text-base leading-6"
        } ${blocked ? "text-chop-accent" : "text-chop-ink"}`}
      >
        {compact ? balance : `${balance} credits`}
      </span>
      <button
        type="button"
        aria-label="buy credits"
        onClick={onTopUp}
        className="inline-flex size-6 items-center justify-center rounded-full bg-chop-accent font-sans text-[17px] leading-none font-semibold text-chop-on-accent"
      >
        +
      </button>
    </div>
  );
}
