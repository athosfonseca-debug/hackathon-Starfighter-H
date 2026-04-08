import { getLLMProvider } from "../lib/llm";
import type { TravelDates, ResolvedDates } from "../types";

export async function resolveDates(dates: TravelDates): Promise<ResolvedDates> {
  if (dates.mode === "fixed") {
    const dep = new Date(dates.departure);
    const ret = new Date(dates.return);
    if (isNaN(dep.getTime()) || isNaN(ret.getTime())) {
      throw new Error("Datas inválidas — use o formato YYYY-MM-DD");
    }
    if (ret <= dep) {
      throw new Error("Data de volta deve ser posterior à data de ida");
    }
    return {
      departure: dates.departure,
      return: dates.return,
      durationDays: Math.round((ret.getTime() - dep.getTime()) / 86_400_000),
      confidence: "high",
    };
  }

  return extractFlexibleDates(dates.raw);
}

async function extractFlexibleDates(raw: string): Promise<ResolvedDates> {
  const llm = getLLMProvider();
  const today = new Date().toISOString().split("T")[0];

  const response = await llm.complete({
    system: "Extrator de datas. Retorne APENAS JSON válido, sem markdown.",
    messages: [
      {
        role: "user",
        content: `Hoje: ${today}. Extraia as datas do texto e retorne:
{"departure":"YYYY-MM-DD","return":"YYYY-MM-DD","durationDays":7,"confidence":"high|medium|low"}

Referências: "meio do ano"=junho/julho, "fim do ano"=novembro/dezembro,
"próximo mês"=mês seguinte, sem mês=60 dias a partir de hoje.
confidence: high=mês específico, medium=estimativa razoável, low=muito vago.

Texto: "${raw}"`,
      },
    ],
    maxTokens: 150,
  });

  const text = response.content.find((b) => b.type === "text")?.text ?? "{}";
  try {
    const p = JSON.parse(text.replace(/```json|```/g, "").trim());
    if (!p.departure || !p.return) throw new Error("campos ausentes");
    return {
      departure: p.departure,
      return: p.return,
      durationDays: p.durationDays ?? 7,
      confidence: p.confidence ?? "medium",
    };
  } catch {
    // Fallback: 60 dias a partir de hoje, 7 dias de duração
    const dep = new Date();
    dep.setDate(dep.getDate() + 60);
    const ret = new Date(dep);
    ret.setDate(ret.getDate() + 7);
    return {
      departure: dep.toISOString().split("T")[0],
      return: ret.toISOString().split("T")[0],
      durationDays: 7,
      confidence: "low",
    };
  }
}
