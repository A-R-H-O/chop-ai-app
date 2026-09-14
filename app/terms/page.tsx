import type { Metadata } from "next";
import Link from "next/link";
import { ProsePage } from "@/components/chop/prose-page";
import { CHOP_COST, DAILY_GRANT } from "@/lib/credits/constants";

export const metadata: Metadata = {
  title: "terms · chop.ai",
  description: "the terms you agree to by using chop.ai",
};

export default function TermsPage() {
  return (
    <ProsePage title="terms of service" updated="14 September 2026">
      <p>
        chop.ai is run by <strong>[LEGAL ENTITY NAME]</strong> (&ldquo;we&rdquo;).
        Using it means you accept what is written here. If you do not, do
        not use it.
      </p>

      <h2>what the service does</h2>
      <p>
        You give chop.ai an audio file and a description of what you are
        after. It separates the recording into parts, analyses the tempo,
        key, transients and mood, picks regions it thinks match your
        description, and returns those regions as audio files you can
        download.
      </p>
      <p>
        It is a tool that suggests. It is not a guarantee of a particular
        result, and the chops it picks will sometimes not be the ones you
        wanted.
      </p>

      <h2>what you upload</h2>
      <p>
        You must own the recording you upload, or otherwise have the right
        to use it the way you are about to. You keep all rights in what you
        upload and in the samples that come back. We claim no ownership of
        either.
      </p>
      <p>
        We use your audio only to produce your samples and to run the
        service. We do not use it to train models, we do not sell it, and
        we do not give it to anybody else except the processors listed in
        the <Link href="/privacy">privacy policy</Link>, who process it on
        our behalf to make the product work.
      </p>
      <p>
        Do not upload anything you have no right to. If you do, that is on
        you, and we will remove it when we are told about it under our{" "}
        <Link href="/dmca">copyright policy</Link>.
      </p>

      <h2>credits</h2>
      <ul>
        <li>A chop costs {CHOP_COST} credits.</li>
        <li>
          A signed-in account is granted {DAILY_GRANT} credits a day, which
          is enough for one chop. The grant does not stack up over days you
          do not use it.
        </li>
        <li>Bought credits do not expire.</li>
        <li>
          If a chop fails, its credits are returned automatically. You do
          not pay for our failures.
        </li>
        <li>
          Credits have no cash value, cannot be transferred between
          accounts, and cannot be exchanged for money outside the{" "}
          <Link href="/refunds">refund policy</Link>.
        </li>
      </ul>

      <h2>how long we keep things</h2>
      <p>
        Uploads are deleted after 7 days. Generated samples are deleted
        after 30 days. Download what you want to keep. We are a tool, not
        your archive.
      </p>

      <h2>what you may not do</h2>
      <ul>
        <li>
          Upload material you have no right to, or anything unlawful.
        </li>
        <li>
          Resell access to chop.ai, or run it as a service for other
          people, without asking us first.
        </li>
        <li>
          Try to get around the credit system, the rate limits, or any
          other technical control.
        </li>
        <li>
          Use automated means to place load on the service beyond normal
          use.
        </li>
      </ul>
      <p>
        We can suspend or close an account that does these things. Where
        it is fair to do so, we will refund unused bought credits when we
        close an account.
      </p>

      <h2>availability</h2>
      <p>
        The service is provided as it is. We do not promise it will always
        be available, that it will produce a particular result, or that it
        is free of faults. We do not offer an uptime guarantee.
      </p>

      <h2>liability</h2>
      <p>
        To the extent the law allows, our total liability to you for any
        claim connected to chop.ai is limited to what you have paid us in
        the twelve months before the claim. We are not liable for lost
        profits, lost work, or lost data.
      </p>
      <p>
        Nothing here limits liability for death or personal injury caused
        by negligence, for fraud, or for anything else that cannot lawfully
        be limited.
      </p>

      <h2>changes</h2>
      <p>
        We may change these terms. If a change matters, we will say so on
        this page and update the date at the top. Continuing to use
        chop.ai after that means you accept the change.
      </p>

      <h2>law</h2>
      <p>
        These terms are governed by the law of{" "}
        <strong>[JURISDICTION]</strong>, and its courts have exclusive
        jurisdiction.
      </p>

      <h2>contact</h2>
      <p>
        <strong>[CONTACT EMAIL]</strong>
      </p>
    </ProsePage>
  );
}
