import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy · Blok Blok Studio Command Center",
  description: "How the Blok Blok Studio Command Center handles data from connected social media accounts.",
};

export default function PrivacyPolicyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="September 13, 2026">
      <section>
        <p>
          This policy explains how Blok Blok Studio LLC (&quot;Blok Blok Studio&quot;, &quot;we&quot;, &quot;us&quot;) handles
          information in the Blok Blok Studio Command Center (the &quot;Command Center&quot;), the tool our team uses to plan,
          schedule, and publish social media content for our clients. It covers data we receive when a client, or our team
          with a client&apos;s permission, connects a TikTok, YouTube, Instagram, Facebook, Threads, LinkedIn, or X account.
          Our public website has its own policy at{" "}
          <a href="https://www.blokblokstudio.com/privacy">blokblokstudio.com/privacy</a>.
        </p>
      </section>

      <section>
        <h2>Who we are</h2>
        <p>
          Blok Blok Studio LLC is a creative and marketing studio registered in Texas, USA. For any privacy question or
          request, email <a href="mailto:chase@blokblokstudio.com">chase@blokblokstudio.com</a>.
        </p>
      </section>

      <section>
        <h2>What we collect from connected accounts</h2>
        <p>When an account is connected, we only request the permissions needed to publish content and report on it:</p>
        <ul>
          <li>
            <strong>Account details:</strong> the account or channel ID, username or handle, display name, and profile picture,
            so our team can pick the right account when scheduling.
          </li>
          <li>
            <strong>Access tokens:</strong> the tokens the platform issues so we can publish on the account&apos;s behalf.
          </li>
          <li>
            <strong>Content we publish:</strong> the videos, images, captions, titles, and settings our team prepares, and the
            ID and link of each post once it is live.
          </li>
          <li>
            <strong>Post performance:</strong> public counts for posts we published, such as views, likes, comments, shares,
            saves, and reach, used in client reporting.
          </li>
        </ul>
        <p>
          We do not read direct messages, collect follower lists, or access content the account owner did not ask us to
          publish.
        </p>
      </section>

      <section>
        <h2>How we use it</h2>
        <ul>
          <li>To publish the posts a client or our team scheduled, at the time and in the format chosen.</li>
          <li>To show which account a post will go to, and whether a connection needs to be renewed.</li>
          <li>To show post performance to the client and our team.</li>
        </ul>
        <p>
          We do not sell this data, use it for advertising, use it to train AI models, or combine it with data from other
          sources to build profiles.
        </p>
      </section>

      <section>
        <h2>Google and YouTube data</h2>
        <p>
          The Command Center uses YouTube API Services. By connecting a YouTube channel you also agree to the{" "}
          <a href="https://www.youtube.com/t/terms">YouTube Terms of Service</a>, and Google handles your information under
          the <a href="https://policies.google.com/privacy">Google Privacy Policy</a>.
        </p>
        <p>
          The Command Center&apos;s use and transfer of information received from Google APIs will adhere to the{" "}
          <a href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</a>,
          including the Limited Use requirements. We use YouTube access only to upload videos, set thumbnails, add videos to
          playlists, and read statistics for videos we uploaded. People at Blok Blok Studio do not read this data except when
          needed to publish, for security, to comply with law, or when the channel owner asks us to.
        </p>
        <p>
          You can remove the Command Center&apos;s access to your Google account at any time at{" "}
          <a href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</a>.
        </p>
      </section>

      <section>
        <h2>TikTok, Meta, and other platforms</h2>
        <p>
          Data from TikTok, Instagram, Facebook, Threads, LinkedIn, and X is used only as described above and is subject to
          each platform&apos;s own terms and privacy policy. You can remove access at any time from the platform: TikTok
          (Settings, Security and permissions, Apps and services), Facebook and Instagram (Settings, Business integrations or
          Apps and websites), LinkedIn (Settings, Data privacy, Permitted services), and X (Settings, Security and account
          access, Apps and sessions).
        </p>
      </section>

      <section>
        <h2>Who we share it with</h2>
        <p>We share data only with the services that run the Command Center, under their data protection terms:</p>
        <ul>
          <li>Vercel (hosting and media storage)</li>
          <li>Prisma Data Platform (database)</li>
          <li>The social platforms themselves, when we publish to them or read statistics from them</li>
        </ul>
        <p>We may also disclose data when required by law.</p>
      </section>

      <section>
        <h2>How we protect it</h2>
        <p>
          Access tokens are encrypted at rest with AES-256-GCM and are never shown to anyone, including our team. Only Blok
          Blok Studio team members with two-factor authentication can sign in to the Command Center. Connections to the
          platforms use HTTPS.
        </p>
      </section>

      <section>
        <h2>How long we keep it</h2>
        <ul>
          <li>Access tokens are kept while an account is connected and deleted when it is disconnected.</li>
          <li>
            Records of published posts and their statistics are kept for as long as we work with the client, so we can report
            on results, and are deleted when the client asks or within 90 days after our work together ends.
          </li>
        </ul>
      </section>

      <section>
        <h2>Your choices and rights</h2>
        <p>
          You can disconnect an account, ask what data we hold, ask us to correct it, or ask us to delete it at any time. See{" "}
          <a href="/legal/data-deletion">Data Deletion</a> for how. We respond within 30 days. If you are in the EU or UK you
          also have the rights given by the GDPR, including the right to complain to your local data protection authority.
        </p>
      </section>

      <section>
        <h2>Children</h2>
        <p>The Command Center is a business tool and is not directed at anyone under 16.</p>
      </section>

      <section>
        <h2>Changes</h2>
        <p>
          If we change this policy we will update the date at the top of this page, and tell connected clients directly about
          any significant change.
        </p>
      </section>
    </LegalPage>
  );
}
