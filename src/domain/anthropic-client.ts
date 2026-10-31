// Shared helper for calling Anthropic's API from server-side code only.
// Requires ANTHROPIC_API_KEY to be set as an environment variable — never
// hardcoded, never sent to the browser. If it's missing, every AI feature
// fails safely with a clear message instead of crashing or silently costing
// money with a key nobody intended to use.

export type AnthropicCallResult =
  | { ok: true; text: string }
  | { ok: false; error: string };

export async function callClaude(params: {
  system: string;
  userMessage: string;
  maxTokens: number;
  timeoutMs?: number;
}): Promise<AnthropicCallResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      error:
        "AI features are not configured. Set ANTHROPIC_API_KEY in your environment variables (see README) to enable this.",
    };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), params.timeoutMs ?? 20000);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: params.maxTokens,
        system: params.system,
        messages: [{ role: "user", content: params.userMessage }],
      }),
    });
    clearTimeout(timeout);

    if (response.status === 401) {
      return { ok: false, error: "AI provider rejected the API key. Check ANTHROPIC_API_KEY is correct and active." };
    }
    if (response.status === 429) {
      return { ok: false, error: "AI provider rate limit reached. Try again shortly." };
    }
    if (!response.ok) {
      return { ok: false, error: `AI provider returned status ${response.status}` };
    }

    const data = await response.json();
    const textBlock = (data.content ?? []).find((b: any) => b.type === "text");
    if (!textBlock?.text) return { ok: false, error: "AI provider returned no text content" };

    return { ok: true, text: textBlock.text };
  } catch (err: any) {
    if (err?.name === "AbortError") return { ok: false, error: "AI request timed out" };
    return { ok: false, error: `AI request failed: ${String(err)}` };
  }
}

export function parseJsonResponse(text: string): { ok: true; data: unknown } | { ok: false; error: string } {
  const cleaned = text.replace(/```json|```/g, "").trim();
  try {
    return { ok: true, data: JSON.parse(cleaned) };
  } catch {
    return { ok: false, error: "AI response was not valid JSON" };
  }
}
