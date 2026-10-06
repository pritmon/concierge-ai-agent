import { db } from "@/lib/db";
import { ArticleInput } from "@/lib/schemas";

export async function PUT(request: Request, ctx: RouteContext<"/api/admin/articles/[id]">) {
  const { id } = await ctx.params;
  const parsed = ArticleInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Title and body are required" }, { status: 400 });
  const { title, body, category } = parsed.data;
  const article = db()
    .prepare("UPDATE articles SET title = ?, body = ?, category = ?, updated_at = datetime('now') WHERE id = ? RETURNING *")
    .get(title, body, category, Number(id));
  if (!article) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ article });
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/admin/articles/[id]">) {
  const { id } = await ctx.params;
  db().prepare("DELETE FROM articles WHERE id = ?").run(Number(id));
  return Response.json({ ok: true });
}
