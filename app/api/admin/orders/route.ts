import { connection } from "next/server";
import { db } from "@/lib/db";

// The demo "backend" the agent's tools act on.
export async function GET() {
  await connection();
  const orders = db().prepare("SELECT * FROM orders ORDER BY created_at DESC").all();
  return Response.json({ orders });
}
