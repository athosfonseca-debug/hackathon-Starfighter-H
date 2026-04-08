import Anthropic from "@anthropic-ai/sdk";
import type { LLMProvider, LLMMessage, LLMTool, LLMResponse } from "./types";

export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";
  private client: Anthropic;
  private model: string;

  constructor() {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
    this.model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-20250514";
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
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: maxTokens,
      system,
      tools: tools?.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters as Anthropic.Tool["input_schema"],
      })),
      messages: messages as Anthropic.MessageParam[],
    });

    const toolCalls = response.content
      .filter((b) => b.type === "tool_use")
      .map((b) => ({
        id: (b as Anthropic.ToolUseBlock).id,
        name: (b as Anthropic.ToolUseBlock).name,
        input: (b as Anthropic.ToolUseBlock).input as Record<string, unknown>,
      }));

    return {
      stopReason: response.stop_reason === "tool_use" ? "tool_use" : "end_turn",
      content: response.content as unknown as LLMResponse["content"],
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    };
  }
}
