import type { LLMTool } from "../lib/llm/types";

export const TOOLS: LLMTool[] = [
  {
    name: "search_flights_onhappy",
    description: `Busca passagens aéreas reais via API OnHappy.
Chame para CADA um dos 3 destinos candidatos.
Retorna preços reais, horários, tarifas (LIGHT/CLASSIC/FLEX) e bagagem.
NUNCA invente preços — sempre use esta tool.`,
    parameters: {
      type: "object",
      properties: {
        to: {
          type: "string",
          description: "Código IATA do destino (ex: SSA, REC, CTG)",
        },
        destinationName: {
          type: "string",
          description: "Nome legível (ex: Salvador)",
        },
        destinationFlag: {
          type: "string",
          description: "Emoji representativo (ex: 🏖️)",
        },
      },
      required: ["to", "destinationName", "destinationFlag"],
    },
  },
];
