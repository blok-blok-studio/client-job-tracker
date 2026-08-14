"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import { Check, Loader2, Shield, Pen, Type, Download, FileText } from "lucide-react";
import SignatureCanvas from "@/components/shared/SignatureCanvas";

interface AgreementData {
  contractorName: string;
  company: string | null;
  title: string;
  kind: string;
  contractBody: string;
  status: string;
  signedName: string | null;
  signatureData: string | null;
  signedAt: string | null;
  providerSignedName: string | null;
  providerSignatureData: string | null;
  providerSignedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

function AgreementRenderer({ body }: { body: string }) {
  const lines = body.split("\n");

  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        const trimmed = line.trim();

        if (!trimmed) return <div key={i} className="h-2" />;

        // Document title — the first all-caps line of the document
        if (i < 3 && /^[A-Z][A-Z\s-]{6,60}$/.test(trimmed)) {
          return (
            <h2 key={i} className="text-xl sm:text-2xl font-display font-bold text-white text-center pt-2 pb-4">
              {trimmed}
            </h2>
          );
        }

        // Section headings
        if (/^SECTION \d+\./.test(trimmed) || trimmed === "ACKNOWLEDGMENT AND ACCEPTANCE") {
          return (
            <h3
              key={i}
              className="text-base font-display font-semibold text-white pt-8 pb-2 border-t border-bb-border/30 mt-6"
            >
              {trimmed}
            </h3>
          );
        }

        // Fill-in-by-hand signature placeholders — the captured signatures below
        // are the real ones, so keep them quiet
        if (/^(PROVIDER|CONTRACTOR|CLIENT):$/.test(trimmed)) {
          return (
            <p key={i} className="text-xs font-medium text-bb-dim uppercase tracking-wide pt-3">
              {trimmed.replace(":", "")}
            </p>
          );
        }
        if (/^(Name|Date|Signature):\s*_{3,}/.test(trimmed)) {
          return (
            <p key={i} className="text-xs text-bb-dim/70">
              {trimmed}
            </p>
          );
        }

        // Bulleted items
        if (/^[-•]\s+/.test(trimmed)) {
          return (
            <p key={i} className="text-sm text-bb-muted leading-relaxed pl-5 relative">
              <span className="absolute left-0 text-bb-orange">•</span>
              {trimmed.replace(/^[-•]\s+/, "")}
            </p>
          );
        }

        return (
          <p key={i} className="text-sm text-bb-muted leading-relaxed">
            {trimmed}
          </p>
        );
      })}
    </div>
  );
}

