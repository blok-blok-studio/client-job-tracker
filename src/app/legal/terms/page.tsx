import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Terms of Service · Blok Blok Studio Command Center",
  description: "Terms for connecting social media accounts to the Blok Blok Studio Command Center.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="September 13, 2026">
      <section>
        <p>
          These terms apply when you connect a social media account to the Blok Blok Studio Command Center (the &quot;Command
          Center&quot;), operated by Blok Blok Studio LLC (&quot;Blok Blok Studio&quot;, &quot;we&quot;, &quot;us&quot;). By
          connecting an account you agree to them. Your services agreement with Blok Blok Studio, if you have one, also
          applies, and it takes priority if the two ever conflict.
        </p>
      </section>

      <section>
        <h2>What the Command Center does</h2>
        <p>
          The Command Center lets our team schedule and publish content to accounts you connect, and report on how that
          content performs. It is used by Blok Blok Studio staff to deliver services to our clients. It is not a public
          self-service product.
        </p>
      </section>

      <section>
        <h2>Your permission</h2>
        <ul>
          <li>
            You confirm that you own the accounts you connect, or are authorized by the owner to connect them and to let us post
            on them.
          </li>
          <li>
            You authorize Blok Blok Studio to publish content that you have approved, or that is covered by our agreement with
            you, to those accounts.
          </li>
          <li>You can withdraw this permission at any time by disconnecting the account or telling us.</li>
        </ul>
      </section>

      <section>
        <h2>Content and platform rules</h2>
        <ul>
          <li>You are responsible for having the rights to the content, music, and materials you give us to publish.</li>
          <li>
            Everything published through the Command Center must follow the rules of the platform it is posted on, including
            the <a href="https://www.tiktok.com/legal/page/us/terms-of-service/en">TikTok Terms of Service</a>, the{" "}
            <a href="https://www.youtube.com/t/terms">YouTube Terms of Service</a>, and the{" "}
            <a href="https://www.facebook.com/terms">Meta</a> and{" "}
            <a href="https://help.instagram.com/581066165581870">Instagram</a> terms.
          </li>
          <li>We may decline to publish content we believe breaks the law or a platform&apos;s rules.</li>
        </ul>
      </section>

      <section>
        <h2>Availability</h2>
        <p>
          The Command Center relies on the platforms&apos; own services. Platforms can change or restrict what can be published,
          reject a post, or require an account to be reconnected. When a post cannot be published we tell you and help find
          another way, but we cannot guarantee that every scheduled post will go live at the exact time planned.
        </p>
      </section>

      <section>
        <h2>Privacy</h2>
        <p>
          How we handle data from connected accounts is described in our <a href="/legal/privacy">Privacy Policy</a>.
        </p>
      </section>

      <section>
        <h2>Liability</h2>
        <p>
          To the extent the law allows, Blok Blok Studio is not liable for indirect or consequential losses arising from use of
          the Command Center, or for actions taken by the platforms. Nothing in these terms limits liability that cannot be
          limited by law.
        </p>
      </section>

      <section>
        <h2>Changes and contact</h2>
        <p>
          We may update these terms and will change the date above when we do. These terms are governed by the laws of the
          State of Texas, USA. Questions: <a href="mailto:chase@blokblokstudio.com">chase@blokblokstudio.com</a>.
        </p>
      </section>
    </LegalPage>
  );
}
