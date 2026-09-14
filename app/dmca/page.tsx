import type { Metadata } from "next";
import Link from "next/link";
import { ProsePage } from "@/components/chop/prose-page";

export const metadata: Metadata = {
  title: "copyright · chop.ai",
  description: "how to report infringing material on chop.ai",
};

export default function DmcaPage() {
  return (
    <ProsePage title="copyright" updated="14 September 2026">
      <p>
        chop.ai lets people upload audio they own and chop it into samples.
        Uploads are private to the account that made them and are not
        published, shared, or reachable by anybody else. There is no feed,
        no library, and no way to browse what other people have uploaded.
      </p>
      <p>
        That does not mean nothing can go wrong, so here is how to tell us.
      </p>

      <h2>reporting infringement</h2>
      <p>
        If you believe material on chop.ai infringes your copyright, send a
        notice to our designated agent:
      </p>
      <p>
        <strong>[DESIGNATED AGENT NAME]</strong>
        <br />
        <strong>[LEGAL ENTITY NAME]</strong>
        <br />
        <strong>[REGISTERED ADDRESS]</strong>
        <br />
        <strong>[DMCA EMAIL]</strong>
      </p>

      <p>Your notice needs to include:</p>
      <ul>
        <li>Your signature, physical or electronic.</li>
        <li>What work you say has been infringed.</li>
        <li>
          Enough detail to let us find the material, so a URL or an account
          email.
        </li>
        <li>How to contact you.</li>
        <li>
          A statement that you believe in good faith the use is not
          authorised by the owner, its agent, or the law.
        </li>
        <li>
          A statement, under penalty of perjury, that the information is
          accurate and that you are the owner or authorised to act for
          them.
        </li>
      </ul>

      <h2>what we do</h2>
      <p>
        We remove or disable the material, and we tell the account holder
        what was removed and why. Accounts that infringe repeatedly are
        closed.
      </p>

      <h2>counter-notice</h2>
      <p>
        If your material was removed and you believe that was a mistake, or
        that you do have the right to use it, send a counter-notice to the
        same address with your signature, the material and where it was,
        your contact details, a statement under penalty of perjury that you
        believe it was removed by mistake or misidentification, and your
        consent to the jurisdiction of the courts where you live.
      </p>
      <p>
        We will pass it on. If the original reporter does not go to court
        within ten business days, we may restore the material.
      </p>

      <h2>a note on what you upload</h2>
      <p>
        Our <Link href="/terms">terms</Link> require that you own what you
        upload or otherwise have the right to use it. Sampling law is not
        the same everywhere and a private tool is not a licence. Producing
        a sample here does not give you the right to release it.
      </p>
    </ProsePage>
  );
}