export default function AgreementSignPage() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [agreement, setAgreement] = useState<AgreementData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signedName, setSignedName] = useState("");
  const [signatureMode, setSignatureMode] = useState<"type" | "draw">("type");
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [signed, setSigned] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/agreement/${token}`);
        const data = await res.json();
        if (data.success) {
          setAgreement(data.data);
          if (data.data.status === "SIGNED") setSigned(true);
        } else {
          setError(data.error || "Invalid link");
        }
      } catch {
        setError("Unable to load this agreement");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [token]);

  async function handleSign(e: React.FormEvent) {
    e.preventDefault();
    if (!agreed || !signedName.trim()) return;
    if (signatureMode === "draw" && !signatureData) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/agreement/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signedName: signedName.trim(),
          signatureData: signatureMode === "draw" ? signatureData : undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSigned(true);
      } else {
        setError(data.error || "Failed to sign");
      }
    } catch {
      setError("Failed to submit. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass =
    "w-full px-3 py-2.5 bg-bb-black border border-bb-border rounded-lg text-white placeholder:text-bb-dim focus:outline-none focus:ring-2 focus:ring-bb-orange/50 focus:border-bb-orange text-sm transition-colors";

  if (loading) {
    return (
      <div className="min-h-screen bg-bb-black flex items-center justify-center">
        <Loader2 className="animate-spin text-bb-orange" size={32} />
      </div>
    );
  }

  if (error && !agreement) {
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
          <h1 className="text-xl font-display font-semibold text-white">Agreement Unavailable</h1>
          <p className="text-bb-muted text-sm">{error}</p>
          <p className="text-bb-dim text-xs">
            If you think this is a mistake, email{" "}
            <a href="mailto:chase@blokblokstudio.com" className="text-bb-orange hover:underline">
              chase@blokblokstudio.com
            </a>
          </p>
        </div>
      </div>
    );
  }

  if (!agreement) return null;

  if (signed) {
    return (
      <div className="min-h-screen bg-bb-black">
        <div className="max-w-3xl mx-auto px-4 py-8 sm:py-12">
          <div className="text-center mb-8">
            <Image
              src="/bb_logo_wordmark_subhead_WHT_PNG.png"
              alt="Blok Blok Studio"
              width={200}
              height={67}
              className="mx-auto mb-6"
            />
            <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4">
              <Check className="text-green-400" size={32} />
            </div>
            <h1 className="text-2xl font-display font-semibold text-white">Signed</h1>
            <p className="text-bb-muted mt-2">
              Thanks, {agreement.contractorName.split(" ")[0]} — both signatures are on file.
              {agreement.kind === "IC_AGREEMENT" && " You can now submit invoices from your portal."}
            </p>
            <a
              href={`/api/agreement/${token}/pdf`}
              className="inline-flex items-center gap-2 mt-4 px-6 py-2.5 bg-bb-orange hover:bg-bb-orange-light text-white font-semibold rounded-lg transition-colors text-sm"
            >
              <Download size={16} />
              Download PDF
            </a>
          </div>

          <div className="bg-bb-surface border border-bb-border rounded-xl p-6 sm:p-10 mb-8">
            <AgreementRenderer body={agreement.contractBody} />
          </div>

          <div className="bg-bb-surface border border-bb-border rounded-xl p-6 space-y-6">
            <p className="text-xs font-medium text-bb-dim uppercase tracking-wide">Signatures</p>
            {agreement.providerSignedName && (
              <div className="space-y-2 pb-4 border-b border-bb-border/50">
                <p className="text-xs font-medium text-bb-dim uppercase tracking-wide">
                  Blok Blok Studio
                </p>
                {agreement.providerSignatureData && (
                  <div className="p-3 bg-bb-black rounded-lg border border-bb-border">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={agreement.providerSignatureData}
                      alt="Provider signature"
                      className="h-16 object-contain"
                    />
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-bb-dim">Signed by</span>
                  <span className="text-white">{agreement.providerSignedName}</span>
                </div>
                {agreement.providerSignedAt && (
                  <div className="flex justify-between text-sm">
                    <span className="text-bb-dim">Date</span>
                    <span className="text-white">
                      {new Date(agreement.providerSignedAt).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                )}
              </div>
            )}
            <div className="space-y-2">
              <p className="text-xs font-medium text-bb-dim uppercase tracking-wide">You</p>
              {(agreement.signatureData || signatureData) && (
                <div className="p-3 bg-bb-black rounded-lg border border-bb-border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={agreement.signatureData || signatureData || ""}
                    alt="Contractor signature"
                    className="h-16 object-contain"
                  />
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-bb-dim">Signed by</span>
                <span className="text-white">{agreement.signedName || signedName}</span>
              </div>
              {agreement.signedAt && (
                <div className="flex justify-between text-sm">
                  <span className="text-bb-dim">Date</span>
                  <span className="text-white">
                    {new Date(agreement.signedAt).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bb-black">
      <div className="max-w-3xl mx-auto px-4 py-8 sm:py-12">
        <div className="text-center mb-8">
          <Image
            src="/bb_logo_wordmark_subhead_WHT_PNG.png"
            alt="Blok Blok Studio"
            width={200}
            height={67}
            className="mx-auto mb-8"
          />
          <p className="text-bb-muted mt-2 text-sm sm:text-base">
            {agreement.contractorName.split(" ")[0]}, here&apos;s your {agreement.title.toLowerCase()} — have a
            read and sign at the bottom.
          </p>
          {agreement.expiresAt && (
            <p className="text-bb-dim text-xs mt-2">
              This link is open until{" "}
              {new Date(agreement.expiresAt).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
              .
            </p>
          )}
        </div>

        <div className="bg-bb-surface border border-bb-border rounded-xl p-6 sm:p-10 mb-8">
          <AgreementRenderer body={agreement.contractBody} />
        </div>

        {agreement.providerSignedName && (
          <div className="bg-bb-surface border border-bb-border rounded-xl p-6 mb-8 space-y-3">
            <p className="text-xs font-medium text-bb-dim uppercase tracking-wide">
              Already signed by Blok Blok Studio
            </p>
            <div className="p-4 bg-bb-black rounded-lg border border-bb-border">
              {agreement.providerSignatureData ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={agreement.providerSignatureData}
                  alt="Provider signature"
                  className="h-16 object-contain"
                />
              ) : (
                <p className="text-3xl font-serif italic text-white">{agreement.providerSignedName}</p>
              )}
            </div>
            <div className="flex gap-6 text-sm flex-wrap">
              <div>
                <span className="text-bb-dim">Signed by </span>
                <span className="text-white">{agreement.providerSignedName}</span>
              </div>
              {agreement.providerSignedAt && (
                <div>
                  <span className="text-bb-dim">on </span>
                  <span className="text-white">
                    {new Date(agreement.providerSignedAt).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        <form onSubmit={handleSign} className="space-y-6">
          <div className="bg-bb-surface border border-bb-orange/30 rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Shield size={18} className="text-bb-orange" />
              <h2 className="text-lg font-display font-semibold text-white">Digital Signature</h2>
            </div>
            <p className="text-xs text-bb-dim">
              By signing below you confirm you have read and agree to this agreement. Your full legal
              name, IP address, and a timestamp are recorded as part of a legally binding electronic
              signature.
            </p>

            <div className="flex gap-1 bg-bb-black rounded-lg p-1 border border-bb-border">
              <button
                type="button"
                onClick={() => setSignatureMode("type")}
                className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                  signatureMode === "type" ? "bg-bb-surface text-white" : "text-bb-dim hover:text-bb-muted"
                }`}
              >
                <Type size={14} /> Type
              </button>
              <button
                type="button"
                onClick={() => setSignatureMode("draw")}
                className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                  signatureMode === "draw" ? "bg-bb-surface text-white" : "text-bb-dim hover:text-bb-muted"
                }`}
              >
                <Pen size={14} /> Draw
              </button>
            </div>

            <div>
              <label className="block text-sm text-bb-muted mb-1.5 font-medium">
                Your full legal name *
              </label>
              <input
                type="text"
                value={signedName}
                onChange={(e) => setSignedName(e.target.value)}
                className={inputClass}
                placeholder="e.g. Jane Doe"
                required
              />
            </div>

            {signatureMode === "type" ? (
              signedName && (
                <div className="p-4 bg-bb-black rounded-lg border border-bb-border">
                  <p className="text-xs text-bb-dim mb-1">Signature preview</p>
                  <p className="text-3xl font-serif italic text-white">{signedName}</p>
                </div>
              )
            ) : (
              <div>
                <label className="block text-sm text-bb-muted mb-1.5 font-medium">
                  Draw your signature *
                </label>
                <SignatureCanvas onSignatureChange={setSignatureData} />
              </div>
            )}

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded border-bb-border bg-bb-black accent-bb-orange"
              />
              <span className="text-sm text-bb-muted">
                I have read and agree to this agreement, and I am signing it on my own behalf (or with
                authority for the company named). I understand this is a legally binding electronic
                signature and that my name, IP address, timestamp, and browser details are recorded.
              </span>
            </label>
          </div>

          {error && <p className="text-red-400 text-sm text-center">{error}</p>}

          <button
            type="submit"
            disabled={
              submitting || !agreed || !signedName.trim() || (signatureMode === "draw" && !signatureData)
            }
            className="w-full py-3 bg-bb-orange hover:bg-bb-orange-light text-white font-semibold rounded-xl transition-colors disabled:opacity-50 text-sm sm:text-base"
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="animate-spin" size={18} />
                Signing...
              </span>
            ) : (
              "Sign Agreement"
            )}
          </button>

          <a
            href={`/api/agreement/${token}/pdf`}
            className="flex items-center justify-center gap-2 text-xs text-bb-dim hover:text-bb-muted transition-colors"
          >
            <FileText size={12} /> Prefer to read it as a PDF?
          </a>

          <p className="text-center text-xs text-bb-dim pb-4">
            Your signature, IP address, and timestamp are securely recorded for legal verification.
          </p>
        </form>
      </div>
    </div>
  );
}
