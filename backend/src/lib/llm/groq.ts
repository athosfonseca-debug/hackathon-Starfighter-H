import type { LLMProvider, LLMMessage, LLMTool, LLMResponse } from "./types";

// Groq é compatível com a API OpenAI — sem SDK extra necessário
export class GroqProvider implements LLMProvider {
  readonly name = "groq";
  private apiKey: string;
  private model: string;

  constructor() {
    this.apiKey = process.env.GROQ_API_KEY!;
    this.model = process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";
  }

  async complete({
    system,
    messages,
    tools,
    maxTokens = 1500,
  }: {
    system: string;
    messages: LLMMessage[];
    tools?: LLMTool[];
    maxTokens?: number;
  }): Promise<LLMResponse> {
    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        ...messages.map((m) => ({
          role: m.role,
          content:
            typeof m.content === "string"
              ? m.content
              : JSON.stringify(m.content),
        })),
      ],
    };

    if (tools?.length) {
      body.tools = tools.map((t) => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));
      body.tool_choice = "auto";
    }

    let res: Response;
    try {
      res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Falha ao conectar ao Groq: ${msg}`);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Groq API ${res.status}: ${text}`);
    }

    const data = (await res.json()) as {
      choices: Array<{
        finish_reason: string;
        message: {
          content: string | null;
          tool_calls?: Array<{
            id: string;
            function: { name: string; arguments: string };
          }>;
        };
      }>;
    };

    const choice = data.choices[0];
    const toolCalls = choice.message.tool_calls?.map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      input: JSON.parse(tc.function.arguments) as Record<string, unknown>,
    }));

    return {
      stopReason:
        choice.finish_reason === "tool_calls" ? "tool_use" : "end_turn",
      content: toolCalls?.length
        ? toolCalls.map((tc) => ({
            type: "tool_use" as const,
            id: tc.id,
            name: tc.name,
            input: tc.input,
          }))
        : [{ type: "text" as const, text: choice.message.content ?? "" }],
      toolCalls: toolCalls?.length ? toolCalls : undefined,
    };
  }
}
