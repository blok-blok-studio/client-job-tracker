"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import { Plus, Trash2, Check, Loader2, ChevronDown, MessageCircle } from "lucide-react";
import QRCode from "qrcode";

interface Contact {
  name: string;
  role: string;
  email: string;
  countryCode: string;
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

const SOURCE_OPTIONS = [
  "Referral",
  "Instagram",
  "LinkedIn",
  "TikTok",
  "Twitter/X",
  "Facebook",
  "YouTube",
  "Google Search",
  "Website",
  "Cold Outreach",
  "Networking Event",
  "Word of Mouth",
  "Other",
];

const INDUSTRY_OPTIONS = [
  "Accounting & Finance",
  "Advertising & Marketing",
  "Agriculture",
  "Architecture",
  "Automotive",
  "Beauty & Cosmetics",
  "Blockchain & Crypto",
  "Cannabis",
  "Coaching & Consulting",
  "Construction",
  "Creative Agency",
  "Dental",
  "E-commerce",
  "Education",
  "Energy & Utilities",
  "Entertainment",
  "Events & Hospitality",
  "Fashion & Apparel",
  "Film & Video",
  "Fitness & Wellness",
  "Food & Beverage",
  "Gaming",
  "Government",
  "Healthcare",
  "Home Services",
  "Insurance",
  "Interior Design",
  "Jewelry & Watches",
  "Law & Legal",
  "Logistics & Shipping",
  "Manufacturing",
  "Media & Publishing",
  "Music",
  "Nonprofit",
  "Outdoor & Recreation",
  "Pets & Animals",
  "Photography",
  "Real Estate",
  "Restaurants & Bars",
  "Retail",
  "SaaS & Software",
  "Skincare",
  "Social Media",
  "Sports",
  "Sustainability & Green",
  "Tech & Startups",
  "Telecommunications",
  "Travel & Tourism",
  "Venture Capital & PE",
  "Other",
];

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

const COUNTRY_CODES = [
  { code: "+1", flag: "\u{1F1FA}\u{1F1F8}", name: "US" },
  { code: "+1", flag: "\u{1F1E8}\u{1F1E6}", name: "CA" },
  { code: "+44", flag: "\u{1F1EC}\u{1F1E7}", name: "UK" },
  { code: "+49", flag: "\u{1F1E9}\u{1F1EA}", name: "DE" },
  { code: "+33", flag: "\u{1F1EB}\u{1F1F7}", name: "FR" },
  { code: "+34", flag: "\u{1F1EA}\u{1F1F8}", name: "ES" },
  { code: "+39", flag: "\u{1F1EE}\u{1F1F9}", name: "IT" },
  { code: "+31", flag: "\u{1F1F3}\u{1F1F1}", name: "NL" },
  { code: "+41", flag: "\u{1F1E8}\u{1F1ED}", name: "CH" },
  { code: "+43", flag: "\u{1F1E6}\u{1F1F9}", name: "AT" },
  { code: "+46", flag: "\u{1F1F8}\u{1F1EA}", name: "SE" },
  { code: "+47", flag: "\u{1F1F3}\u{1F1F4}", name: "NO" },
  { code: "+45", flag: "\u{1F1E9}\u{1F1F0}", name: "DK" },
  { code: "+358", flag: "\u{1F1EB}\u{1F1EE}", name: "FI" },
  { code: "+48", flag: "\u{1F1F5}\u{1F1F1}", name: "PL" },
  { code: "+351", flag: "\u{1F1F5}\u{1F1F9}", name: "PT" },
  { code: "+353", flag: "\u{1F1EE}\u{1F1EA}", name: "IE" },
  { code: "+32", flag: "\u{1F1E7}\u{1F1EA}", name: "BE" },
  { code: "+61", flag: "\u{1F1E6}\u{1F1FA}", name: "AU" },
  { code: "+64", flag: "\u{1F1F3}\u{1F1FF}", name: "NZ" },
  { code: "+81", flag: "\u{1F1EF}\u{1F1F5}", name: "JP" },
  { code: "+82", flag: "\u{1F1F0}\u{1F1F7}", name: "KR" },
  { code: "+86", flag: "\u{1F1E8}\u{1F1F3}", name: "CN" },
  { code: "+91", flag: "\u{1F1EE}\u{1F1F3}", name: "IN" },
  { code: "+55", flag: "\u{1F1E7}\u{1F1F7}", name: "BR" },
  { code: "+52", flag: "\u{1F1F2}\u{1F1FD}", name: "MX" },
  { code: "+27", flag: "\u{1F1FF}\u{1F1E6}", name: "ZA" },
  { code: "+234", flag: "\u{1F1F3}\u{1F1EC}", name: "NG" },
  { code: "+254", flag: "\u{1F1F0}\u{1F1EA}", name: "KE" },
  { code: "+233", flag: "\u{1F1EC}\u{1F1ED}", name: "GH" },
  { code: "+971", flag: "\u{1F1E6}\u{1F1EA}", name: "AE" },
  { code: "+966", flag: "\u{1F1F8}\u{1F1E6}", name: "SA" },
  { code: "+972", flag: "\u{1F1EE}\u{1F1F1}", name: "IL" },
  { code: "+90", flag: "\u{1F1F9}\u{1F1F7}", name: "TR" },
  { code: "+7", flag: "\u{1F1F7}\u{1F1FA}", name: "RU" },
  { code: "+380", flag: "\u{1F1FA}\u{1F1E6}", name: "UA" },
  { code: "+65", flag: "\u{1F1F8}\u{1F1EC}", name: "SG" },
  { code: "+66", flag: "\u{1F1F9}\u{1F1ED}", name: "TH" },
  { code: "+63", flag: "\u{1F1F5}\u{1F1ED}", name: "PH" },
  { code: "+62", flag: "\u{1F1EE}\u{1F1E9}", name: "ID" },
  { code: "+60", flag: "\u{1F1F2}\u{1F1FE}", name: "MY" },
  { code: "+84", flag: "\u{1F1FB}\u{1F1F3}", name: "VN" },
  { code: "+20", flag: "\u{1F1EA}\u{1F1EC}", name: "EG" },
  { code: "+212", flag: "\u{1F1F2}\u{1F1E6}", name: "MA" },
  { code: "+56", flag: "\u{1F1E8}\u{1F1F1}", name: "CL" },
  { code: "+57", flag: "\u{1F1E8}\u{1F1F4}", name: "CO" },
  { code: "+54", flag: "\u{1F1E6}\u{1F1F7}", name: "AR" },
  { code: "+51", flag: "\u{1F1F5}\u{1F1EA}", name: "PE" },
];

function getGmtOffset(tz: string): string {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "shortOffset",
    });
    const parts = formatter.formatToParts(now);
    const offsetPart = parts.find((p) => p.type === "timeZoneName");
    return offsetPart?.value || "";
  } catch {
    return "";
  }
}

