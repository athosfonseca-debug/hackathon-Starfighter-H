export type PassengerType = "adult" | "child" | "infant";

export interface Passenger {
  type: PassengerType;
  age?: number; // obrigatório para child
}

export interface FixedDates {
  mode: "fixed";
  departure: string;  // YYYY-MM-DD
  return: string;     // YYYY-MM-DD
}

export interface FlexibleDates {
  mode: "flexible";
  raw: string;        // "quero ir no meio do ano por uns 7 dias"
}

export type TravelDates = FixedDates | FlexibleDates;

export interface SearchRequest {
  passengers: Passenger[];
  dates: TravelDates;
  origin: { raw: string; iata: string };
  budget: { total: number; currency: "BRL" };
  intent: string;
}

export interface ResolvedDates {
  departure: string;
  return: string;
  durationDays: number;
  confidence: "high" | "medium" | "low";
}

export interface FlightOption {
  id: string;
  destination: string;
  destinationIATA: string;
  destinationFlag: string;
  airline: string;
  fareFamily: string;
  totalPriceBRL: number;
  pricePerPerson: number;
  baggageChecked: boolean;
  baggageCarryOn: boolean;
  recommended: boolean;
  withinBudget: boolean;
  outbound: FlightLeg;
  inbound: FlightLeg;
  bookingUrl: string;
}

export interface FlightLeg {
  flightNumber: string;
  departure: string;  // HH:MM
  arrival: string;    // HH:MM
  durationMin: number;
  date: string;       // YYYY-MM-DD
}

export interface SearchResponse {
  options: FlightOption[];
  message: string;
  resolvedDates: ResolvedDates;
  meta: {
    llmProvider: string;
    mockMode: boolean;
    durationMs: number;
  };
}

// Re-export LLMMessage for routes
export type { LLMMessage } from "./lib/llm/types";
