import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "../../src/agents/systemPrompt";

describe("buildSystemPrompt", () => {
  it("injeta o contextJson no prompt", () => {
    const ctx = JSON.stringify({ intent: "praia", budget: { total: 5000 } });
    const prompt = buildSystemPrompt(ctx);
    expect(prompt).toContain("praia");
    expect(prompt).toContain("5000");
  });

  it("contém os delimitadores de saída", () => {
    const prompt = buildSystemPrompt("{}");
    expect(prompt).toContain("<flight_results>");
    expect(prompt).toContain("</flight_results>");
  });

  it("contém instrução de exatamente 3 destinos", () => {
    const prompt = buildSystemPrompt("{}");
    expect(prompt).toContain("EXATAMENTE 3");
  });

  it("contém instrução de não inventar preços", () => {
    const prompt = buildSystemPrompt("{}");
    expect(prompt).toContain("NUNCA invente preços");
  });
});
