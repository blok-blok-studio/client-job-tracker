"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Send } from "lucide-react";
import TopBar from "@/components/layout/TopBar";
import Badge from "@/components/shared/Badge";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  sender: string;
  text: string;
  createdAt: string;
}

interface TicketDetail {
  id: string;
  subject: string;
  status: string;
  priority: string;
  createdAt: string;
  client: { id: string; name: string; company: string | null; tier: string };
  messages: Message[];
}

const statusVariant: Record<string, "green" | "orange" | "blue" | "gray"> = {
  OPEN: "orange",
  IN_PROGRESS: "blue",
  RESOLVED: "green",
  CLOSED: "gray",
};

export default function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchTicket = useCallback(async () => {
    const res = await fetch(`/api/support/${id}`);
    const data = await res.json();
    if (data.success) setTicket(data.data);
  }, [id]);

  useEffect(() => {
    fetchTicket();
    // Poll for new messages every 10 seconds
    const interval = setInterval(fetchTicket, 10000);
    return () => clearInterval(interval);
  }, [fetchTicket]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [ticket?.messages.length]);

  async function handleSendReply(e: React.FormEvent) {
    e.preventDefault();
    if (!reply.trim() || sending) return;

    setSending(true);
    await fetch(`/api/support/${id}/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: reply, sender: "chase" }),
    });
    setReply("");
    setSending(false);
    fetchTicket();
  }

  async function handleStatusChange(status: string) {
    await fetch(`/api/support/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    fetchTicket();
  }

  if (!ticket) return <div className="p-6 text-bb-dim">Loading...</div>;

  return (
    <div className="flex flex-col h-[calc(100vh-1rem)]">
      <TopBar title={ticket.subject} subtitle={`${ticket.client.name}${ticket.client.company ? ` · ${ticket.client.company}` : ""}`} />
      <div className="px-4 lg:px-6 flex-1 flex flex-col min-h-0 pb-4">
        {/* Header bar */}
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <button onClick={() => router.back()} className="flex items-center gap-1 text-sm text-bb-muted hover:text-white transition-colors">
            <ArrowLeft size={16} /> Back
          </button>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={statusVariant[ticket.status] || "gray"}>{ticket.status.replace("_", " ")}</Badge>
            {ticket.status !== "RESOLVED" && ticket.status !== "CLOSED" && (
              <button
                onClick={() => handleStatusChange("RESOLVED")}
                className="px-3 py-1.5 text-xs bg-green-500/10 text-green-400 hover:bg-green-500/20 rounded-md transition-colors"
              >
                Mark Resolved
              </button>
            )}
            {ticket.status === "RESOLVED" && (
              <button
                onClick={() => handleStatusChange("CLOSED")}
                className="px-3 py-1.5 text-xs bg-bb-elevated text-bb-muted hover:text-white rounded-md transition-colors"
              >
                Close Ticket
              </button>
            )}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 bg-bb-surface border border-bb-border rounded-lg overflow-y-auto min-h-0">
          <div className="p-4 space-y-4">
            {ticket.messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "flex",
                  msg.sender === "client" ? "justify-start" : "justify-end"
                )}
              >
                <div
                  className={cn(
                    "max-w-[75%] rounded-lg px-4 py-2.5",
                    msg.sender === "client"
                      ? "bg-bb-elevated text-white"
                      : msg.sender === "bot"
                        ? "bg-bb-border/50 text-bb-muted italic"
                        : "bg-bb-orange/20 text-white"
                  )}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-bb-dim">
                      {msg.sender === "client" ? ticket.client.name : msg.sender === "bot" ? "Bot" : "Chase"}
                    </span>
                    <span className="text-xs text-bb-dim">
                      {formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Reply input */}
        {ticket.status !== "CLOSED" && (
          <form onSubmit={handleSendReply} className="mt-3 flex gap-2">
            <input
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder="Type a reply..."
              className="flex-1 px-4 py-2.5 bg-bb-surface border border-bb-border rounded-lg text-sm text-white placeholder:text-bb-dim focus:outline-none focus:ring-2 focus:ring-bb-orange/50"
            />
            <button
              type="submit"
              disabled={!reply.trim() || sending}
              className="px-4 py-2.5 bg-bb-orange hover:bg-bb-orange-light text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Send size={16} />
              <span className="hidden sm:inline text-sm font-medium">Send</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
