"use client";

import { CreditBalance } from "./credit-balance";

/**
 * Client wrapper that owns the top up handler.
 *
 * This indirection is load-bearing: AppHeader is a Server Component and
 * CreditBalance is a Client Component, and a function prop cannot cross
 * that boundary because it is not serializable. Only the balance, a
 * number, crosses. The dialog itself arrives in the payments plan.
 */
export function HeaderCredits({ balance }: { balance: number }) {
  function openTopUp() {
    // Intentionally empty until the payments plan adds the dialog. The
    // control is rendered and keeps its accessible name so the header
    // layout and a11y are testable now.
  }

  return <CreditBalance balance={balance} onTopUp={openTopUp} />;
}
