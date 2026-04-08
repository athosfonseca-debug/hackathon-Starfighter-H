export interface LLMMessage {
  role: "user" | "assistant";
  content: string | LLMContentBlock[];
}

export interface LLMContentBlock {
  type: "text" | "tool_use" | "tool_result";
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
}

export interface LLMTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
}

export interface LLMResponse {
  stopReason: "end_turn" | "tool_use" | "error";
  content: LLMContentBlock[];
  toolCalls?: Array<{
    id: string;
    name: string;
    input: Record<string, unknown>;
  }>;
}

export interface LLMProvider {
  complete(params: {
    system: string;
    messages: LLMMessage[];
    tools?: LLMTool[];
    maxTokens?: number;
  }): Promise<LLMResponse>;

  // Identificação do provider — usado em meta da resposta
  readonly name: string;
}
