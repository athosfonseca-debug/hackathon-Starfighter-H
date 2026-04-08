import type {
  LLMProvider,
  LLMResponse,
  LLMMessage,
  LLMTool,
} from "../../src/lib/llm/types";

// LLM fake que simula tool_use + resposta final
export function createMockLLM(destinations: string[]): LLMProvider {
  let callCount = 0;

  return {
    name: "mock",
    async complete({
      messages,
      tools,
    }: {
      system: string;
      messages: LLMMessage[];
      tools?: LLMTool[];
      maxTokens?: number;
    }): Promise<LLMResponse> {
      callCount++;

      // 1ª chamada: pede as tools (simula escolha de 3 destinos)
      if (callCount === 1 && tools?.length) {
        return {
          stopReason: "tool_use",
          content: destinations.map((to, i) => ({
            type: "tool_use" as const,
            id: `tool_${i}`,
            name: "search_flights_onhappy",
            input: { to, destinationName: to, destinationFlag: "✈️" },
          })),
          toolCalls: destinations.map((to, i) => ({
            id: `tool_${i}`,
            name: "search_flights_onhappy",
            input: { to, destinationName: to, destinationFlag: "✈️" },
          })),
        };
      }

      // 2ª chamada: resposta final com o formato correto
      const mockOptions = destinations.slice(0, 3).map((to, i) => ({
        id: `mock-${to}-LIGHT`,
        destination: to,
        destinationIATA: to,
        destinationFlag: "✈️",
        airline: "G3",
        fareFamily: "LIGHT",
        totalPriceBRL: 1000 + i * 200,
        pricePerPerson: 1000 + i * 200,
        baggageChecked: false,
        baggageCarryOn: true,
        recommended: i === 0,
        withinBudget: true,
        outbound: {
          flightNumber: "G3 100",
          departure: "08:00",
          arrival: "10:00",
          durationMin: 120,
          date: "2026-07-10",
        },
        inbound: {
          flightNumber: "G3 101",
          departure: "16:00",
          arrival: "18:00",
          durationMin: 120,
          date: "2026-07-17",
        },
      }));

      return {
        stopReason: "end_turn",
        content: [
          {
            type: "text",
            text: `<flight_results>\n${JSON.stringify({
              options: mockOptions,
              message: "Ótimas opções encontradas para sua viagem!",
            })}\n</flight_results>`,
          },
        ],
      };
    },
  };
}
