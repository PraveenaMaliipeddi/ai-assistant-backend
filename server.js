import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";

dotenv.config();

const app = express();

/**
 * ✅ CORS: allow localhost + Vercel production + Vercel preview
 * NOTE: Do NOT use app.options("*") with Express 5 (it crashes with path-to-regexp).
 * The cors middleware already handles preflight requests.
 */
const corsOptions = {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // curl/health checks, server-to-server

    // Local dev
    if (origin.startsWith("http://localhost:")) return cb(null, true);

    // Production Vercel URL
    if (origin === "https://ai-assistant-frontend-nu.vercel.app")
      return cb(null, true);

    // Allow ALL Vercel preview deployments
    if (origin.endsWith(".vercel.app")) return cb(null, true);

    return cb(new Error(`CORS blocked for origin: ${origin}`));
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));
app.use(express.json({ limit: "1mb" }));

/**
 * ✅ Config
 */
const REGION = process.env.AWS_REGION || "us-east-1";
const MODEL_ID =
  process.env.BEDROCK_MODEL_ID || "anthropic.claude-3-haiku-20240307-v1:0";

const client = new BedrockRuntimeClient({ region: REGION });

/**
 * ✅ Health endpoints
 */
app.get("/", (_req, res) => {
  res.send(`AI Chat Assistant API ✅ region=${REGION} model=${MODEL_ID}`);
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", region: REGION, model: MODEL_ID });
});

/**
 * ✅ Chat endpoint
 */
app.post("/chat", async (req, res) => {
  try {
    const userInput = (req.body?.message || "").toString().trim();
    if (!userInput) return res.status(400).json({ error: "message required" });

    const body = {
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 500,
      temperature: 0.7,
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: userInput }],
        },
      ],
    };

    const cmd = new InvokeModelCommand({
      modelId: MODEL_ID,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify(body),
    });

    const TIMEOUT_MS = 25000;
    const resp = await Promise.race([
      client.send(cmd),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Bedrock request timed out")), TIMEOUT_MS)
      ),
    ]);

    const json = JSON.parse(new TextDecoder().decode(resp.body));
    const reply = json?.content?.[0]?.text ?? "(no reply)";
    res.json({ reply });
  } catch (err) {
    console.error("Bedrock error:", err);
    res
      .status(500)
      .json({ error: "server_error", detail: err?.message || String(err) });
  }
});

/**
 * ✅ Render uses process.env.PORT automatically
 */
const PORT = process.env.PORT || 9090;
app.listen(PORT, () => {
  console.log(`✅ API running on port ${PORT}`);
});
