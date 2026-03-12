"use client";

import { X } from "lucide-react";

export default function PaymentCancelledPage() {
  return (
    <div className="min-h-screen bg-bb-black flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="mx-auto w-16 h-16 bg-red-500/10 border-2 border-red-500/50 rounded-full flex items-center justify-center">
          <X size={32} className="text-red-400" />
        </div>
        <div>
          <h1 className="text-2xl font-display font-bold text-white">
            Payment Cancelled
          </h1>
          <p className="text-bb-muted mt-2">
            No worries — nothing has been charged. If you have any questions, feel free to reach out.
          </p>
        </div>
        <p className="text-xs text-bb-dim">
          You can close this page.
        </p>
      </div>
    </div>
  );
}
