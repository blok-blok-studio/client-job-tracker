"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import { Check, Loader2, Shield, Pen, Type, RotateCcw } from "lucide-react";

interface ContractData {
  clientName: string;
  company: string | null;
  contractBody: string;
  status: string;
  signedName: string | null;
  signatureData: string | null;
  signedAt: string | null;
  providerSignedName: string | null;
  providerSignedAt: string | null;
  createdAt: string;
}

function SignatureCanvas({ onSignatureChange }: { onSignatureChange: (data: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  const getPos = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ("touches" in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }, []);

  const startDraw = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  }, [getPos]);

  const draw = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    if (!isDrawing) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasDrawn(true);
  }, [isDrawing, getPos]);

  const endDraw = useCallback(() => {
    setIsDrawing(false);
    if (hasDrawn && canvasRef.current) {
      onSignatureChange(canvasRef.current.toDataURL("image/png"));
    }
  }, [hasDrawn, onSignatureChange]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    setHasDrawn(false);
    onSignatureChange(null);
  };

  return (
    <div className="space-y-2">
      <div className="relative bg-bb-black rounded-lg border border-bb-border overflow-hidden">
        <canvas
          ref={canvasRef}
          width={600}
          height={200}
          className="w-full h-[150px] cursor-crosshair touch-none"
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        />
        {!hasDrawn && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-bb-dim text-sm">Sign here with your finger or mouse</p>
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={clear}
        className="flex items-center gap-1.5 text-xs text-bb-dim hover:text-bb-muted transition-colors"
      >
        <RotateCcw size={12} /> Clear
      </button>
    </div>
  );
}

