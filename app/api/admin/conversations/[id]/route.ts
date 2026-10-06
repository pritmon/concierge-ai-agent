import { connection } from "next/server";
import { z } from "zod";
import { addMessage, getConversation, getMessages, updateConversation } from "@/lib/db";

export async function GET(_request: Request, ctx: RouteContext<"/api/admin/conversations/[id]">) {
  await connection();
  const { id } = await ctx.params;
  const conversation = getConversation(id);
  if (!conversation) return Response.json({ error: "Not found" }, { status: 404 });
  const messages = getMessages(id).map((m) => ({ ...m, meta: m.meta ? JSON.parse(m.meta) : null }));
  return Response.json({ conversation, messages });
}

const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reply"), text: z.string().trim().min(1) }),
  z.object({ action: z.literal("status"), status: z.enum(["ai", "escalated", "resolved", "closed"]) }),
]);

export async function POST(request: Request, ctx: RouteContext<"/api/admin/conversations/[id]">) {
  const { id } = await ctx.params;
  const conversation = getConversation(id);
  if (!conversation) return Response.json({ error: "Not found" }, { status: 404 });
  const parsed = Action.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid action" }, { status: 400 });

  if (parsed.data.action === "reply") {
    // A teammate replying takes ownership away from the AI.
    if (conversation.status !== "escalated") updateConversation(id, { status: "escalated" });
    addMessage(id, "human", parsed.data.text, { author: "Support team" });
  } else {
    updateConversation(id, { status: parsed.data.status });
    const labels = { ai: "Handed back to the AI agent", escalated: "Assigned to a human", resolved: "Marked as resolved", closed: "Closed" };
    addMessage(id, "system", labels[parsed.data.status]);
  }
  return Response.json({ ok: true });
}
