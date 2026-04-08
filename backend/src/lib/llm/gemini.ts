import { GoogleGenerativeAI } from "@google/generative-ai";
import type { LLMProvider, LLMMessage, LLMTool, LLMResponse } from "./types";

export class GeminiProvider implements LLMProvider {
  readonly name = "gemini";
  private genai: GoogleGenerativeAI;

  constructor() {
    this.genai = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
  }

  async complete({
    system,
    messages,
    tools,
    maxTokens = 1024,
  }: {
    system: string;
    messages: LLMMessage[];
    tools?: LLMTool[];
    maxTokens?: number;
  }): Promise<LLMResponse> {
    const model = this.genai.getGenerativeModel({
      model: "gemini-2.0-flash",
      systemInstruction: system,
    });

    const history = messages.slice(0, -1).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [
        {
          text:
            typeof m.content === "string"
              ? m.content
              : JSON.stringify(m.content),
        },
      ],
    }));

    const last = messages[messages.length - 1];
    const chat = model.startChat({ history });
    const result = await chat.sendMessage(
      typeof last.content === "string"
        ? last.content
        : JSON.stringify(last.content)
    );

    return {
      stopReason: "end_turn",
      content: [{ type: "text", text: result.response.text() }],
    };
  }
}