function ContractRenderer({ body }: { body: string }) {
  // Handle legacy JSON contract bodies from auto-generation
  // Try to parse as JSON — if it is, show a placeholder notice
  try {
    const parsed = JSON.parse(body);
    if (parsed && typeof parsed === "object") {
      return (
        <div className="space-y-4 text-center py-8">
          <h2 className="text-2xl font-display font-bold text-white">SERVICE AGREEMENT</h2>
          <p className="text-sm text-bb-muted leading-relaxed max-w-lg mx-auto">
            This Service Agreement is between <span className="text-white font-medium">Blok Blok Studio</span> (&quot;Provider&quot;) and <span className="text-white font-medium">{parsed.clientName || "Client"}</span> (&quot;Client&quot;).
          </p>
          <div className="bg-bb-orange/10 border border-bb-orange/30 rounded-lg p-4 mt-4">
            <p className="text-sm text-bb-orange">
              A detailed contract is being prepared. You will receive an updated link once the full agreement is ready for review.
            </p>
          </div>
        </div>
      );
    }
  } catch {
    // Not JSON — proceed with normal text rendering
  }

  const lines = body.split("\n");

  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        const trimmed = line.trim();

        // Main title
        if (trimmed === "SERVICE AGREEMENT") {
          return (
            <h2 key={i} className="text-2xl font-display font-bold text-white text-center pt-2 pb-4">
              {trimmed}
            </h2>
          );
        }

        // Section headers (SECTION 1. ...)
        if (/^SECTION \d+\./.test(trimmed)) {
          return (
            <h3 key={i} className="text-base font-display font-semibold text-white pt-8 pb-2 border-t border-bb-border/30 mt-6">
              {trimmed}
            </h3>
          );
        }

        // ACKNOWLEDGMENT header
        if (trimmed === "ACKNOWLEDGMENT AND ACCEPTANCE") {
          return (
            <h3 key={i} className="text-base font-display font-semibold text-white pt-8 pb-2 border-t border-bb-border/30 mt-6">
              {trimmed}
            </h3>
          );
        }

        // Sub-headers (e.g. "What is included:", "Estimated timeline:", etc.)
        if (trimmed === "What is included:") {
          return (
            <p key={i} className="text-sm text-bb-muted font-medium pl-8 pt-1">
              {trimmed}
            </p>
          );
        }

        // Lettered items (A. Package Name    $5,000 USD)
        if (/^[A-Z]\.\s/.test(trimmed) && trimmed.includes("$")) {
          const parts = trimmed.match(/^([A-Z]\.\s.+?)\s{2,}\$(.+)$/);
          if (parts) {
            return (
              <div key={i} className="flex items-baseline justify-between pt-4 pb-1 pl-4">
                <span className="text-sm font-semibold text-white">{parts[1]}</span>
                <span className="text-sm font-mono text-bb-orange font-semibold">${parts[2]}</span>
              </div>
            );
          }
        }

        // Total line
        if (trimmed.startsWith("Total") && trimmed.includes("$")) {
          const parts = trimmed.match(/^Total\s{2,}\$(.+)$/);
          if (parts) {
            return (
              <div key={i} className="flex items-baseline justify-between pt-3 pb-1 pl-4 border-t border-bb-border/30 mt-2">
                <span className="text-sm font-bold text-white">Total</span>
                <span className="text-base font-mono text-bb-orange font-bold">${parts[1]}</span>
              </div>
            );
          }
        }

        // Itemized breakdown lines (   Package Name    $X,XXX USD)
        if (/^\s{3}\S/.test(line) && trimmed.includes("$") && trimmed.includes("USD") && !trimmed.startsWith("Total")) {
          const parts = trimmed.match(/^(.+?)\s{2,}\$(.+)$/);
          if (parts) {
            return (
              <div key={i} className="flex items-baseline justify-between pl-6 py-0.5">
                <span className="text-xs text-bb-dim">{parts[1]}</span>
                <span className="text-xs font-mono text-bb-muted">${parts[2]}</span>
              </div>
            );
          }
        }

        // Indented deliverable items
        if (/^\s{8,}/.test(line) && trimmed) {
          return (
            <p key={i} className="text-sm text-bb-dim pl-12 py-0.5">
              {trimmed}
            </p>
          );
        }

        // "Estimated timeline:" and "Post-launch support:" lines
        if (trimmed.startsWith("Estimated timeline:") || trimmed.startsWith("Post-launch support:")) {
          const [label, value] = trimmed.split(": ");
          return (
            <p key={i} className="text-xs text-bb-dim pl-8 py-0.5">
              <span className="text-bb-dim/70">{label}:</span> {value}
            </p>
          );
        }

        // Empty lines
        if (!trimmed) {
          return <div key={i} className="h-2" />;
        }

        // Intro paragraph text (between parties, etc.)
        if (trimmed.startsWith("This Service Agreement") || trimmed.startsWith("This Agreement outlines")) {
          return (
            <p key={i} className="text-sm text-bb-muted leading-relaxed">
              {trimmed}
            </p>
          );
        }

        // Regular paragraph text
        return (
          <p key={i} className="text-sm text-bb-muted leading-relaxed">
            {trimmed}
          </p>
        );
      })}
    </div>
  );
}

