import type { Metadata } from "next";
import { ProsePage } from "@/components/chop/prose-page";
import { CHOP_COST } from "@/lib/credits/constants";

export const metadata: Metadata = {
  title: "refunds · chop.ai",
  description: "when credits come back and when money does",
};

export default function RefundsPage() {
  return (
    <ProsePage title="refunds" updated="14 September 2026">
      <p>
        Two different things can come back: credits, and money. Credits
        come back automatically and often. Money is rarer and involves us.
      </p>

      <h2>credits, automatically</h2>
      <p>
        A chop costs {CHOP_COST} credits, taken when it starts. If it does
        not finish, they are returned. This covers:
      </p>
      <ul>
        <li>A chop that fails for any reason on our side.</li>
        <li>
          Audio we could not work with, whether it is too long, unreadable,
          or has nothing in it worth chopping.
        </li>
        <li>
          A chop that stops responding. A background job checks for these
          and returns the credits without you asking.
        </li>
      </ul>
      <p>
        You do not have to contact anyone for these. If you believe a chop
        failed and your credits did not come back, that is a bug, and we
        want to hear about it.
      </p>

      <h2>when a chop works but you do not like it</h2>
      <p>
        This is not a failure and the credits are not returned
        automatically. The tool did the work and you got samples; they were
        not the ones you wanted.
      </p>
      <p>
        Tell us anyway. If the result was genuinely unusable rather than
        just not to taste, email us and we will put the credits back. We
        would rather hear about it than have you quietly stop using it.
      </p>

      <h2>money back</h2>
      <p>
        Payments are handled by LemonSqueezy, who are the merchant of
        record. Your receipt comes from them and so does the refund.
      </p>
      <ul>
        <li>
          <strong>Within 14 days, credits unused:</strong> email us and we
          will refund the purchase in full.
        </li>
        <li>
          <strong>Within 14 days, some credits used:</strong> we will
          refund the unused portion.
        </li>
        <li>
          <strong>After 14 days:</strong> credits do not expire, so they
          are still yours to spend. We will still look at a refund request
          on its merits, particularly if the service was not working.
        </li>
      </ul>
      <p>
        If you are a consumer in the UK or EU, you have a statutory right
        to cancel a purchase within 14 days. Buying credits and spending
        them immediately starts the service, which affects that right for
        the part you have used. The policy above is written to be at least
        as generous as the law requires.
      </p>

      <h2>if we close your account</h2>
      <p>
        If we suspend or close an account, we refund unused bought credits
        where it is fair to do so. We will not do that where the account
        was closed for uploading material it had no right to.
      </p>

      <h2>how to ask</h2>
      <p>
        Email <strong>[CONTACT EMAIL]</strong> from the address on the
        account, with the order number from your LemonSqueezy receipt. We
        aim to answer within a few working days.
      </p>
    </ProsePage>
  );
}
