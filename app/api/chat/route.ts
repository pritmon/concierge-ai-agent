/**
 * POST /api/chat: entry point for every customer message from the widget.
 *
 * Saves the message, then either runs the AI agent or, if a human owns the
 * conversation, just queues it. The response is a stream of server-sent events
 * (text deltas, tool status, done) that the widget renders live.
 */
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { runAgentTurn, type AgentEvent } from "@/lib/agent/run";
import { addMessage, createConversation, getConversation, updateConversation } from "@/lib/db";

const Body = z.object({
  conversationId: z.string().nullish(),
  message: z.string().trim().min(1).max(4000),
  // Identity of a signed-in customer, passed by the host site. In production,
  // verify this with a signed user hash instead of trusting the client.
  customer: z.object({ email: z.string().email(), name: z.string().optional() }).optional(),
});

type StreamEvent = AgentEvent | { type: "conversation"; id: string } | { type: "queued"; messageId: number };

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const { message, customer } = parsed.data;

  let conversationId = parsed.data.conversationId;
  let conversation = conversationId ? getConversation(conversationId) : undefined;
  if (!conversation) {
    conversationId = randomUUID();
    createConversation(conversationId, customer?.email, customer?.name);
    conversation = getConversation(conversationId)!;
  }
  const id = conversationId!;
  const customerRow = addMessage(id, "customer", message);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: StreamEvent) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      send({ type: "conversation", id });

      if (conversation.status === "escalated") {
        // A human owns this conversation; the AI stays quiet.
        send({ type: "queued", messageId: customerRow.id });
      } else {
        if (conversation.status !== "ai") {
          // Customer wrote again after resolution: the AI picks it back up.
          updateConversation(id, { status: "ai" });
        }
        for await (const event of runAgentTurn(id, message)) send(event);
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
