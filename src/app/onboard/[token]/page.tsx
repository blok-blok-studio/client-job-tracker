"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import { Plus, Trash2, Check, Loader2 } from "lucide-react";

interface Contact {
  name: string;
  role: string;
  email: string;
  phone: string;
  isPrimary: boolean;
}

interface Credential {
  platform: string;
  username: string;
  password: string;
  url: string;
  notes: string;
}

interface SocialLink {
  platform: string;
  url: string;
}

const SOCIAL_PLATFORMS = [
  "Instagram",
  "LinkedIn",
  "TikTok",
  "Twitter/X",
  "YouTube",
  "Facebook",
  "Pinterest",
  "Shopify",
  "WordPress",
  "Other",
];

export default function OnboardPage() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [clientName, setClientName] = useState("");
  const [, setClientCompany] = useState("");

  // Form state
  const [contacts, setContacts] = useState<Contact[]>([
    { name: "", role: "", email: "", phone: "", isPrimary: true },
  ]);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>([
    { platform: "", url: "" },
  ]);
  const [timezone, setTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone
  );
  const [notes, setNotes] = useState("");
  const [brandGuidelines, setBrandGuidelines] = useState("");

  useEffect(() => {
    async function fetchClient() {
      try {
        const res = await fetch(`/api/onboard/${token}`);
        const data = await res.json();
        if (data.success) {
          setClientName(data.data.name);
          setClientCompany(data.data.company || "");
        } else {
          setError(data.error || "Invalid onboarding link");
        }
      } catch {
        setError("Unable to load onboarding form");
      } finally {
        setLoading(false);
      }
    }
    fetchClient();
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);

    const validContacts = contacts.filter((c) => c.name.trim());
    const validCredentials = credentials.filter(
      (c) => c.platform.trim() && c.username.trim() && c.password.trim()
    );
    const validSocialLinks = socialLinks.filter(
      (s) => s.platform.trim() && s.url.trim()
    );

    try {
      const res = await fetch(`/api/onboard/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contacts: validContacts.length > 0 ? validContacts : undefined,
          credentials:
            validCredentials.length > 0 ? validCredentials : undefined,
          socialLinks:
            validSocialLinks.length > 0 ? validSocialLinks : undefined,
          timezone: timezone || undefined,
          notes: notes.trim() || undefined,
          brandGuidelines: brandGuidelines.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSubmitted(true);
      } else {
        setError(data.error || "Something went wrong");
      }
    } catch {
      setError("Failed to submit. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // Contact helpers
  function addContact() {
    setContacts([
      ...contacts,
      { name: "", role: "", email: "", phone: "", isPrimary: false },
    ]);
  }
  function removeContact(i: number) {
    setContacts(contacts.filter((_, idx) => idx !== i));
  }
  function updateContact(i: number, field: keyof Contact, value: string | boolean) {
    const updated = [...contacts];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (updated[i] as any)[field] = value;
    setContacts(updated);
  }

  // Credential helpers
  function addCredential() {
    setCredentials([
      ...credentials,
      { platform: "", username: "", password: "", url: "", notes: "" },
    ]);
  }
  function removeCredential(i: number) {
    setCredentials(credentials.filter((_, idx) => idx !== i));
  }
  function updateCredential(i: number, field: keyof Credential, value: string) {
    const updated = [...credentials];
    updated[i][field] = value;
    setCredentials(updated);
  }

  // Social link helpers
  function addSocialLink() {
    setSocialLinks([...socialLinks, { platform: "", url: "" }]);
  }
  function removeSocialLink(i: number) {
    setSocialLinks(socialLinks.filter((_, idx) => idx !== i));
  }
  function updateSocialLink(i: number, field: keyof SocialLink, value: string) {
    const updated = [...socialLinks];
    updated[i][field] = value;
    setSocialLinks(updated);
  }

  const inputClass =
    "w-full px-3 py-2.5 bg-bb-black border border-bb-border rounded-lg text-white placeholder:text-bb-dim focus:outline-none focus:ring-2 focus:ring-bb-orange/50 focus:border-bb-orange text-sm transition-colors";
  const labelClass = "block text-sm text-bb-muted mb-1.5 font-medium";

  if (loading) {
    return (
      <div className="min-h-screen bg-bb-black flex items-center justify-center">
        <Loader2 className="animate-spin text-bb-orange" size={32} />
      </div>
    );
  }

  if (error && !clientName) {
    return (
      <div className="min-h-screen bg-bb-black flex items-center justify-center px-4">
        <div className="text-center space-y-4 max-w-md">
          <Image
            src="/bb_logo_wordmark_subhead_WHT_PNG.png"
            alt="Blok Blok Studio"
            width={180}
            height={60}
            className="mx-auto mb-6"
          />
          <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto">
            <span className="text-red-400 text-2xl">!</span>
          </div>
          <h1 className="text-xl font-display font-semibold text-white">
            Link Unavailable
          </h1>
          <p className="text-bb-muted text-sm">
            This onboarding link is invalid or has already been used.
          </p>
          <p className="text-bb-dim text-xs">
            If you think this is a mistake, please contact us at{" "}
            <a
              href="mailto:hello@blokblokstudio.com"
              className="text-bb-orange hover:underline"
            >
              hello@blokblokstudio.com
            </a>
          </p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-bb-black flex items-center justify-center px-4">
        <div className="text-center space-y-4 max-w-md">
          <Image
            src="/bb_logo_wordmark_subhead_WHT_PNG.png"
            alt="Blok Blok Studio"
            width={180}
            height={60}
            className="mx-auto mb-6"
          />
          <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto">
            <Check className="text-green-400" size={32} />
          </div>
          <h1 className="text-2xl font-display font-semibold text-white">
            You&apos;re all set!
          </h1>
          <p className="text-bb-muted">
            Thanks, {clientName.split(" ")[0]}! We&apos;ve received your
            information and will be in touch soon.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bb-black">
      <div className="max-w-2xl mx-auto px-4 py-8 sm:py-12">
        {/* Header */}
        <div className="text-center mb-8">
          <Image
            src="/bb_logo_wordmark_subhead_WHT_PNG.png"
            alt="Blok Blok Studio"
            width={180}
            height={60}
            className="mx-auto mb-6"
          />
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-white">
            Welcome, {clientName.split(" ")[0]}!
          </h1>
          <p className="text-bb-muted mt-2 text-sm sm:text-base">
            Fill out the details below so we can get started working together.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Contacts Section */}
          <section className="bg-bb-surface border border-bb-border rounded-xl p-4 sm:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-display font-semibold text-white">
                Contact Info
              </h2>
              <button
                type="button"
                onClick={addContact}
                className="flex items-center gap-1 text-xs text-bb-orange hover:text-bb-orange-light transition-colors"
              >
                <Plus size={14} /> Add Contact
              </button>
            </div>
            <p className="text-xs text-bb-dim">
              Who should we reach out to? Add your main point(s) of contact.
            </p>

            {contacts.map((contact, i) => (
              <div
                key={i}
                className="space-y-3 border border-bb-border rounded-lg p-4 relative"
              >
                {contacts.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeContact(i)}
                    className="absolute top-3 right-3 text-bb-dim hover:text-red-400 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Name *</label>
                    <input
                      value={contact.name}
                      onChange={(e) => updateContact(i, "name", e.target.value)}
                      required
                      className={inputClass}
                      placeholder="Full name"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Role</label>
                    <input
                      value={contact.role}
                      onChange={(e) => updateContact(i, "role", e.target.value)}
                      className={inputClass}
                      placeholder="e.g. Marketing Manager"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Email</label>
                    <input
                      type="email"
                      value={contact.email}
                      onChange={(e) => updateContact(i, "email", e.target.value)}
                      className={inputClass}
                      placeholder="email@example.com"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Phone</label>
                    <input
                      value={contact.phone}
                      onChange={(e) => updateContact(i, "phone", e.target.value)}
                      className={inputClass}
                      placeholder="+1 234 567 8900"
                    />
                  </div>
                </div>
              </div>
            ))}
          </section>

          {/* Social Links Section */}
          <section className="bg-bb-surface border border-bb-border rounded-xl p-4 sm:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-display font-semibold text-white">
                Social Profiles
              </h2>
              <button
                type="button"
                onClick={addSocialLink}
                className="flex items-center gap-1 text-xs text-bb-orange hover:text-bb-orange-light transition-colors"
              >
                <Plus size={14} /> Add Profile
              </button>
            </div>
            <p className="text-xs text-bb-dim">
              Share your social media profiles so we can manage your presence.
            </p>

            {socialLinks.map((link, i) => (
              <div key={i} className="flex items-start gap-3">
                <select
                  value={link.platform}
                  onChange={(e) =>
                    updateSocialLink(i, "platform", e.target.value)
                  }
                  className={`${inputClass} max-w-[160px]`}
                >
                  <option value="">Platform</option>
                  {SOCIAL_PLATFORMS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
                <input
                  value={link.url}
                  onChange={(e) => updateSocialLink(i, "url", e.target.value)}
                  className={`${inputClass} flex-1`}
                  placeholder="https://..."
                />
                {socialLinks.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeSocialLink(i)}
                    className="p-2.5 text-bb-dim hover:text-red-400 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </section>

          {/* Credentials Section */}
          <section className="bg-bb-surface border border-bb-border rounded-xl p-4 sm:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-display font-semibold text-white">
                Account Access
              </h2>
              <button
                type="button"
                onClick={addCredential}
                className="flex items-center gap-1 text-xs text-bb-orange hover:text-bb-orange-light transition-colors"
              >
                <Plus size={14} /> Add Account
              </button>
            </div>
            <p className="text-xs text-bb-dim">
              Share login credentials for accounts we&apos;ll manage. All
              passwords are encrypted with AES-256.
            </p>

            {credentials.length === 0 && (
              <button
                type="button"
                onClick={addCredential}
                className="w-full py-3 border border-dashed border-bb-border rounded-lg text-sm text-bb-dim hover:text-bb-muted hover:border-bb-dim transition-colors"
              >
                + Add account credentials
              </button>
            )}

            {credentials.map((cred, i) => (
              <div
                key={i}
                className="space-y-3 border border-bb-border rounded-lg p-4 relative"
              >
                <button
                  type="button"
                  onClick={() => removeCredential(i)}
                  className="absolute top-3 right-3 text-bb-dim hover:text-red-400 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Platform *</label>
                    <select
                      value={cred.platform}
                      onChange={(e) =>
                        updateCredential(i, "platform", e.target.value)
                      }
                      className={inputClass}
                    >
                      <option value="">Select platform</option>
                      {SOCIAL_PLATFORMS.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>URL</label>
                    <input
                      value={cred.url}
                      onChange={(e) =>
                        updateCredential(i, "url", e.target.value)
                      }
                      className={inputClass}
                      placeholder="https://..."
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Username *</label>
                    <input
                      value={cred.username}
                      onChange={(e) =>
                        updateCredential(i, "username", e.target.value)
                      }
                      className={inputClass}
                      placeholder="Username or email"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Password *</label>
                    <input
                      type="password"
                      value={cred.password}
                      onChange={(e) =>
                        updateCredential(i, "password", e.target.value)
                      }
                      className={inputClass}
                      placeholder="Password"
                    />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Notes</label>
                  <input
                    value={cred.notes}
                    onChange={(e) =>
                      updateCredential(i, "notes", e.target.value)
                    }
                    className={inputClass}
                    placeholder="2FA enabled, recovery email, etc."
                  />
                </div>
              </div>
            ))}
          </section>

          {/* Additional Info */}
          <section className="bg-bb-surface border border-bb-border rounded-xl p-4 sm:p-6 space-y-4">
            <h2 className="text-lg font-display font-semibold text-white">
              Additional Details
            </h2>

            <div>
              <label className={labelClass}>Timezone</label>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className={inputClass}
              >
                {Intl.supportedValuesOf("timeZone").map((tz) => (
                  <option key={tz} value={tz}>
                    {tz.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass}>Brand Guidelines</label>
              <textarea
                value={brandGuidelines}
                onChange={(e) => setBrandGuidelines(e.target.value)}
                rows={3}
                className={inputClass}
                placeholder="Brand colors, fonts, tone of voice, dos and don'ts..."
              />
            </div>

            <div>
              <label className={labelClass}>Anything else we should know?</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className={inputClass}
                placeholder="Goals, preferences, important dates..."
              />
            </div>
          </section>

          {error && (
            <p className="text-red-400 text-sm text-center">{error}</p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 bg-bb-orange hover:bg-bb-orange-light text-white font-semibold rounded-xl transition-colors disabled:opacity-50 text-sm sm:text-base"
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="animate-spin" size={18} />
                Submitting...
              </span>
            ) : (
              "Complete Onboarding"
            )}
          </button>

          <p className="text-center text-xs text-bb-dim pb-4">
            Your information is securely encrypted and only accessible by the
            Blok Blok Studio team.
          </p>
        </form>
      </div>
    </div>
  );
}
