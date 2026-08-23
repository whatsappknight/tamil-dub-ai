import type { TamilTtsProvider } from "./types";

const VOICE_ENV_KEYS: Record<string, string> = { "male-1": "TTS_VOICE_MALE_1", "male-2": "TTS_VOICE_MALE_2", "female-1": "TTS_VOICE_FEMALE_1", "female-2": "TTS_VOICE_FEMALE_2" };

function requireTtsConfig() {
  const endpoint = process.env.TTS_API_URL;
  const apiKey = process.env.TTS_API_KEY;
  if (!endpoint || !apiKey) throw new Error("Tamil TTS is not configured. Add TTS_API_URL and TTS_API_KEY in managed environment settings before processing.");
  return { endpoint, apiKey };
}

function elevenLabsVoiceSettings(style: string) {
  const settings: Record<string, { stability: number; similarity_boost: number; style: number }> = {
    natural: { stability: 0.45, similarity_boost: 0.72, style: 0.15 },
    professional: { stability: 0.7, similarity_boost: 0.78, style: 0.08 },
    friendly: { stability: 0.4, similarity_boost: 0.7, style: 0.3 },
    documentary: { stability: 0.75, similarity_boost: 0.76, style: 0.05 },
    energetic: { stability: 0.32, similarity_boost: 0.72, style: 0.5 },
  };
  return settings[style] || settings.natural;
}

export function elevenLabsFailureMessage(status: number, detail: string) {
  let code = "";
  try { code = String((JSON.parse(detail) as { detail?: { code?: string } }).detail?.code || ""); } catch { code = ""; }
  if (code === "quota_exceeded" || /quota exceeded|credits? remaining/i.test(detail)) return "ElevenLabs has no remaining voice credits for this Tamil-dubbing request. Add credits or use an account with available quota, then retry the failed voice stage.";
  if (status === 401 || status === 403) return "ElevenLabs could not authorize Tamil voice generation. Verify the configured provider secret and voice endpoint, then retry the failed voice stage.";
  if (status === 429) return "ElevenLabs is temporarily rate-limiting voice generation. Wait briefly, then retry the failed voice stage.";
  return `ElevenLabs Tamil voice generation failed (HTTP ${status}). Check the provider account and configured voice endpoint, then retry the failed voice stage.`;
}

export class ElevenLabsTamilTtsProvider implements TamilTtsProvider {
  async synthesize(input: { text: string; voice: string; style: string; speed: number }) {
    const { endpoint, apiKey } = requireTtsConfig();
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({
        text: input.text,
        model_id: process.env.TTS_MODEL || "eleven_multilingual_v2",
        voice_settings: elevenLabsVoiceSettings(input.style),
        output_format: "mp3_44100_128",
      }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => response.statusText);
      throw new Error(elevenLabsFailureMessage(response.status, detail));
    }
    return { audio: Buffer.from(await response.arrayBuffer()), contentType: response.headers.get("content-type") || "audio/mpeg", extension: "mp3" as const };
  }
}

export class GenericOpenAiCompatibleTamilTtsProvider implements TamilTtsProvider {
  async synthesize(input: { text: string; voice: string; style: string; speed: number }) {
    const { endpoint, apiKey } = requireTtsConfig();
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: process.env.TTS_MODEL || undefined, input: input.text, voice: process.env[VOICE_ENV_KEYS[input.voice]] || input.voice, speed: input.speed, response_format: "mp3", language: "ta", style: input.style }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => response.statusText);
      throw new Error(`Tamil TTS provider failed (${response.status}): ${detail.slice(0, 500)}`);
    }
    return { audio: Buffer.from(await response.arrayBuffer()), contentType: response.headers.get("content-type") || "audio/mpeg", extension: "mp3" as const };
  }
}

export function selectTamilTtsProvider(provider = process.env.TTS_PROVIDER || "generic-openai"): TamilTtsProvider {
  if (provider === "elevenlabs") return new ElevenLabsTamilTtsProvider();
  if (provider === "generic-openai") return new GenericOpenAiCompatibleTamilTtsProvider();
  throw new Error(`Unsupported configured Tamil TTS provider: ${provider}`);
}

/** Provider facade preserves a stable contract while allowing server-side provider selection through managed environment variables. */
export const tamilTtsProvider: TamilTtsProvider = { synthesize: input => selectTamilTtsProvider().synthesize(input) };
