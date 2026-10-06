import { connection } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  await connection();
  const d = db();

  // A conversation counts as handled by AI when no human ever stepped in.
  const totals = d
    .prepare(
      `SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN escalation_reason IS NULL
                  AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = c.id AND m.role = 'human')
             THEN 1 ELSE 0 END) AS ai_handled,
        SUM(CASE WHEN status = 'escalated' THEN 1 ELSE 0 END) AS open_escalations,
        SUM(CASE WHEN escalation_reason IS NOT NULL THEN 1 ELSE 0 END) AS escalated_ever,
        SUM(CASE WHEN csat = 1 THEN 1 ELSE 0 END) AS csat_positive,
        SUM(CASE WHEN csat = -1 THEN 1 ELSE 0 END) AS csat_negative
       FROM conversations c
       WHERE EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = c.id AND m.role = 'customer')`,
    )
    .get() as Record<string, number | null>;

  const daily = d
    .prepare(
      `SELECT date(created_at) AS day,
        COUNT(*) AS total,
        SUM(CASE WHEN escalation_reason IS NULL THEN 1 ELSE 0 END) AS ai_handled
       FROM conversations
       WHERE created_at >= date('now', '-13 days')
       GROUP BY day ORDER BY day`,
    )
    .all();

  const actions = d
    .prepare(
      `SELECT tool, COUNT(*) AS count, SUM(is_error) AS errors
       FROM actions GROUP BY tool ORDER BY count DESC`,
    )
    .all();

  const refunds = d
    .prepare(
      `SELECT COALESCE(SUM(json_extract(output, '$.refunded_usd')), 0) AS amount, COUNT(*) AS count
       FROM actions WHERE tool IN ('issue_refund', 'cancel_order') AND is_error = 0`,
    )
    .get();

  const escalationReasons = d
    .prepare(
      `SELECT escalation_reason AS reason, COUNT(*) AS count FROM conversations
       WHERE escalation_reason IS NOT NULL GROUP BY escalation_reason ORDER BY count DESC LIMIT 8`,
    )
    .all();

  const gaps = d
    .prepare(
      `SELECT query, COUNT(*) AS count FROM knowledge_gaps
       GROUP BY lower(query) ORDER BY count DESC LIMIT 8`,
    )
    .all();

  return Response.json({ totals, daily, actions, refunds, escalationReasons, gaps });
}
