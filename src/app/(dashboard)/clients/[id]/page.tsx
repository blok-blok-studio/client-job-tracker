"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Edit2, Plus, Check, X, Trash2, Copy, Link2, ExternalLink, Clock, FileText, Loader2, CreditCard, Send, ChevronDown, ChevronUp, Upload } from "lucide-react";
import Link from "next/link";
import TopBar from "@/components/layout/TopBar";
import Badge from "@/components/shared/Badge";
import Modal from "@/components/shared/Modal";
import EditClientForm from "@/components/clients/EditClientForm";
import { formatCurrency, formatRelativeDate } from "@/lib/utils";
import { PLATFORM_OPTIONS } from "@/types";
import { getFlagFromPhone, LiveClock } from "@/lib/client-utils";
import { SERVICE_PACKAGES, ADDON_PACKAGES, PACKAGE_CATEGORIES, type PackageCustomization } from "@/lib/contract-templates";

interface ClientDetail {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  type: string;
  tier: string;
  source: string | null;
  industry: string | null;
  notes: string | null;
  monthlyRetainer: string | number | null;
  contractStart: string | null;
  contractEnd: string | null;
  timezone: string | null;
  onboardToken: string | null;
  uploadToken: string | null;
  contacts: Array<{ id: string; name: string; role: string | null; email: string | null; phone: string | null; isPrimary: boolean }>;
  tasks: Array<{ id: string; title: string; status: string; priority: string; dueDate: string | null }>;
  credentials: Array<{ id: string; platform: string; username: string }>;
  checklistItems: Array<{ id: string; label: string; checked: boolean }>;
  invoices: Array<{ id: string; amount: string | number; status: string; createdAt: string }>;
  socialLinks: Array<{ id: string; platform: string; url: string; handle: string | null }>;
  activityLogs: Array<{ id: string; action: string; details: string | null; actor: string; createdAt: string }>;
  contracts: Array<{ id: string; token: string; status: string; signedName: string | null; signedAt: string | null; createdAt: string }>;
  paymentLinks: Array<{ id: string; stripeUrl: string; amount: number; currency: string; description: string; recurring: boolean; interval: string | null; status: string; paidAt: string | null; milestone: string | null; contractId: string | null; createdAt: string }>;
}

