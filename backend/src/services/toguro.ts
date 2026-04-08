import type { FlightOption, Passenger, ResolvedDates } from "../types";
import { buildPassengersParam } from "./passengers";

export interface SearchFlightsInput {
  passengers: Passenger[];
  dates: ResolvedDates;
  from: string;
  to: string;
  destinationName?: string;
  destinationFlag?: string;
}

export interface SearchFlightsOutput {
  options: FlightOption[];
  totalResults: number;
  priceRange: { min: number; max: number };
}

// ── Token cache (válido por 365 dias, limitado a 1 auth/2min) ───
let _cachedOnflyToken: string | null = null;
let _cachedToguroToken: string | null = null;
let _tokenFetchPromise: Promise<{ onfly: string; toguro: string }> | null = null;

async function getTokens(): Promise<{ onfly: string; toguro: string }> {
  if (_cachedOnflyToken && _cachedToguroToken) {
    return { onfly: _cachedOnflyToken, toguro: _cachedToguroToken };
  }
  // Deduplica chamadas concorrentes: todas aguardam a mesma promise
  if (_tokenFetchPromise) return _tokenFetchPromise;

  _tokenFetchPromise = (async () => {
    const onfly = await getOnflyToken();
    const toguro = await getToguroToken(onfly);
    _cachedOnflyToken = onfly;
    _cachedToguroToken = toguro;
    _tokenFetchPromise = null;
    return { onfly, toguro };
  })();

  return _tokenFetchPromise;
}

// ── Auth step 1: Onfly OAuth token ──────────────────────────────
async function getOnflyToken(): Promise<string> {
  console.log("[toguro] step 1 → POST https://api.onfly.com.br/oauth/token");
  const res = await fetch("https://api.onfly.com.br/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      scope: "*",
      client_id: process.env.ONFLY_CLIENT_ID,
      client_secret: process.env.ONFLY_CLIENT_SECRET,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Onfly OAuth ${res.status}: ${body}`);
  }

  const data = (await res.json()) as Record<string, unknown>;
  const token = data.access_token as string;
  if (!token) throw new Error("Onfly OAuth: access_token não encontrado na resposta");
  console.log("[toguro] step 1 ← token OK");
  return token;
}

// ── Auth step 2: Toguro internal token ─────────────────────────
async function getToguroToken(onflyToken: string): Promise<string> {
  console.log("[toguro] step 2 → GET https://api.onfly.com/auth/token/internal");
  const res = await fetch("https://api.onfly.com/auth/token/internal", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${onflyToken}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Toguro internal token ${res.status}: ${body}`);
  }

  const data = (await res.json()) as Record<string, unknown>;
  console.log("[toguro] step 2 ← keys:", Object.keys(data));
  const token = (data.token ?? data.access_token) as string;
  if (!token) throw new Error(`Toguro internal token: token não encontrado. Keys: ${Object.keys(data).join(", ")}`);
  console.log("[toguro] step 2 ← token OK");
  return token;
}

// ── Auth step 3: Quote creation ─────────────────────────────────
function birthdayFromAge(age: number | undefined): string {
  const years = age ?? 30;
  const birthYear = new Date().getFullYear() - years;
  return `${birthYear}-01-01`;
}

