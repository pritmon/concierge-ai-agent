"use client";

import { useState } from "react";
import {
  buttonClass,
  Card,
  inputClass,
  PageHeader,
  secondaryButtonClass,
  send,
  timeAgo,
  useApi,
} from "@/components/admin/ui";

interface Article {
  id: number;
  title: string;
  body: string;
  category: string;
  updated_at: string;
}

type Draft = { id?: number; title: string; body: string; category: string };

export default function Knowledge() {
  const { data, reload } = useApi<{ articles: Article[]; gaps: { query: string; count: number }[] }>("/api/admin/articles");
  const [editing, setEditing] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  async function save() {
    if (!editing) return;
    setError(null);
    try {
      const { id, ...body } = editing;
      await send(id ? `/api/admin/articles/${id}` : "/api/admin/articles", id ? "PUT" : "POST", body);
      setEditing(null);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    }
  }

  async function remove(id: number) {
    if (!confirm("Delete this article? The agent will no longer use it.")) return;
    await send(`/api/admin/articles/${id}`, "DELETE");
    setEditing(null);
    await reload();
  }

  const articles = (data?.articles ?? []).filter(
    (a) => !query || `${a.title} ${a.body} ${a.category}`.toLowerCase().includes(query.toLowerCase()),
  );
  const categories = [...new Set(articles.map((a) => a.category))];

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Knowledge"
        description="Help center articles the agent searches before answering. Changes take effect on the next message."
        actions={
          <button className={buttonClass} onClick={() => setEditing({ title: "", body: "", category: "General" })}>
            New article
          </button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {editing && (
            <Card className="space-y-3 p-5">
              <h2 className="font-medium">{editing.id ? "Edit article" : "New article"}</h2>
              <div className="grid gap-3 sm:grid-cols-3">
                <input
                  className={`${inputClass} sm:col-span-2`}
                  placeholder="Title"
                  value={editing.title}
                  onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                />
                <input
                  className={inputClass}
                  placeholder="Category"
                  value={editing.category}
                  onChange={(e) => setEditing({ ...editing, category: e.target.value })}
                />
              </div>
              <textarea
                className={`${inputClass} font-mono text-[13px]`}
                rows={10}
                placeholder="Write the policy or answer in plain language…"
                value={editing.body}
                onChange={(e) => setEditing({ ...editing, body: e.target.value })}
              />
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex justify-between">
                <div>
                  {editing.id && (
                    <button className="text-sm text-red-600 hover:underline" onClick={() => remove(editing.id!)}>
                      Delete
                    </button>
                  )}
                </div>
                <div className="flex gap-2">
                  <button className={secondaryButtonClass} onClick={() => setEditing(null)}>
                    Cancel
                  </button>
                  <button className={buttonClass} onClick={save}>
                    Save
                  </button>
                </div>
              </div>
            </Card>
          )}

          <input className={inputClass} placeholder="Filter articles…" value={query} onChange={(e) => setQuery(e.target.value)} />

          {categories.map((cat) => (
            <Card key={cat}>
              <div className="border-b border-slate-100 px-5 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{cat}</div>
              <ul className="divide-y divide-slate-100">
                {articles
                  .filter((a) => a.category === cat)
                  .map((a) => (
                    <li key={a.id}>
                      <button
                        className="block w-full px-5 py-3 text-left hover:bg-slate-50"
                        onClick={() => setEditing({ id: a.id, title: a.title, body: a.body, category: a.category })}
                      >
                        <div className="flex justify-between gap-3">
                          <span className="text-sm font-medium">{a.title}</span>
                          <span className="shrink-0 text-xs text-slate-400">Updated {timeAgo(a.updated_at)}</span>
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-sm text-slate-500">{a.body}</p>
                      </button>
                    </li>
                  ))}
              </ul>
            </Card>
          ))}
        </div>

        <Card className="h-fit p-5">
          <h2 className="font-medium">Knowledge gaps</h2>
          <p className="mt-1 text-xs text-slate-500">Customer questions where the search found nothing relevant.</p>
          {!data?.gaps.length ? (
            <p className="mt-3 text-sm text-slate-500">None yet.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {data.gaps.map((g) => (
                <li key={g.query} className="flex items-start justify-between gap-2 text-sm">
                  <span className="text-slate-700">
                    “{g.query}” <span className="text-xs text-slate-400">{g.count}×</span>
                  </span>
                  <button
                    className="shrink-0 text-xs text-indigo-600 hover:underline"
                    onClick={() => setEditing({ title: g.query, body: "", category: "General" })}
                  >
                    Write article
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