const tierVariant: Record<string, "orange" | "gray" | "blue"> = { VIP: "orange", STANDARD: "gray", TRIAL: "blue" };
const typeVariant: Record<string, "green" | "yellow" | "gray" | "red"> = { ACTIVE: "green", PROSPECT: "yellow", PAST: "gray", ARCHIVED: "red" };

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [client, setClient] = useState<ClientDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [newContact, setNewContact] = useState(false);
  const [contactForm, setContactForm] = useState({ name: "", role: "", email: "", phone: "" });
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [newSocial, setNewSocial] = useState(false);
  const [socialForm, setSocialForm] = useState({ platform: "", url: "", handle: "" });
  const [customPlatform, setCustomPlatform] = useState("");
  const [showContractModal, setShowContractModal] = useState(false);
  const [selectedPackages, setSelectedPackages] = useState<string[]>([]);
  const [selectedAddons, setSelectedAddons] = useState<string[]>([]);
  const [customItems, setCustomItems] = useState<{ name: string; price: string; recurring: boolean }[]>([]);
  const [customTerms, setCustomTerms] = useState("");
  const [generatingContract, setGeneratingContract] = useState(false);
  const [contractCopied, setContractCopied] = useState<string | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDescription, setPaymentDescription] = useState("");
  const [paymentSelectedPkgs, setPaymentSelectedPkgs] = useState<string[]>([]);
  const [paymentSelectedAddons, setPaymentSelectedAddons] = useState<string[]>([]);
  const [paymentCurrency, setPaymentCurrency] = useState<"usd" | "eur">("eur");
  const [paymentCountry, setPaymentCountry] = useState<string>("DE");
  const [paymentRecurring, setPaymentRecurring] = useState(false);
  const [paymentInterval, setPaymentInterval] = useState<"month" | "year">("month");
  const [generatingPayment, setGeneratingPayment] = useState(false);
  const [paymentCopied, setPaymentCopied] = useState<string | null>(null);
  const [showUpdatePriceModal, setShowUpdatePriceModal] = useState(false);
  const [updatePriceLink, setUpdatePriceLink] = useState<{ id: string; amount: number; currency: string; description: string; interval: string | null } | null>(null);
  const [updatePriceAmount, setUpdatePriceAmount] = useState("");
  const [updatePriceProrate, setUpdatePriceProrate] = useState(true);
  const [updatingPrice, setUpdatingPrice] = useState(false);
  // Package customizations (price overrides + deliverable toggling)
  const [contractCustomizations, setContractCustomizations] = useState<Record<string, PackageCustomization>>({});
  const [contractExpandedPkgs, setContractExpandedPkgs] = useState<string[]>([]);
  const [paymentCustomizations, setPaymentCustomizations] = useState<Record<string, PackageCustomization>>({});
  const [paymentExpandedPkgs, setPaymentExpandedPkgs] = useState<string[]>([]);
  const [providerSignedName, setProviderSignedName] = useState("Chase Haynes");
  const [contractCountry, setContractCountry] = useState("DE");
  const [contractSchedule, setContractSchedule] = useState<"none" | "50/50" | "50/25/25">("50/50");

  const fetchClient = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch(`/api/clients/${id}`);
      const data = await res.json();
      if (data.success) {
        setClient(data.data);
      } else {
        setError(data.error || "Failed to load client");
      }
    } catch {
      setError("Failed to connect to server");
    }
  }, [id]);

  useEffect(() => { fetchClient(); }, [fetchClient]);

  async function handleUpdate(data: Record<string, unknown>) {
    await fetch(`/api/clients/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    setEditOpen(false);
    fetchClient();
  }

  async function handleRegenerateToken() {
    setRegenerating(true);
    try {
      const res = await fetch(`/api/clients/${id}/regenerate-token`, { method: "POST" });
      const data = await res.json();
      if (data.success && client) {
        setClient({ ...client, onboardToken: data.data.onboardToken });
      }
    } finally {
      setRegenerating(false);
    }
  }

  async function handleGenerateUploadToken() {
    setRegenerating(true);
    try {
      const res = await fetch(`/api/clients/${id}/upload-token`, { method: "POST" });
      const data = await res.json();
      if (data.success && client) {
        setClient({ ...client, uploadToken: data.data.uploadToken });
      }
    } finally {
      setRegenerating(false);
    }
  }

  async function handleToggleChecklist(itemId: string, checked: boolean) {
    // Use a direct checklist endpoint
    await fetch(`/api/checklist/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checked: !checked }),
    });
    setClient((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        checklistItems: prev.checklistItems.map((item) =>
          item.id === itemId ? { ...item, checked: !checked } : item
        ),
      };
    });
  }

  async function handleAddContact() {
    await fetch(`/api/clients/${id}/contacts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(contactForm),
    });
    setNewContact(false);
    setContactForm({ name: "", role: "", email: "", phone: "" });
    fetchClient();
  }

  async function handleDeleteContact(contactId: string) {
    await fetch(`/api/clients/${id}/contacts/${contactId}`, { method: "DELETE" });
    fetchClient();
  }

  async function handleAddSocial() {
    const platform = socialForm.platform === "Other" ? customPlatform : socialForm.platform;
    if (!platform || !socialForm.url) return;
    try {
      await fetch(`/api/clients/${id}/social-links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, url: socialForm.url, handle: socialForm.handle || undefined }),
      });
      setNewSocial(false);
      setSocialForm({ platform: "", url: "", handle: "" });
      setCustomPlatform("");
      fetchClient();
    } catch { /* stay on form */ }
  }

  async function handleGenerateContract() {
    if (selectedPackages.length === 0 && customItems.filter(i => i.name.trim()).length === 0) return;
    setGeneratingContract(true);
    const validCustomItems = customItems
      .filter(i => i.name.trim() && Number(i.price) > 0)
      .map(i => ({ name: i.name.trim(), price: Number(i.price), recurring: i.recurring }));
    try {
      const res = await fetch(`/api/clients/${id}/contract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packages: selectedPackages,
          addons: selectedAddons,
          customItems: validCustomItems.length > 0 ? validCustomItems : undefined,
          customTerms: customTerms.trim() || undefined,
          packageCustomizations: Object.keys(contractCustomizations).length > 0 ? contractCustomizations : undefined,
          providerSignedName,
          country: contractCountry,
          paymentSchedule: contractSchedule === "50/50"
            ? [{ label: "deposit", percent: 50 }, { label: "completion", percent: 50 }]
            : contractSchedule === "50/25/25"
            ? [{ label: "deposit", percent: 50 }, { label: "milestone", percent: 25 }, { label: "completion", percent: 25 }]
            : undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setShowContractModal(false);
        setSelectedPackages([]);
        setSelectedAddons([]);
        setCustomItems([]);
        setCustomTerms("");
        setContractCustomizations({});
        setContractExpandedPkgs([]);
        setContractCountry("DE");
        setContractSchedule("50/50");
        fetchClient();
        if (data.data?.paymentLinkError) {
          alert(`Contract created, but payment links failed: ${data.data.paymentLinkError}\n\nYou can create them manually from the Payments section.`);
        } else if (data.data?.paymentLinks?.length > 0) {
          alert(`Contract generated with ${data.data.paymentLinks.length} payment link(s). Deposit link sent to client.`);
        }
      } else {
        alert(data.error || "Failed to generate contract");
      }
    } catch { alert("Network error generating contract"); }
    finally { setGeneratingContract(false); }
  }

  function handleCopyContractLink(token: string) {
    navigator.clipboard.writeText(`${window.location.origin}/contract/${token}`);
    setContractCopied(token);
    setTimeout(() => setContractCopied(null), 2000);
  }

  async function handleGeneratePaymentLink() {
    const amount = Number(paymentAmount);
    if (!amount || amount <= 0 || !paymentDescription.trim()) return;
    setGeneratingPayment(true);
    try {
      const res = await fetch(`/api/clients/${id}/payment-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
          description: paymentDescription.trim(),
          currency: paymentCurrency,
          country: paymentCountry,
          recurring: paymentRecurring,
          interval: paymentRecurring ? paymentInterval : undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setShowPaymentModal(false);
        setPaymentAmount("");
        setPaymentDescription("");
        setPaymentCurrency("eur");
        setPaymentCountry("DE");
        setPaymentRecurring(false);
        setPaymentInterval("month");
        setPaymentSelectedPkgs([]);
        setPaymentSelectedAddons([]);
        fetchClient();
      } else {
        alert(data.error || "Failed to create payment link");
      }
    } catch { alert("Network error creating payment link"); }
    finally { setGeneratingPayment(false); }
  }

  function handleCopyPaymentLink(url: string, linkId: string) {
    navigator.clipboard.writeText(url);
    setPaymentCopied(linkId);
    setTimeout(() => setPaymentCopied(null), 2000);
  }

  async function handleDeleteSocial(linkId: string) {
    try {
      await fetch(`/api/clients/${id}/social-links?linkId=${linkId}`, { method: "DELETE" });
      fetchClient();
    } catch { /* silently fail */ }
  }

  if (error) return (
    <div className="p-6">
      <div className="text-red-400 mb-4">{error}</div>
      <button onClick={fetchClient} className="text-bb-accent hover:underline">Try again</button>
    </div>
  );
  if (!client) return <div className="p-6 text-bb-dim">Loading...</div>;

  return (
    <div>
      <TopBar title={client.name} subtitle={client.company || undefined} />
      <div className="px-4 lg:px-6 pb-8">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
          <button onClick={() => router.back()} className="flex items-center gap-1 text-sm text-bb-muted hover:text-white transition-colors">
            <ArrowLeft size={16} /> Back
          </button>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={typeVariant[client.type] || "gray"}>{client.type}</Badge>
            <Badge variant={tierVariant[client.tier] || "gray"}>{client.tier}</Badge>
            <button onClick={() => setEditOpen(true)} className="flex items-center gap-1 px-3 py-1.5 text-sm bg-bb-elevated hover:bg-bb-border rounded-md text-bb-muted hover:text-white transition-colors">
              <Edit2 size={14} /> Edit
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* LEFT COLUMN */}
          <div className="lg:col-span-3 space-y-6">
            <div className="bg-bb-surface border border-bb-border rounded-lg p-5">
              <h3 className="font-display font-semibold mb-4">Overview</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                {([
                  ["Email", client.email],
                  ["Phone", client.phone ? `${getFlagFromPhone(client.phone) || ""} ${client.phone}`.trim() : null],
                  ["How They Found Us", client.source],
                  ["Industry", client.industry],
                  ["Retainer", client.monthlyRetainer ? formatCurrency(Number(client.monthlyRetainer)) : null],
                  ["Contract Start", client.contractStart ? new Date(client.contractStart).toLocaleDateString() : null],
                  ["Contract End", client.contractEnd ? new Date(client.contractEnd).toLocaleDateString() : null],
                ] as [string, string | null][]).map(([label, value]) => (
                  <div key={label}>
                    <span className="text-bb-dim">{label}</span>
                    <p className="text-bb-muted">{value || "\u2014"}</p>
                  </div>
                ))}
                <div className="col-span-2">
                  <span className="text-bb-dim flex items-center gap-1"><Clock size={12} /> Local Time</span>
                  {client.timezone ? (
                    <p className="text-bb-muted flex items-center gap-2">
                      <LiveClock timezone={client.timezone} />
                      <span className="text-bb-dim text-xs">({client.timezone.replace(/_/g, " ")})</span>
                    </p>
                  ) : (
                    <p className="text-bb-muted">{"\u2014"}</p>
                  )}
                </div>
              </div>
              {client.notes && (
                <div className="mt-4 pt-4 border-t border-bb-border">
                  <span className="text-sm text-bb-dim">Notes</span>
                  <p className="text-sm text-bb-muted mt-1 whitespace-pre-wrap">{client.notes}</p>
                </div>
              )}
            </div>

            <div className="bg-bb-surface border border-bb-border rounded-lg p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display font-semibold">Contacts</h3>
                <button onClick={() => setNewContact(true)} className="text-bb-orange hover:text-bb-orange-light text-sm flex items-center gap-1"><Plus size={14} /> Add</button>
              </div>
              {newContact && (
                <div className="mb-4 p-3 bg-bb-black rounded-lg space-y-2">
                  <input placeholder="Name *" value={contactForm.name} onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })} className="w-full px-3 py-1.5 bg-bb-surface border border-bb-border rounded text-sm text-white" />
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input placeholder="Role" value={contactForm.role} onChange={(e) => setContactForm({ ...contactForm, role: e.target.value })} className="px-3 py-1.5 bg-bb-surface border border-bb-border rounded text-sm text-white" />
                    <input placeholder="Email" value={contactForm.email} onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })} className="px-3 py-1.5 bg-bb-surface border border-bb-border rounded text-sm text-white" />
                    <input placeholder="Phone" value={contactForm.phone} onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })} className="px-3 py-1.5 bg-bb-surface border border-bb-border rounded text-sm text-white" />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setNewContact(false)} className="p-1 text-bb-dim hover:text-white"><X size={16} /></button>
                    <button onClick={handleAddContact} disabled={!contactForm.name} className="p-1 text-bb-orange hover:text-bb-orange-light disabled:opacity-50"><Check size={16} /></button>
                  </div>
                </div>
              )}
              <div className="space-y-2">
                {client.contacts.map((c) => (
                  <div key={c.id} className="flex items-center justify-between p-2 rounded hover:bg-bb-elevated">
                    <div>
                      <span className="text-sm font-medium">{c.name}</span>
                      {c.role && <span className="text-xs text-bb-dim ml-2">{c.role}</span>}
                      <div className="text-xs text-bb-dim">{[c.email, c.phone].filter(Boolean).join(" \u00B7 ")}</div>
                    </div>
                    <button onClick={() => handleDeleteContact(c.id)} className="p-1 text-bb-dim hover:text-red-400"><Trash2 size={14} /></button>
                  </div>
                ))}
                {client.contacts.length === 0 && !newContact && <p className="text-sm text-bb-dim">No contacts added</p>}
              </div>
            </div>

            <div className="bg-bb-surface border border-bb-border rounded-lg p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display font-semibold">Tasks</h3>
                <Link href={`/kanban?clientId=${id}`} className="text-bb-orange hover:text-bb-orange-light text-sm">View in Kanban</Link>
              </div>
              <div className="space-y-2">
                {client.tasks.map((t) => (
                  <div key={t.id} className="flex items-center justify-between p-2 rounded hover:bg-bb-elevated">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{t.title}</span>
                      <Badge variant={t.status === "DONE" ? "green" : "default"} size="sm">{t.status.replace("_", " ")}</Badge>
                    </div>
                    {t.dueDate && (
                      <span className={`text-xs ${new Date(t.dueDate) < new Date() && t.status !== "DONE" ? "text-red-400" : "text-bb-dim"}`}>
                        {formatRelativeDate(new Date(t.dueDate))}
                      </span>
                    )}
                  </div>
                ))}
                {client.tasks.length === 0 && <p className="text-sm text-bb-dim">No tasks</p>}
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-bb-surface border border-bb-border rounded-lg p-5">
              <h3 className="font-display font-semibold mb-5">Onboarding Pipeline</h3>
              <div className="relative">
                {(() => {
                  // Parallel-aware pipeline: "Payment confirmed" and "Contract signed"
                  // can happen in any order. "Onboarding completed" requires both.
                  const PARALLEL_LABELS = ["Payment confirmed", "Payment method confirmed", "Contract signed"];
                  const ONBOARDING_LABELS = ["Onboarding completed", "Onboarding call completed"];

                  const isParallelStep = (label: string) =>
                    PARALLEL_LABELS.some(p => label.toLowerCase() === p.toLowerCase());
                  const isOnboardingStep = (label: string) =>
                    ONBOARDING_LABELS.some(o => label.toLowerCase() === o.toLowerCase());

                  // Check if both parallel steps are done (for gating onboarding)
                  const parallelItems = client.checklistItems.filter(i => isParallelStep(i.label));
                  const bothParallelDone = parallelItems.length > 0 && parallelItems.every(i => i.checked);

                  return client.checklistItems.map((item, idx) => {
                    const isCompleted = item.checked;
                    const isLast = idx === client.checklistItems.length - 1;
                    const stepNum = idx + 1;
                    const isParallel = isParallelStep(item.label);
                    const isOnboarding = isOnboardingStep(item.label);

                    // Determine if step is active (actionable)
                    let isActive = false;
                    if (!isCompleted) {
                      if (idx === 0) {
                        // First step is always actionable
                        isActive = true;
                      } else if (isParallel) {
                        // Payment/Contract are active if step 1 (discovery) is done
                        const discoveryDone = client.checklistItems[0]?.checked;
                        isActive = !!discoveryDone;
                      } else if (isOnboarding) {
                        // Onboarding only active when BOTH payment + contract are done
                        isActive = bothParallelDone;
                      } else {
                        // Later steps (content calendar, first deliverable): active if previous is done
                        isActive = !!client.checklistItems[idx - 1]?.checked;
                      }
                    }

                    // Line color between steps
                    const nextCompleted = client.checklistItems[idx + 1]?.checked;
                    const lineColor = isCompleted && nextCompleted ? "bg-green-500" :
                      isCompleted ? "bg-green-500/40" : "bg-bb-border";

                    // Badge text for parallel steps
                    let badge = "";
                    if (isActive && isParallel) {
                      badge = "Either order";
                    } else if (isActive && isOnboarding && !bothParallelDone) {
                      badge = "Waiting";
                    } else if (isActive) {
                      badge = "Next up";
                    }
                    // Waiting state for onboarding when parallel steps aren't both done
                    const isWaiting = isOnboarding && !isCompleted && !bothParallelDone;

                    return (
                      <div key={item.id} className="flex gap-4 group">
                        <div className="flex flex-col items-center">
                          <button
                            onClick={() => handleToggleChecklist(item.id, item.checked)}
                            className={`relative w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all shrink-0 ${
                              isCompleted
                                ? "bg-green-500 border-green-500 text-white"
                                : isWaiting
                                ? "bg-bb-black border-bb-border text-bb-dim opacity-50"
                                : isActive
                                ? "bg-bb-orange/20 border-bb-orange text-bb-orange animate-pulse"
                                : "bg-bb-black border-bb-border text-bb-dim"
                            }`}
                          >
                            {isCompleted ? <Check size={16} /> : stepNum}
                          </button>
                          {!isLast && (
                            <div className={`w-0.5 h-8 ${lineColor}`} />
                          )}
                        </div>

                        <div className="pt-2 pb-4">
                          <span className={`text-sm font-medium ${
                            isCompleted ? "text-green-400" :
                            isWaiting ? "text-bb-dim opacity-50" :
                            isActive ? "text-white" : "text-bb-dim"
                          }`}>
                            {item.label}
                          </span>
                          {badge && (
                            <span className={`ml-2 text-xs font-medium ${
                              badge === "Waiting" ? "text-bb-dim" :
                              badge === "Either order" ? "text-blue-400" :
                              "text-bb-orange"
                            }`}>
                              {badge}
                            </span>
                          )}
                          {isOnboarding && !isCompleted && !bothParallelDone && (
                            <p className="text-xs text-bb-dim mt-0.5">
                              Requires both payment &amp; contract
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
              {client.checklistItems.length > 0 && (
                <div className="mt-3 pt-3 border-t border-bb-border">
                  <div className="flex items-center justify-between text-xs text-bb-dim">
                    <span>{client.checklistItems.filter(i => i.checked).length} of {client.checklistItems.length} complete</span>
                    <span className="font-medium text-bb-orange">
                      {client.checklistItems.every(i => i.checked) ? "Fully onboarded" :
                       `${client.checklistItems.filter(i => !i.checked).length} remaining`}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-bb-surface border border-bb-orange/30 rounded-lg p-5">
              <div className="flex items-center gap-2 mb-3">
                <Link2 size={16} className="text-bb-orange" />
                <h3 className="font-display font-semibold">Onboarding Link</h3>
              </div>
              {client.onboardToken ? (
                <>
                  <p className="text-xs text-bb-dim mb-3">Send this to your client to collect their info, contacts, and credentials.</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs bg-bb-black px-3 py-2 rounded border border-bb-border text-bb-muted truncate">
                      {window.location.origin}/onboard/{client.onboardToken}
                    </code>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}/onboard/${client.onboardToken}`);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      }}
                      className="p-2 rounded bg-bb-elevated hover:bg-bb-border text-bb-muted hover:text-white transition-colors shrink-0"
                      title="Copy link"
                    >
                      {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-xs text-bb-dim mb-3">This client has already completed onboarding. Generate a new link if you need them to resubmit.</p>
                  <button
                    onClick={handleRegenerateToken}
                    disabled={regenerating}
                    className="px-4 py-2 bg-bb-orange hover:bg-bb-orange-light text-white text-sm font-medium rounded-md transition-colors disabled:opacity-50"
                  >
                    {regenerating ? "Generating..." : "Generate New Link"}
                  </button>
                </>
              )}
            </div>

            {/* Upload Portal Link */}
            <div className="bg-bb-surface border border-bb-border rounded-lg p-5">
              <div className="flex items-center gap-2 mb-3">
                <Upload size={16} className="text-bb-orange" />
                <h3 className="font-display font-semibold">File Upload Portal</h3>
              </div>
              {client.uploadToken ? (
                <>
                  <p className="text-xs text-bb-dim mb-3">Share this link with your client so they can upload photos, videos, and audio directly to their media library.</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs bg-bb-black px-3 py-2 rounded border border-bb-border text-bb-muted truncate">
                      {window.location.origin}/upload/{client.uploadToken}
                    </code>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}/upload/${client.uploadToken}`);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      }}
                      className="p-2 rounded bg-bb-elevated hover:bg-bb-border text-bb-muted hover:text-white transition-colors shrink-0"
                      title="Copy link"
                    >
                      {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-xs text-bb-dim mb-3">Generate a unique upload link for this client. They&apos;ll be able to drag & drop their files which automatically land in their media library here.</p>
                  <button
                    onClick={handleGenerateUploadToken}
                    disabled={regenerating}
                    className="px-4 py-2 bg-bb-orange hover:bg-bb-orange-light text-white text-sm font-medium rounded-md transition-colors disabled:opacity-50"
                  >
                    {regenerating ? "Generating..." : "Generate Upload Link"}
                  </button>
                </>
              )}
            </div>

            <div className="bg-bb-surface border border-bb-border rounded-lg p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display font-semibold flex items-center gap-2">
                  <FileText size={16} className="text-bb-orange" /> Contracts
                </h3>
                <button
                  onClick={() => setShowContractModal(true)}
                  className="text-bb-orange hover:text-bb-orange-light text-sm flex items-center gap-1"
                >
                  <Plus size={14} /> New
                </button>
              </div>
              <div className="space-y-2">
                {client.contracts && client.contracts.length > 0 ? (
                  client.contracts.map((contract) => (
                    <div key={contract.id} className="p-3 rounded-lg bg-bb-black border border-bb-border space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-bb-dim">
                          {new Date(contract.createdAt).toLocaleDateString()}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                            contract.status === "SIGNED"
                              ? "bg-green-500/10 text-green-400"
                              : "bg-yellow-500/10 text-yellow-400"
                          }`}>
                            {contract.status === "SIGNED" ? "Signed" : "Pending"}
                          </span>
                          <button
                            onClick={async () => {
                              if (!confirm("Delete this contract? This cannot be undone.")) return;
                              try {
                                await fetch(`/api/clients/${id}/contract/${contract.id}`, { method: "DELETE" });
                                fetchClient();
                              } catch { /* silently fail */ }
                            }}
                            className="p-1 text-bb-dim hover:text-red-400 transition-colors"
                            title="Delete contract"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                      {contract.status === "SIGNED" && contract.signedName && (
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-bb-muted">
                            Signed by {contract.signedName} on {new Date(contract.signedAt!).toLocaleString()}
                          </p>
                          <button
                            onClick={() => window.open(`/api/contract/${contract.token}/certificate`, "_blank")}
                            className="text-xs text-bb-orange hover:text-bb-orange-light transition-colors"
                          >
                            View Certificate
                          </button>
                        </div>
                      )}
                      {contract.status === "PENDING" && (
                        <div className="flex items-center gap-2">
                          <code className="flex-1 text-xs bg-bb-surface px-2 py-1.5 rounded border border-bb-border text-bb-dim truncate">
                            {window.location.origin}/contract/{contract.token}
                          </code>
                          <button
                            onClick={() => handleCopyContractLink(contract.token)}
                            className="p-1.5 rounded bg-bb-elevated hover:bg-bb-border text-bb-muted hover:text-white transition-colors shrink-0"
                            title="Copy link"
                          >
                            {contractCopied === contract.token ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-bb-dim">No contracts generated</p>
                )}
              </div>
            </div>

            <div className="bg-bb-surface border border-bb-border rounded-lg p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <h3 className="font-display font-semibold flex items-center gap-2">
                    <CreditCard size={16} className="text-bb-orange" /> Payments
                  </h3>
                  <a
                    href="https://dashboard.stripe.com/settings/payouts"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-bb-dim hover:text-bb-orange flex items-center gap-0.5 transition-colors"
                  >
                    <ExternalLink size={9} /> Payout settings
                  </a>
                </div>
                <button
                  onClick={() => setShowPaymentModal(true)}
                  className="text-bb-orange hover:text-bb-orange-light text-sm flex items-center gap-1"
                >
                  <Plus size={14} /> New
                </button>
              </div>
              <div className="space-y-2">
                {client.paymentLinks && client.paymentLinks.length > 0 ? (
                  client.paymentLinks.map((link) => (
                    <div key={link.id} className="p-3 rounded-lg bg-bb-black border border-bb-border space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-sm font-medium text-white">
                            {new Intl.NumberFormat("en-US", { style: "currency", currency: link.currency || "usd" }).format(link.amount / 100)}
                            {link.recurring && link.interval && (
                              <span className="text-bb-dim font-normal">/{link.interval === "year" ? "yr" : "mo"}</span>
                            )}
                          </span>
                          {link.milestone && (
                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ml-1 ${
                              link.milestone === "deposit"
                                ? "bg-orange-500/10 text-orange-400"
                                : link.milestone === "milestone"
                                ? "bg-purple-500/10 text-purple-400"
                                : "bg-blue-500/10 text-blue-400"
                            }`}>
                              {link.milestone === "deposit" ? "Deposit" : link.milestone === "milestone" ? "Milestone" : "Completion"}
                            </span>
                          )}
                          <span className="text-xs text-bb-dim ml-2">{link.description}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                            link.status === "PAID" || link.status === "ACTIVE"
                              ? "bg-green-500/10 text-green-400"
                              : link.status === "CANCELLED"
                              ? "bg-red-500/10 text-red-400"
                              : "bg-yellow-500/10 text-yellow-400"
                          }`}>
                            {link.status === "ACTIVE" ? "Active" : link.status === "PAID" ? "Paid" : link.status === "CANCELLED" ? "Cancelled" : "Pending"}
                          </span>
                          {link.status === "ACTIVE" && link.recurring && (
                            <button
                              onClick={() => {
                                setUpdatePriceLink({ id: link.id, amount: link.amount, currency: link.currency, description: link.description, interval: link.interval });
                                setUpdatePriceAmount((link.amount / 100).toString());
                                setUpdatePriceProrate(true);
                                setShowUpdatePriceModal(true);
                              }}
                              className="p-1 text-bb-dim hover:text-bb-orange transition-colors"
                              title="Update subscription price"
                            >
                              <Edit2 size={13} />
                            </button>
                          )}
                          <button
                            onClick={async () => {
                              if (!confirm("Delete this payment link? This cannot be undone.")) return;
                              try {
                                await fetch(`/api/clients/${id}/payment-link/${link.id}`, { method: "DELETE" });
                                fetchClient();
                              } catch { /* silently fail */ }
                            }}
                            className="p-1 text-bb-dim hover:text-red-400 transition-colors"
                            title="Delete payment link"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                      {(link.status === "PAID" || link.status === "ACTIVE") && link.paidAt && (
                        <p className="text-xs text-bb-muted">
                          {link.status === "ACTIVE" ? "Started" : "Paid"} on {new Date(link.paidAt).toLocaleString()}
                        </p>
                      )}
                      {link.status === "PENDING" && (
                        <div className="flex items-center gap-1 mb-1">
                          <button
                            onClick={async () => {
                              try {
                                const res = await fetch(`/api/clients/${id}/payment-link/${link.id}`, { method: "POST" });
                                const data = await res.json();
                                if (data.success) {
                                  alert("Payment link email resent!");
                                } else {
                                  alert(data.error || "Failed to resend");
                                }
                              } catch { alert("Failed to resend"); }
                            }}
                            className="flex items-center gap-1 text-[10px] text-bb-dim hover:text-bb-orange transition-colors"
                            title="Resend payment link email"
                          >
                            <Send size={10} /> Resend email
                          </button>
                        </div>
                      )}
                      {link.status === "PENDING" && (
                        <div className="flex items-center gap-2">
                          <code className="flex-1 text-xs bg-bb-surface px-2 py-1.5 rounded border border-bb-border text-bb-dim truncate">
                            {link.stripeUrl}
                          </code>
                          <button
                            onClick={() => handleCopyPaymentLink(link.stripeUrl, link.id)}
                            className="p-1.5 rounded bg-bb-elevated hover:bg-bb-border text-bb-muted hover:text-white transition-colors shrink-0"
                            title="Copy link"
                          >
                            {paymentCopied === link.id ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-bb-dim">No payment links</p>
                )}
              </div>
            </div>

            <div className="bg-bb-surface border border-bb-border rounded-lg p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display font-semibold">Credentials</h3>
                <Link href="/vault" className="text-bb-orange hover:text-bb-orange-light text-sm">Manage</Link>
              </div>
              <div className="space-y-2">
                {client.credentials.map((cred) => (
                  <div key={cred.id} className="flex items-center justify-between p-2 rounded hover:bg-bb-elevated">
                    <span className="text-sm">{cred.platform}</span>
                    <span className="text-xs text-bb-dim font-mono">{cred.username}</span>
                  </div>
                ))}
                {client.credentials.length === 0 && <p className="text-sm text-bb-dim">No credentials stored</p>}
              </div>
            </div>

            <div className="bg-bb-surface border border-bb-border rounded-lg p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display font-semibold">Social Links</h3>
                <button onClick={() => setNewSocial(true)} className="text-bb-orange hover:text-bb-orange-light text-sm flex items-center gap-1"><Plus size={14} /> Add</button>
              </div>
              {newSocial && (
                <div className="mb-4 p-3 bg-bb-black rounded-lg space-y-2">
                  <select value={socialForm.platform} onChange={(e) => setSocialForm({ ...socialForm, platform: e.target.value })} className="w-full px-3 py-1.5 bg-bb-surface border border-bb-border rounded text-sm text-white">
                    <option value="">Select platform</option>
                    {PLATFORM_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                  {socialForm.platform === "Other" && (
                    <input placeholder="Custom platform *" value={customPlatform} onChange={(e) => setCustomPlatform(e.target.value)} className="w-full px-3 py-1.5 bg-bb-surface border border-bb-border rounded text-sm text-white" />
                  )}
                  <input placeholder="URL *" value={socialForm.url} onChange={(e) => setSocialForm({ ...socialForm, url: e.target.value })} className="w-full px-3 py-1.5 bg-bb-surface border border-bb-border rounded text-sm text-white" />
                  <input placeholder="Handle (e.g. @username)" value={socialForm.handle} onChange={(e) => setSocialForm({ ...socialForm, handle: e.target.value })} className="w-full px-3 py-1.5 bg-bb-surface border border-bb-border rounded text-sm text-white" />
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => { setNewSocial(false); setSocialForm({ platform: "", url: "", handle: "" }); setCustomPlatform(""); }} className="p-1 text-bb-dim hover:text-white"><X size={16} /></button>
                    <button onClick={handleAddSocial} disabled={!socialForm.platform || !socialForm.url || (socialForm.platform === "Other" && !customPlatform)} className="p-1 text-bb-orange hover:text-bb-orange-light disabled:opacity-50"><Check size={16} /></button>
                  </div>
                </div>
              )}
              <div className="space-y-2">
                {client.socialLinks.map((link) => (
                  <div key={link.id} className="flex items-center justify-between p-2 rounded hover:bg-bb-elevated">
                    <a href={link.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 min-w-0 group">
                      <span className="text-sm font-medium text-white group-hover:text-bb-orange transition-colors shrink-0">{link.platform}</span>
                      {link.handle && <span className="text-xs text-bb-dim truncate">{link.handle}</span>}
                      <ExternalLink size={12} className="text-bb-dim group-hover:text-bb-orange transition-colors shrink-0" />
                    </a>
                    <button onClick={() => handleDeleteSocial(link.id)} className="p-1 text-bb-dim hover:text-red-400 shrink-0"><Trash2 size={14} /></button>
                  </div>
                ))}
                {client.socialLinks.length === 0 && !newSocial && <p className="text-sm text-bb-dim">No social links added</p>}
              </div>
            </div>

            <div className="bg-bb-surface border border-bb-border rounded-lg p-5">
              <h3 className="font-display font-semibold mb-4">Recent Activity</h3>
              <div className="space-y-3 max-h-[300px] overflow-y-auto">
                {client.activityLogs.map((log) => (
                  <div key={log.id} className="text-sm">
                    <div className="flex items-center gap-2">
                      <Badge variant={log.actor === "agent" ? "orange" : "default"} size="sm">{log.actor}</Badge>
                      <span className="text-bb-muted">{log.action.replace(/_/g, " ")}</span>
                    </div>
                    {log.details && <p className="text-xs text-bb-dim mt-0.5 line-clamp-1">{log.details}</p>}
                    <span className="text-xs text-bb-dim">{new Date(log.createdAt).toLocaleString()}</span>
                  </div>
                ))}
                {client.activityLogs.length === 0 && <p className="text-sm text-bb-dim">No activity</p>}
              </div>
            </div>

            <div className="bg-bb-surface border border-bb-border rounded-lg p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display font-semibold">Invoices</h3>
                <Link href="/invoices" className="text-bb-orange hover:text-bb-orange-light text-sm">Manage</Link>
              </div>
              <div className="space-y-2">
                {client.invoices.map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between p-2 rounded hover:bg-bb-elevated text-sm group">
                    <div className="flex items-center gap-3">
                      <span className="font-mono">{formatCurrency(Number(inv.amount))}</span>
                      <Badge variant={inv.status === "PAID" ? "green" : inv.status === "OVERDUE" ? "red" : "default"} size="sm">{inv.status}</Badge>
                    </div>
                    <button
                      onClick={async () => {
                        if (!confirm("Delete this invoice? This cannot be undone.")) return;
                        try {
                          await fetch(`/api/invoices/${inv.id}`, { method: "DELETE" });
                          fetchClient();
                        } catch { /* silently fail */ }
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 text-bb-dim hover:text-red-400 transition-all"
                      title="Delete invoice"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                {client.invoices.length === 0 && <p className="text-sm text-bb-dim">No invoices</p>}
              </div>
            </div>
          </div>
        </div>
      </div>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit Client" className="max-w-2xl">
        <EditClientForm
          initialData={{
            name: client.name,
            email: client.email || "",
            phone: client.phone || "",
            company: client.company || "",
            type: client.type,
            tier: client.tier,
            source: client.source || "",
            industry: client.industry || "",
            notes: client.notes || "",
            monthlyRetainer: client.monthlyRetainer ? Number(client.monthlyRetainer) : null,
            contractStart: client.contractStart,
            contractEnd: client.contractEnd,
            timezone: client.timezone || "",
          }}
          onSubmit={handleUpdate}
          onCancel={() => setEditOpen(false)}
          submitLabel="Save Changes"
        />
      </Modal>

      {/* Generate Contract Modal */}
      <Modal open={showContractModal} onClose={() => setShowContractModal(false)} title="Generate Contract" className="max-w-2xl">
        <div className="space-y-6">
          <div>
            <h4 className="text-sm font-medium text-white mb-3">Select Services *</h4>
            <div className="space-y-5 max-h-[400px] overflow-y-auto pr-1">
              {PACKAGE_CATEGORIES.map((cat) => {
                const catPackages = SERVICE_PACKAGES.filter((p) => p.category === cat.id);
                if (catPackages.length === 0) return null;
                const hasRecurring = catPackages.some((p) => p.recurring);
                const hasOneTime = catPackages.some((p) => !p.recurring);
                return (
                  <div key={cat.id}>
                    <div className="flex items-center gap-2 mb-2">
                      <h5 className="text-xs font-semibold text-bb-muted uppercase tracking-wider">{cat.label}</h5>
                      {hasRecurring && hasOneTime ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-bb-elevated text-bb-dim">Mixed</span>
                      ) : hasRecurring ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400">Monthly</span>
                      ) : (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-400">One-time</span>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      {catPackages.map((pkg) => {
                        const isSelected = selectedPackages.includes(pkg.id);
                        const isExpanded = contractExpandedPkgs.includes(pkg.id);
                        const cust = contractCustomizations[pkg.id];
                        const displayPrice = cust?.priceOverride != null ? cust.priceOverride : pkg.price;
                        const hasOverride = cust?.priceOverride != null || (cust?.excludedDeliverables && cust.excludedDeliverables.length > 0);
                        return (
                        <div key={pkg.id}>
                        <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                          isSelected
                            ? "border-bb-orange bg-bb-orange/5"
                            : "border-bb-border hover:border-bb-orange/30"
                        } ${isSelected && isExpanded ? "rounded-b-none" : ""}`}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedPackages([...selectedPackages, pkg.id]);
                              } else {
                                setSelectedPackages(selectedPackages.filter((p) => p !== pkg.id));
                                setContractExpandedPkgs(contractExpandedPkgs.filter((p) => p !== pkg.id));
                                const next = { ...contractCustomizations };
                                delete next[pkg.id];
                                setContractCustomizations(next);
                              }
                            }}
                            className="w-4 h-4 mt-0.5 rounded border-bb-border bg-bb-black accent-bb-orange"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium text-white">{pkg.name}</span>
                              <span className={`text-sm font-mono font-semibold ${pkg.recurring ? "text-blue-400" : "text-bb-orange"}`}>
                                ${displayPrice.toLocaleString()}{pkg.recurring ? "/mo" : ""}
                              </span>
                              {hasOverride && <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-400 font-medium">Modified</span>}
                              {pkg.recurring ? (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 font-medium">Recurring</span>
                              ) : (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 font-medium">One-time</span>
                              )}
                            </div>
                            <p className="text-xs text-bb-dim mt-0.5">{pkg.description}</p>
                          </div>
                          {isSelected && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                setContractExpandedPkgs(isExpanded
                                  ? contractExpandedPkgs.filter((p) => p !== pkg.id)
                                  : [...contractExpandedPkgs, pkg.id]
                                );
                              }}
                              className="p-1 text-bb-dim hover:text-white shrink-0"
                            >
                              {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </button>
                          )}
                        </label>
                        {isSelected && isExpanded && (
                          <div className="border border-t-0 border-bb-orange bg-bb-black/50 rounded-b-lg p-3 space-y-3">
                            <div>
                              <label className="block text-[10px] uppercase tracking-wider text-bb-dim font-medium mb-1">Price Override</label>
                              <div className="relative w-40">
                                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-bb-dim text-sm">$</span>
                                <input
                                  type="number"
                                  value={cust?.priceOverride != null ? cust.priceOverride : pkg.price}
                                  onChange={(e) => {
                                    const val = e.target.value === "" ? undefined : Number(e.target.value);
                                    setContractCustomizations({
                                      ...contractCustomizations,
                                      [pkg.id]: { ...contractCustomizations[pkg.id], priceOverride: val === pkg.price ? undefined : val },
                                    });
                                  }}
                                  className="w-full pl-6 pr-3 py-1.5 bg-bb-surface border border-bb-border rounded text-sm text-white"
                                  min="0"
                                  step="1"
                                />
                              </div>
                              {cust?.priceOverride != null && cust.priceOverride !== pkg.price && (
                                <p className="text-[10px] text-yellow-400 mt-1">
                                  Original: ${pkg.price.toLocaleString()} → Custom: ${cust.priceOverride.toLocaleString()}
                                </p>
                              )}
                            </div>
                            <div>
                              <label className="block text-[10px] uppercase tracking-wider text-bb-dim font-medium mb-1.5">Included Services</label>
                              <div className="space-y-1">
                                {pkg.deliverables.map((d, di) => {
                                  const excluded = cust?.excludedDeliverables || [];
                                  const isIncluded = !excluded.includes(di);
                                  return (
                                    <label key={di} className="flex items-start gap-2 cursor-pointer group">
                                      <input
                                        type="checkbox"
                                        checked={isIncluded}
                                        onChange={(e) => {
                                          const prev = contractCustomizations[pkg.id]?.excludedDeliverables || [];
                                          const next = e.target.checked
                                            ? prev.filter((i) => i !== di)
                                            : [...prev, di];
                                          setContractCustomizations({
                                            ...contractCustomizations,
                                            [pkg.id]: { ...contractCustomizations[pkg.id], excludedDeliverables: next.length > 0 ? next : undefined },
                                          });
                                        }}
                                        className="w-3.5 h-3.5 mt-0.5 rounded border-bb-border bg-bb-black accent-bb-orange shrink-0"
                                      />
                                      <span className={`text-xs ${isIncluded ? "text-bb-muted" : "text-bb-dim line-through"}`}>{d}</span>
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        )}
                        </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <h4 className="text-sm font-medium text-white mb-3">Add-Ons (Optional)</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
              {ADDON_PACKAGES.map((addon) => {
                const addonCust = contractCustomizations[addon.id];
                const addonPrice = addonCust?.priceOverride != null ? addonCust.priceOverride : addon.price;
                return (
                <label key={addon.id} className={`flex items-center gap-2 p-2 rounded border cursor-pointer transition-colors ${
                  selectedAddons.includes(addon.id)
                    ? "border-bb-orange bg-bb-orange/5"
                    : "border-bb-border hover:border-bb-orange/30"
                }`}>
                  <input
                    type="checkbox"
                    checked={selectedAddons.includes(addon.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedAddons([...selectedAddons, addon.id]);
                      } else {
                        setSelectedAddons(selectedAddons.filter((a) => a !== addon.id));
                        const next = { ...contractCustomizations };
                        delete next[addon.id];
                        setContractCustomizations(next);
                      }
                    }}
                    className="w-3.5 h-3.5 rounded border-bb-border bg-bb-black accent-bb-orange"
                  />
                  <div className="flex-1">
                    <span className="text-xs font-medium text-white">{addon.name}</span>
                    <span className={`text-xs ml-1 font-mono ${addon.recurring ? "text-blue-400" : "text-bb-orange"}`}>
                      ${addonPrice.toLocaleString()}{addon.recurring ? "/mo" : ""}
                    </span>
                    {addonCust?.priceOverride != null && <span className="text-[9px] ml-1 text-yellow-400">modified</span>}
                  </div>
                  {selectedAddons.includes(addon.id) && (
                    <input
                      type="number"
                      value={addonCust?.priceOverride != null ? addonCust.priceOverride : addon.price}
                      onClick={(e) => e.preventDefault()}
                      onChange={(e) => {
                        const val = e.target.value === "" ? undefined : Number(e.target.value);
                        setContractCustomizations({
                          ...contractCustomizations,
                          [addon.id]: { ...contractCustomizations[addon.id], priceOverride: val === addon.price ? undefined : val },
                        });
                      }}
                      className="w-20 px-2 py-1 bg-bb-surface border border-bb-border rounded text-xs text-white text-right"
                      min="0"
                    />
                  )}
                </label>
                );
              })}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium text-white">Custom Line Items</h4>
              <button
                type="button"
                onClick={() => setCustomItems([...customItems, { name: "", price: "", recurring: false }])}
                className="text-bb-orange hover:text-bb-orange-light text-xs flex items-center gap-1"
              >
                <Plus size={12} /> Add Item
              </button>
            </div>
            {customItems.length === 0 && (
              <p className="text-xs text-bb-dim">Use this for discounted or custom-priced services (one-time or monthly).</p>
            )}
            <div className="space-y-2">
              {customItems.map((item, i) => (
                <div key={i} className="space-y-1.5 p-2.5 rounded-lg border border-bb-border bg-bb-black">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={item.name}
                      onChange={(e) => {
                        const updated = [...customItems];
                        updated[i].name = e.target.value;
                        setCustomItems(updated);
                      }}
                      className="flex-1 px-3 py-1.5 bg-bb-surface border border-bb-border rounded text-sm text-white placeholder:text-bb-dim"
                      placeholder="Service name"
                    />
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-bb-dim text-sm">$</span>
                      <input
                        type="number"
                        value={item.price}
                        onChange={(e) => {
                          const updated = [...customItems];
                          updated[i].price = e.target.value;
                          setCustomItems(updated);
                        }}
                        className="w-28 pl-6 pr-3 py-1.5 bg-bb-surface border border-bb-border rounded text-sm text-white placeholder:text-bb-dim"
                        placeholder="0"
                        min="0"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setCustomItems(customItems.filter((_, idx) => idx !== i))}
                      className="p-1 text-bb-dim hover:text-red-400"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const updated = [...customItems];
                        updated[i].recurring = false;
                        setCustomItems(updated);
                      }}
                      className={`flex-1 py-1 text-xs font-medium rounded border transition-colors ${
                        !item.recurring
                          ? "border-green-500 bg-green-500/10 text-green-400"
                          : "border-bb-border bg-bb-surface text-bb-dim hover:border-green-500/30"
                      }`}
                    >
                      One-time
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const updated = [...customItems];
                        updated[i].recurring = true;
                        setCustomItems(updated);
                      }}
                      className={`flex-1 py-1 text-xs font-medium rounded border transition-colors ${
                        item.recurring
                          ? "border-blue-500 bg-blue-500/10 text-blue-400"
                          : "border-bb-border bg-bb-surface text-bb-dim hover:border-blue-500/30"
                      }`}
                    >
                      Monthly
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {(selectedPackages.length > 0 || selectedAddons.length > 0 || customItems.some(i => i.name.trim() && Number(i.price) > 0)) && (() => {
            const allSelected = [
              ...SERVICE_PACKAGES.filter((p) => selectedPackages.includes(p.id)),
              ...ADDON_PACKAGES.filter((a) => selectedAddons.includes(a.id)),
            ];
            const validCustom = customItems.filter(i => i.name.trim() && Number(i.price) > 0);
            const getEffectivePrice = (i: { id: string; price: number }) => contractCustomizations[i.id]?.priceOverride ?? i.price;
            const oneTimeItems = [
              ...allSelected.filter((i) => !i.recurring).map(i => ({ name: i.name, price: getEffectivePrice(i) })),
              ...validCustom.filter(i => !i.recurring).map(i => ({ name: i.name, price: Number(i.price) })),
            ];
            const recurringItems = [
              ...allSelected.filter((i) => i.recurring).map(i => ({ name: i.name, price: getEffectivePrice(i) })),
              ...validCustom.filter(i => i.recurring).map(i => ({ name: i.name, price: Number(i.price) })),
            ];
            const oneTimeTotal = oneTimeItems.reduce((sum, i) => sum + i.price, 0);
            const recurringTotal = recurringItems.reduce((sum, i) => sum + i.price, 0);
            return (
              <div className="p-3 bg-bb-black rounded-lg border border-bb-border space-y-2">
                {oneTimeItems.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
                      <span className="text-[10px] uppercase tracking-wider text-bb-dim font-medium">One-time</span>
                    </div>
                    <div className="space-y-0.5 pl-3">
                      {oneTimeItems.map((item, idx) => (
                        <div key={idx} className="flex justify-between text-xs">
                          <span className="text-bb-muted">{item.name}</span>
                          <span className="text-bb-orange font-mono">${item.price.toLocaleString()}</span>
                        </div>
                      ))}
                      {oneTimeItems.length > 1 && (
                        <div className="flex justify-between text-sm pt-1 border-t border-bb-border/30">
                          <span className="text-bb-dim text-xs font-medium">Subtotal</span>
                          <span className="text-bb-orange font-mono font-semibold">${oneTimeTotal.toLocaleString()}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {recurringItems.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-400 inline-block" />
                      <span className="text-[10px] uppercase tracking-wider text-bb-dim font-medium">Monthly</span>
                    </div>
                    <div className="space-y-0.5 pl-3">
                      {recurringItems.map((item, idx) => (
                        <div key={idx} className="flex justify-between text-xs">
                          <span className="text-bb-muted">{item.name}</span>
                          <span className="text-blue-400 font-mono">${item.price.toLocaleString()}/mo</span>
                        </div>
                      ))}
                      {recurringItems.length > 1 && (
                        <div className="flex justify-between text-sm pt-1 border-t border-bb-border/30">
                          <span className="text-bb-dim text-xs font-medium">Subtotal</span>
                          <span className="text-blue-400 font-mono font-semibold">${recurringTotal.toLocaleString()}/mo</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {oneTimeTotal > 0 && recurringTotal > 0 && (
                  <div className="flex justify-between text-sm pt-2 border-t border-bb-border/50">
                    <span className="text-white text-xs font-semibold">Total</span>
                    <span className="text-white font-mono font-semibold">
                      ${oneTimeTotal.toLocaleString()} + ${recurringTotal.toLocaleString()}/mo
                    </span>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Payment Schedule */}
          <div>
            <h4 className="text-sm font-medium text-white mb-3">Payment Schedule</h4>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {([
                ["none", "No Split", "Manual payment links"],
                ["50/50", "50 / 50", "Deposit + Completion"],
                ["50/25/25", "50 / 25 / 25", "Deposit + Milestone + Completion"],
              ] as const).map(([value, label, desc]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setContractSchedule(value as "none" | "50/50" | "50/25/25")}
                  className={`p-2.5 rounded-lg border text-left transition-colors ${
                    contractSchedule === value
                      ? "border-bb-orange bg-bb-orange/5"
                      : "border-bb-border hover:border-bb-orange/30"
                  }`}
                >
                  <span className="text-sm font-medium text-white block">{label}</span>
                  <span className="text-[10px] text-bb-dim">{desc}</span>
                </button>
              ))}
            </div>
            {contractSchedule !== "none" && (() => {
              const allSelected = [
                ...SERVICE_PACKAGES.filter((p) => selectedPackages.includes(p.id)),
                ...ADDON_PACKAGES.filter((a) => selectedAddons.includes(a.id)),
              ];
              const validCustom = customItems.filter(i => i.name.trim() && Number(i.price) > 0);
              const getEffectivePrice = (i: { id: string; price: number }) => contractCustomizations[i.id]?.priceOverride ?? i.price;
              const oneTimeTotal = allSelected.filter((i) => !i.recurring).reduce((s, i) => s + getEffectivePrice(i), 0)
                + validCustom.filter(i => !i.recurring).reduce((s, i) => s + Number(i.price), 0);
              if (oneTimeTotal <= 0) return null;
              const splits = contractSchedule === "50/50"
                ? [{ label: "Deposit", percent: 50 }, { label: "Completion", percent: 50 }]
                : [{ label: "Deposit", percent: 50 }, { label: "Milestone", percent: 25 }, { label: "Completion", percent: 25 }];
              return (
                <div className="p-3 bg-bb-black rounded-lg border border-bb-border space-y-1.5">
                  {splits.map((s, i) => (
                    <div key={i} className="flex justify-between text-xs">
                      <span className="text-bb-muted">{s.label} ({s.percent}%)</span>
                      <span className="text-bb-orange font-mono">${Math.round((oneTimeTotal * s.percent) / 100).toLocaleString()}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-xs pt-1 border-t border-bb-border/30">
                    <span className="text-bb-dim font-medium">Total</span>
                    <span className="text-white font-mono font-semibold">${oneTimeTotal.toLocaleString()}</span>
                  </div>
                  <p className="text-[10px] text-bb-dim pt-1">Deposit link will be auto-sent to the client. Other milestones can be sent manually.</p>
                </div>
              );
            })()}
          </div>

          {/* Country for contract & payment links */}
          <div>
            <label className="block text-sm font-medium text-white mb-1.5">Client Country</label>
              <select
                value={contractCountry}
                onChange={(e) => setContractCountry(e.target.value)}
                className="w-full px-3 py-2 bg-bb-black border border-bb-border rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-bb-orange/50"
              >
                <optgroup label="North America">
                  <option value="US">{"\uD83C\uDDFA\uD83C\uDDF8"} United States</option>
                  <option value="CA">{"\uD83C\uDDE8\uD83C\uDDE6"} Canada</option>
                  <option value="MX">{"\uD83C\uDDF2\uD83C\uDDFD"} Mexico</option>
                </optgroup>
                <optgroup label="Europe (EUR)">
                  <option value="DE">{"\uD83C\uDDE9\uD83C\uDDEA"} Germany</option>
                  <option value="AT">{"\uD83C\uDDE6\uD83C\uDDF9"} Austria</option>
                  <option value="NL">{"\uD83C\uDDF3\uD83C\uDDF1"} Netherlands</option>
                  <option value="BE">{"\uD83C\uDDE7\uD83C\uDDEA"} Belgium</option>
                  <option value="FR">{"\uD83C\uDDEB\uD83C\uDDF7"} France</option>
                  <option value="ES">{"\uD83C\uDDEA\uD83C\uDDF8"} Spain</option>
                  <option value="IT">{"\uD83C\uDDEE\uD83C\uDDF9"} Italy</option>
                  <option value="IE">{"\uD83C\uDDEE\uD83C\uDDEA"} Ireland</option>
                  <option value="PT">{"\uD83C\uDDF5\uD83C\uDDF9"} Portugal</option>
                  <option value="FI">{"\uD83C\uDDEB\uD83C\uDDEE"} Finland</option>
                  <option value="GR">{"\uD83C\uDDEC\uD83C\uDDF7"} Greece</option>
                  <option value="LU">{"\uD83C\uDDF1\uD83C\uDDFA"} Luxembourg</option>
                  <option value="SE">{"\uD83C\uDDF8\uD83C\uDDEA"} Sweden</option>
                  <option value="DK">{"\uD83C\uDDE9\uD83C\uDDF0"} Denmark</option>
                  <option value="PL">{"\uD83C\uDDF5\uD83C\uDDF1"} Poland</option>
                  <option value="CZ">{"\uD83C\uDDE8\uD83C\uDDFF"} Czech Republic</option>
                  <option value="HU">{"\uD83C\uDDED\uD83C\uDDFA"} Hungary</option>
                  <option value="RO">{"\uD83C\uDDF7\uD83C\uDDF4"} Romania</option>
                  <option value="HR">{"\uD83C\uDDED\uD83C\uDDF7"} Croatia</option>
                  <option value="SK">{"\uD83C\uDDF8\uD83C\uDDF0"} Slovakia</option>
                  <option value="SI">{"\uD83C\uDDF8\uD83C\uDDEE"} Slovenia</option>
                  <option value="BG">{"\uD83C\uDDE7\uD83C\uDDEC"} Bulgaria</option>
                  <option value="EE">{"\uD83C\uDDEA\uD83C\uDDEA"} Estonia</option>
                  <option value="LV">{"\uD83C\uDDF1\uD83C\uDDFB"} Latvia</option>
                  <option value="LT">{"\uD83C\uDDF1\uD83C\uDDF9"} Lithuania</option>
                  <option value="CY">{"\uD83C\uDDE8\uD83C\uDDFE"} Cyprus</option>
                  <option value="MT">{"\uD83C\uDDF2\uD83C\uDDF9"} Malta</option>
                </optgroup>
                <optgroup label="Europe (Non-EU)">
                  <option value="GB">{"\uD83C\uDDEC\uD83C\uDDE7"} United Kingdom</option>
                  <option value="CH">{"\uD83C\uDDE8\uD83C\uDDED"} Switzerland</option>
                  <option value="NO">{"\uD83C\uDDF3\uD83C\uDDF4"} Norway</option>
                </optgroup>
                <optgroup label="Africa">
                  <option value="ZA">{"\uD83C\uDDFF\uD83C\uDDE6"} South Africa</option>
                  <option value="NG">{"\uD83C\uDDF3\uD83C\uDDEC"} Nigeria</option>
                  <option value="KE">{"\uD83C\uDDF0\uD83C\uDDEA"} Kenya</option>
                  <option value="GH">{"\uD83C\uDDEC\uD83C\uDDED"} Ghana</option>
                  <option value="EG">{"\uD83C\uDDEA\uD83C\uDDEC"} Egypt</option>
                </optgroup>
                <optgroup label="Asia & Pacific">
                  <option value="AU">{"\uD83C\uDDE6\uD83C\uDDFA"} Australia</option>
                  <option value="NZ">{"\uD83C\uDDF3\uD83C\uDDFF"} New Zealand</option>
                  <option value="JP">{"\uD83C\uDDEF\uD83C\uDDF5"} Japan</option>
                  <option value="SG">{"\uD83C\uDDF8\uD83C\uDDEC"} Singapore</option>
                  <option value="IN">{"\uD83C\uDDEE\uD83C\uDDF3"} India</option>
                  <option value="AE">{"\uD83C\uDDE6\uD83C\uDDEA"} UAE</option>
                  <option value="IL">{"\uD83C\uDDEE\uD83C\uDDF1"} Israel</option>
                  <option value="PH">{"\uD83C\uDDF5\uD83C\uDDED"} Philippines</option>
                </optgroup>
                <optgroup label="South America">
                  <option value="BR">{"\uD83C\uDDE7\uD83C\uDDF7"} Brazil</option>
                  <option value="CO">{"\uD83C\uDDE8\uD83C\uDDF4"} Colombia</option>
                  <option value="AR">{"\uD83C\uDDE6\uD83C\uDDF7"} Argentina</option>
                  <option value="CL">{"\uD83C\uDDE8\uD83C\uDDF1"} Chile</option>
                </optgroup>
              </select>
              <p className="text-[10px] text-bb-dim mt-1">
                {["DE","AT","NL","BE","FR","IT","ES","PT","IE","FI","SE","DK","PL","CZ","GR","HU","RO","BG","HR","SK","SI","LT","LV","EE","CY","MT","LU"].includes(contractCountry)
                  ? "Currency: EUR — EU invoice template"
                  : "Currency: USD — US invoice template"}
              </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-white mb-1.5">Custom Terms (Optional)</label>
            <textarea
              value={customTerms}
              onChange={(e) => setCustomTerms(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 bg-bb-black border border-bb-border rounded-lg text-white placeholder:text-bb-dim focus:outline-none focus:ring-2 focus:ring-bb-orange/50 text-sm"
              placeholder="Any additional terms or conditions..."
            />
          </div>

          {/* Provider Counter-Signature */}
          <div>
            <label className="block text-sm font-medium text-bb-muted mb-1">Your Full Legal Name (Counter-Signature)</label>
            <input
              type="text"
              value={providerSignedName}
              onChange={(e) => setProviderSignedName(e.target.value)}
              className="w-full px-3 py-2 bg-bb-black border border-bb-border rounded-lg text-white placeholder:text-bb-dim focus:outline-none focus:ring-2 focus:ring-bb-orange/50 text-sm"
              placeholder="Your full legal name"
            />
            <p className="text-xs text-bb-dim mt-1">By generating this contract, you are counter-signing it with your full legal name, IP address, and timestamp.</p>
          </div>

          <div className="flex gap-3 justify-end">
            <button
              onClick={() => setShowContractModal(false)}
              className="px-4 py-2 text-sm text-bb-muted hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleGenerateContract}
              disabled={(selectedPackages.length === 0 && !customItems.some(i => i.name.trim())) || generatingContract || !providerSignedName.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-bb-orange hover:bg-bb-orange-light text-white text-sm font-medium rounded-md transition-colors disabled:opacity-50"
            >
              {generatingContract ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <FileText size={14} />
                  Generate Contract
                </>
              )}
            </button>
          </div>
        </div>
      </Modal>

      {/* Generate Payment Link Modal */}
      <Modal open={showPaymentModal} onClose={() => setShowPaymentModal(false)} title="Create Payment Link" className="max-w-2xl">
        <div className="space-y-4">
          <p className="text-xs text-bb-dim">
            Select packages or enter a custom amount. A Stripe checkout link will be generated and emailed to {client?.name?.split(" ")[0]}.
          </p>

          {/* Package Selection */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">Select Packages</label>
            <div className="max-h-64 overflow-y-auto space-y-3 pr-1">
              {PACKAGE_CATEGORIES.map((cat) => {
                const pkgs = SERVICE_PACKAGES.filter((p) => p.category === cat.id);
                if (pkgs.length === 0) return null;
                return (
                  <div key={cat.id}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-[10px] font-bold text-bb-dim uppercase tracking-wider">{cat.label}</span>
                      {pkgs[0]?.recurring && <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 font-medium">Recurring</span>}
                      {!pkgs[0]?.recurring && <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 font-medium">One-time</span>}
                    </div>
                    {pkgs.map((pkg) => {
                      const pmtSelected = paymentSelectedPkgs.includes(pkg.id);
                      const pmtExpanded = paymentExpandedPkgs.includes(pkg.id);
                      const pmtCust = paymentCustomizations[pkg.id];
                      const pmtPrice = pmtCust?.priceOverride != null ? pmtCust.priceOverride : pkg.price;
                      const pmtHasOverride = pmtCust?.priceOverride != null || (pmtCust?.excludedDeliverables && pmtCust.excludedDeliverables.length > 0);

                      const recalcPaymentTotals = (newPkgs: string[], newAddons: string[], newCust: Record<string, PackageCustomization>) => {
                        const allSel = [
                          ...SERVICE_PACKAGES.filter((p) => newPkgs.includes(p.id)),
                          ...ADDON_PACKAGES.filter((a) => newAddons.includes(a.id)),
                        ];
                        if (allSel.length > 0) {
                          const hasRec = allSel.some((p) => p.recurring);
                          const getP = (p: { id: string; price: number }) => newCust[p.id]?.priceOverride ?? p.price;
                          const ot = allSel.filter((p) => !p.recurring).reduce((s, p) => s + getP(p), 0);
                          const rt = allSel.filter((p) => p.recurring).reduce((s, p) => s + getP(p), 0);
                          const total = hasRec && !ot ? rt : ot + rt;
                          setPaymentAmount(total.toString());
                          const desc = allSel.map((p) => {
                            const c = newCust[p.id];
                            const modified = c?.priceOverride != null || (c?.excludedDeliverables && c.excludedDeliverables.length > 0);
                            return modified ? `${p.name} (customized)` : p.name;
                          }).join(" + ");
                          setPaymentDescription(desc);
                          if (hasRec && !paymentRecurring) setPaymentRecurring(true);
                        }
                      };

                      return (
                      <div key={pkg.id} className="mb-1">
                      <label
                        className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                          pmtSelected
                            ? "border-bb-orange bg-bb-orange/5"
                            : "border-bb-border bg-bb-black hover:border-bb-dim"
                        } ${pmtSelected && pmtExpanded ? "rounded-b-none" : ""}`}
                      >
                        <input
                          type="checkbox"
                          checked={pmtSelected}
                          onChange={(e) => {
                            const newPkgs = e.target.checked
                              ? [...paymentSelectedPkgs, pkg.id]
                              : paymentSelectedPkgs.filter((p) => p !== pkg.id);
                            setPaymentSelectedPkgs(newPkgs);
                            if (!e.target.checked) {
                              setPaymentExpandedPkgs(paymentExpandedPkgs.filter((p) => p !== pkg.id));
                              const next = { ...paymentCustomizations };
                              delete next[pkg.id];
                              setPaymentCustomizations(next);
                              recalcPaymentTotals(newPkgs, paymentSelectedAddons, next);
                            } else {
                              recalcPaymentTotals(newPkgs, paymentSelectedAddons, paymentCustomizations);
                            }
                          }}
                          className="w-3.5 h-3.5 rounded border-bb-border bg-bb-black accent-bb-orange shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm text-white font-medium">{pkg.name}</span>
                          {pmtHasOverride && <span className="text-[9px] ml-1.5 px-1 py-0.5 rounded bg-yellow-500/10 text-yellow-400">modified</span>}
                          <span className="text-xs text-bb-dim ml-2">{pkg.description}</span>
                        </div>
                        <span className="text-sm font-mono text-bb-orange shrink-0">
                          ${pmtPrice.toLocaleString()}{pkg.recurring ? "/mo" : ""}
                        </span>
                        {pmtSelected && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              setPaymentExpandedPkgs(pmtExpanded
                                ? paymentExpandedPkgs.filter((p) => p !== pkg.id)
                                : [...paymentExpandedPkgs, pkg.id]
                              );
                            }}
                            className="p-0.5 text-bb-dim hover:text-white shrink-0"
                          >
                            {pmtExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                          </button>
                        )}
                      </label>
                      {pmtSelected && pmtExpanded && (
                        <div className="border border-t-0 border-bb-orange bg-bb-black/50 rounded-b-lg p-3 space-y-3">
                          <div>
                            <label className="block text-[10px] uppercase tracking-wider text-bb-dim font-medium mb-1">Price Override</label>
                            <div className="relative w-36">
                              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-bb-dim text-xs">$</span>
                              <input
                                type="number"
                                value={pmtCust?.priceOverride != null ? pmtCust.priceOverride : pkg.price}
                                onChange={(e) => {
                                  const val = e.target.value === "" ? undefined : Number(e.target.value);
                                  const next = {
                                    ...paymentCustomizations,
                                    [pkg.id]: { ...paymentCustomizations[pkg.id], priceOverride: val === pkg.price ? undefined : val },
                                  };
                                  setPaymentCustomizations(next);
                                  recalcPaymentTotals(paymentSelectedPkgs, paymentSelectedAddons, next);
                                }}
                                className="w-full pl-5 pr-2 py-1 bg-bb-surface border border-bb-border rounded text-xs text-white"
                                min="0"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="block text-[10px] uppercase tracking-wider text-bb-dim font-medium mb-1">Included Services</label>
                            <div className="space-y-1">
                              {pkg.deliverables.map((d, di) => {
                                const excl = pmtCust?.excludedDeliverables || [];
                                const incl = !excl.includes(di);
                                return (
                                  <label key={di} className="flex items-start gap-2 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={incl}
                                      onChange={(e) => {
                                        const prev = paymentCustomizations[pkg.id]?.excludedDeliverables || [];
                                        const nextExcl = e.target.checked ? prev.filter((i) => i !== di) : [...prev, di];
                                        const next = {
                                          ...paymentCustomizations,
                                          [pkg.id]: { ...paymentCustomizations[pkg.id], excludedDeliverables: nextExcl.length > 0 ? nextExcl : undefined },
                                        };
                                        setPaymentCustomizations(next);
                                        recalcPaymentTotals(paymentSelectedPkgs, paymentSelectedAddons, next);
                                      }}
                                      className="w-3 h-3 mt-0.5 rounded border-bb-border bg-bb-black accent-bb-orange shrink-0"
                                    />
                                    <span className={`text-[11px] ${incl ? "text-bb-muted" : "text-bb-dim line-through"}`}>{d}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      )}
                      </div>
                      );
                    })}
                  </div>
                );
              })}

              {/* Add-ons */}
              {ADDON_PACKAGES.length > 0 && (
                <div>
                  <span className="text-[10px] font-bold text-bb-dim uppercase tracking-wider">Add-Ons</span>
                  {ADDON_PACKAGES.map((addon) => {
                    const addonPmtCust = paymentCustomizations[addon.id];
                    const addonPmtPrice = addonPmtCust?.priceOverride != null ? addonPmtCust.priceOverride : addon.price;
                    return (
                    <label
                      key={addon.id}
                      className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors mb-1 ${
                        paymentSelectedAddons.includes(addon.id)
                          ? "border-bb-orange bg-bb-orange/5"
                          : "border-bb-border bg-bb-black hover:border-bb-dim"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={paymentSelectedAddons.includes(addon.id)}
                        onChange={(e) => {
                          const newAddons = e.target.checked
                            ? [...paymentSelectedAddons, addon.id]
                            : paymentSelectedAddons.filter((a) => a !== addon.id);
                          setPaymentSelectedAddons(newAddons);
                          if (!e.target.checked) {
                            const next = { ...paymentCustomizations };
                            delete next[addon.id];
                            setPaymentCustomizations(next);
                          }
                          const custRef = e.target.checked ? paymentCustomizations : (() => { const n = { ...paymentCustomizations }; delete n[addon.id]; return n; })();
                          const allSel = [
                            ...SERVICE_PACKAGES.filter((p) => paymentSelectedPkgs.includes(p.id)),
                            ...ADDON_PACKAGES.filter((a) => newAddons.includes(a.id)),
                          ];
                          if (allSel.length > 0) {
                            const hasRec = allSel.some((p) => p.recurring);
                            const total = allSel.reduce((s, p) => s + (custRef[p.id]?.priceOverride ?? p.price), 0);
                            setPaymentAmount(total.toString());
                            setPaymentDescription(allSel.map((p) => p.name).join(" + "));
                            if (hasRec && !paymentRecurring) setPaymentRecurring(true);
                          }
                        }}
                        className="w-3.5 h-3.5 rounded border-bb-border bg-bb-black accent-bb-orange shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-white font-medium">{addon.name}</span>
                        {addonPmtCust?.priceOverride != null && <span className="text-[9px] ml-1 text-yellow-400">modified</span>}
                      </div>
                      <span className="text-sm font-mono text-bb-orange shrink-0">
                        ${addonPmtPrice.toLocaleString()}{addon.recurring ? "/mo" : ""}
                      </span>
                      {paymentSelectedAddons.includes(addon.id) && (
                        <input
                          type="number"
                          value={addonPmtCust?.priceOverride != null ? addonPmtCust.priceOverride : addon.price}
                          onClick={(e) => e.preventDefault()}
                          onChange={(e) => {
                            const val = e.target.value === "" ? undefined : Number(e.target.value);
                            const next = {
                              ...paymentCustomizations,
                              [addon.id]: { ...paymentCustomizations[addon.id], priceOverride: val === addon.price ? undefined : val },
                            };
                            setPaymentCustomizations(next);
                            const allSel = [
                              ...SERVICE_PACKAGES.filter((p) => paymentSelectedPkgs.includes(p.id)),
                              ...ADDON_PACKAGES.filter((a) => paymentSelectedAddons.includes(a.id)),
                            ];
                            const total = allSel.reduce((s, p) => s + (next[p.id]?.priceOverride ?? p.price), 0);
                            setPaymentAmount(total.toString());
                          }}
                          className="w-20 px-2 py-1 bg-bb-surface border border-bb-border rounded text-xs text-white text-right"
                          min="0"
                        />
                      )}
                    </label>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-bb-border" />
            <span className="text-[10px] text-bb-dim uppercase">or customize below</span>
            <div className="flex-1 h-px bg-bb-border" />
          </div>

          <div>
            <label className="block text-sm font-medium text-white mb-1.5">Description *</label>
            <input
              type="text"
              value={paymentDescription}
              onChange={(e) => setPaymentDescription(e.target.value)}
              className="w-full px-3 py-2 bg-bb-black border border-bb-border rounded-lg text-white placeholder:text-bb-dim focus:outline-none focus:ring-2 focus:ring-bb-orange/50 text-sm"
              placeholder="e.g. Single Agent Build, AI Operations Package"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-white mb-1.5">Country</label>
              <select
                value={paymentCountry}
                onChange={(e) => {
                  const country = e.target.value;
                  setPaymentCountry(country);
                  const EU_COUNTRIES = ["DE", "AT", "NL", "BE", "FR", "IT", "ES", "PT", "IE", "FI", "SE", "DK", "PL", "CZ", "GR", "HU", "RO", "BG", "HR", "SK", "SI", "LT", "LV", "EE", "CY", "MT", "LU"];
                  setPaymentCurrency(EU_COUNTRIES.includes(country) ? "eur" : "usd");
                }}
                className="w-full px-3 py-2 bg-bb-black border border-bb-border rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-bb-orange/50"
              >
                <optgroup label="North America">
                  <option value="US">{"\uD83C\uDDFA\uD83C\uDDF8"} United States</option>
                  <option value="CA">{"\uD83C\uDDE8\uD83C\uDDE6"} Canada</option>
                  <option value="MX">{"\uD83C\uDDF2\uD83C\uDDFD"} Mexico</option>
                </optgroup>
                <optgroup label="Europe (EUR)">
                  <option value="DE">{"\uD83C\uDDE9\uD83C\uDDEA"} Germany</option>
                  <option value="AT">{"\uD83C\uDDE6\uD83C\uDDF9"} Austria</option>
                  <option value="NL">{"\uD83C\uDDF3\uD83C\uDDF1"} Netherlands</option>
                  <option value="BE">{"\uD83C\uDDE7\uD83C\uDDEA"} Belgium</option>
                  <option value="FR">{"\uD83C\uDDEB\uD83C\uDDF7"} France</option>
                  <option value="ES">{"\uD83C\uDDEA\uD83C\uDDF8"} Spain</option>
                  <option value="IT">{"\uD83C\uDDEE\uD83C\uDDF9"} Italy</option>
                  <option value="IE">{"\uD83C\uDDEE\uD83C\uDDEA"} Ireland</option>
                  <option value="PT">{"\uD83C\uDDF5\uD83C\uDDF9"} Portugal</option>
                  <option value="FI">{"\uD83C\uDDEB\uD83C\uDDEE"} Finland</option>
                  <option value="GR">{"\uD83C\uDDEC\uD83C\uDDF7"} Greece</option>
                  <option value="LU">{"\uD83C\uDDF1\uD83C\uDDFA"} Luxembourg</option>
                  <option value="SE">{"\uD83C\uDDF8\uD83C\uDDEA"} Sweden</option>
                  <option value="DK">{"\uD83C\uDDE9\uD83C\uDDF0"} Denmark</option>
                  <option value="PL">{"\uD83C\uDDF5\uD83C\uDDF1"} Poland</option>
                  <option value="CZ">{"\uD83C\uDDE8\uD83C\uDDFF"} Czech Republic</option>
                  <option value="HU">{"\uD83C\uDDED\uD83C\uDDFA"} Hungary</option>
                  <option value="RO">{"\uD83C\uDDF7\uD83C\uDDF4"} Romania</option>
                  <option value="HR">{"\uD83C\uDDED\uD83C\uDDF7"} Croatia</option>
                  <option value="SK">{"\uD83C\uDDF8\uD83C\uDDF0"} Slovakia</option>
                  <option value="SI">{"\uD83C\uDDF8\uD83C\uDDEE"} Slovenia</option>
                  <option value="BG">{"\uD83C\uDDE7\uD83C\uDDEC"} Bulgaria</option>
                  <option value="EE">{"\uD83C\uDDEA\uD83C\uDDEA"} Estonia</option>
                  <option value="LV">{"\uD83C\uDDF1\uD83C\uDDFB"} Latvia</option>
                  <option value="LT">{"\uD83C\uDDF1\uD83C\uDDF9"} Lithuania</option>
                  <option value="CY">{"\uD83C\uDDE8\uD83C\uDDFE"} Cyprus</option>
                  <option value="MT">{"\uD83C\uDDF2\uD83C\uDDF9"} Malta</option>
                </optgroup>
                <optgroup label="Europe (Non-EU)">
                  <option value="GB">{"\uD83C\uDDEC\uD83C\uDDE7"} United Kingdom</option>
                  <option value="CH">{"\uD83C\uDDE8\uD83C\uDDED"} Switzerland</option>
                  <option value="NO">{"\uD83C\uDDF3\uD83C\uDDF4"} Norway</option>
                </optgroup>
                <optgroup label="Africa">
                  <option value="ZA">{"\uD83C\uDDFF\uD83C\uDDE6"} South Africa</option>
                  <option value="NG">{"\uD83C\uDDF3\uD83C\uDDEC"} Nigeria</option>
                  <option value="KE">{"\uD83C\uDDF0\uD83C\uDDEA"} Kenya</option>
                  <option value="GH">{"\uD83C\uDDEC\uD83C\uDDED"} Ghana</option>
                  <option value="EG">{"\uD83C\uDDEA\uD83C\uDDEC"} Egypt</option>
                </optgroup>
                <optgroup label="Asia & Pacific">
                  <option value="AU">{"\uD83C\uDDE6\uD83C\uDDFA"} Australia</option>
                  <option value="NZ">{"\uD83C\uDDF3\uD83C\uDDFF"} New Zealand</option>
                  <option value="JP">{"\uD83C\uDDEF\uD83C\uDDF5"} Japan</option>
                  <option value="SG">{"\uD83C\uDDF8\uD83C\uDDEC"} Singapore</option>
                  <option value="IN">{"\uD83C\uDDEE\uD83C\uDDF3"} India</option>
                  <option value="AE">{"\uD83C\uDDE6\uD83C\uDDEA"} UAE</option>
                  <option value="IL">{"\uD83C\uDDEE\uD83C\uDDF1"} Israel</option>
                  <option value="PH">{"\uD83C\uDDF5\uD83C\uDDED"} Philippines</option>
                </optgroup>
                <optgroup label="South America">
                  <option value="BR">{"\uD83C\uDDE7\uD83C\uDDF7"} Brazil</option>
                  <option value="CO">{"\uD83C\uDDE8\uD83C\uDDF4"} Colombia</option>
                  <option value="AR">{"\uD83C\uDDE6\uD83C\uDDF7"} Argentina</option>
                  <option value="CL">{"\uD83C\uDDE8\uD83C\uDDF1"} Chile</option>
                </optgroup>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-bb-muted mb-1.5">Currency (auto)</label>
              <div className="px-3 py-2 bg-bb-black border border-bb-border rounded-lg text-white text-sm">
                {paymentCurrency === "eur" ? "\u20AC EUR" : "$ USD"}
              </div>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-white mb-1.5">Amount *</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-bb-dim text-sm">
                {paymentCurrency === "usd" ? "$" : "\u20AC"}
              </span>
              <input
                type="number"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                className="w-full pl-7 pr-3 py-2 bg-bb-black border border-bb-border rounded-lg text-white placeholder:text-bb-dim focus:outline-none focus:ring-2 focus:ring-bb-orange/50 text-sm"
                placeholder="5000"
                min="1"
                step="1"
              />
            </div>
          </div>
          <div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={paymentRecurring}
                onChange={(e) => setPaymentRecurring(e.target.checked)}
                className="w-4 h-4 rounded border-bb-border bg-bb-black accent-bb-orange"
              />
              <span className="text-sm text-white font-medium">Recurring subscription</span>
            </label>
            {paymentRecurring && (
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentInterval("month")}
                  className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors ${
                    paymentInterval === "month"
                      ? "border-bb-orange bg-bb-orange/10 text-bb-orange"
                      : "border-bb-border bg-bb-black text-bb-muted hover:border-bb-orange/30"
                  }`}
                >
                  Monthly
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentInterval("year")}
                  className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors ${
                    paymentInterval === "year"
                      ? "border-bb-orange bg-bb-orange/10 text-bb-orange"
                      : "border-bb-border bg-bb-black text-bb-muted hover:border-bb-orange/30"
                  }`}
                >
                  Yearly
                </button>
              </div>
            )}
          </div>
          {paymentAmount && Number(paymentAmount) > 0 && (
            <div className="p-3 bg-bb-black rounded-lg border border-bb-border">
              <div className="flex justify-between text-sm">
                <span className="text-bb-dim">{paymentRecurring ? "Subscription" : "Payment"} amount</span>
                <span className="text-white font-mono font-semibold">
                  {new Intl.NumberFormat("en-US", { style: "currency", currency: paymentCurrency }).format(Number(paymentAmount))}
                  {paymentRecurring && <span className="text-bb-dim font-normal">/{paymentInterval === "year" ? "yr" : "mo"}</span>}
                </span>
              </div>
            </div>
          )}
          <div className="flex gap-3 justify-end pt-2">
            <button
              onClick={() => setShowPaymentModal(false)}
              className="px-4 py-2 text-sm text-bb-muted hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleGeneratePaymentLink}
              disabled={!paymentAmount || Number(paymentAmount) <= 0 || !paymentDescription.trim() || generatingPayment}
              className="flex items-center gap-2 px-4 py-2 bg-bb-orange hover:bg-bb-orange-light text-white text-sm font-medium rounded-md transition-colors disabled:opacity-50"
            >
              {generatingPayment ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <CreditCard size={14} />
                  Create Payment Link
                </>
              )}
            </button>
          </div>
        </div>
      </Modal>

      {/* Update Subscription Price Modal */}
      <Modal open={showUpdatePriceModal} onClose={() => setShowUpdatePriceModal(false)} title="Update Subscription Price">
        <div className="space-y-4">
          {updatePriceLink && (
            <>
              <div className="p-3 bg-bb-black rounded-lg border border-bb-border">
                <p className="text-sm text-white font-medium">{updatePriceLink.description}</p>
                <p className="text-xs text-bb-dim mt-1">
                  Current: {new Intl.NumberFormat("en-US", { style: "currency", currency: updatePriceLink.currency || "usd" }).format(updatePriceLink.amount / 100)}
                  /{updatePriceLink.interval === "year" ? "yr" : "mo"}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-white mb-1.5">New Amount *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-bb-dim text-sm">
                    {updatePriceLink.currency === "eur" ? "€" : "$"}
                  </span>
                  <input
                    type="number"
                    value={updatePriceAmount}
                    onChange={(e) => setUpdatePriceAmount(e.target.value)}
                    className="w-full pl-7 pr-3 py-2 bg-bb-black border border-bb-border rounded-lg text-white placeholder:text-bb-dim focus:outline-none focus:ring-2 focus:ring-bb-orange/50 text-sm"
                    placeholder="5000"
                    min="1"
                    step="1"
                  />
                </div>
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={updatePriceProrate}
                  onChange={(e) => setUpdatePriceProrate(e.target.checked)}
                  className="w-4 h-4 rounded border-bb-border bg-bb-black text-bb-orange focus:ring-bb-orange/50 accent-bb-orange"
                />
                <div>
                  <span className="text-sm text-white">Prorate remaining billing period</span>
                  <p className="text-xs text-bb-dim">Charge or credit the difference for the current period</p>
                </div>
              </label>
              {updatePriceAmount && Number(updatePriceAmount) > 0 && Number(updatePriceAmount) * 100 !== updatePriceLink.amount && (
                <div className="p-3 bg-bb-black rounded-lg border border-bb-border">
                  <div className="flex justify-between text-sm">
                    <span className="text-bb-dim">New price</span>
                    <span className="text-white font-mono font-semibold">
                      {new Intl.NumberFormat("en-US", { style: "currency", currency: updatePriceLink.currency || "usd" }).format(Number(updatePriceAmount))}
                      /{updatePriceLink.interval === "year" ? "yr" : "mo"}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs mt-1">
                    <span className="text-bb-dim">Change</span>
                    <span className={Number(updatePriceAmount) * 100 > updatePriceLink.amount ? "text-green-400" : "text-red-400"}>
                      {Number(updatePriceAmount) * 100 > updatePriceLink.amount ? "↑ Upgrade" : "↓ Downgrade"}
                    </span>
                  </div>
                </div>
              )}
              <div className="flex gap-3 justify-end pt-2">
                <button
                  onClick={() => setShowUpdatePriceModal(false)}
                  className="px-4 py-2 text-sm text-bb-muted hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    if (!updatePriceLink || !updatePriceAmount || Number(updatePriceAmount) <= 0) return;
                    setUpdatingPrice(true);
                    try {
                      const res = await fetch(`/api/clients/${id}/payment-link/${updatePriceLink.id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ amount: Number(updatePriceAmount), prorate: updatePriceProrate }),
                      });
                      const data = await res.json();
                      if (data.success) {
                        setShowUpdatePriceModal(false);
                        setUpdatePriceLink(null);
                        fetchClient();
                      } else {
                        alert(data.error || "Failed to update price");
                      }
                    } catch {
                      alert("Failed to update price");
                    } finally {
                      setUpdatingPrice(false);
                    }
                  }}
                  disabled={!updatePriceAmount || Number(updatePriceAmount) <= 0 || Number(updatePriceAmount) * 100 === updatePriceLink.amount || updatingPrice}
                  className="flex items-center gap-2 px-4 py-2 bg-bb-orange hover:bg-bb-orange-light text-white text-sm font-medium rounded-md transition-colors disabled:opacity-50"
                >
                  {updatingPrice ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Updating...
                    </>
                  ) : (
                    <>
                      <CreditCard size={14} />
                      Update Price
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
