import Anthropic from "@anthropic-ai/sdk";
import { getConversation, getMessages, getSettings } from "../db";
import { searchArticles } from "../kb";

const client = new Anthropic();

/** Drafts a reply for a human agent working an escalated conversation. */
export async function draftReply(conversationId: string): Promise<string> {
  const conversation = getConversation(conversationId);
  if (!conversation) throw new Error("Conversation not found");
  const settings = getSettings();
  const messages = getMessages(conversationId).filter((m) => m.role !== "tool");

  const speaker = { customer: "Customer", ai: "AI agent", human: "Support teammate", system: "System", tool: "Tool" };
  const transcript = messages.map((m) => `${speaker[m.role]}: ${m.content}`).join("\n\n");
  const lastCustomer = [...messages].reverse().find((m) => m.role === "customer")?.content ?? "";
  const articles = searchArticles(lastCustomer, 3)
    .map((h) => `### ${h.article.title}\n${h.article.body}`)
    .join("\n\n");

  const response = await client.beta.messages.create({
    model: settings.model,
    max_tokens: 4000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low" },
    system: `You draft replies for human support agents at ${settings.companyName}. Write the next message the support teammate should send to the customer: friendly, specific, consistent with policy, and short enough for a chat window. Output only the message text.`,
    messages: [
      {
        role: "user",
        content: `Handoff summary: ${conversation.summary ?? "(none)"}\nEscalation reason: ${conversation.escalation_reason ?? "(none)"}\n\nRelevant help center articles:\n${articles || "(none found)"}\n\nTranscript:\n${transcript}`,
      },
    ],
  });

  if (response.stop_reason === "refusal") return "";
  return response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}
