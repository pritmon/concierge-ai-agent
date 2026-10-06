import { connection } from "next/server";
import { ArticleInput } from "@/lib/schemas";
import { db } from "@/lib/db";

export async function GET() {
  await connection();
  const articles = db().prepare("SELECT * FROM articles ORDER BY category, title").all();
  const gaps = db()
    .prepare("SELECT query, COUNT(*) AS count, MAX(created_at) AS last_seen FROM knowledge_gaps GROUP BY lower(query) ORDER BY count DESC, last_seen DESC LIMIT 20")
    .all();
  return Response.json({ articles, gaps });
}

export async function POST(request: Request) {
  const parsed = ArticleInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Title and body are required" }, { status: 400 });
  const { title, body, category } = parsed.data;
  const article = db()
    .prepare("INSERT INTO articles (title, body, category) VALUES (?, ?, ?) RETURNING *")
    .get(title, body, category);
  return Response.json({ article });
}
