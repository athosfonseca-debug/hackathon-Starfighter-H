import type { Passenger } from "../types";

// adult → 18 | child → 11 | infant → 1
// [adult, adult, child(7), infant] → "18,18,11,1"
export function buildPassengersParam(passengers: Passenger[]): string {
  if (passengers.length === 0) throw new Error("Pelo menos 1 passageiro é obrigatório");
  return passengers
    .map((p) => {
      switch (p.type) {
        case "adult":
          return "18";
        case "child":
          return "11";
        case "infant":
          return "1";
        default:
          throw new Error(`Tipo de passageiro inválido: ${(p as { type: string }).type}`);
      }
    })
    .join(",");
}

export function countByType(passengers: Passenger[]) {
  return {
    adults: passengers.filter((p) => p.type === "adult").length,
    children: passengers.filter((p) => p.type === "child"),
    infants: passengers.filter((p) => p.type === "infant").length,
    total: passengers.length,
  };
}
