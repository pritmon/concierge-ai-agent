"use client";

import Link from "next/link";
import { useState } from "react";
import { Card, PageHeader, useApi } from "@/components/admin/ui";

interface Analytics {
  totals: {
    total: number;
    ai_handled: number | null;
    open_escalations: number | null;
    escalated_ever: number | null;
    csat_positive: number | null;
    csat_negative: number | null;
  };
  daily: { day: string; total: number; ai_handled: number }[];
  actions: { tool: string; count: number; errors: number }[];
  refunds: { amount: number; count: number };
  escalationReasons: { reason: string; count: number }[];
  gaps: { query: string; count: number }[];
}

const SERIES = { ai: "#2a78d6", human: "#eb6834" };

const TOOL_NAMES: Record<string, string> = {
  search_knowledge_base: "Searched help center",
  lookup_order: "Looked up order",
  list_customer_orders: "Listed customer orders",
  cancel_order: "Cancelled order",
  update_shipping_address: "Changed shipping address",
  issue_refund: "Issued refund",
  escalate_to_human: "Escalated to human",
};

function pct(n: number, d: number) {
  return d > 0 ? `${Math.round((n / d) * 100)}%` : "—";
}

export default function Overview() {
  const { data, error } = useApi<Analytics>("/api/admin/analytics", 10000);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!data) return <p className="text-sm text-slate-500">Loading…</p>;

  const t = data.totals;
  const total = t.total ?? 0;
  const aiHandled = t.ai_handled ?? 0;
  const csatTotal = (t.csat_positive ?? 0) + (t.csat_negative ?? 0);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Overview" description="How your AI agent is performing across all conversations." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Conversations" value={String(total)} />
        <Stat
          label="Handled fully by AI"
          value={pct(aiHandled, total)}
          hint={`${aiHandled} of ${total} with no human involvement`}
        />
        <Stat
          label="Customer satisfaction"
          value={pct(t.csat_positive ?? 0, csatTotal)}
          hint={csatTotal ? `${csatTotal} ratings` : "No ratings yet"}
        />
        <Stat
          label="Waiting for a human"
          value={String(t.open_escalations ?? 0)}
          hint={
            <Link href="/admin/inbox?status=escalated" className="text-indigo-600 hover:underline">
              Open inbox →
            </Link>
          }
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <VolumeChart daily={data.daily} />
        </Card>
        <Card className="p-5">
          <h2 className="font-medium">Actions taken by the agent</h2>
          <p className="mb-3 text-xs text-slate-500">
            ${data.refunds.amount.toFixed(2)} refunded across {data.refunds.count} refunds/cancellations
          </p>
          {data.actions.length === 0 ? (
            <p className="text-sm text-slate-500">No actions yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {data.actions.map((a) => (
                <li key={a.tool} className="flex justify-between py-2">
                  <span>{TOOL_NAMES[a.tool] ?? a.tool}</span>
                  <span className="tabular-nums text-slate-600">
                    {a.count}
                    {a.errors > 0 && <span className="ml-1 text-xs text-slate-400">({a.errors} blocked)</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="font-medium">Why conversations escalated</h2>
          {data.escalationReasons.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">No escalations yet.</p>
          ) : (
            <ul className="mt-2 divide-y divide-slate-100 text-sm">
              {data.escalationReasons.map((r) => (
                <li key={r.reason} className="flex justify-between gap-4 py-2">
                  <span className="text-slate-700">{r.reason}</span>
                  <span className="tabular-nums text-slate-600">{r.count}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="p-5">
          <h2 className="font-medium">Knowledge gaps</h2>
          <p className="text-xs text-slate-500">Questions the help center couldn&apos;t answer. Write articles for these.</p>
          {data.gaps.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">No gaps found yet.</p>
          ) : (
            <ul className="mt-2 divide-y divide-slate-100 text-sm">
              {data.gaps.map((g) => (
                <li key={g.query} className="flex justify-between gap-4 py-2">
                  <span className="text-slate-700">“{g.query}”</span>
                  <span className="tabular-nums text-slate-600">{g.count}×</span>
                </li>
              ))}
            </ul>
          )}
          <Link href="/admin/knowledge" className="mt-3 inline-block text-sm text-indigo-600 hover:underline">
            Manage knowledge →
          </Link>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: React.ReactNode }) {
  return (
    <Card className="p-4">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="mt-1 text-3xl font-semibold tabular-nums tracking-tight">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </Card>
  );
}

function VolumeChart({ daily }: { daily: Analytics["daily"] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const [now] = useState(() => Date.now());

  // Fill in the last 14 days so empty days still get a slot.
  const byDay = new Map(daily.map((d) => [d.day, d]));
  const days = Array.from({ length: 14 }, (_, i) => {
    const date = new Date(now - (13 - i) * 86_400_000).toISOString().slice(0, 10);
    const d = byDay.get(date);
    return { day: date, ai: d?.ai_handled ?? 0, human: (d?.total ?? 0) - (d?.ai_handled ?? 0) };
  });
  const max = Math.max(1, ...days.map((d) => d.ai + d.human));
  const fmt = (day: string) => new Date(day + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium">Conversations per day</h2>
        <div className="flex items-center gap-4 text-xs text-slate-600">
          <Legend color={SERIES.ai} label="Handled by AI" />
          <Legend color={SERIES.human} label="Escalated to human" />
          <button onClick={() => setShowTable((v) => !v)} className="text-indigo-600 hover:underline">
            {showTable ? "Show chart" : "Show table"}
          </button>
        </div>
      </div>

      {showTable ? (
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-slate-500">
            <tr>
              <th className="py-1 font-medium">Day</th>
              <th className="py-1 text-right font-medium">Handled by AI</th>
              <th className="py-1 text-right font-medium">Escalated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 tabular-nums">
            {days.map((d) => (
              <tr key={d.day}>
                <td className="py-1">{fmt(d.day)}</td>
                <td className="py-1 text-right">{d.ai}</td>
                <td className="py-1 text-right">{d.human}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="relative">
          <div className="flex h-48 items-end gap-1.5 border-b border-slate-200">
            {days.map((d, i) => (
              <div
                key={d.day}
                className="relative flex h-full flex-1 cursor-default flex-col justify-end"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              >
                {hover === i && <div className="absolute inset-0 rounded-t bg-slate-100" />}
                <div className="relative mx-auto flex w-full max-w-7 flex-col justify-end gap-[2px]">
                  {d.human > 0 && (
                    <div
                      className="rounded-t"
                      style={{ height: `${(d.human / max) * 176}px`, background: SERIES.human }}
                    />
                  )}
                  {d.ai > 0 && (
                    <div
                      className={d.human > 0 ? "" : "rounded-t"}
                      style={{ height: `${(d.ai / max) * 176}px`, background: SERIES.ai }}
                    />
                  )}
                </div>
                {hover === i && (
                  <div className="absolute bottom-full left-1/2 z-10 mb-1 w-40 -translate-x-1/2 rounded-lg bg-white p-2 text-xs shadow-lg ring-1 ring-slate-200">
                    <div className="mb-1 font-medium text-slate-900">{fmt(d.day)}</div>
                    <Row color={SERIES.ai} label="Handled by AI" value={d.ai} />
                    <Row color={SERIES.human} label="Escalated" value={d.human} />
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[11px] text-slate-500">
            <span>{fmt(days[0].day)}</span>
            <span>Today</span>
          </div>
        </div>
      )}
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="size-2.5 rounded-sm" style={{ background: color }} />
      {label}
    </span>
  );
}

function Row({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-2 text-slate-600">
      <span className="flex items-center gap-1.5">
        <span className="size-2 rounded-sm" style={{ background: color }} />
        {label}
      </span>
      <span className="tabular-nums text-slate-900">{value}</span>
    </div>
  );
}
