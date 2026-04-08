import Fastify from "fastify";
import cors from "@fastify/cors";
import "dotenv/config";
import { searchRoutes } from "./routes/search";

const app = Fastify({
  logger: {
    level: process.env.NODE_ENV === "test" ? "silent" : "info",
  },
});

app.register(cors, {
  origin: (
    origin: string | undefined,
    cb: (err: Error | null, allow: boolean) => void
  ) => {
    const allowed = [
      /\.vercel\.app$/,
      /\.lovable\.app$/,
      /\.lovableproject\.com$/,
      /^https:\/\/claude\.ai$/,
      /^http:\/\/localhost/,
      /\.ngrok-free\.app$/,
      /\.up\.railway\.app$/,
    ];
    if (!origin || allowed.some((r) => r.test(origin))) cb(null, true);
    else cb(new Error(`CORS bloqueado: ${origin}`), false);
  },
  methods: ["GET", "POST", "OPTIONS"],
});

app.register(searchRoutes);

app.get("/health", async () => ({
  status: "ok",
  ts: Date.now(),
  llmProvider: process.env.LLM_PROVIDER ?? "anthropic",
  mockMode: !process.env.ONHAPPY_API_TOKEN,
}));

export default app;

if (process.env.NODE_ENV !== "test") {
  const port = Number(process.env.PORT ?? 3001);
  app.listen({ port, host: "0.0.0.0" }, (err) => {
    if (err) {
      app.log.error(err);
      process.exit(1);
    }
  });
}
