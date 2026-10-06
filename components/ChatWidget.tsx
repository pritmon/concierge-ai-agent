"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Markdown } from "./Markdown";

interface WidgetConfig {
  agentName: string;
  companyName: string;
  greeting: string;
  brandColor: string;
}

interface ChatMessage {
  id?: number;
  role: "customer" | "ai" | "human" | "system";
  content: string;
  sources?: { id: number; title: string }[];
  streaming?: boolean;
}

interface ServerMessage {
  id: number;
  role: ChatMessage["role"];
  content: string;
  meta: { sources?: { id: number; title: string }[] } | null;
}

type Status = "ai" | "escalated" | "resolved" | "closed";

function storageGet(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function storageSet(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: the chat still works for this page view */
  }
}

export function ChatWidget() {
  const [config, setConfig] = useState<WidgetConfig | null>(null);
  const [customer, setCustomer] = useState<{ email: string; name?: string } | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<Status>("ai");
  const [csat, setCsat] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [toolLabel, setToolLabel] = useState<string | null>(null);
  const [embedded, setEmbedded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const storageKey = `concierge:conversation:${customer?.email ?? "guest"}`;

  // Identity comes from the embed script's query params.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const email = params.get("email");
    // Identity is only known in the browser; read it after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCustomer(email ? { email, name: params.get("name") ?? undefined } : null);
    setEmbedded(params.get("embedded") === "1");
    fetch("/api/widget-config")
      .then((r) => r.json())
      .then(setConfig)
      .catch(() => setConfig({ agentName: "Assistant", companyName: "", greeting: "Hi! How can I help?", brandColor: "#4f46e5" }));
  }, []);

  const sync = useCallback(async (id: string) => {
    const res = await fetch(`/api/conversations/${id}/messages`);
    if (!res.ok) return false;
    const data = (await res.json()) as { status: Status; csat: number | null; messages: ServerMessage[] };
    setStatus(data.status);
    setCsat(data.csat);
    setMessages(
      data.messages.map((m) => ({ id: m.id, role: m.role, content: m.content, sources: m.meta?.sources })),
    );
    return true;
  }, []);

  // Restore an existing conversation for this customer.
  useEffect(() => {
    if (config === null) return;
    const saved = storageGet(storageKey);
    if (saved) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring server state for a saved conversation
      sync(saved).then((ok) => {
        if (ok) setConversationId(saved);
        else storageSet(storageKey, null);
      });
    }
  }, [config, storageKey, sync]);

  // While a human owns the conversation, poll for their replies.
  useEffect(() => {
    if (!conversationId || status !== "escalated" || busy) return;
    const timer = setInterval(() => void sync(conversationId), 3000);
    return () => clearInterval(timer);
  }, [conversationId, status, busy, sync]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, toolLabel]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setInput("");
    setBusy(true);
    setCsat(null);
    setMessages((prev) => [...prev, { role: "customer", content: message }]);

    const updateAi = (fn: (m: ChatMessage) => ChatMessage) =>
      setMessages((prev) => {
        const last = prev.at(-1);
        if (last?.role === "ai" && last.streaming) return [...prev.slice(0, -1), fn(last)];
        return [...prev, fn({ role: "ai", content: "", streaming: true })];
      });

    let id = conversationId;
    let errorMessage: string | null = null;
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: id, message, customer: customer ?? undefined }),
      });
      if (!res.ok || !res.body) throw new Error("Request failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";
        for (const chunk of chunks) {
          if (!chunk.startsWith("data: ")) continue;
          const event = JSON.parse(chunk.slice(6));
          switch (event.type) {
            case "conversation":
              id = event.id;
              setConversationId(event.id);
              storageSet(storageKey, event.id);
              break;
            case "text":
              setToolLabel(null);
              updateAi((m) => ({ ...m, content: m.content + event.delta }));
              break;
            case "reset":
              updateAi((m) => ({ ...m, content: "" }));
              break;
            case "tool":
              setToolLabel(event.label);
              break;
            case "escalated":
              setStatus("escalated");
              break;
            case "error":
              errorMessage = event.message;
              break;
          }
        }
      }
    } catch {
      errorMessage = "Connection problem. Please try again.";
    } finally {
      setBusy(false);
      setToolLabel(null);
      if (id) await sync(id);
      // Errors aren't stored server-side, so show them after the resync.
      if (errorMessage) setMessages((prev) => [...prev, { role: "system", content: errorMessage! }]);
    }
  }

  async function giveFeedback(rating: 1 | -1) {
    if (!conversationId) return;
    setCsat(rating);
    const res = await fetch(`/api/conversations/${conversationId}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating }),
    });
    if (res.ok) await sync(conversationId);
  }

  async function requestHuman() {
    if (!conversationId) return;
    await fetch(`/api/conversations/${conversationId}/handoff`, { method: "POST" });
    await sync(conversationId);
  }

  function newConversation() {
    storageSet(storageKey, null);
    setConversationId(null);
    setMessages([]);
    setStatus("ai");
    setCsat(null);
  }

  const brand = config?.brandColor ?? "#4f46e5";
  const lastAiIndex = messages.findLastIndex((m) => m.role === "ai");
  const showFeedback = !busy && status === "ai" && csat === null && lastAiIndex === messages.length - 1 && lastAiIndex >= 0;
  const humanJoined = messages.some((m) => m.role === "human");

  return (
    <div className="flex h-dvh flex-col bg-white text-slate-900" style={{ ["--brand" as string]: brand }}>
      <header className="flex items-center gap-3 px-4 py-3 text-white" style={{ background: brand }}>
        <div className="flex size-9 items-center justify-center rounded-full bg-white/20 text-sm font-semibold">
          {config?.agentName.slice(0, 1) ?? "·"}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold leading-tight">
            {humanJoined && status === "escalated" ? `${config?.companyName} Support` : config?.agentName ?? " "}
          </div>
          <div className="truncate text-xs text-white/80">
            {status === "escalated"
              ? humanJoined
                ? "A teammate is helping you"
                : "Waiting for a teammate…"
              : "AI agent · replies instantly"}
          </div>
        </div>
        <button
          onClick={newConversation}
          className="rounded-md px-2 py-1 text-xs text-white/90 hover:bg-white/15"
          title="Start a new conversation"
        >
          New chat
        </button>
        {embedded && (
          <button
            onClick={() => window.parent.postMessage({ type: "concierge:close" }, "*")}
            className="rounded-md px-2 py-1 text-lg leading-none text-white/90 hover:bg-white/15"
            aria-label="Close chat"
          >
            ×
          </button>
        )}
      </header>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {config && (
          <Bubble role="ai" brand={brand}>
            <Markdown text={config.greeting} />
          </Bubble>
        )}
        {messages.length === 0 && config && (
          <div className="flex flex-wrap gap-2 pt-1">
            {["Where is my order?", "I want to return something", "What's your shipping policy?"].map((q) => (
              <button
                key={q}
                onClick={() => send(q)}
                className="rounded-full border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:border-slate-300 hover:bg-slate-50"
              >
                {q}
              </button>
            ))}
          </div>
        )}
        {messages.map((m, i) =>
          m.role === "system" ? (
            <div key={m.id ?? `l${i}`} className="text-center text-xs text-slate-500">
              {m.content}
            </div>
          ) : (
            <Bubble key={m.id ?? `l${i}`} role={m.role} brand={brand}>
              {m.role === "customer" ? (
                <p className="whitespace-pre-wrap">{m.content}</p>
              ) : m.content ? (
                <Markdown text={m.content} />
              ) : null}
              {m.sources && m.sources.length > 0 && (
                <div className="mt-2 border-t border-slate-200 pt-2 text-xs text-slate-500">
                  Sources: {m.sources.map((s) => s.title).join(" · ")}
                </div>
              )}
            </Bubble>
          ),
        )}
        {busy && (messages.at(-1)?.role !== "ai" || !messages.at(-1)?.content) && (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <span className="flex gap-1">
              <span className="typing-dot size-1.5 rounded-full bg-slate-400" />
              <span className="typing-dot size-1.5 rounded-full bg-slate-400" />
              <span className="typing-dot size-1.5 rounded-full bg-slate-400" />
            </span>
            {toolLabel && <span>{toolLabel}…</span>}
          </div>
        )}
        {showFeedback && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            Did that answer your question?
            <button onClick={() => giveFeedback(1)} className="rounded-full border border-slate-200 px-2.5 py-1 hover:bg-slate-50">
              👍 Yes
            </button>
            <button onClick={() => giveFeedback(-1)} className="rounded-full border border-slate-200 px-2.5 py-1 hover:bg-slate-50">
              👎 No
            </button>
          </div>
        )}
        {csat === -1 && status === "ai" && !busy && (
          <div className="text-xs text-slate-500">
            Sorry about that.{" "}
            <button onClick={requestHuman} className="font-medium underline" style={{ color: brand }}>
              Talk to a person
            </button>
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
        className="border-t border-slate-200 p-3"
      >
        <div className="flex items-end gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 focus-within:border-slate-400">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            rows={1}
            placeholder="Write a message…"
            className="max-h-32 flex-1 resize-none bg-transparent py-1 text-sm outline-none placeholder:text-slate-400"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
            style={{ background: brand }}
          >
            Send
          </button>
        </div>
        <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
          <span>{customer ? `Signed in as ${customer.email}` : "AI responses may be inaccurate."}</span>
          {conversationId && status !== "escalated" && (
            <button type="button" onClick={requestHuman} className="hover:text-slate-600 hover:underline">
              Talk to a person
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

function Bubble({ role, brand, children }: { role: ChatMessage["role"]; brand: string; children: React.ReactNode }) {
  const mine = role === "customer";
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
          mine ? "rounded-br-md text-white" : role === "human" ? "rounded-bl-md bg-amber-50 ring-1 ring-amber-200" : "rounded-bl-md bg-slate-100"
        }`}
        style={mine ? { background: brand } : undefined}
      >
        {role === "human" && <div className="mb-1 text-[11px] font-semibold text-amber-700">Support teammate</div>}
        {children}
      </div>
    </div>
  );
}
