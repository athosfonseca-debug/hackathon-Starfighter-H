import type { SearchRequest } from "../../src/types";

export const FIXED_DATES_BEACH: SearchRequest = {
  passengers: [
    { type: "adult" },
    { type: "adult" },
    { type: "child", age: 7 },
    { type: "child", age: 4 },
  ],
  dates: { mode: "fixed", departure: "2026-07-10", return: "2026-07-17" },
  origin: { raw: "BH", iata: "BHZ" },
  budget: { total: 5000, currency: "BRL" },
  intent: "Tava querendo ir pra praia, algo tranquilo pra criança",
};

export const FLEXIBLE_DATES_ROMANTIC: SearchRequest = {
  passengers: [{ type: "adult" }, { type: "adult" }],
  dates: { mode: "flexible", raw: "quero ir no meio do ano por uns 7 dias" },
  origin: { raw: "São Paulo", iata: "GRU" },
  budget: { total: 8000, currency: "BRL" },
  intent: "lua de mel, algo romântico",
};

export const TIGHT_BUDGET: SearchRequest = {
  passengers: [{ type: "adult" }],
  dates: { mode: "fixed", departure: "2026-08-01", return: "2026-08-05" },
  origin: { raw: "BH", iata: "BHZ" },
  budget: { total: 800, currency: "BRL" },
  intent: "quero viajar barato, qualquer lugar",
};

export const WITH_INFANT: SearchRequest = {
  passengers: [{ type: "adult" }, { type: "adult" }, { type: "infant" }],
  dates: { mode: "fixed", departure: "2026-09-10", return: "2026-09-17" },
  origin: { raw: "BH", iata: "BHZ" },
  budget: { total: 6000, currency: "BRL" },
  intent: "praia tranquila pra bebê de 6 meses",
};

export const SPECIFIC_DESTINATION: SearchRequest = {
  passengers: [{ type: "adult" }, { type: "adult" }],
  dates: { mode: "fixed", departure: "2026-12-15", return: "2026-12-22" },
  origin: { raw: "São Paulo", iata: "GRU" },
  budget: { total: 15000, currency: "BRL" },
  intent: "sonho em ir pra Lisboa conhecer Portugal",
};