async function createQuote(
  toguroToken: string,
  input: SearchFlightsInput
): Promise<unknown> {
  const travelers = input.passengers.map((p) => ({
    birthday: birthdayFromAge(p.age),
    travelerEntityId: null,
  }));

  const body = {
    owners: [null],
    flights: [
      {
        departure: input.dates.departure,
        from: input.from,
        return: input.dates.return,
        to: input.to,
        travelers,
      },
    ],
    groupFlights: true,
  };

  console.log("[toguro] step 3 → POST https://toguro-app-prod.onfly.com/bff/quote/create");
  console.log("[toguro] step 3 body:", JSON.stringify(body));

  const res = await fetch("https://toguro-app-prod.onfly.com/bff/quote/create", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${toguroToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Toguro BFF ${res.status}: ${text}`);
  }

  const json = await res.json();
  console.log("[toguro] step 3 ← status OK, tipo:", Array.isArray(json) ? `array[${(json as unknown[]).length}]` : typeof json);
  return json;
}

function invalidateTokenCache(): void {
  console.log("[toguro] invalidando cache de tokens");
  _cachedOnflyToken = null;
  _cachedToguroToken = null;
  _tokenFetchPromise = null;
}

// ── Main entry point ────────────────────────────────────────────
export async function searchFlights(
  input: SearchFlightsInput
): Promise<SearchFlightsOutput> {
  let raw: unknown;
  try {
    const { toguro: toguroToken } = await getTokens();
    raw = await createQuote(toguroToken, input);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    // Token expirado: invalida cache e tenta uma vez mais
    if (message.includes("401") || message.includes("token_expired")) {
      console.log(`[toguro] token expirado para ${input.to}, reautenticando...`);
      invalidateTokenCache();
      try {
        const { toguro: freshToken } = await getTokens();
        raw = await createQuote(freshToken, input);
      } catch (retryErr: unknown) {
        const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr);
        throw new Error(`Falha ao buscar voos para ${input.to} (após retry): ${retryMsg}`);
      }
    } else {
      throw new Error(`Falha ao buscar voos para ${input.to}: ${message}`);
    }
  }

  return parseResponse(raw, input);
}

// ── Parser ──────────────────────────────────────────────────────
// Toguro response shape:
//   Array<{ response: { data: Package[], metadata: { pagination, minPrice, maxPrice } } }>
// Each Package: { fares[], options: { outbounds[], inbounds[] } }
// Prices are in centavos → divide by 100

type R = Record<string, unknown>;

export function parseResponse(
  raw: unknown,
  input: SearchFlightsInput
): SearchFlightsOutput {
  // Unwrap outer array wrapper
  const outerArr = Array.isArray(raw) ? (raw as R[]) : [];
  const firstItem = (outerArr[0] as R) ?? {};
  const responseObj = (firstItem.response as R) ?? {};
  const packages: R[] = Array.isArray(responseObj.data)
    ? (responseObj.data as R[])
    : [];
  const meta = (responseObj.metadata as R) ?? {};
  const pagination = (meta.pagination as R) ?? {};

  const options: FlightOption[] = [];

  for (const pkg of packages) {
    const pkgOptions = (pkg.options as R) ?? {};
    const outbounds: R[] = Array.isArray(pkgOptions.outbounds)
      ? (pkgOptions.outbounds as R[])
      : [];
    const inbounds: R[] = Array.isArray(pkgOptions.inbounds)
      ? (pkgOptions.inbounds as R[])
      : [];

    const out = outbounds[0];
    const inb = inbounds[0];
    if (!out || !inb) continue;

    const fares: R[] = Array.isArray(pkg.fares) ? (pkg.fares as R[]) : [];

    for (const fare of fares) {
      if (fare.status !== "Available") continue;

      const priceCentavos = (fare.totalPrice as number) ?? 0;
      const priceBRL = priceCentavos / 100;

      const services: R[] = Array.isArray(fare.includedServices)
        ? (fare.includedServices as R[])
        : [];
      const baggageChecked = services.some((s) => s.code === "SER_01");
      const baggageCarryOn = services.some(
        (s) => s.code === "SER_06" || s.code === "SER_11"
      );

      const cia = (fare.ciaManaging as R) ?? {};
      const airline = (cia.code as string) ?? "??";
      const family = (fare.family as string) ?? "STANDARD";

      options.push({
        id: `${airline}-${family}-${pkg.id as string ?? Math.random()}`,
        destination: input.destinationName ?? input.to,
        destinationIATA: input.to,
        destinationFlag: input.destinationFlag ?? "✈️",
        airline,
        fareFamily: family,
        totalPriceBRL: priceBRL,
        pricePerPerson: priceBRL / input.passengers.length,
        baggageChecked,
        baggageCarryOn,
        recommended: false,
        withinBudget: false,
        outbound: parseFlightLeg(out),
        inbound: parseFlightLeg(inb),
        bookingUrl: buildBookingUrl(input),
      });
    }
  }

  options.sort((a, b) => a.totalPriceBRL - b.totalPriceBRL);

  const minPriceBRL = ((meta.minPrice as number) ?? 0) / 100;
  const maxPriceBRL = ((meta.maxPrice as number) ?? 0) / 100;
  const prices = options.map((o) => o.totalPriceBRL);

  return {
    options: options.slice(0, 6),
    totalResults: (pagination.total as number) ?? options.length,
    priceRange: {
      min: minPriceBRL || (prices[0] ?? 0),
      max: maxPriceBRL || (prices[prices.length - 1] ?? 0),
    },
  };
}

function buildBookingUrl(input: SearchFlightsInput): string {
  const params = new URLSearchParams({
    origin: input.from,
    destination: input.to,
    departure: input.dates.departure,
    arrival: input.dates.return,
    passengers: buildPassengersParam(input.passengers),
    type: "user",
  });
  return `https://app.onfly.com.br/flight-search?${params.toString()}`;
}

function parseFlightLeg(leg: R): FlightOption["outbound"] {
  const departure = (leg.departure as string) ?? "";
  const arrival = (leg.arrival as string) ?? "";
  return {
    flightNumber: String(leg.flightNumber ?? ""),
    departure: departure.slice(11, 16) || "00:00",
    arrival: arrival.slice(11, 16) || "00:00",
    durationMin: (leg.duration as number) ?? 0,
    date: departure.slice(0, 10) || "",
  };
}