export default function OnboardPage() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [clientName, setClientName] = useState("");
  const [telegramLink, setTelegramLink] = useState<string | null>(null);
  const [telegramQR, setTelegramQR] = useState<string | null>(null);

  // Form state
  const [contacts, setContacts] = useState<Contact[]>([
    { name: "", role: "", email: "", countryCode: "+1", phone: "", isPrimary: true },
  ]);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>([
    { platform: "", url: "" },
  ]);
  const [timezone, setTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone
  );
  const [company, setCompany] = useState("");
  const [companyWebsite, setCompanyWebsite] = useState("");
  const [source, setSource] = useState("");
  const [industry, setIndustry] = useState("");
  const [sourceOpen, setSourceOpen] = useState(false);
  const [industryOpen, setIndustryOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [brandGuidelines, setBrandGuidelines] = useState("");

  const timezoneOptions = useMemo(() => {
    try {
      return Intl.supportedValuesOf("timeZone").map((tz) => ({
        value: tz,
        label: `${tz.replace(/_/g, " ")} (${getGmtOffset(tz)})`,
      }));
    } catch {
      return [];
    }
  }, []);

  useEffect(() => {
    async function fetchClient() {
      try {
        const res = await fetch(`/api/onboard/${token}`);
        const data = await res.json();
        if (data.success) {
          setClientName(data.data.name);
          if (data.data.telegramLink) {
            setTelegramLink(data.data.telegramLink);
            QRCode.toDataURL(data.data.telegramLink, {
              width: 200,
              margin: 2,
              color: { dark: "#FFFFFF", light: "#00000000" },
            }).then(setTelegramQR).catch(() => {});
          }
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
    setError(null);

    const validContacts = contacts.filter((c) => c.name.trim());
    const validCredentials = credentials.filter(
      (c) => c.platform.trim() && c.username.trim() && c.password.trim()
    );
    const validSocialLinks = socialLinks.filter(
      (s) => s.platform.trim() && s.url.trim()
    );

    // Combine country code + phone for submission
    const contactsPayload = validContacts.map((c) => ({
      name: c.name,
      role: c.role,
      email: c.email,
      phone: c.phone ? `${c.countryCode} ${c.phone}` : "",
      isPrimary: c.isPrimary,
    }));

    try {
      const res = await fetch(`/api/onboard/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contacts: contactsPayload.length > 0 ? contactsPayload : undefined,
          credentials:
            validCredentials.length > 0 ? validCredentials : undefined,
          socialLinks:
            validSocialLinks.length > 0 ? validSocialLinks : undefined,
          timezone: timezone || undefined,
          company: company.trim() || undefined,
          companyWebsite: companyWebsite.trim() ? `https://www.${companyWebsite.trim()}` : undefined,
          source: source.trim() || undefined,
          industry: industry.trim() || undefined,
          notes: notes.trim() || undefined,
          brandGuidelines: brandGuidelines.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSubmitted(true);
      } else {
        const debugInfo = data.debug ? ` (${data.debug})` : "";
        setError((data.error || "Something went wrong") + debugInfo);
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
      { name: "", role: "", email: "", countryCode: "+1", phone: "", isPrimary: false },
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
              href="mailto:chase@blokblokstudio.com"
              className="text-bb-orange hover:underline"
            >
              chase@blokblokstudio.com
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
                <div>
                  <label className={labelClass}>Email *</label>
                  <input
                    type="email"
                    value={contact.email}
                    onChange={(e) => updateContact(i, "email", e.target.value)}
                    required
                    className={inputClass}
                    placeholder="email@example.com"
                  />
                </div>
                <div>
                  <label className={labelClass}>Phone *</label>
                  <div className="flex gap-2">
                    <div className="relative">
                      <select
                        value={contact.countryCode}
                        onChange={(e) => updateContact(i, "countryCode", e.target.value)}
                        className="appearance-none pl-3 pr-8 py-2.5 bg-bb-black border border-bb-border rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-bb-orange/50 focus:border-bb-orange transition-colors min-w-[100px]"
                      >
                        {COUNTRY_CODES.map((c, idx) => (
                          <option key={`${c.code}-${c.name}-${idx}`} value={c.code}>
                            {c.flag} {c.name} ({c.code})
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-bb-dim pointer-events-none" />
                    </div>
                    <input
                      type="tel"
                      value={contact.phone}
                      onChange={(e) => updateContact(i, "phone", e.target.value)}
                      required
                      className={`${inputClass} flex-1`}
                      placeholder="234 567 8900"
                    />
                  </div>
                </div>
              </div>
            ))}
          </section>

          {/* Company Info */}
          <section className="bg-bb-surface border border-bb-border rounded-xl p-4 sm:p-6 space-y-4">
            <h2 className="text-lg font-display font-semibold text-white">
              Company Info
            </h2>
            <p className="text-xs text-bb-dim">
              If applicable, share your company details.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Company Name</label>
                <input
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  className={inputClass}
                  placeholder="Acme Inc."
                />
              </div>
              <div>
                <label className={labelClass}>Company Website</label>
                <div className="flex">
                  <span className="inline-flex items-center px-3 bg-bb-black border border-r-0 border-bb-border rounded-l-lg text-bb-dim text-sm">
                    https://www.
                  </span>
                  <input
                    type="text"
                    value={companyWebsite}
                    onChange={(e) => setCompanyWebsite(e.target.value)}
                    className={`${inputClass} rounded-l-none`}
                    placeholder="example.com"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="relative">
                <label className={labelClass}>How did you hear about us?</label>
                <input
                  type="text"
                  value={source}
                  onChange={(e) => { setSource(e.target.value); setSourceOpen(true); }}
                  onFocus={() => setSourceOpen(true)}
                  onBlur={() => setTimeout(() => setSourceOpen(false), 150)}
                  className={inputClass}
                  placeholder="Select or type..."
                />
                {sourceOpen && (() => {
                  const filtered = source
                    ? SOURCE_OPTIONS.filter((o) => o.toLowerCase().includes(source.toLowerCase()))
                    : SOURCE_OPTIONS;
                  return filtered.length > 0 ? (
                    <ul className="absolute z-50 w-full mt-1 max-h-48 overflow-y-auto bg-bb-black border border-bb-border rounded-lg shadow-lg">
                      {filtered.map((opt) => (
                        <li
                          key={opt}
                          onMouseDown={() => { setSource(opt); setSourceOpen(false); }}
                          className="px-3 py-2 text-sm text-white hover:bg-bb-orange/20 cursor-pointer"
                        >
                          {opt}
                        </li>
                      ))}
                    </ul>
                  ) : null;
                })()}
              </div>
              <div className="relative">
                <label className={labelClass}>Industry</label>
                <input
                  type="text"
                  value={industry}
                  onChange={(e) => { setIndustry(e.target.value); setIndustryOpen(true); }}
                  onFocus={() => setIndustryOpen(true)}
                  onBlur={() => setTimeout(() => setIndustryOpen(false), 150)}
                  className={inputClass}
                  placeholder="Select or type..."
                />
                {industryOpen && (() => {
                  const filtered = industry
                    ? INDUSTRY_OPTIONS.filter((o) => o.toLowerCase().includes(industry.toLowerCase()))
                    : INDUSTRY_OPTIONS;
                  return filtered.length > 0 ? (
                    <ul className="absolute z-50 w-full mt-1 max-h-48 overflow-y-auto bg-bb-black border border-bb-border rounded-lg shadow-lg">
                      {filtered.map((opt) => (
                        <li
                          key={opt}
                          onMouseDown={() => { setIndustry(opt); setIndustryOpen(false); }}
                          className="px-3 py-2 text-sm text-white hover:bg-bb-orange/20 cursor-pointer"
                        >
                          {opt}
                        </li>
                      ))}
                    </ul>
                  ) : null;
                })()}
              </div>
            </div>
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
                    <label className={labelClass}>Username / Email *</label>
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

          {/* Telegram Setup */}
          {telegramLink && (
            <section className="bg-bb-surface border border-bb-border rounded-xl p-4 sm:p-6 space-y-4">
              <div className="flex items-center gap-2">
                <MessageCircle size={20} className="text-[#29B6F6]" />
                <h2 className="text-lg font-display font-semibold text-white">
                  Connect Telegram
                </h2>
              </div>
              <p className="text-xs text-bb-dim">
                Get instant updates and direct support through Telegram. Take your
                time — this link won&apos;t expire while you download and set up
                the app.
              </p>

              {/* Step 1: Download */}
              <div className="bg-bb-black border border-bb-border rounded-lg p-4 space-y-3">
                <p className="text-sm text-white font-medium">
                  Step 1: Download Telegram
                </p>
                <p className="text-xs text-bb-dim">
                  If you don&apos;t have Telegram yet, download it first:
                </p>
                <div className="flex flex-wrap gap-2">
                  <a
                    href="https://apps.apple.com/app/telegram-messenger/id686449807"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-bb-surface border border-bb-border rounded-lg text-xs text-white hover:border-bb-dim transition-colors"
                  >
                    App Store (iPhone)
                  </a>
                  <a
                    href="https://play.google.com/store/apps/details?id=org.telegram.messenger"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-bb-surface border border-bb-border rounded-lg text-xs text-white hover:border-bb-dim transition-colors"
                  >
                    Google Play (Android)
                  </a>
                  <a
                    href="https://desktop.telegram.org/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-bb-surface border border-bb-border rounded-lg text-xs text-white hover:border-bb-dim transition-colors"
                  >
                    Desktop App
                  </a>
                </div>
                <p className="text-[10px] text-bb-dim">
                  Already have Telegram? Skip to Step 2.
                </p>
              </div>

              {/* Step 2: Connect */}
              <div className="bg-bb-black border border-bb-border rounded-lg p-4 space-y-3">
                <p className="text-sm text-white font-medium">
                  Step 2: Connect your account
                </p>
                <div className="flex flex-col sm:flex-row items-center gap-6">
                  {telegramQR && (
                    <div className="border border-bb-border rounded-xl p-3 flex-shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={telegramQR}
                        alt="Scan to connect Telegram"
                        width={140}
                        height={140}
                        className="rounded"
                      />
                    </div>
                  )}
                  <div className="flex flex-col items-center sm:items-start gap-3 text-center sm:text-left">
                    <div className="space-y-1">
                      <p className="text-xs text-bb-muted font-medium">
                        Scan the QR code with your phone camera
                      </p>
                      <p className="text-xs text-bb-dim">
                        Or tap the button below to open directly in Telegram and
                        press &quot;Start&quot; to connect.
                      </p>
                    </div>
                    <a
                      href={telegramLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#29B6F6] hover:bg-[#039BE5] text-white font-medium rounded-lg transition-colors text-sm"
                    >
                      <MessageCircle size={16} />
                      Open in Telegram
                    </a>
                  </div>
                </div>
              </div>

              <p className="text-[10px] text-bb-dim text-center">
                Optional — you can always connect later
              </p>
            </section>
          )}

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
                {timezoneOptions.map((tz) => (
                  <option key={tz.value} value={tz.value}>
                    {tz.label}
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
