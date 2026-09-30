import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { BetaMessage, MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { CreateMessage } from "../src/ai.ts";

const FIXTURES = fileURLToPath(new URL("../../../tests/fixtures/", import.meta.url));

export function fixtureText(path: string): string {
  return readFileSync(FIXTURES + path, "utf8");
}

export function fixture<T = unknown>(path: string): T {
  return JSON.parse(fixtureText(path)) as T;
}

export function textMessage(text: string, overrides: Partial<BetaMessage> = {}): BetaMessage {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-5-5",
    content: [{ type: "text", text, citations: null }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 1000, output_tokens: 500, server_tool_use: null },
    ...overrides,
  } as unknown as BetaMessage;
}

/** Fake Anthropic client: returns queued responses in order and records the requests. */
export function fakeClaude(responses: Array<BetaMessage | string | Error>) {
  const calls: MessageCreateParamsNonStreaming[] = [];
  const queue = [...responses];
  const createMessage: CreateMessage = async (params) => {
    calls.push(structuredClone(params));
    const next = queue.shift();
    if (next === undefined) throw new Error("fakeClaude: no more responses queued");
    if (next instanceof Error) throw next;
    return typeof next === "string" ? textMessage(next) : next;
  };
  return { createMessage, calls };
}

export function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

export const noSleep = async () => {};
