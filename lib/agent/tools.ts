import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { db, logKnowledgeGap, updateConversation, type Order, type Settings } from "../db";
import { searchArticles } from "../kb";

export interface ToolContext {
  conversationId: string;
  /** Email the customer was signed in with when the chat started (trusted identity). */
  verifiedEmail: string | null;
  settings: Settings;
}

export interface ToolOutcome {
  output: unknown;
  isError?: boolean;
  /** Knowledge-base articles the agent read, surfaced as sources in the UI. */
  sources?: { id: number; title: string }[];
  escalated?: boolean;
}

type Tool = Anthropic.Beta.BetaTool;

function schema(properties: Record<string, unknown>, required: string[]): Tool["input_schema"] {
  return { type: "object", properties, required, additionalProperties: false };
}

export const TOOL_DEFINITIONS: Tool[] = [
  {
    name: "search_knowledge_base",
    description:
      "Search the help center for company policies and how-to information (shipping, returns, refunds, warranty, payments, membership, account). Always use this before answering a policy question instead of relying on general knowledge.",
    strict: true,
    input_schema: schema(
      { query: { type: "string", description: "A short natural-language search query" } },
      ["query"],
    ),
  },
  {
    name: "lookup_order",
    description:
      "Look up a single order's status, items, total, tracking number and shipping address. Requires the order number and the email address on the order.",
    strict: true,
    input_schema: schema(
      {
        order_id: { type: "string", description: "Order number, e.g. NW-10421" },
        email: { type: "string", description: "Email address used to place the order" },
      },
      ["order_id", "email"],
    ),
  },
  {
    name: "check_delivery_date",
    description:
      "Estimate when an order will be delivered. Use when the customer asks when their order will arrive or how long delivery will take. Requires the order number and the email address on the order.",
    strict: true,
    input_schema: schema(
      {
        order_id: { type: "string", description: "Order number, e.g. NW-10421" },
        email: { type: "string", description: "Email address used to place the order" },
      },
      ["order_id", "email"],
    ),
  },
  {
    name: "list_customer_orders",
    description: "List recent orders for a customer email address. Use when the customer doesn't know their order number.",
    strict: true,
    input_schema: schema({ email: { type: "string" } }, ["email"]),
  },
  {
    name: "cancel_order",
    description:
      "Cancel an order that is still in 'processing' status. Only call after the customer has explicitly confirmed they want to cancel.",
    strict: true,
    input_schema: schema(
      { order_id: { type: "string" }, email: { type: "string" } },
      ["order_id", "email"],
    ),
  },
  {
    name: "update_shipping_address",
    description:
      "Change the shipping address of an order that is still in 'processing' status. Only call after the customer confirmed the full new address.",
    strict: true,
    input_schema: schema(
      { order_id: { type: "string" }, email: { type: "string" }, new_address: { type: "string" } },
      ["order_id", "email", "new_address"],
    ),
  },
  {
    name: "issue_refund",
    description:
      "Issue a refund to the original payment method. Only call after checking eligibility against policy and after the customer confirmed the amount. Refunds above the auto-approve limit are rejected and must be escalated to a human instead.",
    strict: true,
    input_schema: schema(
      {
        order_id: { type: "string" },
        email: { type: "string" },
        amount: { type: "number", description: "Refund amount in USD" },
        reason: { type: "string", description: "Short reason, e.g. 'damaged item' or 'return within 30 days'" },
      },
      ["order_id", "email", "amount", "reason"],
    ),
  },
  {
    name: "escalate_to_human",
    description:
      "Hand the conversation to a human support agent. Use when the customer asks for a human, when a request needs approval beyond your permissions, when policy doesn't cover the situation, or when a procedure says to escalate. After calling, tell the customer a teammate will join shortly.",
    strict: true,
    input_schema: schema(
      {
        reason: { type: "string", description: "Why a human is needed (one line)" },
        summary: {
          type: "string",
          description: "Handoff note for the human agent: the customer's issue, relevant order numbers, and what has been done so far",
        },
      },
      ["reason", "summary"],
    ),
  },
];

