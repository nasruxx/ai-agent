import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { sendMessage } from "./src/services/gemini.ts";
import { AISettings, KnowledgeBase } from "./src/types.ts";

// Server-side storage (In-memory for demo, resets on server restart)
let globalSettings: AISettings | null = null;
let globalKnowledge: KnowledgeBase | null = null;

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // Debug Logger
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
  });

  // API: Health Check for infrastructure
  app.get("/healthz", (req, res) => {
    res.status(200).send("OK");
  });

  // API: Sync Settings from Client
  app.post("/api/sync-settings", (req, res) => {
    const { settings, knowledge } = req.body;
    globalSettings = settings;
    globalKnowledge = knowledge;
    res.json({ status: "ok" });
  });

  // API: Proxy QR Fetch (Avoid CORS)
  app.get("/api/whatsapp/qr", async (req, res) => {
    if (!globalSettings?.qrIntegration?.apiKey || !globalSettings?.qrIntegration?.apiUrl) {
      return res.status(400).json({ error: "QR Integration not configured" });
    }

    try {
      const { apiUrl, apiKey } = globalSettings.qrIntegration;
      // Using Whapi.cloud style as example
      const response = await fetch(`${apiUrl}/instance/qr`, {
        headers: { "Authorization": `Bearer ${apiKey}` }
      });
      const data = await response.json();
      res.json(data);
    } catch (err) {
      console.error("Failed to fetch QR:", err);
      res.status(500).json({ error: "Failed to fetch QR code from external API" });
    }
  });

  // API: External WhatsApp Webhook (Broad matching for trailing slashes / subpaths)
  app.all("/api/whatsapp/external-webhook*", async (req, res) => {
    console.log(`[Webhook] ${req.method} ${req.url} received`);
    
    if (req.method === "GET" || req.method === "HEAD") {
      return res.json({ status: "alive", message: "Nexus AI External Webhook reachable" });
    }

    try {
      const body = req.body;
      console.log("External Webhook Body Received");
      
      const messages = body.messages;
      if (Array.isArray(messages)) {
        for (const msg of messages) {
          if (!msg.from_me && msg.type === "text" && globalSettings?.qrIntegration?.isActive) {
            const from = msg.chat_id || msg.from;
            const text = msg.text?.body || msg.body;

            console.log(`Received External WhatsApp message from ${from}: ${text}`);

            const responseText = await sendMessage(
              text, 
              [], 
              globalKnowledge || undefined, 
              globalSettings || undefined
            );

            await sendExternalWhatsAppMessage(from, responseText);
          }
        }
      }
      
      res.sendStatus(200);
    } catch (err) {
      console.error("Error processing External WhatsApp webhook:", err);
      res.sendStatus(500);
    }
  });

  async function sendExternalWhatsAppMessage(to: string, text: string) {
    if (!globalSettings?.qrIntegration) return;

    const { apiUrl, apiKey } = globalSettings.qrIntegration;
    if (!apiKey || !apiUrl) return;

    try {
      // Dynamic endpoint based on typical external API (Whapi example)
      const url = `${apiUrl}/messages/text`;
      await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: to,
          body: text,
        }),
      });
    } catch (err) {
      console.error("Failed to send external WhatsApp message:", err);
    }
  }

  // API: WhatsApp Webhook (Verification)
  app.get("/api/whatsapp/webhook", (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    const verifyToken = globalSettings?.whatsapp?.verifyToken || "aura_nexus_secret";

    if (mode === "subscribe" && token === verifyToken) {
      console.log("WhatsApp Webhook Verified!");
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  });

  // API: WhatsApp Webhook (Messages)
  app.post("/api/whatsapp/webhook", async (req, res) => {
    try {
      const body = req.body;

      if (body.object === "whatsapp_business_account") {
        const entry = body.entry?.[0];
        const changes = entry?.changes?.[0];
        const value = changes?.value;
        const message = value?.messages?.[0];

        if (message && message.type === "text" && globalSettings?.whatsapp?.isActive) {
          const from = message.from; // WhatsApp ID
          const text = message.text.body;

          console.log(`Received WhatsApp message from ${from}: ${text}`);

          // Send to Gemini
          const responseText = await sendMessage(
            text, 
            [], // simple one-off for now, can be expanded to multi-turn using a map of 'from' to history
            globalKnowledge || undefined, 
            globalSettings || undefined
          );

          // Send back to WhatsApp
          await sendWhatsAppMessage(from, responseText);
        }
        res.status(200).send("EVENT_RECEIVED");
      } else {
        res.sendStatus(404);
      }
    } catch (err) {
      console.error("Error processing WhatsApp webhook:", err);
      res.sendStatus(500);
    }
  });

  async function sendWhatsAppMessage(to: string, text: string) {
    if (!globalSettings?.whatsapp) return;

    const { accessToken, phoneNumberId } = globalSettings.whatsapp;
    if (!accessToken || !phoneNumberId) return;

    try {
      const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: to,
          type: "text",
          text: { body: text },
        }),
      });

      const result = await response.json();
      console.log("WhatsApp API response:", result);
    } catch (err) {
      console.error("Failed to send WhatsApp message:", err);
    }
  }

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("FATAL: Server failed to start:", err);
  process.exit(1);
});
