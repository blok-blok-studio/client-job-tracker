"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Edit2, Plus, Check, X, Trash2, Copy, Link2, ExternalLink, Clock, FileText, Loader2 } from "lucide-react";
import Link from "next/link";
import TopBar from "@/components/layout/TopBar";
import Badge from "@/components/shared/Badge";
import Modal from "@/components/shared/Modal";
import EditClientForm from "@/components/clients/EditClientForm";
import { formatCurrency, formatRelativeDate } from "@/lib/utils";
import { PLATFORM_OPTIONS } from "@/types";
import { getFlagFromPhone, LiveClock } from "@/lib/client-utils";
import { SERVICE_PACKAGES, ADDON_PACKAGES } from "@/lib/contract-templates";

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
  contacts: Array<{ id: string; name: string; role: string | null; email: string | null; phone: string | null; isPrimary: boolean }>;
  tasks: Array<{ id: string; title: string; status: string; priority: string; dueDate: string | null }>;
  credentials: Array<{ id: string; platform: string; username: string }>;
  checklistItems: Array<{ id: string; label: string; checked: boolean }>;
  invoices: Array<{ id: string; amount: string | number; status: string; createdAt: string }>;
  socialLinks: Array<{ id: string; platform: string; url: string; handle: string | null }>;
  activityLogs: Array<{ id: string; action: string; details: string | null; actor: string; createdAt: string }>;
  contracts: Array<{ id: string; token: string; status: string; signedName: string | null; signedAt: string | null; createdAt: string }>;
}

const tierVariant: Record<string, "orange" | "gray" | "blue"> = { VIP: "orange", STANDARD: "gray", TRIAL: "blue" };
const typeVariant: Record<string, "green" | "yellow" | "gray" | "red"> = { ACTIVE: "green", PROSPECT: "yellow", PAST: "gray", ARCHIVED: "red" };

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [client, setClient] = useState<ClientDetail | null>(null);
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
  const [customTerms, setCustomTerms] = useState("");
  const [generatingContract, setGeneratingContract] = useState(false);
  const [contractCopied, setContractCopied] = useState<string | null>(null);

  const fetchClient = useCallback(async () => {
    const res = await fetch(`/api/clients/${id}`);
    const data = await res.json();
    if (data.success) setClient(data.data);
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
    if (selectedPackages.length === 0) return;
    setGeneratingContract(true);
    try {
      const res = await fetch(`/api/clients/${id}/contract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packages: selectedPackages,
          addons: selectedAddons,
          customTerms: customTerms.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setShowContractModal(false);
        setSelectedPackages([]);
        setSelectedAddons([]);
        setCustomTerms("");
        fetchClient();
      }
    } catch { /* stay on modal */ }
    finally { setGeneratingContract(false); }
  }

  function handleCopyContractLink(token: string) {
    navigator.clipboard.writeText(`${window.location.origin}/contract/${token}`);
    setContractCopied(token);
    setTimeout(() => setContractCopied(null), 2000);
  }

  async function handleDeleteSocial(linkId: string) {
    try {
      await fetch(`/api/clients/${id}/social-links?linkId=${linkId}`, { method: "DELETE" });
      fetchClient();
    } catch { /* silently fail */ }
  }

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
              <h3 className="font-display font-semibold mb-4">Onboarding Checklist</h3>
              <div className="space-y-2">
                {client.checklistItems.map((item) => (
                  <label key={item.id} className="flex items-center gap-3 p-1.5 rounded hover:bg-bb-elevated cursor-pointer">
                    <input type="checkbox" checked={item.checked} onChange={() => handleToggleChecklist(item.id, item.checked)} className="w-4 h-4 rounded border-bb-border bg-bb-black accent-bb-orange" />
                    <span className={`text-sm ${item.checked ? "text-bb-dim line-through" : "text-bb-muted"}`}>{item.label}</span>
                  </label>
                ))}
              </div>
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
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          contract.status === "SIGNED"
                            ? "bg-green-500/10 text-green-400"
                            : "bg-yellow-500/10 text-yellow-400"
                        }`}>
                          {contract.status === "SIGNED" ? "Signed" : "Pending"}
                        </span>
                      </div>
                      {contract.status === "SIGNED" && contract.signedName && (
                        <p className="text-xs text-bb-muted">
                          Signed by {contract.signedName} on {new Date(contract.signedAt!).toLocaleString()}
                        </p>
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
              <h3 className="font-display font-semibold mb-4">Invoices</h3>
              <div className="space-y-2">
                {client.invoices.map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between p-2 rounded hover:bg-bb-elevated text-sm">
                    <span className="font-mono">{formatCurrency(Number(inv.amount))}</span>
                    <Badge variant={inv.status === "PAID" ? "green" : inv.status === "OVERDUE" ? "red" : "default"} size="sm">{inv.status}</Badge>
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
            <h4 className="text-sm font-medium text-white mb-3">Select Package *</h4>
            <div className="space-y-2">
              {SERVICE_PACKAGES.map((pkg) => (
                <label key={pkg.id} className="flex items-start gap-3 p-3 rounded-lg border border-bb-border hover:border-bb-orange/30 cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={selectedPackages.includes(pkg.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedPackages([...selectedPackages, pkg.id]);
                      } else {
                        setSelectedPackages(selectedPackages.filter((p) => p !== pkg.id));
                      }
                    }}
                    className="w-4 h-4 mt-0.5 rounded border-bb-border bg-bb-black accent-bb-orange"
                  />
                  <div>
                    <span className="text-sm font-medium text-white">{pkg.name}</span>
                    <span className="text-sm text-bb-orange ml-2">${pkg.price.toLocaleString()}</span>
                    <p className="text-xs text-bb-dim mt-0.5">{pkg.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div>
            <h4 className="text-sm font-medium text-white mb-3">Add-Ons (Optional)</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
              {ADDON_PACKAGES.map((addon) => (
                <label key={addon.id} className="flex items-center gap-2 p-2 rounded border border-bb-border hover:border-bb-orange/30 cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={selectedAddons.includes(addon.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedAddons([...selectedAddons, addon.id]);
                      } else {
                        setSelectedAddons(selectedAddons.filter((a) => a !== addon.id));
                      }
                    }}
                    className="w-3.5 h-3.5 rounded border-bb-border bg-bb-black accent-bb-orange"
                  />
                  <div>
                    <span className="text-xs font-medium text-white">{addon.name}</span>
                    <span className="text-xs text-bb-orange ml-1">${addon.price.toLocaleString()}</span>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {(selectedPackages.length > 0 || selectedAddons.length > 0) && (
            <div className="p-3 bg-bb-black rounded-lg border border-bb-border">
              <div className="flex justify-between text-sm">
                <span className="text-bb-dim">Total</span>
                <span className="text-white font-mono font-semibold">
                  ${[...SERVICE_PACKAGES.filter((p) => selectedPackages.includes(p.id)),
                    ...ADDON_PACKAGES.filter((a) => selectedAddons.includes(a.id))]
                    .reduce((sum, item) => sum + item.price, 0)
                    .toLocaleString()}
                </span>
              </div>
            </div>
          )}

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

          <div className="flex gap-3 justify-end">
            <button
              onClick={() => setShowContractModal(false)}
              className="px-4 py-2 text-sm text-bb-muted hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleGenerateContract}
              disabled={selectedPackages.length === 0 || generatingContract}
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
    </div>
  );
}
