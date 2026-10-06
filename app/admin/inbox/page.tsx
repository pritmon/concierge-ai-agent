"use client";

import { useEffect, useState } from "react";
import { Markdown } from "@/components/Markdown";
import {
  buttonClass,
  Card,
  inputClass,
  secondaryButtonClass,
  send,
  StatusBadge,
  timeAgo,
  useApi,
} from "@/components/admin/ui";

interface ConversationSummary {
  id: string;
  customer_email: string | null;
  customer_name: string | null;
  status: string;
  escalation_reason: string | null;
  csat: number | null;
  updated_at: string;
  first_message: string | null;
  last_message: string | null;
  message_count: number;
}

interface Detail {
  conversation: ConversationSummary & { summary: string | null; created_at: string };
  messages: {
    id: number;
    role: "customer" | "ai" | "human" | "tool" | "system";
    content: string;
    meta: Record<string, unknown> | null;
    created_at: string;
  }[];
}

const FILTERS = [
  { key: "all", label: "All" },
  { key: "escalated", label: "Needs human" },
  { key: "ai", label: "AI handling" },
  { key: "resolved", label: "Resolved" },
  { key: "closed", label: "Closed" },
];

export default function Inbox() {
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const status = new URLSearchParams(window.location.search).get("status");
    // Read after mount so server and client render the same initial markup.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (status) setFilter(status);
  }, []);

  const list = useApi<{ conversations: ConversationSummary[] }>(`/api/admin/conversations?status=${filter}`, 4000);

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4 lg:h-[calc(100dvh-3rem)] lg:flex-row">
      <Card className="flex flex-col overflow-hidden lg:w-96 lg:shrink-0">
        <div className="border-b border-slate-200 p-3">
          <h1 className="mb-2 px-1 text-lg font-semibold">Inbox</h1>
          <div className="flex flex-wrap gap-1">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`rounded-md px-2.5 py-1 text-xs ${filter === f.key ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <div className="max-h-[50vh] flex-1 overflow-y-auto lg:max-h-none">
          {list.data?.conversations.length === 0 && (
            <p className="p-4 text-sm text-slate-500">No conversations yet. Start one from the storefront chat.</p>
          )}
          {list.data?.conversations.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelected(c.id)}
              className={`block w-full border-b border-slate-100 px-4 py-3 text-left hover:bg-slate-50 ${selected === c.id ? "bg-indigo-50/60" : ""}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">{c.customer_name ?? c.customer_email ?? "Guest visitor"}</span>
                <span className="shrink-0 text-xs text-slate-400">{timeAgo(c.updated_at)}</span>
              </div>
              <div className="mt-0.5 truncate text-sm text-slate-600">{c.first_message ?? "(no messages)"}</div>
              <div className="mt-1.5 flex items-center gap-2">
                <StatusBadge status={c.status} />
                {c.csat === 1 && <span className="text-xs">👍</span>}
                {c.csat === -1 && <span className="text-xs">👎</span>}
                <span className="text-xs text-slate-400">{c.message_count} messages</span>
              </div>
            </button>
          ))}
        </div>
      </Card>

      <Card className="flex min-h-[60vh] flex-1 flex-col overflow-hidden">
        {selected ? (
          <ConversationView key={selected} id={selected} onChange={list.reload} />
        ) : (
          <div className="flex flex-1 items-center justify-center p-8 text-sm text-slate-500">Select a conversation</div>
        )}
      </Card>
    </div>
  );
}

