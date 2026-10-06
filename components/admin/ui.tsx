"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";

export function useApi<T>(url: string, pollMs?: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      setData(await res.json());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    }
  }, [url]);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch(url)
        .then((res) => {
          if (!res.ok) throw new Error(`Request failed (${res.status})`);
          return res.json();
        })
        .then((json) => {
          if (cancelled) return;
          setData(json);
          setError(null);
        })
        .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Request failed"));
    void load();
    const t = pollMs ? setInterval(load, pollMs) : undefined;
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [url, pollMs]);

  return { data, error, reload };
}

export async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json;
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-slate-500">{description}</p>}
      </div>
      {actions}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl bg-white ring-1 ring-slate-200 ${className}`}>{children}</div>;
}

const STATUS_STYLES: Record<string, string> = {
  ai: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  escalated: "bg-amber-50 text-amber-800 ring-amber-200",
  resolved: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  closed: "bg-slate-100 text-slate-600 ring-slate-200",
};
const STATUS_LABELS: Record<string, string> = {
  ai: "AI handling",
  escalated: "Needs human",
  resolved: "Resolved",
  closed: "Closed",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_STYLES[status] ?? STATUS_STYLES.closed}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

export const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100";
export const buttonClass =
  "inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50";
export const secondaryButtonClass =
  "inline-flex items-center justify-center gap-1.5 rounded-lg bg-white px-3.5 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50 disabled:opacity-50";

export function timeAgo(sqliteDate: string) {
  const date = new Date(sqliteDate.includes("T") ? sqliteDate : sqliteDate.replace(" ", "T") + "Z");
  const s = Math.max(0, (Date.now() - date.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
