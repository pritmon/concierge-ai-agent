# Architecture

How Concierge works, from a customer's message to the agent's reply. Read this alongside the code; each section links to the file it describes.

## The big picture

```
 Customer's website
 └─ public/widget.js ── injects an iframe ──▶ /widget (components/ChatWidget.tsx)
                                                   │
                                     POST /api/chat│  (streamed back as server-sent events)
                                                   ▼
                                     app/api/chat/route.ts
                                                   │
                                                   ▼
                                     lib/agent/run.ts  ◀──▶  Claude API
                                                   │   (agent loop)
                                                   ▼
                                     lib/agent/tools.ts
                                     ├─ lib/kb.ts      help-center search
                                     └─ lib/db.ts      orders, conversations, logs (SQLite)

 Admin dashboard (/admin) ── reads and edits the same data via /api/admin/*
```

## Following one message

Say a signed-in customer types **"When will my order arrive?"**

1. **Widget**: [components/ChatWidget.tsx](../components/ChatWidget.tsx) sends `{ conversationId, message, customer }` to `/api/chat` and starts reading the event stream.
2. **API route**: [app/api/chat/route.ts](../app/api/chat/route.ts) validates the body with Zod, creates the conversation if it's new, and saves the customer's message.
   - If a human has taken over (`status = "escalated"`), it stops here. The AI stays quiet.
   - Otherwise it calls `runAgentTurn()` and forwards each event to the browser.
3. **Agent loop**: [lib/agent/run.ts](../lib/agent/run.ts):
   1. Loads the conversation's Claude history and appends the new message.
   2. Calls Claude with the system prompt (settings + procedures), the tool list and the history.
   3. Claude replies with a **tool request**: `check_delivery_date({ order_id, email })`.
   4. The loop runs the tool, appends the result, and calls Claude again.
   5. Claude now writes the **final reply**, which streams to the widget word by word.
   6. The history and the reply are saved.
4. **Tool**: [lib/agent/tools.ts](../lib/agent/tools.ts) validates the input, checks the customer owns the order, and returns the delivery estimate.
5. **Widget** shows "Checking your delivery date…" while the tool runs, then the reply.

## Key concepts

### The agent loop
One customer message can need several model calls:

```
repeat (up to 10 times):
  call Claude
  if Claude wrote a final reply → stop
  if Claude asked for tools     → run them, send results back, repeat
```

Claude decides *which* tools to use and *when*. The code decides *whether it's allowed* and does the work.

### Tools = function + description
Each tool in `tools.ts` has a **definition** (name, description, input schema) that Claude reads, and an **implementation** (a `case` in `executeTool`) that runs. Claude never sees the code, only the description, so descriptions are written as instructions about when to use the tool.

| Tool | Does | Guardrail |
|---|---|---|
| `search_knowledge_base` | Searches help articles | Logs a knowledge gap when nothing matches |
| `lookup_order` | Order details | Order number + matching email; signed-in customers only see their own orders |
| `check_delivery_date` | Delivery estimate, flags delays | Same ownership check |
| `list_customer_orders` | Customer's orders | Signed-in customers can only list their own |
| `cancel_order` | Cancels | Only while `processing` |
| `update_shipping_address` | Changes address | Only while `processing` |
| `issue_refund` | Refunds | At most the auto-approve limit and the remaining balance |
| `escalate_to_human` | Hands off | Sets the conversation to `escalated` with a summary |

### Guardrails live in code
The prompt tells the agent the refund limit, but `issue_refund` **also** rejects anything above it. Prompts guide behavior; code enforces rules. A prompt injection can at most make the model *ask* for something, and the tool still says no.

### Two histories per conversation
- `messages` table: what people see (customer, AI, teammate, system notes, plus tool rows for admins).
- `llm_history` table: the exact Claude message list, including tool calls and thinking. It is **append-only**, which keeps the model's context accurate across turns.

### Procedures
Admin-written playbooks ("When: customer asks for a refund → steps 1-5") are stored in the database and added to the system prompt on every turn. Support teams change agent behavior without a code deploy.

### Prompt caching
The system prompt and tool list are the same across turns, so they're marked for caching, which makes them cheaper and faster on repeat calls. Per-conversation details (today's date, who's signed in) go in a second block *after* the cached part so they don't invalidate it.

### Human handoff
A conversation is handed off by the agent (`escalate_to_human`), by the customer ("Talk to a person"), or automatically if the model declines a request. Then:
- the AI stops replying ([app/api/chat/route.ts](../app/api/chat/route.ts)),
- the inbox shows the handoff summary ([app/admin/inbox/page.tsx](../app/admin/inbox/page.tsx)),
- teammate replies appear in the widget through polling,
- **Draft reply with AI** ([lib/agent/copilot.ts](../lib/agent/copilot.ts)) suggests a response.

### Help-center search
[lib/kb.ts](../lib/kb.ts) ranks articles with BM25, a classic keyword-relevance formula. With a small help center it's accurate enough and needs no extra services. Questions with no match are logged as **knowledge gaps** and shown in the dashboard.

## Conversation statuses

```
ai ──(escalation)──▶ escalated ──(teammate resolves)──▶ resolved / closed
 │                       ▲
 └──(customer 👍)──▶ resolved
                         │
   "Hand back to AI" ────┘ (from the inbox)
```

## Where to make common changes

| I want to… | Edit |
|---|---|
| Let the agent do something new | `lib/agent/tools.ts` (definition, schema, label, `case`) |
| Change how the agent behaves | `buildSystemPrompt()` in `lib/agent/run.ts`, or add a Procedure in the admin |
| Improve search | `lib/kb.ts` |
| Store new data | `SCHEMA` in `lib/db.ts` (delete `data/support.db` to recreate) |
| Change the chat UI | `components/ChatWidget.tsx` |
| Add an admin page | `app/admin/<page>/page.tsx` + `app/api/admin/<page>/route.ts` |

## Known limitations

- `/admin` has no login.
- The widget trusts the customer email it's given; production should verify a signed token.
- Orders are demo data in SQLite rather than a real store integration.
- Today's date is given to the agent in UTC, so "today/tomorrow" can be off by a day in other timezones.
- No automated tests of agent behavior yet.
