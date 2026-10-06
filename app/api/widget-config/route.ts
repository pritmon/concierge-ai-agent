import { connection } from "next/server";
import { getSettings } from "@/lib/db";

export async function GET() {
  await connection();
  const { agentName, companyName, greeting, brandColor } = getSettings();
  return Response.json({ agentName, companyName, greeting, brandColor });
}
