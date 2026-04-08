import { getLLMProvider } from "../lib/llm";

const QUICK_MAP: Record<string, string> = {
  // Minas Gerais
  "bh": "CNF", "belo horizonte": "CNF", "bhz": "CNF", "cnf": "CNF",
  // São Paulo
  "sp": "GRU", "são paulo": "GRU", "sao paulo": "GRU", "gru": "GRU", "cgh": "CGH",
  // Rio de Janeiro
  "rj": "GIG", "rio": "GIG", "rio de janeiro": "GIG", "gig": "GIG", "sdu": "SDU",
  // Brasília
  "bsb": "BSB", "brasilia": "BSB", "brasília": "BSB",
  // Salvador
  "ssa": "SSA", "salvador": "SSA",
  // Recife
  "rec": "REC", "recife": "REC",
  // Florianópolis
  "fln": "FLN", "florianopolis": "FLN", "florianópolis": "FLN",
  // Fortaleza
  "for": "FOR", "fortaleza": "FOR",
  // Curitiba
  "cwb": "CWB", "curitiba": "CWB",
  // Porto Alegre
  "poa": "POA", "porto alegre": "POA",
  // Natal
  "nat": "NAT", "natal": "NAT",
  // Manaus
  "mao": "MAO", "manaus": "MAO",
  // Belém
  "bel": "BEL", "belem": "BEL", "belém": "BEL",
  // Goiânia
  "gyn": "GYN", "goiania": "GYN", "goiânia": "GYN",
  // Maceió
  "mcz": "MCZ", "maceio": "MCZ", "maceió": "MCZ",
  // Campo Grande
  "cgr": "CGR", "campo grande": "CGR",
  // Cuiabá
  "cgb": "CGB", "cuiaba": "CGB", "cuiabá": "CGB",
};

export async function resolveOriginIATA(raw: string): Promise<string> {
  const key = raw.trim().toLowerCase();

  if (QUICK_MAP[key]) return QUICK_MAP[key];

  // Fallback: LLM resolve qualquer cidade do mundo
  try {
    const llm = getLLMProvider();
    const res = await llm.complete({
      system: "Responda APENAS com o código IATA de 3 letras do aeroporto principal. Sem explicações.",
      messages: [{ role: "user", content: `Código IATA do aeroporto principal de: "${raw}"` }],
      maxTokens: 10,
    });
    const iata = res.content.find((b) => b.type === "text")?.text?.trim().toUpperCase() ?? "";
    if (/^[A-Z]{3}$/.test(iata)) return iata;
  } catch {
    // ignora erro e usa fallback
  }

  return "GRU";
}
