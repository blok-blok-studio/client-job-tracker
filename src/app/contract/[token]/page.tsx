"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import { Check, Loader2, FileText, Shield } from "lucide-react";

interface ContractData {
  clientName: string;
  company: string | null;
  contractBody: string;
  status: string;
  signedName: string | null;
  signedAt: string | null;
  createdAt: string;
}

export default function ContractSignPage() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [contract, setContract] = useState<ContractData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signedName, setSignedName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [signed, setSigned] = useState(false);

  useEffect(() => {
    async function fetchContract() {
      try {
        const res = await fetch(`/api/contract/${token}`);
        const data = await res.json();
        if (data.success) {
          setContract(data.data);
          if (data.data.status === "SIGNED") {
            setSigned(true);
          }
        } else {
          setError(data.error || "Invalid contract link");
        }
      } catch {
        setError("Unable to load contract");
      } finally {
        setLoading(false);
      }
    }
    fetchContract();
  }, [token]);

  async function handleSign(e: React.FormEvent) {
    e.preventDefault();
    if (!agreed || !signedName.trim()) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/contract/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signedName: signedName.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setSigned(true);
      } else {
        setError(data.error || "Failed to sign contract");
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

  if (error && !contract) {
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
            Contract Unavailable
          </h1>
          <p className="text-bb-muted text-sm">{error}</p>
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

  if (signed) {
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
            Contract Signed
          </h1>
          <p className="text-bb-muted">
            Thank you, {contract?.clientName?.split(" ")[0]}! Your agreement has been recorded.
            We&apos;ll be in touch to get started.
          </p>
          {contract?.signedAt && (
            <div className="bg-bb-surface border border-bb-border rounded-lg p-4 text-left space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-bb-dim">Signed by</span>
                <span className="text-white">{contract.signedName || signedName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-bb-dim">Date</span>
                <span className="text-white">
                  {new Date(contract.signedAt).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!contract) return null;

  return (
    <div className="min-h-screen bg-bb-black">
      <div className="max-w-3xl mx-auto px-4 py-8 sm:py-12">
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
            Service Agreement
          </h1>
          <p className="text-bb-muted mt-2 text-sm sm:text-base">
            Please review and sign the agreement below, {contract.clientName.split(" ")[0]}.
          </p>
        </div>

        {/* Contract Body */}
        <div className="bg-bb-surface border border-bb-border rounded-xl p-6 sm:p-8 mb-8">
          <div className="flex items-center gap-2 mb-6 pb-4 border-b border-bb-border">
            <FileText size={20} className="text-bb-orange" />
            <h2 className="text-lg font-display font-semibold text-white">Agreement Terms</h2>
          </div>
          <pre className="whitespace-pre-wrap text-sm text-bb-muted font-sans leading-relaxed">
            {contract.contractBody}
          </pre>
        </div>

        {/* Signing Section */}
        <form onSubmit={handleSign} className="space-y-6">
          <div className="bg-bb-surface border border-bb-orange/30 rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Shield size={18} className="text-bb-orange" />
              <h2 className="text-lg font-display font-semibold text-white">
                Digital Signature
              </h2>
            </div>
            <p className="text-xs text-bb-dim">
              By signing below, you acknowledge that you have read, understood, and agree to the
              terms outlined in this Service Agreement. Your full legal name, IP address, and
              timestamp will be recorded.
            </p>

            <div>
              <label className="block text-sm text-bb-muted mb-1.5 font-medium">
                Type your full legal name *
              </label>
              <input
                type="text"
                value={signedName}
                onChange={(e) => setSignedName(e.target.value)}
                className={inputClass}
                placeholder="e.g. John Smith"
                required
              />
              {signedName && (
                <p className="mt-2 text-2xl font-serif italic text-white">
                  {signedName}
                </p>
              )}
            </div>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded border-bb-border bg-bb-black accent-bb-orange"
              />
              <span className="text-sm text-bb-muted">
                I have read and agree to the terms of this Service Agreement. I understand
                that this constitutes a legally binding digital signature.
              </span>
            </label>
          </div>

          {error && (
            <p className="text-red-400 text-sm text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting || !agreed || !signedName.trim()}
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

          <p className="text-center text-xs text-bb-dim pb-4">
            Your signature, IP address, and timestamp are securely recorded for legal verification.
          </p>
        </form>
      </div>
    </div>
  );
}
