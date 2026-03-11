"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
}

export default function Modal({ open, onClose, title, children, className }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      dialog.showModal();
    } else {
      dialog.close();
    }
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="fixed inset-0 z-50 bg-transparent p-0 m-0 max-w-none max-h-none w-full h-full backdrop:bg-black/60"
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose();
      }}
    >
      <div className="flex items-end sm:items-center justify-center min-h-full sm:p-4">
        <div
          className={cn(
            "bg-bb-surface border border-bb-border rounded-t-xl sm:rounded-xl shadow-modal w-full max-w-lg max-h-[90vh] sm:max-h-[85vh] overflow-y-auto",
            className
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-bb-border sticky top-0 bg-bb-surface rounded-t-xl">
            <h2 className="text-lg font-display font-semibold text-white">{title}</h2>
            <button
              onClick={onClose}
              className="p-1.5 rounded-md hover:bg-bb-elevated text-bb-muted hover:text-white transition-colors"
            >
              <X size={18} />
            </button>
          </div>
          <div className="p-4 sm:p-6">{children}</div>
        </div>
      </div>
    </dialog>
  );
}
