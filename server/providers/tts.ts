import type { TamilTtsProvider } from "./types";

const VOICE_ENV_KEYS: Record<string, string> = { "male-1": "TTS_VOICE_MALE_1", "male-2": "TTS_VOICE_MALE_2", "female-1": "TTS_VOICE_FEMALE_1", "female-2": "TTS_VOICE_FEMALE_2", narrator: "TTS_VOICE_NARRATOR", youth: "TTS_VOICE_YOUTH" };
const GOOGLE_INTERACTIONS_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
const GOOGLE_DEFAULT_MODEL = "gemini-3.1-flash-tts-preview";
const GOOGLE_VOICES: Record<string, string> = { "male-1": "Charon", "male-2": "Orus", "female-1": "Kore", "female-2": "Aoede", narrator: "Iapetus", youth: "Leda" };

type ProviderConfig = { endpoint: string; apiKey: string; model?: string };
export type GoogleAiStudioConfig = { apiKey: string; model?: string };
type FetchRequest = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
type Pause = (milliseconds: number) => Promise<void>;
const TTS_REQUEST_TIMEOUT_MS = Math.max(5_000, Number(process.env.TTS_REQUEST_TIMEOUT_MS || 25_000));
const GOOGLE_RATE_LIMIT_RETRY_MS = Math.max(1_000, Number(process.env.GOOGLE_AI_STUDIO_RATE_LIMIT_RETRY_MS || 15_000));
const GOOGLE_RATE_LIMIT_MAX_RETRIES = Math.max(0, Number(process.env.GOOGLE_AI_STUDIO_RATE_LIMIT_MAX_RETRIES || 2));
const GOOGLE_TTS_TOTAL_TIMEOUT_MS = Math.max(TTS_REQUEST_TIMEOUT_MS, Number(process.env.GOOGLE_AI_STUDIO_TOTAL_TIMEOUT_MS || 90_000));

function pause(milliseconds: number) { return new Promise<void>(resolve => setTimeout(resolve, milliseconds)); }

