import { z } from "zod";
import { addMessage, getConversation, updateConversation } from "@/lib/db";

const Body = z.object({ rating: z.union([z.literal(1), z.literal(-1)]) });

export async function POST(request: Request, ctx: RouteContext<"/api/conversations/[id]/feedback">) {
  const { id } = await ctx.params;
  const conversation = getConversation(id);
  if (!conversation) return Response.json({ error: "Not found" }, { status: 404 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid rating" }, { status: 400 });

  const { rating } = parsed.data;
  // A thumbs-up on an AI-handled conversation counts as an AI resolution.
  const status = rating === 1 && conversation.status === "ai" ? "resolved" : conversation.status;
  updateConversation(id, { csat: rating, status });
  addMessage(id, "system", rating === 1 ? "Customer marked the answer as helpful" : "Customer marked the answer as not helpful");
  return Response.json({ ok: true, status });
}
