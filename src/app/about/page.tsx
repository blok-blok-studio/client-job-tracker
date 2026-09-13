import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Blok Blok Studio Command Center",
  description: "The tool Blok Blok Studio uses to plan, schedule, publish, and report on social media content for its clients.",
};

// Public home page for the app (linked from platform consent screens and app reviews)
export default function AboutPage() {
  return (
    <LegalPage title="Blok Blok Studio Command Center">
      <section>
        <p>
          The Command Center is the web app Blok Blok Studio LLC uses to plan, schedule, publish, and report on social media
          content for our clients. Clients connect their own accounts, approve what goes out, and see how each post performs.
        </p>
      </section>

      <section>
        <h2>What it does</h2>
        <ul>
          <li>Schedules and publishes posts to YouTube, TikTok, Instagram, Facebook, LinkedIn, Threads, and X.</li>
          <li>Formats videos and images for each platform, such as 9:16 Shorts and Reels or 16:9 videos.</li>
          <li>Sends posts to clients for approval before they go live.</li>
          <li>Shows views, likes, comments, and shares for the posts we published.</li>
        </ul>
      </section>

      <section>
        <h2>YouTube</h2>
        <p>
          When a client connects a YouTube channel, the Command Center uses YouTube API Services to upload the videos that
          client approved, set their titles, descriptions, privacy, publish time, thumbnails, and playlists, and read view,
          like, and comment counts for those videos. It does not read or change any other videos on the channel. See the{" "}
          <a href="https://www.youtube.com/t/terms">YouTube Terms of Service</a> and{" "}
          <a href="https://policies.google.com/privacy">Google Privacy Policy</a>.
        </p>
      </section>

      <section>
        <h2>Connecting an account</h2>
        <p>
          Accounts are connected by signing in on the platform itself, so the Command Center never sees your password. We only
          ask for permission to publish content and read statistics for posts we publish, and you can disconnect at any time.
          How we handle this data is described in our <a href="/legal/privacy">Privacy Policy</a>.
        </p>
      </section>

      <section>
        <h2>Who can use it</h2>
        <p>
          Blok Blok Studio team members sign in with two-factor authentication. Clients connect their accounts from a private
          onboarding link we send them. Questions: <a href="mailto:chase@blokblokstudio.com">chase@blokblokstudio.com</a>.
        </p>
        <p className="pt-2">
          <Link
            href="/login"
            className="inline-block rounded-lg bg-bb-orange px-4 py-2 text-sm font-medium !text-white !no-underline hover:opacity-90"
          >
            Team sign in
          </Link>
        </p>
      </section>
    </LegalPage>
  );
}