export async function requestVoiceWithTimeout(request: FetchRequest, input: string | URL | Request, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TTS_REQUEST_TIMEOUT_MS);
  try {
    return await request(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) throw new Error("Tamil voice provider request timed out. The configured fallback provider will be tried when enabled.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function requestGoogleVoiceWithRetry(request: FetchRequest, input: string | URL | Request, init: RequestInit, wait: Pause = pause, maxRetries = GOOGLE_RATE_LIMIT_MAX_RETRIES) {
  const deadline = Date.now() + GOOGLE_TTS_TOTAL_TIMEOUT_MS;
  for (let attempt = 0; ; attempt += 1) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error("Google AI Studio Tamil voice request exceeded its safe time limit. Retry the failed voice stage.");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.min(TTS_REQUEST_TIMEOUT_MS, remaining));
    try {
      const response = await request(input, { ...init, signal: controller.signal });
      const rawBody = await response.text();
      let payload: unknown = undefined;
      try { payload = rawBody ? JSON.parse(rawBody) : undefined; } catch { payload = undefined; }
      if (response.status !== 429 || attempt >= maxRetries) return { response, payload };
      const retryDelay = Math.min(GOOGLE_RATE_LIMIT_RETRY_MS * (attempt + 1), Math.max(0, deadline - Date.now()));
      if (!retryDelay) return { response, payload };
      await wait(retryDelay);
    } catch (error) {
      if (controller.signal.aborted) throw new Error("Google AI Studio Tamil voice request exceeded its safe time limit. Retry the failed voice stage.");
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function requireTtsConfig(): ProviderConfig { const endpoint = process.env.TTS_API_URL; const apiKey = process.env.TTS_API_KEY; if (!endpoint || !apiKey) throw new Error("Tamil TTS is not configured. Add TTS_API_URL and TTS_API_KEY in managed environment settings before processing."); return { endpoint, apiKey, model: process.env.TTS_MODEL }; }
function genericFallbackConfig(): ProviderConfig { const endpoint = process.env.TTS_FALLBACK_API_URL; const apiKey = process.env.TTS_FALLBACK_API_KEY; if (!endpoint || !apiKey) throw new Error("No generic fallback Tamil TTS provider is configured."); return { endpoint, apiKey, model: process.env.TTS_FALLBACK_MODEL }; }
function backupElevenLabsConfig(): ProviderConfig { const endpoint = process.env.TTS_API_URL; const apiKey = process.env.TTS_BACKUP_API_KEY; if (!endpoint || !apiKey) throw new Error("No backup ElevenLabs credential is configured."); return { endpoint, apiKey, model: process.env.TTS_BACKUP_MODEL || process.env.TTS_MODEL }; }
function googleAiStudioConfig(): GoogleAiStudioConfig { const apiKey = process.env.GOOGLE_AI_STUDIO_API_KEY; if (!apiKey) throw new Error("Google AI Studio Tamil voice fallback is not configured."); return { apiKey, model: process.env.GOOGLE_AI_STUDIO_TTS_MODEL || GOOGLE_DEFAULT_MODEL }; }
export function googleAiStudioBackupConfigured() { return Boolean(process.env.GOOGLE_AI_STUDIO_BACKUP_API_KEY); }
export function googleAiStudioFallbackConfig(): GoogleAiStudioConfig { if (process.env.TTS_PROVIDER === "google-ai-studio" && googleAiStudioBackupConfigured()) return { apiKey: process.env.GOOGLE_AI_STUDIO_BACKUP_API_KEY!, model: process.env.GOOGLE_AI_STUDIO_TTS_MODEL || GOOGLE_DEFAULT_MODEL }; return googleAiStudioConfig(); }

function elevenLabsVoiceSettings(style: string) { const settings: Record<string, { stability: number; similarity_boost: number; style: number }> = { natural: { stability: 0.45, similarity_boost: 0.72, style: 0.15 }, conversational: { stability: 0.34, similarity_boost: 0.7, style: 0.38 }, professional: { stability: 0.7, similarity_boost: 0.78, style: 0.08 }, friendly: { stability: 0.4, similarity_boost: 0.7, style: 0.3 }, documentary: { stability: 0.75, similarity_boost: 0.76, style: 0.05 }, energetic: { stability: 0.32, similarity_boost: 0.72, style: 0.5 } }; return settings[style] || settings.natural; }
function elevenLabsEndpointForVoice(endpoint: string, voice: string) { const configuredVoiceId = process.env[VOICE_ENV_KEYS[voice] || ""]; if (!configuredVoiceId) return endpoint; const url = new URL(endpoint); url.pathname = url.pathname.replace(/\/text-to-speech\/[^/]+$/, `/text-to-speech/${configuredVoiceId}`); return url.toString(); }
function googleDirection(style: string, speed: number) { const styleLine: Record<string, string> = { natural: "Sound natural and conversational.", conversational: "Sound like a real Tamil person speaking casually to a friend. Use lively colloquial Tamil intonation, natural pauses, and varied emphasis; do not sound robotic or like a newsreader.", professional: "Sound polished and professional.", friendly: "Sound friendly and approachable.", documentary: "Sound calm and documentary-like.", energetic: "Sound lively without shouting." }; const pace = speed <= .92 ? "Speak slightly slower than normal." : speed >= 1.1 ? "Speak briskly while keeping every word clear." : "Use a natural conversational pace."; return `${styleLine[style] || styleLine.natural} ${pace}`; }
function googlePrompt(input: { text: string; style: string; speed: number }) { return ["You are a professional Tamil dubbing voice actor.", "Read the Tamil transcript exactly as written. Do not add, omit, translate, or explain any words.", googleDirection(input.style, input.speed), "Tamil transcript:", input.text].join("\n"); }

export function pcm16Mono24kToWav(pcm: Buffer) { const header = Buffer.alloc(44); header.write("RIFF", 0, "ascii"); header.writeUInt32LE(36 + pcm.length, 4); header.write("WAVE", 8, "ascii"); header.write("fmt ", 12, "ascii"); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(24_000, 24); header.writeUInt32LE(48_000, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write("data", 36, "ascii"); header.writeUInt32LE(pcm.length, 40); return Buffer.concat([header, pcm]); }

function extractGoogleAudioData(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const record = payload as Record<string, unknown>;
  for (const key of ["output_audio", "outputAudio", "audio", "inline_data", "inlineData"]) {
    const candidate = record[key];
    if (candidate && typeof candidate === "object" && typeof (candidate as Record<string, unknown>).data === "string") return (candidate as Record<string, string>).data;
  }
  for (const step of Array.isArray(record.steps) ? record.steps : []) {
    if (!step || typeof step !== "object") continue;
    const content = (step as Record<string, unknown>).content;
    for (const part of Array.isArray(content) ? content : []) {
      if (!part || typeof part !== "object") continue;
      const audioPart = part as Record<string, unknown>;
      if (audioPart.type === "audio" && typeof audioPart.data === "string") return audioPart.data;
      for (const key of ["audio", "inline_data", "inlineData"]) {
        const candidate = audioPart[key];
        if (candidate && typeof candidate === "object" && typeof (candidate as Record<string, unknown>).data === "string") return (candidate as Record<string, string>).data;
      }
    }
  }
  return undefined;
}

export function elevenLabsFailureMessage(status: number, detail: string) { let code = ""; try { code = String((JSON.parse(detail) as { detail?: { code?: string } }).detail?.code || ""); } catch { code = ""; } if (code === "quota_exceeded" || /quota exceeded|credits? remaining/i.test(detail)) return "ElevenLabs has no remaining voice credits for this Tamil-dubbing request. Add credits or use an account with available quota, then retry the failed voice stage."; if (status === 401 || status === 403) return "ElevenLabs could not authorize Tamil voice generation. Verify the configured provider secret and voice endpoint, then retry the failed voice stage."; if (status === 429) return "ElevenLabs is temporarily rate-limiting voice generation. Wait briefly, then retry the failed voice stage."; return `ElevenLabs Tamil voice generation failed (HTTP ${status}). Check the provider account and configured voice endpoint, then retry the failed voice stage.`; }
function googleFailureMessage(status: number) { if (status === 401 || status === 403) return "Google AI Studio could not authorize Tamil voice generation. Verify the managed Google API key and project access, then retry the failed voice stage."; if (status === 429) return "Google AI Studio is temporarily rate-limiting Tamil voice generation. Wait briefly, then retry the failed voice stage."; return `Google AI Studio Tamil voice generation failed (HTTP ${status}). Check the managed provider configuration, then retry the failed voice stage.`; }

export type ElevenLabsUsageAccount = { label: "Primary" | "Backup"; tier: string | null; characterCount: number | null; characterLimit: number | null; remainingCharacters: number | null; percentUsed: number | null; nextResetAt: number | null; error?: string };
async function readElevenLabsUsageAccount(label: ElevenLabsUsageAccount["label"], apiKey: string): Promise<ElevenLabsUsageAccount> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.min(TTS_REQUEST_TIMEOUT_MS, 10_000));
  try {
    const response = await fetch("https://api.elevenlabs.io/v1/user/subscription", { headers: { "xi-api-key": apiKey, Accept: "application/json" }, signal: controller.signal });
    if (!response.ok) return { label, tier: null, characterCount: null, characterLimit: null, remainingCharacters: null, percentUsed: null, nextResetAt: null, error: response.status === 401 || response.status === 403 ? "ElevenLabs rejected this credential." : `ElevenLabs usage request failed (${response.status}).` };
    const payload = await response.json() as { tier?: unknown; character_count?: unknown; character_limit?: unknown; next_character_count_reset_unix?: unknown };
    const characterCount = Number.isFinite(Number(payload.character_count)) ? Number(payload.character_count) : null;
    const characterLimit = Number.isFinite(Number(payload.character_limit)) ? Number(payload.character_limit) : null;
    return { label, tier: typeof payload.tier === "string" ? payload.tier : null, characterCount, characterLimit, remainingCharacters: characterCount !== null && characterLimit !== null ? Math.max(0, characterLimit - characterCount) : null, percentUsed: characterCount !== null && characterLimit ? Math.min(100, Math.max(0, Math.round(characterCount / characterLimit * 1000) / 10)) : null, nextResetAt: Number.isFinite(Number(payload.next_character_count_reset_unix)) ? Number(payload.next_character_count_reset_unix) : null };
  } catch (error) {
    return { label, tier: null, characterCount: null, characterLimit: null, remainingCharacters: null, percentUsed: null, nextResetAt: null, error: error instanceof DOMException && error.name === "AbortError" ? "ElevenLabs usage request timed out." : "ElevenLabs usage is temporarily unavailable." };
  } finally { clearTimeout(timeout); }
}
export async function getElevenLabsUsage() { const credentials: Array<{ label: ElevenLabsUsageAccount["label"]; apiKey: string }> = []; if (process.env.TTS_PROVIDER === "elevenlabs" && process.env.TTS_API_KEY) credentials.push({ label: "Primary", apiKey: process.env.TTS_API_KEY }); if (process.env.TTS_BACKUP_API_KEY) credentials.push({ label: "Backup", apiKey: process.env.TTS_BACKUP_API_KEY }); return { configured: credentials.length > 0, accounts: await Promise.all(credentials.map(item => readElevenLabsUsageAccount(item.label, item.apiKey))), fetchedAt: Date.now() }; }

export class ElevenLabsTamilTtsProvider implements TamilTtsProvider { constructor(private config?: ProviderConfig) {} async synthesize(input: { text: string; voice: string; style: string; speed: number }) { const config = this.config || requireTtsConfig(); const response = await requestVoiceWithTimeout(fetch, elevenLabsEndpointForVoice(config.endpoint, input.voice), { method: "POST", headers: { "xi-api-key": config.apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" }, body: JSON.stringify({ text: input.text, model_id: config.model || "eleven_multilingual_v2", voice_settings: elevenLabsVoiceSettings(input.style), output_format: "mp3_44100_128" }) }); if (!response.ok) throw new Error(elevenLabsFailureMessage(response.status, await response.text().catch(() => response.statusText))); return { audio: Buffer.from(await response.arrayBuffer()), contentType: response.headers.get("content-type") || "audio/mpeg", extension: "mp3" as const }; } }

export class GoogleAiStudioTamilTtsProvider implements TamilTtsProvider { constructor(private config?: GoogleAiStudioConfig, private request: FetchRequest = fetch, private wait: Pause = pause) {} async synthesize(input: { text: string; voice: string; style: string; speed: number }) { const config = this.config || googleAiStudioConfig(); const { response, payload } = await requestGoogleVoiceWithRetry(this.request, GOOGLE_INTERACTIONS_URL, { method: "POST", headers: { "x-goog-api-key": config.apiKey, "Content-Type": "application/json" }, body: JSON.stringify({ model: config.model || GOOGLE_DEFAULT_MODEL, input: googlePrompt(input), response_format: { type: "audio" }, generation_config: { speech_config: [{ voice: GOOGLE_VOICES[input.voice] || "Kore", language: "ta" }] }, store: false }) }, this.wait); if (!response.ok) throw new Error(googleFailureMessage(response.status)); const audioData = extractGoogleAudioData(payload); if (!audioData) throw new Error("Google AI Studio did not return Tamil voice audio. Retry the failed voice stage."); return { audio: pcm16Mono24kToWav(Buffer.from(audioData, "base64")), contentType: "audio/wav", extension: "wav" as const }; } }

export class GenericOpenAiCompatibleTamilTtsProvider implements TamilTtsProvider { constructor(private config?: ProviderConfig) {} async synthesize(input: { text: string; voice: string; style: string; speed: number }) { const config = this.config || requireTtsConfig(); const response = await requestVoiceWithTimeout(fetch, config.endpoint, { method: "POST", headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: config.model, input: input.text, voice: process.env[VOICE_ENV_KEYS[input.voice]] || input.voice, speed: input.speed, response_format: "mp3", language: "ta", style: input.style }) }); if (!response.ok) throw new Error(`Tamil TTS provider failed (${response.status}). Check the configured provider and retry the failed voice stage.`); return { audio: Buffer.from(await response.arrayBuffer()), contentType: response.headers.get("content-type") || "audio/mpeg", extension: "mp3" as const }; } }

export function selectTamilTtsProvider(provider = process.env.TTS_PROVIDER || "generic-openai"): TamilTtsProvider { if (provider === "elevenlabs") return new ElevenLabsTamilTtsProvider(); if (provider === "google-ai-studio") return new GoogleAiStudioTamilTtsProvider(); if (provider === "generic-openai") return new GenericOpenAiCompatibleTamilTtsProvider(); throw new Error(`Unsupported configured Tamil TTS provider: ${provider}`); }
export function backupElevenLabsConfigured() { return Boolean(process.env.TTS_PROVIDER === "elevenlabs" && process.env.TTS_API_URL && process.env.TTS_BACKUP_API_KEY); }
export function voiceFallbackConfigured() { return process.env.TTS_FALLBACK_PROVIDER === "google-ai-studio" ? Boolean(process.env.GOOGLE_AI_STUDIO_API_KEY) : Boolean(process.env.TTS_FALLBACK_PROVIDER === "generic-openai" && process.env.TTS_FALLBACK_API_URL && process.env.TTS_FALLBACK_API_KEY); }
function configuredFallbackProvider(): TamilTtsProvider { if (process.env.TTS_FALLBACK_PROVIDER === "google-ai-studio") return new GoogleAiStudioTamilTtsProvider(googleAiStudioFallbackConfig()); if (process.env.TTS_FALLBACK_PROVIDER === "generic-openai") return new GenericOpenAiCompatibleTamilTtsProvider(genericFallbackConfig()); throw new Error("A fallback provider is configured but unsupported. Set TTS_FALLBACK_PROVIDER to google-ai-studio or generic-openai, or disable fallback."); }
export async function synthesizeTamilVoice(input: { text: string; voice: string; style: string; speed: number }, allowFallback: boolean, providers?: { primary?: () => TamilTtsProvider; elevenLabsBackup?: () => TamilTtsProvider; fallback?: () => TamilTtsProvider }) { try { return await (providers?.primary?.() || selectTamilTtsProvider()).synthesize(input); } catch (primaryError) { if (!allowFallback) throw primaryError; if (backupElevenLabsConfigured()) { try { return await (providers?.elevenLabsBackup?.() || new ElevenLabsTamilTtsProvider(backupElevenLabsConfig())).synthesize(input); } catch { /* proceed to configured tertiary fallback */ } } if (!voiceFallbackConfigured()) throw primaryError; try { return await (providers?.fallback?.() || configuredFallbackProvider()).synthesize(input); } catch { throw primaryError; } } }
export const tamilTtsProvider: TamilTtsProvider = { synthesize: input => selectTamilTtsProvider().synthesize(input) };
