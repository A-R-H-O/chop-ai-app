import type { Metadata } from "next";
import { ProsePage } from "@/components/chop/prose-page";

export const metadata: Metadata = {
  title: "privacy · chop.ai",
  description: "what chop.ai stores, who processes it, and how to remove it",
};

export default function PrivacyPage() {
  return (
    <ProsePage title="privacy" updated="14 September 2026">
      <p>
        This says what chop.ai stores, who it passes through, and how to
        get it back or delete it. The data controller is{" "}
        <strong>[LEGAL ENTITY NAME]</strong>,{" "}
        <strong>[REGISTERED ADDRESS]</strong>.
      </p>

      <h2>what we store</h2>
      <ul>
        <li>
          <strong>Your account.</strong> The email address and account id
          Google gives us when you sign in. We never see or store a
          password, because sign-in is Google only.
        </li>
        <li>
          <strong>Audio you upload.</strong> Kept for 7 days, then deleted.
        </li>
        <li>
          <strong>Samples we generate.</strong> Kept for 30 days, then
          deleted.
        </li>
        <li>
          <strong>What you typed.</strong> The description you wrote for
          each chop, kept with the job.
        </li>
        <li>
          <strong>Analysis of your audio.</strong> Tempo, key, transient
          positions, mood scores and, where the recording has vocals, a
          transcript of the words. Kept with the job.
        </li>
        <li>
          <strong>Your credit ledger.</strong> Every grant, spend, refund
          and purchase, so the balance is auditable.
        </li>
        <li>
          <strong>Usage analytics.</strong> Which screens you reach and
          which actions you take, tied to your account id.
        </li>
      </ul>

      <h2>who processes it</h2>
      <p>
        These are the only companies your data passes through. Each
        processes it on our instructions, to run the product.
      </p>
      <ul>
        <li>
          <strong>Supabase</strong> — database, authentication and file
          storage. United States.
        </li>
        <li>
          <strong>Modal</strong> — the GPU workers that separate and
          analyse your audio. United States.
        </li>
        <li>
          <strong>Anthropic</strong> — receives the analysis summary and
          your description to choose which regions to chop. It receives
          text, never your audio. Anthropic does not train on API data.
        </li>
        <li>
          <strong>Vercel</strong> — hosts the website. United States.
        </li>
        <li>
          <strong>LemonSqueezy</strong> — takes payments and is the
          merchant of record. We never see your card details.
        </li>
        <li>
          <strong>PostHog</strong> — product analytics.
        </li>
      </ul>
      <p>
        If you are in the UK or EU, this means your data is transferred to
        the United States under the standard contractual clauses those
        providers offer.
      </p>

      <h2>what we do not do</h2>
      <p>
        We do not train models on your audio. We do not sell your data. We
        do not use it for advertising. We do not share it with anyone
        outside the list above, except where the law requires it.
      </p>

      <h2>your rights</h2>
      <p>
        You can get a copy of everything we hold, or delete your account
        entirely, from your account settings. No email required and no
        waiting.
      </p>
      <ul>
        <li>
          <strong>Export</strong> returns a single JSON file with your
          account, your credit ledger, every chop and every sample record.
        </li>
        <li>
          <strong>Delete</strong> removes your uploads, your samples, your
          chops, your ledger, your profile and your login. It cannot be
          undone.
        </li>
      </ul>
      <p>
        One thing survives deletion: the record that a purchase happened,
        stripped of who made it. What is kept is the pack, the amount and
        the date. We keep it because a payment has a second side at the
        payment processor, and a chargeback or a tax question later needs
        an answer. It no longer identifies you.
      </p>
      <p>
        You also have the right to complain to your data protection
        regulator. In the UK that is the ICO.
      </p>

      <h2>cookies</h2>
      <p>
        chop.ai sets one cookie, which keeps you signed in. There are no
        advertising cookies and no third-party trackers, which is why you
        are not being asked to accept anything.
      </p>

      <h2>contact</h2>
      <p>
        <strong>[CONTACT EMAIL]</strong>
      </p>
    </ProsePage>
  );
}
