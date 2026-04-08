import { describe, it, expect, vi, beforeEach } from "vitest";
import app from "../../src/server";
import * as llmModule from "../../src/lib/llm";
import { createMockLLM } from "../helpers/mockLLM";
import {
  FIXED_DATES_BEACH,
  FLEXIBLE_DATES_ROMANTIC,
  WITH_INFANT,
} from "../helpers/fixtures";

// Força mock mode (sem token da OnHappy)
beforeEach(() => {
  delete process.env.ONHAPPY_API_TOKEN;
  vi.spyOn(llmModule, "getLLMProvider").mockReturnValue(
    createMockLLM(["SSA", "REC", "FLN"])
  );
});

async function post(body: unknown) {
  return app.inject({
    method: "POST",
    url: "/api/search",
    payload: body,
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/search", () => {
  it("retorna 200 com opções para busca com datas fixas", async () => {
    const res = await post(FIXED_DATES_BEACH);
    expect(res.statusCode).toBe(200);
    const body = res.json() as Record<string, unknown>;
    expect(body.options).toBeDefined();
    expect(
      (body.resolvedDates as Record<string, unknown>).confidence
    ).toBe("high");
    expect((body.meta as Record<string, unknown>).mockMode).toBe(true);
  });

  it("retorna options como array mesmo sem resultados", async () => {
    vi.spyOn(llmModule, "getLLMProvider").mockReturnValue(createMockLLM([]));
    const res = await post(FIXED_DATES_BEACH);
    const body = res.json() as Record<string, unknown>;
    expect(Array.isArray(body.options)).toBe(true);
  });

  it("informa o provider LLM usado no meta", async () => {
    const res = await post(FIXED_DATES_BEACH);
    const body = res.json() as Record<string, unknown>;
    expect((body.meta as Record<string, unknown>).llmProvider).toBe("mock");
  });

  it("retorna 400 para body inválido", async () => {
    const res = await post({ passengers: [] });
    expect(res.statusCode).toBe(400);
  });

  it("funciona com datas flexíveis", async () => {
    vi.spyOn(llmModule, "getLLMProvider").mockReturnValue(
      createMockLLM(["REC", "FLN", "GIG"])
    );
    const res = await post(FLEXIBLE_DATES_ROMANTIC);
    expect(res.statusCode).toBe(200);
    const body = res.json() as Record<string, unknown>;
    expect(
      (body.resolvedDates as Record<string, unknown>).departure
    ).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("funciona com viajantes com bebê", async () => {
    const res = await post(WITH_INFANT);
    expect(res.statusCode).toBe(200);
  });

  it("GET /health retorna status ok", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect((res.json() as Record<string, unknown>).status).toBe("ok");
  });
});
