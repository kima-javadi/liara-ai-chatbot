import { createOpenAI } from "@ai-sdk/openai";

/**
 * An OpenAI-compatible provider configured entirely from the environment, so
 * pointing at Liara's AI endpoint, a proxy, or OpenAI itself is a config
 * change with no code change.
 *
 * `.chat()` is required, not stylistic. Calling the provider directly or via
 * `.languageModel()` targets OpenAI's Responses API, which third-party
 * OpenAI-compatible endpoints do not implement. That failure appears at
 * runtime as a 404 from the provider, not at compile time.
 */
const provider = createOpenAI({
  baseURL: process.env.AI_BASE_URL,
  apiKey: process.env.AI_API_KEY,
  name: "liara-ai",
});

export function chatModel() {
  const id = process.env.AI_MODEL;
  if (!id) throw new Error("AI_MODEL is not set");
  return provider.chat(id);
}
