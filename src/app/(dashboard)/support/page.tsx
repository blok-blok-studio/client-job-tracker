"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import TopBar from "@/components/layout/TopBar";
import Badge from "@/components/shared/Badge";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

const TABS = [
  { key: "ALL", label: "All" },
  { key: "OPEN", label: "Open" },
  { key: "IN_PROGRESS", label: "Active" },
  { key: "RESOLVED", label: "Resolved" },
  { key: "CLOSED", label: "Closed" },
];

const statusVariant: Record<string, "green" | "orange" | "blue" | "gray" | "red"> = {
  OPEN: "orange",
  IN_PROGRESS: "blue",
  RESOLVED: "green",
  CLOSED: "gray",
};

const priorityVariant: Record<string, "red" | "orange" | "blue" | "gray"> = {
  URGENT: "red",
  HIGH: "orange",
  MEDIUM: "blue",
  LOW: "gray",
};

interface Ticket {
  id: string;
  subject: string;
  status: string;
  priority: string;
  createdAt: string;
  updatedAt: string;
  client: { name: string; company: string | null; tier: string };
  messages: Array<{ text: string; sender: string; createdAt: string }>;
  _count: { messages: number };
}

export default function SupportPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [activeTab, setActiveTab] = useState("ALL");

  const fetchTickets = useCallback(async () => {
    const params = new URLSearchParams();
    if (activeTab !== "ALL") params.set("status", activeTab);
    const res = await fetch(`/api/support?${params}`);
    const data = await res.json();
    if (data.success) setTickets(data.data);
  }, [activeTab]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  return (
    <div>
      <TopBar title="Support" subtitle="Client support tickets via Telegram" />
      <div className="px-4 lg:px-6 space-y-4">
        {/* Tabs */}
        <div className="flex gap-1 bg-bb-surface border border-bb-border rounded-lg p-1 overflow-x-auto w-full sm:w-auto">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "px-3 py-1.5 text-sm rounded-md transition-colors whitespace-nowrap",
                activeTab === tab.key
                  ? "bg-bb-orange text-white"
                  : "text-bb-muted hover:text-white"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tickets List */}
        <div className="bg-bb-surface border border-bb-border rounded-lg divide-y divide-bb-border">
          {tickets.length === 0 ? (
            <div className="px-5 py-12 text-center text-bb-dim text-sm">
              No support tickets yet. When clients message your Telegram bot, tickets will appear here.
            </div>
          ) : (
            tickets.map((ticket) => (
              <Link
                key={ticket.id}
                href={`/support/${ticket.id}`}
                className="flex items-center gap-4 px-5 py-4 hover:bg-bb-elevated/50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium truncate">{ticket.subject}</span>
                    <Badge variant={priorityVariant[ticket.priority] || "gray"} size="sm">
                      {ticket.priority}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-bb-dim">
                    <span>{ticket.client.name}</span>
                    {ticket.client.company && (
                      <>
                        <span>·</span>
                        <span>{ticket.client.company}</span>
                      </>
                    )}
                    <span>·</span>
                    <span>{ticket._count.messages} messages</span>
                    <span>·</span>
                    <span>{formatDistanceToNow(new Date(ticket.updatedAt), { addSuffix: true })}</span>
                  </div>
                  {ticket.messages[0] && (
                    <p className="text-xs text-bb-muted mt-1 line-clamp-1">
                      {ticket.messages[0].sender === "client" ? "Client: " : "You: "}
                      {ticket.messages[0].text}
                    </p>
                  )}
                </div>
                <Badge variant={statusVariant[ticket.status] || "gray"} size="sm">
                  {ticket.status.replace("_", " ")}
                </Badge>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
