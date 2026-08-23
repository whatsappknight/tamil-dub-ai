import { describe, expect, it } from "vitest";

describe("configured ElevenLabs Tamil text-to-speech provider", () => {
  const liveIt = process.env.RUN_LIVE_TTS_VALIDATION === "true" ? it : it.skip;

  liveIt("accepts an authenticated minimal Tamil synthesis request using the official ElevenLabs payload", async () => {
    const endpoint = process.env.TTS_API_URL;
    const apiKey = process.env.TTS_API_KEY;
    const model = process.env.TTS_MODEL;

    expect(endpoint, "TTS_API_URL must be configured").toBeTruthy();
    expect(apiKey, "TTS_API_KEY must be configured").toBeTruthy();
    expect(process.env.TTS_PROVIDER, "TTS_PROVIDER must select ElevenLabs").toBe("elevenlabs");

    const response = await fetch(endpoint!, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey!,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: "வணக்கம்",
        model_id: model || "eleven_multilingual_v2",
        output_format: "mp3_44100_128",
      }),
    });

    const detail = response.ok ? "" : await response.text().catch(() => response.statusText);
    expect(response.ok, `ElevenLabs rejected the validation request (${response.status}): ${detail.slice(0, 400)}`).toBe(true);
    expect(response.headers.get("content-type") || "", "ElevenLabs must return an audio response").toMatch(/audio|octet-stream/i);
  }, 30_000);
});
