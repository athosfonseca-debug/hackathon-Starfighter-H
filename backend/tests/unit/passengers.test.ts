import { describe, it, expect } from "vitest";
import {
  buildPassengersParam,
  countByType,
} from "../../src/services/passengers";

describe("buildPassengersParam", () => {
  it("converte adult para 18", () => {
    expect(buildPassengersParam([{ type: "adult" }])).toBe("18");
  });

  it("converte child para 11 independente da idade", () => {
    expect(buildPassengersParam([{ type: "child", age: 7 }])).toBe("11");
  });

  it("converte infant para 1", () => {
    expect(buildPassengersParam([{ type: "infant" }])).toBe("1");
  });

  it("combina múltiplos passageiros", () => {
    expect(
      buildPassengersParam([
        { type: "adult" },
        { type: "adult" },
        { type: "child", age: 7 },
        { type: "infant" },
      ])
    ).toBe("18,18,11,1");
  });

  it("lança erro com array vazio", () => {
    expect(() => buildPassengersParam([])).toThrow("Pelo menos 1 passageiro");
  });
});

describe("countByType", () => {
  it("conta corretamente por tipo", () => {
    const result = countByType([
      { type: "adult" },
      { type: "adult" },
      { type: "child", age: 5 },
      { type: "infant" },
    ]);
    expect(result.adults).toBe(2);
    expect(result.children).toHaveLength(1);
    expect(result.infants).toBe(1);
    expect(result.total).toBe(4);
  });
});
