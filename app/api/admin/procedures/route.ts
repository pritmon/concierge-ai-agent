import { connection } from "next/server";
import { ProcedureInput } from "@/lib/schemas";
import { db } from "@/lib/db";

export async function GET() {
  await connection();
  return Response.json({ procedures: db().prepare("SELECT * FROM procedures ORDER BY id").all() });
}

export async function POST(request: Request) {
  const parsed = ProcedureInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Name, trigger and instructions are required" }, { status: 400 });
  const { name, trigger, instructions, enabled } = parsed.data;
  const procedure = db()
    .prepare("INSERT INTO procedures (name, trigger, instructions, enabled) VALUES (?, ?, ?, ?) RETURNING *")
    .get(name, trigger, instructions, enabled ? 1 : 0);
  return Response.json({ procedure });
}