function ConversationView({ id, onChange }: { id: string; onChange: () => void }) {
  const { data, reload } = useApi<Detail>(`/api/admin/conversations/${id}`, 3000);
  const [reply, setReply] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!data) return <div className="p-6 text-sm text-slate-500">Loading…</div>;
  const c = data.conversation;

  async function act(body: unknown) {
    setError(null);
    try {
      await send(`/api/admin/conversations/${id}`, "POST", body);
      await reload();
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }

  async function sendReply() {
    if (!reply.trim()) return;
    setSending(true);
    await act({ action: "reply", text: reply });
    setReply("");
    setSending(false);
  }

  async function draft() {
    setDrafting(true);
    setError(null);
    try {
      const { draft } = await send(`/api/admin/conversations/${id}/draft`, "POST");
      setReply(draft);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Draft failed");
    } finally {
      setDrafting(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium">{c.customer_name ?? c.customer_email ?? "Guest visitor"}</span>
            <StatusBadge status={c.status} />
          </div>
          <div className="text-xs text-slate-500">
            {c.customer_email ? `${c.customer_email} · signed in` : "Not signed in"} · started {timeAgo(c.created_at)}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {c.status !== "ai" && (
            <button className={secondaryButtonClass} onClick={() => act({ action: "status", status: "ai" })}>
              Hand back to AI
            </button>
          )}
          {c.status !== "resolved" && (
            <button className={secondaryButtonClass} onClick={() => act({ action: "status", status: "resolved" })}>
              Mark resolved
            </button>
          )}
          {c.status !== "closed" && (
            <button className={secondaryButtonClass} onClick={() => act({ action: "status", status: "closed" })}>
              Close
            </button>
          )}
        </div>
      </div>

      {c.escalation_reason && (
        <div className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm">
          <div className="font-medium text-amber-900">Handoff: {c.escalation_reason}</div>
          {c.summary && <p className="mt-1 whitespace-pre-wrap text-amber-900/80">{c.summary}</p>}
        </div>
      )}

      <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
        {data.messages.map((m) => {
          if (m.role === "tool") return <ToolRow key={m.id} message={m} />;
          if (m.role === "system")
            return (
              <div key={m.id} className="text-center text-xs text-slate-500">
                {m.content}
              </div>
            );
          const fromCustomer = m.role === "customer";
          const sources = (m.meta?.sources as { title: string }[] | undefined) ?? [];
          return (
            <div key={m.id} className={`flex ${fromCustomer ? "justify-start" : "justify-end"}`}>
              <div className="max-w-[80%]">
                <div className={`mb-1 text-[11px] text-slate-500 ${fromCustomer ? "" : "text-right"}`}>
                  {fromCustomer ? "Customer" : m.role === "ai" ? "AI agent" : "Support team"} · {timeAgo(m.created_at)}
                </div>
                <div
                  className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                    fromCustomer ? "bg-slate-100" : m.role === "ai" ? "bg-indigo-50 ring-1 ring-indigo-100" : "bg-amber-50 ring-1 ring-amber-200"
                  }`}
                >
                  {fromCustomer ? <p className="whitespace-pre-wrap">{m.content}</p> : <Markdown text={m.content} />}
                  {sources.length > 0 && (
                    <div className="mt-2 border-t border-indigo-100 pt-1.5 text-xs text-slate-500">
                      Sources: {sources.map((s) => s.title).join(" · ")}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t border-slate-200 p-4">
        {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
        <textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          rows={3}
          placeholder={c.status === "escalated" ? "Reply to the customer…" : "Replying takes the conversation over from the AI…"}
          className={inputClass}
        />
        <div className="mt-2 flex justify-between gap-2">
          <button className={secondaryButtonClass} onClick={draft} disabled={drafting}>
            {drafting ? "Drafting…" : "✨ Draft reply with AI"}
          </button>
          <button className={buttonClass} onClick={sendReply} disabled={sending || !reply.trim()}>
            Send reply
          </button>
        </div>
      </div>
    </>
  );
}

function ToolRow({ message }: { message: Detail["messages"][number] }) {
  const [open, setOpen] = useState(false);
  const meta = message.meta ?? {};
  const isError = Boolean(meta.isError);
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] text-xs">
        <button
          onClick={() => setOpen((v) => !v)}
          className={`rounded-md px-2 py-1 font-mono ring-1 ${isError ? "bg-red-50 text-red-700 ring-red-200" : "bg-slate-50 text-slate-600 ring-slate-200"}`}
        >
          ⚙ {String(meta.tool ?? message.content)}
          {isError ? " · blocked" : ""} {open ? "▾" : "▸"}
        </button>
        {open && (
          <pre className="mt-1 max-h-64 overflow-auto rounded-md bg-slate-900 p-3 text-[11px] leading-relaxed text-slate-100">
            {JSON.stringify({ input: meta.input, output: meta.output }, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}
