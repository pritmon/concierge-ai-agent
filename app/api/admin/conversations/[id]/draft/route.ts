import Anthropic from "@anthropic-ai/sdk";
import { draftReply } from "@/lib/agent/copilot";

export async function POST(_request: Request, ctx: RouteContext<"/api/admin/conversations/[id]/draft">) {
  const { id } = await ctx.params;
  try {
    return Response.json({ draft: await draftReply(id) });
  } catch (err) {
    const message =
      err instanceof Anthropic.AuthenticationError ||
      (err instanceof Anthropic.AnthropicError && !(err instanceof Anthropic.APIError))
        ? "Set ANTHROPIC_API_KEY in .env.local to use Copilot drafts."
        : err instanceof Anthropic.APIError
          ? `AI service error (${err.status ?? "network"})`
          : err instanceof Error
            ? err.message
            : "Draft failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
