# Concierge — AI customer support agent

An AI agent that resolves customer support conversations end to end, in the spirit of Decagon and Intercom Fin. It answers questions from your help center, takes real actions (order lookups, cancellations, address changes, refunds) under guardrails you set, and hands off to a human with a summary when it should.

## What's in the box

| Area | What it does |
|---|---|
| **Chat widget** | Embeddable on any site with one `<script>` tag. Streams replies, shows what the agent is doing ("Looking up your order…"), cites help-center sources, collects 👍/👎 ratings, and has a "Talk to a person" button. |
| **AI agent** | Claude (Opus 5.5 by default) with tool use: `search_knowledge_base`, `lookup_order`, `list_customer_orders`, `cancel_order`, `update_shipping_address`, `issue_refund`, `escalate_to_human`. |
| **Procedures** | Plain-language playbooks ("when a customer asks for a refund, do 1-2-3…") that the agent follows. Editable in the dashboard; no code changes. |
| **Guardrails** | Enforced in code, not just the prompt: signed-in customers can only see their own orders, guests need order number + email, refunds above the auto-approve limit are blocked and must be escalated, and cancellations/address changes only work before shipping. |
| **Human handoff** | Escalated chats land in the inbox with the agent's handoff summary. Teammates reply from the dashboard and the customer sees it live in the widget. **Copilot** drafts the reply for them. |
| **Analytics** | Conversations handled fully by AI, CSAT, open escalations, actions taken, refund totals, escalation reasons, and **knowledge gaps** (questions the help center couldn't answer). |

## Getting started

Requires Node.js 24+ (uses the built-in `node:sqlite`).

```bash
npm install
cp .env.example .env.local   # then paste your ANTHROPIC_API_KEY
npm run dev
```

- Storefront demo with the widget: http://localhost:3000 (use "Browse as" to chat as a guest or a signed-in customer)
- Admin dashboard: http://localhost:3000/admin

The database (`data/support.db`) is created and seeded with demo help articles, procedures and orders on first run. Delete the file to reset.

### Things to try

- "What's your return policy?" — answers from the help center with sources
- Browse as **Sam**: "Cancel my rain shell order" — looks up NW-10502, confirms, cancels
- As a guest: "I want a refund for order NW-10421, email alex@example.com" — $229 is over the $100 limit, so the agent escalates with a summary
- "I'm going to file a chargeback" — triggers the "Upset customer" procedure → escalation
- Reply to an escalated chat from **Inbox**, or click **✨ Draft reply with AI**

## How it works

For a full walkthrough of the code, see **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

```
widget (iframe) ──POST /api/chat (SSE)──▶ lib/agent/run.ts ──▶ Claude Messages API
                                              │   ▲ tool_use / tool_result loop
                                              ▼   │
                                        lib/agent/tools.ts ──▶ orders, knowledge base (SQLite)
```

- `lib/agent/run.ts` — the agent loop. Builds the system prompt from settings + enabled procedures, streams text to the widget, runs tools, and stores the full Claude message history per conversation (append-only, so thinking blocks stay valid across turns). Uses adaptive thinking, the configured effort level, prompt caching on the system prompt, and server-side refusal fallbacks (`fallbacks: "default"`).
- `lib/agent/tools.ts` — tool definitions (strict JSON schemas) and their implementations, with input validation and authorization.
- `lib/kb.ts` — BM25 search over help-center articles.
- `lib/agent/copilot.ts` — reply drafts for human agents.
- `public/widget.js` — the embed script.

## Embedding on your site

```html
<script src="https://YOUR-DOMAIN/widget.js"
        data-customer-email="jane@example.com"
        data-customer-name="Jane Doe"
        async></script>
```

Omit the `data-customer-*` attributes for anonymous visitors.

## Before production

This is a working MVP. The main gaps to close before real customers use it:

1. **Admin authentication** — `/admin` and `/api/admin/*` are open. Add auth (e.g. Auth.js, Clerk) and protect them in `proxy.ts`.
2. **Identity verification** — the widget trusts `data-customer-email`. Sign it on your server (HMAC of the email with a shared secret) and verify in `/api/chat`.
3. **Real integrations** — replace the demo `orders` table in `lib/agent/tools.ts` with calls to Shopify / your OMS / Stripe.
4. **Database** — move from SQLite to Postgres for multi-instance deployments; consider vector search once the help center has hundreds of articles.
5. **Rate limiting & abuse protection** on `/api/chat`.
6. **More channels** — email and voice reuse the same `runAgentTurn` loop.
