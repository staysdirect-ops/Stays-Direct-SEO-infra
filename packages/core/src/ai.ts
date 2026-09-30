import Anthropic from "@anthropic-ai/sdk";

export interface CallClaudeOptions {
  system: string;
  user: string;
  json?: boolean;
  maxTokens?: number;
}

export interface ClaudeResponse {
  text: string;
  tokens: { input: number; output: number };
}

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function callClaude(options: CallClaudeOptions): Promise<ClaudeResponse> {
  const { system, user, json = false, maxTokens = 2048 } = options;

  let retries = 0;
  const maxRetries = 1;

  while (true) {
    try {
      const message = await client.messages.create({
        model: process.env.CLAUDE_MODEL || "claude-sonnet-5-5",
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: user }],
      });

      let text = "";
      if (message.content[0].type === "text") {
        text = message.content[0].text;
      }

      if (json) {
        text = parseJSON(text);
      }

      return {
        text,
        tokens: {
          input: message.usage.input_tokens,
          output: message.usage.output_tokens,
        },
      };
    } catch (error: any) {
      if (error?.status >= 500 && retries < maxRetries) {
        retries++;
        await new Promise((resolve) => setTimeout(resolve, 1000 * retries));
        continue;
      }
      throw error;
    }
  }
}

function parseJSON(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.slice(7);
  }
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.slice(0, -3);
  }
  return cleaned.trim();
}
