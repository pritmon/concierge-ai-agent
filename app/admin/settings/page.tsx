"use client";

import { useEffect, useState } from "react";
import { buttonClass, Card, inputClass, PageHeader, send, useApi } from "@/components/admin/ui";

interface Settings {
  companyName: string;
  agentName: string;
  tone: string;
  greeting: string;
  refundAutoApproveLimit: number;
  model: string;
  effort: string;
  brandColor: string;
}

export default function SettingsPage() {
  const { data } = useApi<{ settings: Settings }>("/api/admin/settings");
  const [edited, setForm] = useState<Settings | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");

  // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only value, read after hydration
  useEffect(() => setOrigin(window.location.origin), []);

  const form = edited ?? data?.settings;
  if (!form) return <p className="text-sm text-slate-500">Loading…</p>;

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => setForm({ ...form, [key]: value });

  async function save() {
    setStatus(null);
    try {
      const { settings } = await send("/api/admin/settings", "PUT", form);
      setForm(settings);
      setStatus("Saved");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Save failed");
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Agent settings" description="Identity, voice, guardrails and the model behind your agent." />

      <div className="space-y-4">
        <Card className="space-y-4 p-5">
          <h2 className="font-medium">Identity</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Company name">
              <input className={inputClass} value={form.companyName} onChange={(e) => set("companyName", e.target.value)} />
            </Field>
            <Field label="Agent name">
              <input className={inputClass} value={form.agentName} onChange={(e) => set("agentName", e.target.value)} />
            </Field>
          </div>
          <Field label="Greeting (first message in the widget)">
            <textarea className={inputClass} rows={2} value={form.greeting} onChange={(e) => set("greeting", e.target.value)} />
          </Field>
          <Field label="Tone of voice">
            <textarea className={inputClass} rows={3} value={form.tone} onChange={(e) => set("tone", e.target.value)} />
          </Field>
          <Field label="Brand color">
            <div className="flex items-center gap-2">
              <input type="color" value={form.brandColor} onChange={(e) => set("brandColor", e.target.value)} className="h-9 w-12 rounded border border-slate-300" />
              <input className={`${inputClass} max-w-32 font-mono`} value={form.brandColor} onChange={(e) => set("brandColor", e.target.value)} />
            </div>
          </Field>
        </Card>

        <Card className="space-y-4 p-5">
          <h2 className="font-medium">Guardrails</h2>
          <Field label="Refunds the agent can approve on its own (USD)" hint="Larger refunds are escalated to a human with a summary.">
            <input
              type="number"
              min={0}
              className={`${inputClass} max-w-40`}
              value={form.refundAutoApproveLimit}
              onChange={(e) => set("refundAutoApproveLimit", Number(e.target.value))}
            />
          </Field>
        </Card>

        <Card className="space-y-4 p-5">
          <h2 className="font-medium">Model</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Claude model">
              <select className={inputClass} value={form.model} onChange={(e) => set("model", e.target.value)}>
                <option value="claude-opus-5-5">Claude Opus 5.5 — most capable</option>
                <option value="claude-sonnet-5-5">Claude Sonnet 5.5 — faster, lower cost</option>
              </select>
            </Field>
            <Field label="Effort" hint="Higher effort reasons more carefully but replies slower.">
              <select className={inputClass} value={form.effort} onChange={(e) => set("effort", e.target.value)}>
                {["low", "medium", "high", "xhigh", "max"].map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </Card>

        <div className="flex items-center justify-end gap-3">
          {status && <span className="text-sm text-slate-500">{status}</span>}
          <button className={buttonClass} onClick={save}>
            Save settings
          </button>
        </div>

        <Card className="p-5">
          <h2 className="font-medium">Install on your website</h2>
          <p className="mt-1 text-sm text-slate-500">Paste this before the closing &lt;/body&gt; tag. Pass the signed-in customer to let the agent act on their account.</p>
          <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-900 p-4 text-xs leading-relaxed text-slate-100">
            {`<script src="${origin}/widget.js"
        data-customer-email="customer@example.com"
        data-customer-name="Jane Doe"
        async></script>`}
          </pre>
        </Card>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}
