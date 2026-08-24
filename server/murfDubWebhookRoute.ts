import express, { type Express } from "express";
import { acceptMurfWebhook, applyMurfDubStatus } from "./services/murfDub";

export function registerMurfDubWebhookRoute(app: Express) {
  app.post("/api/murf-dub/webhook", express.raw({ type: "application/json", limit: "2mb" }), async (req, res) => {
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";
    const accepted = await acceptMurfWebhook({ rawBody, timestamp: req.header("X-Signature-Timestamp") || undefined, signature: req.header("X-HMAC-Signature") || undefined });
    if (!accepted) return res.status(400).json({ accepted: false });
    res.status(202).json({ accepted: true });
    void applyMurfDubStatus(accepted.projectId, accepted.status).catch(error => console.error("[Murf Dub] Failed to ingest callback output", error));
  });
}
