import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Data Deletion · Blok Blok Studio Command Center",
  description: "How to remove a connected account and delete its data from the Blok Blok Studio Command Center.",
};

export default function DataDeletionPage() {
  return (
    <LegalPage title="Data Deletion" updated="September 13, 2026">
      <section>
        <p>
          You can remove the Blok Blok Studio Command Center&apos;s access to your accounts and have your data deleted at any
          time. You do not need to give a reason.
        </p>
      </section>

      <section>
        <h2>1. Ask us to delete your data</h2>
        <p>
          Email <a href="mailto:chase@blokblokstudio.com?subject=Data%20deletion%20request">chase@blokblokstudio.com</a> with
          the subject &quot;Data deletion request&quot; and tell us which accounts it is about (for example your Instagram
          handle, Facebook Page name, TikTok username, or YouTube channel). We will:
        </p>
        <ul>
          <li>Disconnect those accounts and delete their access tokens.</li>
          <li>Delete the account details and post statistics we stored for them.</li>
          <li>Confirm by email once it is done, within 30 days.</li>
        </ul>
        <p>
          If you also want records of posts we published for you removed from our system, say so in the same email. Posts that
          are already live on a platform stay there until you delete them on that platform.
        </p>
      </section>

      <section>
        <h2>2. Remove access from the platform</h2>
        <p>You can also cut off access yourself. We lose the ability to post or read statistics immediately.</p>
        <ul>
          <li>
            <strong>Facebook:</strong> Settings and privacy, Settings, Business integrations, then remove
            &quot;blokblokstudio-command-center&quot;.
          </li>
          <li>
            <strong>Instagram:</strong> Settings, Apps and websites (or Business integrations), then remove the Blok Blok Studio
            app.
          </li>
          <li>
            <strong>TikTok:</strong> Settings and privacy, Security and permissions, Apps and services permissions, then remove
            &quot;Blok Blok Studio&quot;.
          </li>
          <li>
            <strong>YouTube (Google):</strong> go to{" "}
            <a href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</a> and remove &quot;Blok Blok
            Studio&quot;.
          </li>
          <li>
            <strong>LinkedIn:</strong> Settings, Data privacy, Permitted services, then remove the app.
          </li>
          <li>
            <strong>X:</strong> Settings, Security and account access, Apps and sessions, Connected apps, then revoke access.
          </li>
        </ul>
        <p>Removing access on the platform does not delete what we already stored, so send the email above as well.</p>
      </section>
    </LegalPage>
  );
}
