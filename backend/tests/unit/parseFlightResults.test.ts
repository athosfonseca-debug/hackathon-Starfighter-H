import { describe, it, expect } from "vitest";
import { parseFlightResults } from "../../src/routes/search";

describe("parseFlightResults", () => {
  it("parseia resposta válida com delimitadores", () => {
    const raw = `<flight_results>
{"options":[{"id":"test","destination":"Salvador","destinationIATA":"SSA","destinationFlag":"🏖️","airline":"G3","fareFamily":"LIGHT","totalPriceBRL":2840.50,"pricePerPerson":1420.25,"baggageChecked":false,"baggageCarryOn":true,"recommended":true,"withinBudget":true,"outbound":{"flightNumber":"G3 1","departure":"08:30","arrival":"10:00","durationMin":90,"date":"2026-07-10"},"inbound":{"flightNumber":"G3 2","departure":"16:00","arrival":"17:30","durationMin":90,"date":"2026-07-17"}}],"message":"Salvador é a melhor opção."}
</flight_results>`;
    const result = parseFlightResults(raw);
    expect(result.options).toHaveLength(1);
    expect((result.options[0] as Record<string, unknown>).destination).toBe(
      "Salvador"
    );
    expect(result.message).toBe("Salvador é a melhor opção.");
  });

  it("retorna options vazio para resposta sem delimitadores", () => {
    const result = parseFlightResults("Texto sem delimitadores");
    expect(result.options).toHaveLength(0);
  });

  it("retorna options vazio para JSON inválido", () => {
    const result = parseFlightResults(
      "<flight_results>json inválido{</flight_results>"
    );
    expect(result.options).toHaveLength(0);
  });

  it("tolera espaços e quebras de linha nos delimitadores", () => {
    const raw = `<flight_results>  \n  {"options":[],"message":"sem voos"}  \n  </flight_results>`;
    const result = parseFlightResults(raw);
    expect(result.message).toBe("sem voos");
  });
});
