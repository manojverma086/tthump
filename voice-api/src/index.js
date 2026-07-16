import "dotenv/config";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { config } from "./config.js";
import { initStorage } from "./storage.js";
import api from "./routes/api.js";

const app = new Hono();

app.use(
  "*",
  cors({
    origin: (origin) => {
      if (!origin) return "*";
      if (config.corsOrigins.includes(origin)) return origin;
      return config.corsOrigins[0] || origin;
    },
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type"],
    maxAge: 86400
  })
);

app.route("/api", api);

app.get("/", (c) =>
  c.json({
    name: "Tap & Roar Voice API",
    docs: "/api/health",
    endpoints: [
      "GET  /api/health",
      "POST /api/voices",
      "GET  /api/voices/:voiceId",
      "POST /api/voices/:voiceId/preview",
      "POST /api/stories/prepare",
      "GET  /api/jobs/:jobId",
      "GET  /api/stories/audio/:cacheKey"
    ]
  })
);

await initStorage();

serve({ fetch: app.fetch, hostname: config.host, port: config.port }, (info) => {
  console.log(`Tap & Roar Voice API → http://${info.address}:${info.port}`);
  console.log(`Provider: ${config.voiceProvider}`);
  if (config.voiceProvider === "elevenlabs" && !config.elevenLabsApiKey) {
    console.warn("Warning: ELEVENLABS_API_KEY missing. Set it or use VOICE_PROVIDER=xtts|mock.");
  }
  if (config.voiceProvider === "xtts") {
    console.log(`XTTS sidecar: ${config.xttsServiceUrl}`);
  }
});
