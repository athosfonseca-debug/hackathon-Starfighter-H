import type { FastifyInstance } from "fastify";
import { getLLMProvider } from "../lib/llm";
import { buildSystemPrompt } from "../agents/systemPrompt";
import { TOOLS } from "../agents/tools";
import { executeToolCall, setExecutorContext } from "../agents/executor";
import { resolveDates } from "../services/dateResolver";
import { countByType, buildPassengersParam } from "../services/passengers";
import { resolveOriginIATA } from "../services/airports";
import type { SearchRequest, SearchResponse, FlightOption, ResolvedDates } from "../types";
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

      // 2. Resolve IATA de origem e monta contexto
      const pax = countByType(body.passengers);
      const from = body.origin.iata ?? await resolveOriginIATA(body.origin.raw);
      setExecutorContext({
        passengers: body.passengers,
        dates: resolvedDates,
        from,
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
        const options = parsed.options as unknown as FlightOption[];

        // 6. Tratamento de erro baseado no que o agente retornou
        const retryCount = messages.filter(
          (m) => m.role === "user" && typeof m.content === "string" && m.content.startsWith("[SISTEMA]")
        ).length;

        // Nenhuma opção encontrada — pede alternativas (máx 1 retry)
        if (options.length === 0 && retryCount === 0) {
          messages.push({
            role: "assistant",
            content: response.content as LLMContentBlock[],
          });
          messages.push({
            role: "user",
            content: `[SISTEMA] Não foram encontrados voos para os destinos escolhidos. Tente 3 destinos alternativos diferentes, preferencialmente mais próximos da origem ou com mais opções de voo. Busque novamente e explique no campo message o que aconteceu e o que você está sugerindo.`,
          });
          continue;
        }

        // Todas as opções acima do budget — pede destinos mais baratos (máx 1 retry)
        const allOverBudget = options.length > 0 && options.every((o) => !o.withinBudget);
        if (allOverBudget && retryCount === 0) {
          messages.push({
            role: "assistant",
            content: response.content as LLMContentBlock[],
          });
          messages.push({
            role: "user",
            content: `[SISTEMA] Todas as opções encontradas estão acima do orçamento de R$ ${body.budget.total}. Tente destinos mais baratos ou domésticos mais próximos. Busque novamente e no campo message explique a situação e o que está sugerindo como alternativa.`,
          });
          continue;
        }

        const passengersParam = buildPassengersParam(body.passengers);

        const result: SearchResponse = {
          options: options.map((o) => ({
            ...o,
            bookingUrl: buildBookingUrl(from, o, passengersParam),
          })),
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

// ── Monta URL de reserva da OnHappy ────────────────────────────
function buildBookingUrl(
  origin: string,
  option: FlightOption,
  passengers: string
): string {
  const params = new URLSearchParams({
    origin,
    destination: option.destinationIATA,
    passengers,
    departure:   option.outbound.date,
    arrival:     option.inbound.date,
    type:        "user",
  });
  return `https://app.onhappy.com.br/flight-search?${params.toString()}`;
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
