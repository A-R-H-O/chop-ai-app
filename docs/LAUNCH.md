# Before chop.ai can take money

The split is by who can do it, not by importance. Everything in the
first list needs a human with an account login. Everything in the second
needs no credential and is code.

Credential detail lives in `docs/CREDENTIALS.md`. This file is the
checklist; that one is the instructions.

---

## You have to sit down and do these

Ordered so each one unblocks the next.

- [ ] **Clear the Vercel billing lock.** `vercel link` returns `402
      account suspended`. Nothing deploys until a payment method is on
      https://vercel.com/teams/huddle-s-projects1/settings/billing.
      Everything below that mentions Vercel is blocked behind this.

- [ ] **Add the callback to Google Cloud Console.** Sign-in is broken
      with `redirect_uri_mismatch`. Supabase's allowlist is already
      right; Google's is not. Add
      `https://peoxidipokajuiyhgvqv.supabase.co/auth/v1/callback`.
      Nothing to paste back. `CREDENTIALS.md` §1.

- [ ] **Confirm Supabase is on a paid plan.** Free tier pauses a project
      after inactivity and caps connections and storage. A paid product
      cannot sit on a database that goes to sleep.

- [ ] **Add an Anthropic key.** Without it every chop falls back to the
      onset grid, which ignores what the producer typed. That is the
      product. `CREDENTIALS.md` §2.

- [ ] **Set `CRON_SECRET`.** `openssl rand -hex 32` into Vercel. The
      cron routes fail closed, so leaving it unset means the stale job
      sweeper silently never runs and a chop whose worker died keeps the
      producer's credits while the screen tells them otherwise. This
      failure is invisible unless you look for it. `CREDENTIALS.md` §7b.

- [ ] **Set up LemonSqueezy and buy one pack yourself.** The money path
      has never run. Test mode first, then one real $4 purchase before
      anyone else can. `CREDENTIALS.md` §5.

- [ ] **Create a Sentry project and paste the DSN into Vercel.** The
      SDK and config are already in the repo and stay inert without it,
      so this is one environment variable, not an integration.
      `CREDENTIALS.md` §7a.

- [ ] **Register a DMCA agent.** The takedown page and process are
      written; designating the agent with the US Copyright Office is
      yours, and so is the contact address it points at.

- [ ] **Clear the GitHub Actions billing lock.** CI is correct and has
      never run. Public repos get unlimited free minutes once the lock
      is gone. `CREDENTIALS.md` §9.

---

## Done, or I can do without asking

- [x] The models run and are correct. demucs, whisper and CLAP verified
      on Apple MPS rather than assumed. Two transformers 5 bugs found
      and fixed that only running could have surfaced.

- [x] Hung jobs no longer keep the money. `reconcile_stale_jobs` sweeps
      and refunds anything past sixteen minutes; the failure screen's
      promise of a refund is now true. Blocked on `CRON_SECRET` above to
      actually fire in production.

- [x] Concurrency capped at three chops per account, so a large balance
      cannot spawn a hundred GPU containers at once.

- [x] Storage expires. Sources at seven days, samples at thirty, through
      the storage API so files are freed rather than orphaned.

- [x] YouTube off by default, enforced server side.

- [x] **"this wasn't it" returns the credits** for a chop that finished
      but came out wrong, once per chop, three a day. Records why, which
      is the part worth having: `chop_rejections` puts the producer's
      reason next to the prompt that produced it.

- [x] Sentry SDK and config wired, inert until a DSN exists.

- [x] **Modal deployed and proven end to end.** Endpoint at
      `https://a-r-h-o--chop-ai-start.modal.run`, secret `chop-ai`
      created. A real job ran the whole pipeline on an L4: 89 bpm,
      C# major, three samples, 86 GPU-seconds, $0.019. The cache path
      works too: the same audio again took 6.2 GPU-seconds and $0.000,
      skipping separation and analysis. Three first-contact bugs found
      and fixed, two of which ruff now catches in CI.

- [x] Terms, privacy and refund pages. **Placeholders need filling:**
      legal entity name, registered address, contact email, jurisdiction,
      DMCA agent. They are spelled `[LIKE THIS]` so they are impossible
      to miss. A lawyer should read these before you take money.

- [x] Account deletion and data export at `/account`, with the storage
      delete policies they needed. Verified end to end: files removed
      from both buckets, every row gone, and the purchase record kept
      without a user id on it.

- [x] DMCA takedown page, at `/dmca`. Registering the agent is yours.

---

## What is still genuinely untested

Worth holding in mind when the first real user arrives, because no
amount of local work has covered it:

1. **The checkout and webhook end to end.** The code is sound and the
   crediting is idempotent, but no real order has flowed through it.
2. **YouTube ingestion.** Never run, needs the proxy, off by default.
3. **Claude chop selection against the real API.** The fallback works
   and is what ran above; the model call itself still needs a key.
