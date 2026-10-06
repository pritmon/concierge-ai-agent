import { db } from "@/lib/db";
import { ProcedureInput } from "@/lib/schemas";

export async function PUT(request: Request, ctx: RouteContext<"/api/admin/procedures/[id]">) {
  const { id } = await ctx.params;
  const parsed = ProcedureInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Name, trigger and instructions are required" }, { status: 400 });
  const { name, trigger, instructions, enabled } = parsed.data;
  const procedure = db()
    .prepare(
      "UPDATE procedures SET name = ?, trigger = ?, instructions = ?, enabled = ?, updated_at = datetime('now') WHERE id = ? RETURNING *",
    )
    .get(name, trigger, instructions, enabled ? 1 : 0, Number(id));
  if (!procedure) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ procedure });
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/admin/procedures/[id]">) {
  const { id } = await ctx.params;
  db().prepare("DELETE FROM procedures WHERE id = ?").run(Number(id));
  return Response.json({ ok: true });
}