const OrderAuth = z.object({ order_id: z.string(), email: z.string() });
const INPUT_SCHEMAS: Record<string, z.ZodType> = {
  search_knowledge_base: z.object({ query: z.string() }),
  lookup_order: OrderAuth,
  list_customer_orders: z.object({ email: z.string() }),
  cancel_order: OrderAuth,
  update_shipping_address: OrderAuth.extend({ new_address: z.string().min(5) }),
  issue_refund: OrderAuth.extend({ amount: z.number().positive(), reason: z.string() }),
  escalate_to_human: z.object({ reason: z.string(), summary: z.string() }),
  check_delivery_date: OrderAuth,
};

/** Human-readable status shown in the chat widget while a tool runs. */
export const TOOL_LABELS: Record<string, string> = {
  search_knowledge_base: "Searching the help center",
  lookup_order: "Looking up your order",
  check_delivery_date: "Checking your delivery date",
  list_customer_orders: "Finding your orders",
  cancel_order: "Cancelling the order",
  update_shipping_address: "Updating the shipping address",
  issue_refund: "Processing the refund",
  escalate_to_human: "Connecting you with a teammate",
};

const norm = (s: string) => s.trim().toLowerCase();

/** Adds business days (Mon-Fri), skipping weekends. */
function addBusinessDays(start: Date, days: number): Date {
  const date = new Date(start);
  let added = 0;
  while (added < days) {
    date.setUTCDate(date.getUTCDate() + 1);
    const day = date.getUTCDay();
    if (day !== 0 && day !== 6) added++;
  }
  return date;
}

function publicOrder(o: Order) {
  return {
    order_id: o.id,
    status: o.status,
    placed_at: o.created_at.slice(0, 10),
    items: JSON.parse(o.items),
    total_usd: o.total,
    refunded_usd: o.refunded_amount,
    tracking_number: o.tracking_number,
    shipping_address: o.shipping_address,
  };
}

/**
 * Loads an order and checks the caller is allowed to see it. When the customer
 * is signed in, only their own orders are accessible regardless of what email
 * the model passes.
 */
function authorizeOrder(ctx: ToolContext, orderId: string, email: string): Order | { error: string } {
  if (ctx.verifiedEmail && norm(email) !== norm(ctx.verifiedEmail)) {
    return { error: "The signed-in customer can only access orders placed with their own email address." };
  }
  const order = db().prepare("SELECT * FROM orders WHERE upper(id) = upper(?)").get(orderId.trim()) as
    | Order
    | undefined;
  if (!order || norm(order.customer_email) !== norm(email)) {
    return { error: "No order found with that order number and email combination. Ask the customer to double-check both." };
  }
  return order;
}