export default function ContractSignPage() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [contract, setContract] = useState<ContractData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signedName, setSignedName] = useState("");
  const [signatureMode, setSignatureMode] = useState<"type" | "draw">("type");
  const [signatureData, setSignatureData] = useState<string | null>(null);
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
    if (signatureMode === "draw" && !signatureData) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/contract/${token}`, {
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
          <div className="bg-bb-surface border border-bb-border rounded-lg p-4 text-left space-y-3 text-sm">
            {contract?.providerSignedName && (
              <div className="space-y-2 pb-3 border-b border-bb-border/50">
                <p className="text-xs font-medium text-bb-dim uppercase tracking-wide">Provider</p>
                <div className="flex justify-between">
                  <span className="text-bb-dim">Signed by</span>
                  <span className="text-white">{contract.providerSignedName}</span>
                </div>
                {contract.providerSignedAt && (
                  <div className="flex justify-between">
                    <span className="text-bb-dim">Date</span>
                    <span className="text-white">
                      {new Date(contract.providerSignedAt).toLocaleDateString("en-US", {
                        year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit",
                      })}
                    </span>
                  </div>
                )}
              </div>
            )}
            <div className="space-y-2">
              <p className="text-xs font-medium text-bb-dim uppercase tracking-wide">Client</p>
              {(contract?.signatureData || signatureData) && (
                <div className="p-3 bg-bb-black rounded-lg border border-bb-border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={contract?.signatureData || signatureData || ""}
                    alt="Client signature"
                    className="h-16 object-contain"
                  />
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-bb-dim">Signed by</span>
                <span className="text-white">{contract?.signedName || signedName}</span>
              </div>
              {contract?.signedAt && (
                <div className="flex justify-between">
                  <span className="text-bb-dim">Date</span>
                  <span className="text-white">
                    {new Date(contract.signedAt).toLocaleDateString("en-US", {
                      year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit",
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

  if (!contract) return null;

  return (
    <div className="min-h-screen bg-bb-black">
      <div className="max-w-3xl mx-auto px-4 py-8 sm:py-12">
        {/* Header */}
        <div className="text-center mb-8">
          <Image
            src="/bb_logo_wordmark_subhead_WHT_PNG.png"
            alt="Blok Blok Studio"
            width={200}
            height={67}
            className="mx-auto mb-8"
          />
          <p className="text-bb-muted mt-2 text-sm sm:text-base">
            Please review and sign the agreement below, {contract.clientName.split(" ")[0]}.
          </p>
        </div>

        {/* Contract Body */}
        <div className="bg-bb-surface border border-bb-border rounded-xl p-6 sm:p-10 mb-8">
          <ContractRenderer body={contract.contractBody} />
        </div>

        {/* Provider Signature Block */}
        {contract.providerSignedName && (
          <div className="bg-bb-surface border border-bb-border rounded-xl p-6 mb-8 space-y-3">
            <p className="text-xs font-medium text-bb-dim uppercase tracking-wide">Provider Signature</p>
            <div className="p-4 bg-bb-black rounded-lg border border-bb-border">
              <p className="text-3xl font-serif italic text-white">{contract.providerSignedName}</p>
            </div>
            <div className="flex gap-6 text-sm">
              <div>
                <span className="text-bb-dim">Signed by </span>
                <span className="text-white">{contract.providerSignedName}</span>
              </div>
              {contract.providerSignedAt && (
                <div>
                  <span className="text-bb-dim">on </span>
                  <span className="text-white">
                    {new Date(contract.providerSignedAt).toLocaleDateString("en-US", {
                      year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit",
                    })}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

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
              timestamp will be recorded as part of this legally binding digital signature.
            </p>

            {/* Type / Draw tabs */}
            <div className="flex gap-1 bg-bb-black rounded-lg p-1 border border-bb-border">
              <button
                type="button"
                onClick={() => setSignatureMode("type")}
                className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                  signatureMode === "type"
                    ? "bg-bb-surface text-white"
                    : "text-bb-dim hover:text-bb-muted"
                }`}
              >
                <Type size={14} /> Type
              </button>
              <button
                type="button"
                onClick={() => setSignatureMode("draw")}
                className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                  signatureMode === "draw"
                    ? "bg-bb-surface text-white"
                    : "text-bb-dim hover:text-bb-muted"
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
                placeholder="e.g. John Smith"
                required
              />
            </div>

            {signatureMode === "type" ? (
              signedName && (
                <div className="p-4 bg-bb-black rounded-lg border border-bb-border">
                  <p className="text-xs text-bb-dim mb-1">Signature preview</p>
                  <p className="text-3xl font-serif italic text-white">
                    {signedName}
                  </p>
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
                I have read and agree to the terms of this Service Agreement. I understand
                that this constitutes a legally binding digital signature and that my name,
                IP address, timestamp, and browser information will be recorded for verification purposes.
              </span>
            </label>
          </div>

          {error && (
            <p className="text-red-400 text-sm text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting || !agreed || !signedName.trim() || (signatureMode === "draw" && !signatureData)}
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
