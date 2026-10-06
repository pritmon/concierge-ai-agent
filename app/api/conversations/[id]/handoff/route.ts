import { addMessage, getConversation, getMessages, updateConversation } from "@/lib/db";

// "Talk to a human" button in the widget.
export async function POST(_request: Request, ctx: RouteContext<"/api/conversations/[id]/handoff">) {
  const { id } = await ctx.params;
  const conversation = getConversation(id);
  if (!conversation) return Response.json({ error: "Not found" }, { status: 404 });
  if (conversation.status !== "escalated") {
    const lastCustomer = getMessages(id)
      .filter((m) => m.role === "customer")
      .at(-1)?.content;
    updateConversation(id, {
      status: "escalated",
      escalation_reason: "Customer requested a human",
      summary: conversation.summary ?? (lastCustomer ? `Last customer message: ${lastCustomer}` : null),
    });
  }
  const row = addMessage(id, "system", "You're now in the queue for a human teammate. They'll reply right here.");
  return Response.json({ ok: true, message: { id: row.id, role: row.role, content: row.content } });
}
