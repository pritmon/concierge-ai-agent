"use client";

import { useState } from "react";
import { buttonClass, Card, inputClass, PageHeader, secondaryButtonClass, send, useApi } from "@/components/admin/ui";

interface Procedure {
  id: number;
  name: string;
  trigger: string;
  instructions: string;
  enabled: number;
}

type Draft = { id?: number; name: string; trigger: string; instructions: string; enabled: boolean };

export default function Procedures() {
  const { data, reload } = useApi<{ procedures: Procedure[] }>("/api/admin/procedures");
  const [editing, setEditing] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(draft: Draft) {
    setError(null);
    try {
      const { id, ...body } = draft;
      await send(id ? `/api/admin/procedures/${id}` : "/api/admin/procedures", id ? "PUT" : "POST", body);
      setEditing(null);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    }
  }

  async function remove(id: number) {
    if (!confirm("Delete this procedure?")) return;
    await send(`/api/admin/procedures/${id}`, "DELETE");
    setEditing(null);
    await reload();
  }

  const toDraft = (p: Procedure): Draft => ({ ...p, enabled: p.enabled === 1 });

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Procedures"
        description="Step-by-step instructions, written in plain language, that tell the agent how to handle specific situations — like a playbook for a new teammate."
        actions={
          <button className={buttonClass} onClick={() => setEditing({ name: "", trigger: "", instructions: "", enabled: true })}>
            New procedure
          </button>
        }
      />

      {editing && !editing.id && (
        <ProcedureForm draft={editing} setDraft={setEditing} onSave={save} onCancel={() => setEditing(null)} error={error} />
      )}

      <div className="space-y-3">
        {data?.procedures.map((p) =>
          editing?.id === p.id ? (
            <ProcedureForm
              key={p.id}
              draft={editing}
              setDraft={setEditing}
              onSave={save}
              onCancel={() => setEditing(null)}
              onDelete={() => remove(p.id)}
              error={error}
            />
          ) : (
            <Card key={p.id} className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="font-medium">{p.name}</h2>
                    {!p.enabled && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">Off</span>}
                  </div>
                  <p className="mt-0.5 text-sm text-slate-500">When: {p.trigger}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <label className="flex items-center gap-1.5 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      checked={p.enabled === 1}
                      onChange={(e) => save({ ...toDraft(p), enabled: e.target.checked })}
                    />
                    Enabled
                  </label>
                  <button className={secondaryButtonClass} onClick={() => setEditing(toDraft(p))}>
                    Edit
                  </button>
                </div>
              </div>
              <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 font-sans text-sm text-slate-700">{p.instructions}</pre>
            </Card>
          ),
        )}
      </div>
    </div>
  );
}

function ProcedureForm({
  draft,
  setDraft,
  onSave,
  onCancel,
  onDelete,
  error,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  onSave: (d: Draft) => void;
  onCancel: () => void;
  onDelete?: () => void;
  error: string | null;
}) {
  return (
    <Card className="mb-3 space-y-3 p-5">
      <input className={inputClass} placeholder="Name, e.g. Damaged item claim" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
      <input
        className={inputClass}
        placeholder="When should the agent use this? e.g. Customer says an item arrived broken"
        value={draft.trigger}
        onChange={(e) => setDraft({ ...draft, trigger: e.target.value })}
      />
      <textarea
        className={inputClass}
        rows={8}
        placeholder={"1. Ask for the order number and a photo\n2. Look up the order\n3. …"}
        value={draft.instructions}
        onChange={(e) => setDraft({ ...draft, instructions: e.target.value })}
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-between">
        <div>
          {onDelete && (
            <button className="text-sm text-red-600 hover:underline" onClick={onDelete}>
              Delete
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <button className={secondaryButtonClass} onClick={onCancel}>
            Cancel
          </button>
          <button className={buttonClass} onClick={() => onSave(draft)}>
            Save
          </button>
        </div>
      </div>
    </Card>
  );
}
