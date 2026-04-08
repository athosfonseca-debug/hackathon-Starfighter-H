import type { FlightOption, Passenger, ResolvedDates } from "../types";
import { buildPassengersParam } from "./passengers";

function buildBookingUrl(input: SearchFlightsInput, departure: string, arrival: string): string {
  const params = new URLSearchParams({
    origin:      input.from,
    destination: input.to,
    passengers:  buildPassengersParam(input.passengers),
    departure,
    arrival,
    type:        "user",
  });
  return `https://app.onhappy.com.br/flight-search?${params.toString()}`;
}

const BASE_URL = "https://api.onhappy.com.br/api/flight/search";

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
  mockMode: boolean;
}

export async function searchFlights(
  input: SearchFlightsInput
): Promise<SearchFlightsOutput> {
  // Mock mode: ativo quando sem token
  if (!process.env.ONHAPPY_API_TOKEN) {
    return getMockResults(input);
  }

  const params = new URLSearchParams({
    passengers: buildPassengersParam(input.passengers),
    departure: input.dates.departure,
    return: input.dates.return,
    from: input.from,
    to: input.to,
    type: "user",
    merge: "1",
  });

  let raw: unknown;
  try {
    const res = await fetch(`${BASE_URL}?${params}`, {
      headers: {
        Authorization: `Bearer ${process.env.ONHAPPY_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(10_000), // 10s timeout
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`OnHappy API ${res.status}: ${body}`);
    }

    raw = await res.json();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Falha ao buscar voos para ${input.to}: ${message}`);
  }

  return parseResponse(raw, input);
}

// ── Parser robusto — usa optional chaining em todos os acessos ──
export function parseResponse(
  raw: unknown,
  input: SearchFlightsInput
): SearchFlightsOutput {
  const data = (raw as Record<string, unknown>)?.data ?? raw;
  const packages: unknown[] = Array.isArray(
    (data as Record<string, unknown>)?.flightsPackages
  )
    ? ((data as Record<string, unknown>).flightsPackages as unknown[])
    : Array.isArray((data as Record<string, unknown>)?.packages)
    ? ((data as Record<string, unknown>).packages as unknown[])
    : [];

  const options: FlightOption[] = [];

  for (const pkg of packages) {
    const p = pkg as Record<string, unknown>;
    const airline: string =
      (p?.cia as string) ?? (p?.airline as string) ?? "??";
    const fares: unknown[] = Array.isArray(p?.fares) ? (p.fares as unknown[]) : [p];

    for (const fare of fares) {
      const f = fare as Record<string, unknown>;
      const priceRaw: number =
        (f?.totalPrice as number) ?? (f?.price as number) ?? 0;
      // Detecta se está em centavos (> 10000) ou reais
      const priceBRL = priceRaw > 10_000 ? priceRaw / 100 : priceRaw;

      const services: unknown[] = Array.isArray(f?.services)
        ? (f.services as unknown[])
        : [];
      const hasChecked = services.some(
        (s: unknown) =>
          (((s as Record<string, unknown>)?.type === "BAGGAGE_CHECKED" ||
            (s as Record<string, unknown>)?.luggageType === "checked") &&
            (s as Record<string, unknown>)?.included)
      );
      const hasCarryOn = services.some(
        (s: unknown) =>
          (((s as Record<string, unknown>)?.type === "BAGGAGE_CARRY_ON" ||
            (s as Record<string, unknown>)?.luggageType === "carry_on") &&
            (s as Record<string, unknown>)?.included)
      );

      const outbounds: unknown[] = Array.isArray(p?.outbounds)
        ? (p.outbounds as unknown[])
        : [];
      const inbounds: unknown[] = Array.isArray(p?.inbounds)
        ? (p.inbounds as unknown[])
        : [];
      const out = (outbounds[0] ??
        (p?.departure_flight as unknown)) as Record<string, unknown>;
      const inb = (inbounds[0] ??
        (p?.return_flight as unknown)) as Record<string, unknown>;

      if (!out || !inb) continue;

      options.push({
        id: `${airline}-${(f?.fareFamily as string) ?? "STD"}-${(out?.flightNumber as string) ?? Math.random()}`,
        destination: input.destinationName ?? input.to,
        destinationIATA: input.to,
        destinationFlag: input.destinationFlag ?? "✈️",
        airline,
        fareFamily:
          (f?.fareFamily as string) ??
          (f?.category as string) ??
          "STANDARD",
        totalPriceBRL: priceBRL,
        pricePerPerson: priceBRL / input.passengers.length,
        baggageChecked: hasChecked,
        baggageCarryOn: hasCarryOn,
        recommended: false,
        withinBudget: false, // preenchido no executor
        outbound:   parseFlightLeg(out, input.dates.departure),
        inbound:    parseFlightLeg(inb, input.dates.return),
        bookingUrl: buildBookingUrl(input, input.dates.departure, input.dates.return),
      });
    }
  }

  options.sort((a, b) => a.totalPriceBRL - b.totalPriceBRL);

  const prices = options.map((o) => o.totalPriceBRL);
  return {
    options: options.slice(0, 6),
    totalResults:
      ((data as Record<string, unknown>)?.count as number) ?? options.length,
    priceRange: {
      min: prices[0] ?? 0,
      max: prices[prices.length - 1] ?? 0,
    },
    mockMode: false,
  };
}

function parseFlightLeg(
  leg: Record<string, unknown>,
  fallbackDate: string
): FlightOption["outbound"] {
  return {
    flightNumber:
      (leg?.flightNumber as string) ??
      (leg?.flight_number as string) ??
      "",
    departure:
      ((leg?.departureTime as string) ??
        (leg?.departure_time as string) ??
        "").slice(11, 16) || "00:00",
    arrival:
      ((leg?.arrivalTime as string) ??
        (leg?.arrival_time as string) ??
        "").slice(11, 16) || "00:00",
    durationMin: (leg?.duration as number) ?? 0,
    date: fallbackDate,
  };
}

// ── Mock realista ───────────────────────────────────────────────
const MOCK_DESTINATIONS: Record<
  string,
  { name: string; flag: string; basePrice: number; durationMin: number }
> = {
  SSA: { name: "Salvador",       flag: "🏖️", basePrice: 890,  durationMin: 135 },
  REC: { name: "Recife",         flag: "🌊", basePrice: 1100, durationMin: 195 },
  FLN: { name: "Florianópolis",  flag: "🏄", basePrice: 780,  durationMin: 100 },
  FOR: { name: "Fortaleza",      flag: "☀️", basePrice: 1300, durationMin: 240 },
  GIG: { name: "Rio de Janeiro", flag: "🏔️", basePrice: 620,  durationMin: 90  },
  GRU: { name: "São Paulo",      flag: "🏙️", basePrice: 450,  durationMin: 80  },
  NAT: { name: "Natal",          flag: "🌅", basePrice: 1050, durationMin: 210 },
  CTG: { name: "Cartagena",      flag: "🇨🇴", basePrice: 2100, durationMin: 300 },
  EZE: { name: "Buenos Aires",   flag: "🇦🇷", basePrice: 2400, durationMin: 210 },
  LIS: { name: "Lisboa",         flag: "🇵🇹", basePrice: 3800, durationMin: 660 },
};

function getMockResults(input: SearchFlightsInput): SearchFlightsOutput {
  const dest = MOCK_DESTINATIONS[input.to] ?? {
    name: input.destinationName ?? input.to,
    flag: input.destinationFlag ?? "✈️",
    basePrice: 1200,
    durationMin: 150,
  };

  const paxCount = input.passengers.length;
  const airlines = ["G3", "AD", "LA"];

  const fares = [
    { family: "LIGHT",   mult: 1.00, baggage: false },
    { family: "CLASSIC", mult: 1.15, baggage: true  },
    { family: "FLEX",    mult: 1.35, baggage: true  },
  ];

  const options: FlightOption[] = fares.map((tier, i) => {
    const total = Math.round(dest.basePrice * paxCount * tier.mult);
    return {
      id: `mock-${input.to}-${tier.family}`,
      destination: input.destinationName ?? dest.name,
      destinationIATA: input.to,
      destinationFlag: input.destinationFlag ?? dest.flag,
      airline: airlines[i % airlines.length],
      fareFamily: tier.family,
      totalPriceBRL: total,
      pricePerPerson: Math.round(total / paxCount),
      baggageChecked: tier.baggage,
      baggageCarryOn: true,
      recommended: false,
      withinBudget: false,
      outbound: {
        flightNumber: `${airlines[i % airlines.length]} ${1400 + i}`,
        departure: "08:30",
        arrival: addMinutes("08:30", dest.durationMin),
        durationMin: dest.durationMin,
        date: input.dates.departure,
      },
      inbound: {
        flightNumber: `${airlines[i % airlines.length]} ${1500 + i}`,
        departure: "16:00",
        arrival: addMinutes("16:00", dest.durationMin),
        durationMin: dest.durationMin,
        date: input.dates.return,
      },
      bookingUrl: buildBookingUrl(input, input.dates.departure, input.dates.return),
    };
  });

  const prices = options.map((o) => o.totalPriceBRL);
  return {
    options,
    totalResults: options.length,
    priceRange: { min: prices[0], max: prices[prices.length - 1] },
    mockMode: true,
  };
}

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(
    total % 60
  ).padStart(2, "0")}`;
}
