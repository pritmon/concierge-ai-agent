import { connection } from "next/server";
import { z } from "zod";
import { getSettings, saveSettings } from "@/lib/db";

const SettingsInput = z
  .object({
    companyName: z.string().trim().min(1),
    agentName: z.string().trim().min(1),
    tone: z.string().trim().min(1),
    greeting: z.string().trim().min(1),
    refundAutoApproveLimit: z.number().min(0),
    model: z.enum(["claude-opus-5-5", "claude-sonnet-5-5"]),
    effort: z.enum(["low", "medium", "high", "xhigh", "max"]),
    brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  })
  .partial();

export async function GET() {
  await connection();
  return Response.json({ settings: getSettings() });
}

export async function PUT(request: Request) {
  const parsed = SettingsInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid settings", issues: parsed.error.issues }, { status: 400 });
  saveSettings(parsed.data);
  return Response.json({ settings: getSettings() });
}
