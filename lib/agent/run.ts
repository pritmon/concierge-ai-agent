/**
 * The agent loop: the core of the support agent.
 *
 * For each customer message, runAgentTurn() sends the conversation to Claude,
 * runs any tools Claude asks for (lib/agent/tools.ts), sends the results back,
 * and repeats until Claude writes a final reply. Text and tool status are
 * streamed to the chat widget as AgentEvents via /api/chat.
 *
 * See docs/ARCHITECTURE.md for the end-to-end flow.
 */
import Anthropic from "@anthropic-ai/sdk";
import {
  addMessage,
  db,
  getConversation,
  getLlmHistory,
  getSettings,
  logAction,
  saveLlmHistory,
  updateConversation,
  type Procedure,
  type Settings,
} from "../db";
import { executeTool, TOOL_DEFINITIONS, TOOL_LABELS, type ToolContext } from "./tools";

type MessageParam = Anthropic.Beta.BetaMessageParam;

/** Events streamed to the chat widget while the agent works. */
export type AgentEvent =
  | { type: "text"; delta: string }
  | { type: "reset" }
  | { type: "tool"; name: string; label: string }
  | { type: "escalated" }
  | { type: "done"; messageId: number; sources: { id: number; title: string }[] }
  | { type: "error"; message: string };

// Upper bound on model calls per customer message, so a confused model can't loop forever.
const MAX_ITERATIONS = 10;

// Reads ANTHROPIC_API_KEY from the environment (.env.local).
const client = new Anthropic();

/**
 * Builds the agent's instructions from admin-editable settings and procedures.
 * The output only changes when an admin edits those, so it is cached between
 * requests (see cache_control below).
 */
function buildSystemPrompt(settings: Settings, procedures: Procedure[]): string {
  const procedureText = procedures.length
    ? procedures
        .map((p) => `### ${p.name}\nWhen: ${p.trigger}\n${p.instructions}`)
        .join("\n\n")
    : "(none)";

  return `You are ${settings.agentName}, the customer support agent for ${settings.companyName}. You chat with customers in a support widget on the company website and resolve their issues end to end: answering questions from the help center and taking actions on their orders with your tools.

## How to work
- Ground every policy statement in the help center: call search_knowledge_base before answering questions about policies, timelines, fees or how-tos. If the help center doesn't cover it, say you're not sure rather than inventing policy, and offer a human.
- Order data is private. Before sharing or changing anything about an order, you need the order number and the email on the order (unless the customer is signed in, in which case use their signed-in email). Never reveal details of orders that don't match.
- Actions with side effects (cancellations, address changes, refunds) need the customer's explicit confirmation of the specifics first. After acting, tell them exactly what happened.
- You may issue refunds up to $${settings.refundAutoApproveLimit} yourself. Larger refunds, exceptions to policy, and anything you can't do with your tools go to a human via escalate_to_human, with a handoff summary good enough that the teammate doesn't need to re-ask anything.
- If the customer asks for a human, escalate right away without trying to talk them out of it.
- Stay on topic: you only help with ${settings.companyName} support. Politely decline unrelated requests.

## Voice
${settings.tone}
Write like a helpful person in a chat window: no headings, keep replies short, and ask one question at a time when you need information. Respond in the customer's language.

## Procedures
The support team has defined these procedures. When a conversation matches a trigger, follow its steps.

${procedureText}`;
}

/**
 * Runs one customer turn through the agent: streams text, executes tools,
 * persists the transcript, and yields events for the chat UI.
 */