export async function executeTool(name: string, rawInput: unknown, ctx: ToolContext): Promise<ToolOutcome> {
  const parser = INPUT_SCHEMAS[name];
  if (!parser) return { output: { error: `Unknown tool ${name}` }, isError: true };
  const parsed = parser.safeParse(rawInput);
  if (!parsed.success) return { output: { error: "Invalid input", details: parsed.error.issues }, isError: true };
  // Each tool reads only the fields its schema validated above.
  const input = parsed.data as {
    query: string;
    order_id: string;
    email: string;
    new_address: string;
    amount: number;
    reason: string;
    summary: string;
  };

  switch (name) {
    case "search_knowledge_base": {
      const hits = searchArticles(input.query);
      if (hits.length === 0) {
        logKnowledgeGap(ctx.conversationId, input.query);
        return { output: { results: [], note: "No matching articles. Do not guess policy; offer to escalate if needed." } };
      }
      return {
        output: { results: hits.map((h) => ({ id: h.article.id, title: h.article.title, content: h.article.body })) },
        sources: hits.map((h) => ({ id: h.article.id, title: h.article.title })),
      };
    }

    case "lookup_order": {
      const order = authorizeOrder(ctx, input.order_id, input.email);
      if ("error" in order) return { output: order, isError: true };
      return { output: publicOrder(order) };
    }

    case "check_delivery_date": {
      const order = authorizeOrder(ctx, input.order_id, input.email);
      if ("error" in order) return { output: order, isError: true };
      if (order.status === "processing") {
        return { output: { order_id: order.id, status: order.status, note: "Not shipped yet. Orders placed before 2pm ET on a business day ship the same day; standard delivery then takes 3-5 business days." } };
      }
      if (order.status !== "shipped") {
        return { output: { order_id: order.id, status: order.status, note: `The order is ${order.status}, so there is no delivery estimate.` } };
      }
      // Standard shipping: 3-5 business days after the order ships (same day as placed).
      const placed = new Date(order.created_at);
      return {
        output: {
          order_id: order.id,
          status: order.status,
          tracking_number: order.tracking_number,
          estimated_delivery_earliest: addBusinessDays(placed, 3).toISOString().slice(0, 10),
          estimated_delivery_latest: addBusinessDays(placed, 5).toISOString().slice(0, 10),
        },
      };
    }

    case "list_customer_orders": {
      if (ctx.verifiedEmail && norm(input.email) !== norm(ctx.verifiedEmail)) {
        return { output: { error: "Can only list orders for the signed-in customer's email." }, isError: true };
      }
      const orders = db()
        .prepare("SELECT * FROM orders WHERE lower(customer_email) = lower(?) ORDER BY created_at DESC LIMIT 10")
        .all(input.email.trim()) as unknown as Order[];
      return { output: { orders: orders.map(publicOrder) } };
    }

    case "cancel_order": {
      const order = authorizeOrder(ctx, input.order_id, input.email);
      if ("error" in order) return { output: order, isError: true };
      if (order.status !== "processing") {
        return { output: { error: `Order is '${order.status}' and can no longer be cancelled.` }, isError: true };
      }
      db().prepare("UPDATE orders SET status = 'cancelled', refunded_amount = total WHERE id = ?").run(order.id);
      return { output: { success: true, order_id: order.id, refunded_usd: order.total, refund_eta: "5-7 business days" } };
    }

    case "update_shipping_address": {
      const order = authorizeOrder(ctx, input.order_id, input.email);
      if ("error" in order) return { output: order, isError: true };
      if (order.status !== "processing") {
        return { output: { error: `Order is '${order.status}'; the address can no longer be changed.` }, isError: true };
      }
      db().prepare("UPDATE orders SET shipping_address = ? WHERE id = ?").run(input.new_address, order.id);
      return { output: { success: true, order_id: order.id, shipping_address: input.new_address } };
    }

    case "issue_refund": {
      const order = authorizeOrder(ctx, input.order_id, input.email);
      if ("error" in order) return { output: order, isError: true };
      const refundable = Math.round((order.total - order.refunded_amount) * 100) / 100;
      if (input.amount > refundable) {
        return { output: { error: `Amount exceeds the refundable balance of $${refundable}.` }, isError: true };
      }
      if (input.amount > ctx.settings.refundAutoApproveLimit) {
        return {
          output: {
            error: `Refunds over $${ctx.settings.refundAutoApproveLimit} require human approval. Escalate to a human with a summary instead.`,
          },
          isError: true,
        };
      }
      db()
        .prepare("UPDATE orders SET refunded_amount = refunded_amount + ? WHERE id = ?")
        .run(input.amount, order.id);
      return {
        output: { success: true, order_id: order.id, refunded_usd: input.amount, refund_eta: "5-7 business days" },
      };
    }

    case "escalate_to_human": {
      updateConversation(ctx.conversationId, {
        status: "escalated",
        escalation_reason: input.reason,
        summary: input.summary,
      });
      return { output: { success: true, message: "A human teammate has been notified." }, escalated: true };
    }
  }
  return { output: { error: `Unhandled tool ${name}` }, isError: true };
}
