# Credentials

Every account and secret chop.ai needs, what it unblocks, and exactly
where the value goes. Ordered by what is blocking the most.

Two of these are billing locks rather than missing keys, and they are the
only reason nothing is live: **Vercel is suspended (402)** and GitHub
Actions is locked. Both are sections 8 and 9.

The app reads its config from `.env.local` in development and from
Vercel's environment variables in production. The worker reads its config
from a Modal secret. Nothing is shared between them except the Supabase
service role key and `WORKER_SHARED_SECRET`.

---

## 1. Google OAuth — blocks sign-in entirely

Sign-in returns `redirect_uri_mismatch`. Supabase's allowlist is already
filled in; Google's is not. These are two separate allowlists and both
have to contain the callback.

1. https://console.cloud.google.com/apis/credentials
2. Open the OAuth 2.0 Client ID chop.ai uses.
3. Under **Authorized redirect URIs**, add exactly:

   ```
   https://peoxidipokajuiyhgvqv.supabase.co/auth/v1/callback
   ```

4. Save. Google takes a few minutes to propagate.

Nothing to paste anywhere. Supabase already holds the client ID and
secret.

---

## 2. Anthropic API key — blocks chop selection

Without it every chop falls back to `naive_chops`, which places cuts on
the onset grid. That works, but it ignores the description the producer
typed, which is the product. You already have an Anthropic account
through Claude Code; this is a separate key.

1. https://console.anthropic.com/settings/keys → **Create key**
2. Goes in the **Modal secret** (step 4), as:

   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ```

Budget note: at `claude-opus-5` on `effort: "low"` with the static prompt
prefix cached, selection is a few cents per chop. `worker/cost.py` holds
the rates and `chop_economics` reports the realised number per job.

---

## 3. Modal — blocks stem separation, lyrics, and mood

The whole GPU half. Nothing in `worker/chop_app.py` has ever run.

1. https://modal.com → sign up, free tier includes credits.
2. `pip install modal && modal token new`
3. Deploy: `modal deploy worker/chop_app.py`
4. Modal prints a FastAPI endpoint URL. That URL goes in **Vercel** as:

   ```
   MODAL_ENDPOINT_URL=https://<your-workspace>--chop-start.modal.run
   ```

---

## 4. Modal secret — what the worker reads

Create once, named `chop-ai`, holding:

| key | value |
| --- | --- |
| `SUPABASE_URL` | `https://peoxidipokajuiyhgvqv.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase dashboard → Settings → API → `service_role` |
| `ANTHROPIC_API_KEY` | from step 2 |
| `WORKER_SHARED_SECRET` | any long random string, must match Vercel |
| `YTDLP_PROXY_URL` | from step 6, optional until then |

```
modal secret create chop-ai \
  SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... ANTHROPIC_API_KEY=... \
  WORKER_SHARED_SECRET=... 
```

Generate the shared secret with `openssl rand -hex 32`. It is what stops
anyone who finds the Modal endpoint from queueing free GPU work.

---

## 5. LemonSqueezy — blocks buying credits

The top up dialog renders and the checkout route exists, but no purchase
can complete. Five values, all into **Vercel**.

1. https://app.lemonsqueezy.com → create a store if there is not one.
2. Create three products, one per pack. The names and prices have to
   match `lib/credits/constants.ts` or the dialog lies about what the
   producer is buying:

   | pack | price | credits | chops |
   | --- | --- | --- | --- |
   | starter | $4 | 100 | 12 |
   | regular | $9 | 300 | 37 |
   | bulk | $25 | 1000 | 125 |

3. Each product has a **variant ID** (Products → the product → Variants,
   it is in the URL). Three of them:

   ```
   LEMONSQUEEZY_VARIANT_100=...
   LEMONSQUEEZY_VARIANT_300=...
   LEMONSQUEEZY_VARIANT_1000=...
   ```

4. Settings → API → new key:

   ```
   LEMONSQUEEZY_API_KEY=...
   ```

5. Settings → General, the store ID is in the URL:

   ```
   LEMONSQUEEZY_STORE_ID=...
   ```

6. Settings → Webhooks → add endpoint:

   - URL: `https://<your-vercel-domain>/api/webhooks/lemonsqueezy`
   - Events: `order_created`
   - Signing secret → 

     ```
     LEMONSQUEEZY_WEBHOOK_SECRET=...
     ```

The webhook is what actually grants credits. The signature is verified
HMAC-SHA256 over the raw body with `timingSafeEqual`, so a wrong secret
fails closed and no credits are granted.

---

## 6. Residential proxy — blocks YouTube links

YouTube blocks datacenter IPs, and Modal is a datacenter. Without a proxy
only file uploads work. File upload is the better path anyway, so this is
the least urgent item here.

Any residential provider works. Goes in the **Modal secret**:

```
YTDLP_PROXY_URL=http://user:pass@host:port
```

---

## 7. PostHog — analytics, not blocking

Every `posthog.capture` call is already in place and no-ops without a
key.

1. https://posthog.com → project → Settings → Project API key.
2. Into **Vercel**:

   ```
   NEXT_PUBLIC_POSTHOG_KEY=phc_...
   NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
   ```

---

## 8. Vercel billing — blocks the deploy

`vercel link` fails with:

```
Error: Your account has been suspended. To reactivate your
subscription, add a valid payment method. (402)
```

https://vercel.com/teams/huddle-s-projects1/settings/billing

Nothing can deploy until this clears. Once it does, the app itself is
ready: the hosted Supabase project is fully migrated (all 8, verified
with `supabase migration list`), so the only remaining work is pasting
the environment variables from the table below.

---

## 9. GitHub Actions billing — blocks CI

`.github/workflows/ci.yml` is correct but every run fails with "your
account is locked due to a billing issue".

https://github.com/settings/billing → clear the outstanding balance or
attach a payment method. Public repos get unlimited free Actions minutes,
so once the lock is cleared this costs nothing.

---

## Where each value lives

**Vercel** (Project → Settings → Environment Variables):

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
MODAL_ENDPOINT_URL
WORKER_SHARED_SECRET
LEMONSQUEEZY_API_KEY
LEMONSQUEEZY_STORE_ID
LEMONSQUEEZY_WEBHOOK_SECRET
LEMONSQUEEZY_VARIANT_100
LEMONSQUEEZY_VARIANT_300
LEMONSQUEEZY_VARIANT_1000
NEXT_PUBLIC_POSTHOG_KEY
NEXT_PUBLIC_POSTHOG_HOST
```

**Modal secret `chop-ai`**:

```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
ANTHROPIC_API_KEY
WORKER_SHARED_SECRET
YTDLP_PROXY_URL
```

**Google Cloud Console**: a redirect URI, nothing to copy out.

Anything prefixed `NEXT_PUBLIC_` is shipped to the browser and is not a
secret. Everything else must never appear in client code. The service
role key bypasses RLS entirely, so it belongs only on the server and in
Modal.