export async function* runAgentTurn(conversationId: string, customerText: string): AsyncGenerator<AgentEvent> {
  const conversation = getConversation(conversationId);
  if (!conversation) {
    yield { type: "error", message: "Conversation not found" };
    return;
  }

  const settings = getSettings();
  const procedures = db()
    .prepare("SELECT * FROM procedures WHERE enabled = 1 ORDER BY id")
    .all() as unknown as Procedure[];
  const ctx: ToolContext = { conversationId, verifiedEmail: conversation.customer_email, settings };

  // The raw Claude conversation (including tool calls), stored separately from the
  // customer-visible transcript. It is only ever appended to, never edited.
  const history = getLlmHistory<MessageParam>(conversationId);
  const startLength = history.length;
  history.push({ role: "user", content: customerText });

  // Volatile per-conversation context lives after the cached system block.
  const sessionContext = [
    `Today's date: ${new Date().toISOString().slice(0, 10)}.`,
    conversation.customer_email
      ? `The customer is signed in as ${conversation.customer_name ?? "a customer"} <${conversation.customer_email}>. Their identity is verified.`
      : "The customer is not signed in.",
  ].join("\n");

  let replyText = "";
  const sources = new Map<number, string>();
  let escalated = false;

  try {
    // Each iteration is one Claude call. It ends either with a final reply (stop)
    // or with tool requests (run them, append results, call Claude again).
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const stream = client.beta.messages.stream({
        model: settings.model,
        max_tokens: 16000,
        // If the model declines a request for policy reasons, the API retries it
        // on a recommended fallback model instead of returning the refusal.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        // Claude decides how much to think; effort (set in admin) trades depth for speed.
        thinking: { type: "adaptive" },
        output_config: { effort: settings.effort },
        // The stable prompt is cached; volatile context comes after it so it doesn't break the cache.
        system: [
          { type: "text", text: buildSystemPrompt(settings, procedures), cache_control: { type: "ephemeral" } },
          { type: "text", text: sessionContext },
        ],
        tools: TOOL_DEFINITIONS,
        messages: history,
      });

      // Forward text to the widget as it is generated.
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          replyText += event.delta.text;
          yield { type: "text", delta: event.delta.text };
        }
      }
      const message = await stream.finalMessage();

      if (message.stop_reason === "refusal") {
        // Discard any partial output and hand off to a person.
        yield { type: "reset" };
        replyText = "I'm sorry, I'm not able to help with that here. Let me connect you with a member of our team.";
        yield { type: "text", delta: replyText };
        history.push({ role: "assistant", content: replyText });
        updateConversation(conversationId, {
          status: "escalated",
          escalation_reason: "Automatic handoff: the AI agent declined the request",
          summary: `Last customer message: ${customerText}`,
        });
        escalated = true;
        break;
      }

      // Store Claude's full response unchanged (text, thinking and tool calls).
      history.push({ role: "assistant", content: message.content });

      // No tool requests means Claude has written its final reply.
      const toolUses = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
      if (message.stop_reason !== "tool_use" || toolUses.length === 0) {
        if (message.stop_reason === "pause_turn") continue;
        break;
      }

      if (replyText && !replyText.endsWith("\n\n")) {
        replyText += "\n\n";
        yield { type: "text", delta: "\n\n" };
      }

      // Run each requested tool. Tool outcomes are also logged for the admin
      // inbox and analytics.
      const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const use of toolUses) {
        yield { type: "tool", name: use.name, label: TOOL_LABELS[use.name] ?? use.name };
        const outcome = await executeTool(use.name, use.input, ctx);
        logAction(conversationId, use.name, use.input, outcome.output, !!outcome.isError);
        addMessage(conversationId, "tool", TOOL_LABELS[use.name] ?? use.name, {
          tool: use.name,
          input: use.input,
          output: outcome.output,
          isError: !!outcome.isError,
        });
        for (const s of outcome.sources ?? []) sources.set(s.id, s.title);
        if (outcome.escalated) {
          escalated = true;
          yield { type: "escalated" };
        }
        results.push({
          type: "tool_result",
          tool_use_id: use.id,
          content: JSON.stringify(outcome.output),
          ...(outcome.isError ? { is_error: true } : {}),
        });
      }
      // All results for one assistant turn go back in a single user message.
      history.push({ role: "user", content: results });
    }
  } catch (err) {
    // Keep the customer's message so the next turn has context; drop the partial agent turn.
    saveLlmHistory(conversationId, [...history.slice(0, startLength), { role: "user", content: customerText }]);
    yield { type: "error", message: describeError(err) };
    return;
  }

  saveLlmHistory(conversationId, history);

  const finalText = replyText.trim() || (escalated ? "I've passed this to a teammate, who will reply here shortly." : "");
  const sourceList = [...sources].map(([id, title]) => ({ id, title }));
  const row = addMessage(conversationId, "ai", finalText, { sources: sourceList });
  yield { type: "done", messageId: row.id, sources: sourceList };
}

/** Turns SDK errors into messages that are safe to show customers. */
function describeError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) {
    return "The AI agent isn't configured: set ANTHROPIC_API_KEY in .env.local and restart the server.";
  }
  if (err instanceof Anthropic.RateLimitError) return "The AI agent is busy right now. Please try again in a moment.";
  if (err instanceof Anthropic.APIError) return `AI service error (${err.status ?? "network"}). Please try again.`;
  if (err instanceof Anthropic.AnthropicError) {
    // Raised before any request is sent, e.g. when no credentials are configured.
    console.error(err);
    return "The AI agent isn't configured: set ANTHROPIC_API_KEY in .env.local and restart the server.";
  }
  console.error(err);
  return "Something went wrong. Please try again.";
}
