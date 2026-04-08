import { describe, it, expect } from "vitest";
import { parseResponse } from "../../src/services/onhappy";

const MOCK_PASSENGERS = [
  { type: "adult" as const },
  { type: "adult" as const },
];
const MOCK_DATES = {
  departure: "2026-07-10",
  return: "2026-07-17",
  durationDays: 7,
  confidence: "high" as const,
};
const MOCK_INPUT = {
  passengers: MOCK_PASSENGERS,
  dates: MOCK_DATES,
  from: "BHZ",
  to: "SSA",
};

describe("parseResponse", () => {
  it("parseia estrutura com flightsPackages", () => {
    const raw = {
      data: {
        count: 5,
        flightsPackages: [
          {
            cia: "G3",
            fares: [
              {
                fareFamily: "LIGHT",
                totalPrice: 284050,
                services: [],
              },
            ],
            outbounds: [
              {
                flightNumber: "G3 1483",
                departureTime: "2026-07-10T08:30:00",
                arrivalTime: "2026-07-10T10:45:00",
                duration: 135,
              },
            ],
            inbounds: [
              {
                flightNumber: "G3 1482",
                departureTime: "2026-07-17T16:00:00",
                arrivalTime: "2026-07-17T18:20:00",
                duration: 140,
              },
            ],
          },
        ],
      },
    };

    const result = parseResponse(raw, MOCK_INPUT);
    expect(result.options).toHaveLength(1);
    expect(result.options[0].totalPriceBRL).toBe(2840.5);
    expect(result.options[0].airline).toBe("G3");
    expect(result.options[0].outbound.departure).toBe("08:30");
    expect(result.options[0].inbound.arrival).toBe("18:20");
  });

  it("detecta preço já em reais (< 10000)", () => {
    const raw = {
      data: {
        flightsPackages: [
          {
            cia: "AD",
            fares: [
              {
                fareFamily: "CLASSIC",
                totalPrice: 3200,
                services: [],
              },
            ],
            outbounds: [
              {
                flightNumber: "AD 100",
                departureTime: "2026-07-10T06:00:00",
                arrivalTime: "2026-07-10T08:00:00",
                duration: 120,
              },
            ],
            inbounds: [
              {
                flightNumber: "AD 101",
                departureTime: "2026-07-17T14:00:00",
                arrivalTime: "2026-07-17T16:00:00",
                duration: 120,
              },
            ],
          },
        ],
      },
    };
    const result = parseResponse(raw, MOCK_INPUT);
    expect(result.options[0].totalPriceBRL).toBe(3200);
  });

  it("retorna array vazio para resposta sem packages", () => {
    const result = parseResponse({}, MOCK_INPUT);
    expect(result.options).toHaveLength(0);
  });

  it("detecta bagagem despachada nos serviços", () => {
    const raw = {
      data: {
        flightsPackages: [
          {
            cia: "LA",
            fares: [
              {
                fareFamily: "CLASSIC",
                totalPrice: 400000,
                services: [
                  { type: "BAGGAGE_CHECKED", included: true },
                  { type: "BAGGAGE_CARRY_ON", included: true },
                ],
              },
            ],
            outbounds: [
              {
                flightNumber: "LA 200",
                departureTime: "2026-07-10T09:00:00",
                arrivalTime: "2026-07-10T11:00:00",
                duration: 120,
              },
            ],
            inbounds: [
              {
                flightNumber: "LA 201",
                departureTime: "2026-07-17T15:00:00",
                arrivalTime: "2026-07-17T17:00:00",
                duration: 120,
              },
            ],
          },
        ],
      },
    };
    const result = parseResponse(raw, MOCK_INPUT);
    expect(result.options[0].baggageChecked).toBe(true);
    expect(result.options[0].baggageCarryOn).toBe(true);
  });
});
