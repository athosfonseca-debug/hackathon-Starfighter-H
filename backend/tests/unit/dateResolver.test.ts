import { describe, it, expect } from "vitest";
import { resolveDates } from "../../src/services/dateResolver";

describe("resolveDates — modo fixed", () => {
  it("retorna datas direto com confidence high", async () => {
    const result = await resolveDates({
      mode: "fixed",
      departure: "2026-07-10",
      return: "2026-07-17",
    });
    expect(result.departure).toBe("2026-07-10");
    expect(result.return).toBe("2026-07-17");
    expect(result.durationDays).toBe(7);
    expect(result.confidence).toBe("high");
  });

  it("lança erro se volta <= ida", async () => {
    await expect(
      resolveDates({
        mode: "fixed",
        departure: "2026-07-17",
        return: "2026-07-10",
      })
    ).rejects.toThrow("posterior");
  });

  it("lança erro com data inválida", async () => {
    await expect(
      resolveDates({
        mode: "fixed",
        departure: "data-invalida",
        return: "2026-07-17",
      })
    ).rejects.toThrow("inválidas");
  });
});
