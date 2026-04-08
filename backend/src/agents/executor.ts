import { searchFlights } from "../services/toguro";
import type { Passenger, ResolvedDates } from "../types";

interface ExecutorContext {
  passengers: Passenger[];
  dates: ResolvedDates;
  from: string;
  budget: number;
}

let _ctx: ExecutorContext | null = null;

export function setExecutorContext(ctx: ExecutorContext): void {
  _ctx = ctx;
}

export async function executeToolCall(
  name: string,
  input: Record<string, unknown>
): Promise<unknown> {
  if (!_ctx)
    throw new Error(
      "ExecutorContext não foi definido antes de executeToolCall"
    );

  switch (name) {
    case "search_flights_toguro": {
      try {
        const searchInput = {
          passengers: _ctx.passengers,
          dates: _ctx.dates,
          from: _ctx.from,
          to: String(input.to),
          destinationName: String(input.destinationName ?? ""),
          destinationFlag: String(input.destinationFlag ?? "✈️"),
        };
        console.log("[toguro] search_flights_toguro →", JSON.stringify(searchInput));

        const result = await searchFlights(searchInput);

        console.log(`[toguro] ← ${result.options.length} opções para ${input.to} (total: ${result.totalResults})`);

        // Calcula withinBudget para cada opção
        result.options = result.options.map((o) => ({
          ...o,
          withinBudget: o.totalPriceBRL <= _ctx!.budget,
        }));

        return result;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[toguro] ERRO search_flights_toguro (${input.to}):`, msg);
        return { error: msg, options: [], totalResults: 0 };
      }
    }

    default:
      return { error: `Tool desconhecida: ${name}` };
  }
}
