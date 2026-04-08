import { AnthropicProvider } from "./anthropic";
import { GeminiProvider } from "./gemini";
import { GroqProvider } from "./groq";
import type { LLMProvider } from "./types";

export function getLLMProvider(): LLMProvider {
  switch (process.env.LLM_PROVIDER ?? "anthropic") {
    case "gemini":
      return new GeminiProvider();
    case "groq":
      return new GroqProvider();
    case "anthropic":
    default:
      return new AnthropicProvider();
  }
}

export type { LLMProvider };
