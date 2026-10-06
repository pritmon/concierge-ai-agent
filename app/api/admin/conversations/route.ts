import { connection, type NextRequest } from "next/server";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  await connection();
  const status = request.nextUrl.searchParams.get("status");
  const filter = status && status !== "all" ? "WHERE c.status = ?" : "";
  const rows = db()
    .prepare(
      `SELECT c.*,
        (SELECT content FROM messages m WHERE m.conversation_id = c.id AND m.role IN ('customer','ai','human') ORDER BY m.id DESC LIMIT 1) AS last_message,
        (SELECT content FROM messages m WHERE m.conversation_id = c.id AND m.role = 'customer' ORDER BY m.id LIMIT 1) AS first_message,
        (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.role IN ('customer','ai','human')) AS message_count
       FROM conversations c ${filter}
       ORDER BY c.updated_at DESC
       LIMIT 200`,
    )
    .all(...(filter ? [status!] : []));
  return Response.json({ conversations: rows });
}
