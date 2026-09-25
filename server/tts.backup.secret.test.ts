import { afterEach, describe, expect, it, vi } from "vitest";
import { elevenLabsFailureMessage, synthesizeTamilVoice } from "./providers/tts";

const liveIt = process.env.RUN_LIVE_TTS_VALIDATION === "true" ? it : it.skip;

afterEach(() => vi.unstubAllEnvs());

describe("backup ElevenLabs Tamil TTS credential", () => {
  liveIt("accepts the official minimal Tamil synthesis request", async () => {
    const endpoint = process.env.TTS_API_URL;
    const apiKey = process.env.TTS_BACKUP_API_KEY;
    if (!endpoint || !apiKey) throw new Error("Backup ElevenLabs validation requires TTS_API_URL and TTS_BACKUP_API_KEY.");
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({ text: "வணக்கம்.", model_id: process.env.TTS_MODEL || "eleven_multilingual_v2", output_format: "mp3_44100_128" }),
    });
    expect(response.status, "ElevenLabs rejected the backup credential.").toBe(200);
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(100);
  }, 30_000);

  liveIt.each([
    ["Backup 2", "TTS_BACKUP_API_KEY_2"],
    ["Backup 3", "TTS_BACKUP_API_KEY_3"],
  ])("validates %s with the non-consuming subscription endpoint", async (_label, keyName) => {
    const apiKey = process.env[keyName];
    if (!apiKey) throw new Error(`${keyName} must be configured.`);
    const response = await fetch("https://api.elevenlabs.io/v1/user/subscription", { headers: { "xi-api-key": apiKey, Accept: "application/json" } });
    expect(response.status, `${keyName} was rejected by ElevenLabs.`).toBe(200);
    const payload = await response.json() as { character_count?: unknown; character_limit?: unknown };
    expect(Number.isFinite(Number(payload.character_count))).toBe(true);
    expect(Number.isFinite(Number(payload.character_limit))).toBe(true);
  }, 30_000);

  liveIt("uses the real backup credential after a forced primary authentication failure", async () => {
    vi.stubEnv("TTS_PROVIDER", "elevenlabs");
    vi.stubEnv("TTS_API_KEY", "invalid-primary-key-for-backup-validation");
    const result = await synthesizeTamilVoice({ text: "வணக்கம்.", voice: "female-1", style: "natural", speed: 1 }, true);
    expect(result.audio.byteLength).toBeGreaterThan(100);
    expect(result.contentType).toContain("audio");
  }, 45_000);

  it("does not expose credential-shaped provider details in failure messages", () => {
    const message = elevenLabsFailureMessage(401, '{"detail":{"code":"invalid_api_key","message":"sk_should_never_appear"}}');
    expect(message).not.toContain("sk_should_never_appear");
    expect(message).not.toContain("invalid_api_key");
  });
});
