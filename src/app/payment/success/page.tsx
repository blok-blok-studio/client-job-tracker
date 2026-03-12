"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Check } from "lucide-react";

function SuccessContent() {
  const searchParams = useSearchParams();
  const name = searchParams.get("name") || "there";

  return (
    <div className="min-h-screen bg-bb-black flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="mx-auto w-16 h-16 bg-green-500/10 border-2 border-green-500 rounded-full flex items-center justify-center">
          <Check size={32} className="text-green-400" />
        </div>
        <div>
          <h1 className="text-2xl font-display font-bold text-white">
            Thank you, {name}!
          </h1>
          <p className="text-bb-muted mt-2">
            Your payment has been received. We&apos;ll be in touch shortly to get started on your project.
          </p>
        </div>
        <p className="text-xs text-bb-dim">
          You can close this page. A receipt has been sent to your email.
        </p>
      </div>
    </div>
  );
}

export default function PaymentSuccessPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-bb-black flex items-center justify-center">
        <p className="text-bb-dim">Loading...</p>
      </div>
    }>
      <SuccessContent />
    </Suspense>
  );
}
