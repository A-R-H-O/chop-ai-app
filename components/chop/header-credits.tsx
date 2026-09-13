"use client";

import { useState } from "react";
import { CreditBalance } from "./credit-balance";
import { TopUpDialog } from "./top-up-dialog";

/**
 * Client wrapper that owns the top up dialog's open state.
 *
 * This indirection is load-bearing: AppHeader is a Server Component and
 * CreditBalance is a Client Component, and a function prop cannot cross
 * that boundary because it is not serializable. Only the balance, a
 * number, crosses.
 */
export function HeaderCredits({ balance }: { balance: number }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <CreditBalance balance={balance} onTopUp={() => setOpen(true)} />
      <TopUpDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
