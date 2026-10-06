import { connection, type NextRequest } from "next/server";
import { getConversation, getMessages } from "@/lib/db";

// Polled by the widget so customers see human replies after a handoff.
export async function GET(request: NextRequest, ctx: RouteContext<"/api/conversations/[id]/messages">) {
  await connection();
  const { id } = await ctx.params;
  const conversation = getConversation(id);
  if (!conversation) return Response.json({ error: "Not found" }, { status: 404 });
  const after = Number(request.nextUrl.searchParams.get("after") ?? 0);
  const messages = getMessages(id, after)
    .filter((m) => m.role !== "tool")
    .map((m) => ({ id: m.id, role: m.role, content: m.content, meta: m.meta ? JSON.parse(m.meta) : null }));
  return Response.json({ status: conversation.status, csat: conversation.csat, messages });
}
