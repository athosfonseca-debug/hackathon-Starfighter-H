import type { FastifyInstance } from "fastify";
import { getLLMProvider } from "../lib/llm";
import { buildSystemPrompt } from "../agents/systemPrompt";
import { TOOLS } from "../agents/tools";
import { executeToolCall, setExecutorContext } from "../agents/executor";
import { resolveDates } from "../services/dateResolver";
import { countByType } from "../services/passengers";
import type { SearchRequest, SearchResponse } from "../types";
import type { LLMMessage, LLMContentBlock } from "../lib/llm/types";

export async function searchRoutes(app: FastifyInstance) {
  app.post<{ Body: SearchRequest }>(
    "/api/search",
    {
      schema: {
        body: {
          type: "object",
          required: ["passengers", "dates", "origin", "budget", "intent"],
          properties: {
            passengers: { type: "array", minItems: 1 },
            dates: { type: "object", required: ["mode"] },
            origin: { type: "object", required: ["raw"] },
            budget: { type: "object", required: ["total"] },
            intent: { type: "string", minLength: 1 },
          },
        },
      },
    },
    async (req, reply) => {
      const start = Date.now();
      const body = req.body;
      const llm = getLLMProvider();

      // 1. Resolve datas
      const resolvedDates = await resolveDates(body.dates);

      // 2. Monta contexto para o executor e o system prompt
      const pax = countByType(body.passengers);
      setExecutorContext({
        passengers: body.passengers,
        dates: resolvedDates,
        from: body.origin.iata ?? "GRU",
        budget: body.budget.total,
      });

      const contextJson = JSON.stringify(
        {
          passengers: body.passengers,
          passengerCount: pax.total,
          hasChildren: pax.children.length > 0,
          hasInfants: pax.infants > 0,
          childrenAges: pax.children.map((c) => c.age),
          dates: resolvedDates,
          dateMode: body.dates.mode,
          origin: body.origin,
          budget: body.budget,
          intent: body.intent,
        },
        null,
        2
      );

      const system = buildSystemPrompt(contextJson);

      // 3. Mensagem inicial
      const initMsg = buildInitialMessage(body, resolvedDates);
      const messages: LLMMessage[] = [{ role: "user", content: initMsg }];

      // 4. Agentic loop
      while (true) {
        const response = await llm.complete({
          system,
          messages,
          tools: TOOLS,
          maxTokens: 1500,
        });

        if (response.stopReason === "tool_use" && response.toolCalls?.length) {
          messages.push({
            role: "assistant",
            content: response.content as LLMContentBlock[],
          });

          const results = await Promise.all(
            response.toolCalls.map(async (tc) => {
              const raw = await executeToolCall(tc.name, tc.input);
              return {
                type: "tool_result" as const,
                tool_use_id: tc.id,
                content: JSON.stringify(slimToolResult(raw)),
              };
            })
          );

          messages.push({
            role: "user",
            content: results as LLMContentBlock[],
          });
          continue;
        }

        // 5. Parseia a resposta final
        const rawText =
          response.content.find((b) => b.type === "text")?.text ?? "";
        const parsed = parseFlightResults(rawText);

        const result: SearchResponse = {
          options: parsed.options,
          message: parsed.message,
          resolvedDates,
          meta: {
            llmProvider: llm.name,
            mockMode: !process.env.ONHAPPY_API_TOKEN,
            durationMs: Date.now() - start,
          },
        };

        return reply.send(result);
      }
    }
  );
}

// ── Reduz o payload das tools antes de enviar à LLM ────────────
function slimToolResult(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null) return raw;
  const r = raw as Record<string, unknown>;
  if (r.error) return { error: r.error };

  const options = Array.isArray(r.options) ? r.options : [];
  return {
    mockMode: r.mockMode,
    options: (options as Record<string, unknown>[]).slice(0, 3).map((o) => ({
      id: o.id,
      fareFamily: o.fareFamily,
      totalPriceBRL: o.totalPriceBRL,
      pricePerPerson: o.pricePerPerson,
      baggageChecked: o.baggageChecked,
      baggageCarryOn: o.baggageCarryOn,
      outbound: (o.outbound as Record<string, unknown>),
      inbound: (o.inbound as Record<string, unknown>),
    })),
  };
}

// ── Parser do formato <flight_results>...</flight_results> ──────
export function parseFlightResults(raw: string): {
  options: SearchRequest[];
  message: string;
} {
  const match = raw.match(
    /<flight_results>\s*([\s\S]*?)\s*<\/flight_results>/
  );
  if (!match) {
    return {
      options: [],
      message: raw.trim() || "Nenhum resultado encontrado.",
    };
  }
  try {
    const parsed = JSON.parse(match[1]) as {
      options?: unknown[];
      message?: unknown;
    };
    return {
      options: Array.isArray(parsed.options)
        ? (parsed.options as SearchRequest[])
        : [],
      message:
        typeof parsed.message === "string" ? parsed.message : "",
    };
  } catch {
    return { options: [], message: "Erro ao processar resultados." };
  }
}

import type { ResolvedDates } from "../types";

function buildInitialMessage(
  req: SearchRequest,
  dates: ResolvedDates
): string {
  const pax = countByType(req.passengers);
  const parts = [
    pax.adults > 0
      ? `${pax.adults} adulto${pax.adults > 1 ? "s" : ""}`
      : "",
    pax.children.length > 0
      ? `${pax.children.length} criança${pax.children.length > 1 ? "s" : ""} (${pax.children.map((c) => `${c.age}a`).join(", ")})`
      : "",
    pax.infants > 0
      ? `${pax.infants} bebê${pax.infants > 1 ? "s" : ""}`
      : "",
  ]
    .filter(Boolean)
    .join(", ");

  return `Busque viagens para ${parts}, saindo de ${req.origin.raw} (${req.origin.iata}), ida ${dates.departure} volta ${dates.return}, budget R$ ${req.budget.total.toLocaleString("pt-BR")}. Intenção: "${req.intent}"`;
}
