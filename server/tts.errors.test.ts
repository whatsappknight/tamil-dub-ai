import { describe, expect, it, vi } from "vitest";
import { elevenLabsFailureMessage, googleAiStudioBackupConfigured, googleAiStudioFallbackConfig, GoogleAiStudioTamilTtsProvider, requestVoiceWithTimeout, synthesizeTamilVoice } from "./providers/tts";

describe("ElevenLabs Tamil TTS error guidance", () => {
  it("turns quota exhaustion into safe retry guidance without provider metadata", () => {
    const message = elevenLabsFailureMessage(401, '{"detail":{"type":"invalid_request","code":"quota_exceeded","message":"This request exceeds your quota","request_id":"private-request-id"}}');
    expect(message).toMatch(/no remaining voice credits/i);
    expect(message).toMatch(/retry the failed voice stage/i);
    expect(message).not.toContain("private-request-id");
  });

  it("gives concise guidance for unauthorized and rate-limited provider responses", () => {
    expect(elevenLabsFailureMessage(401, "unauthorized")).toMatch(/authorize/i);
    expect(elevenLabsFailureMessage(429, "rate limited")).toMatch(/rate-limiting/i);
  });

  it("uses a configured fallback after a controlled primary provider failure", async () => {
    vi.stubEnv("TTS_FALLBACK_PROVIDER", "generic-openai"); vi.stubEnv("TTS_FALLBACK_API_URL", "https://example.test/voice"); vi.stubEnv("TTS_FALLBACK_API_KEY", "test-key");
    const result = await synthesizeTamilVoice({ text: "வணக்கம்", voice: "female-1", style: "natural", speed: 1 }, true, { primary: () => ({ synthesize: async () => { throw new Error("primary failed"); } }), elevenLabsBackup: () => ({ synthesize: async () => { throw new Error("backup failed"); } }), fallback: () => ({ synthesize: async () => ({ audio: Buffer.from("fallback"), contentType: "audio/mpeg", extension: "mp3" }) }) });
    expect(result.audio.toString()).toBe("fallback");
    vi.unstubAllEnvs();
  });

  it("uses the ElevenLabs backup before the configured tertiary fallback", async () => {
    vi.stubEnv("TTS_PROVIDER", "elevenlabs"); vi.stubEnv("TTS_API_URL", "https://example.test/voice"); vi.stubEnv("TTS_BACKUP_API_KEY", "backup-test-key");
    const fallback = vi.fn(() => ({ synthesize: async () => ({ audio: Buffer.from("tertiary"), contentType: "audio/mpeg", extension: "mp3" as const }) }));
    const result = await synthesizeTamilVoice({ text: "வணக்கம்", voice: "male-1", style: "natural", speed: 1 }, true, { primary: () => ({ synthesize: async () => { throw new Error("primary failed"); } }), elevenLabsBackup: () => ({ synthesize: async () => ({ audio: Buffer.from("backup"), contentType: "audio/mpeg", extension: "mp3" as const }) }), fallback });
    expect(result.audio.toString()).toBe("backup");
    expect(fallback).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("selects a distinct Google backup credential when Google is the direct provider", () => {
    vi.stubEnv("TTS_PROVIDER", "google-ai-studio");
    vi.stubEnv("GOOGLE_AI_STUDIO_API_KEY", "primary-google-test-key");
    vi.stubEnv("GOOGLE_AI_STUDIO_BACKUP_API_KEY", "backup-google-test-key");

    expect(googleAiStudioBackupConfigured()).toBe(true);
    expect(googleAiStudioFallbackConfig().apiKey).toBe("backup-google-test-key");
    vi.unstubAllEnvs();
  });

  it("does not invoke any fallback when the project disables fallback", async () => {
    const fallback = vi.fn(() => ({ synthesize: async () => ({ audio: Buffer.from("fallback"), contentType: "audio/mpeg", extension: "mp3" as const }) }));
    await expect(synthesizeTamilVoice({ text: "வணக்கம்", voice: "female-1", style: "natural", speed: 1 }, false, { primary: () => ({ synthesize: async () => { throw new Error("primary failed"); } }), fallback })).rejects.toThrow("primary failed");
    expect(fallback).not.toHaveBeenCalled();
  });

  it("does not invoke an arbitrary fallback for an unsupported configured provider", async () => {
    vi.stubEnv("TTS_PROVIDER", "generic-openai"); vi.stubEnv("TTS_FALLBACK_PROVIDER", "unsupported-provider");
    const fallback = vi.fn(() => ({ synthesize: async () => ({ audio: Buffer.from("fallback"), contentType: "audio/mpeg", extension: "mp3" as const }) }));
    await expect(synthesizeTamilVoice({ text: "வணக்கம்", voice: "female-1", style: "natural", speed: 1 }, true, { primary: () => ({ synthesize: async () => { throw new Error("primary failed"); } }), fallback })).rejects.toThrow("primary failed");
    expect(fallback).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("reports a controlled timeout without provider metadata", async () => {
    vi.useFakeTimers();
    const request = vi.fn((_input: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))));
    const pending = requestVoiceWithTimeout(request, "https://voice.example.test", { method: "POST" });
    const timeoutAssertion = expect(pending).rejects.toThrow(/timed out/i);
    await vi.advanceTimersByTimeAsync(25_000);
    await timeoutAssertion;
    vi.useRealTimers();
  });

  it("retries a temporary Google rate limit before returning Tamil WAV audio", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(new Response("rate limited", { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ audio: { data: Buffer.from("pcm").toString("base64") } }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const wait = vi.fn().mockResolvedValue(undefined);
    const provider = new GoogleAiStudioTamilTtsProvider({ apiKey: "test-key" }, request, wait);

    const result = await provider.synthesize({ text: "வணக்கம்", voice: "female-1", style: "natural", speed: 1 });

    expect(request).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledTimes(1);
    expect(result.contentType).toBe("audio/wav");
    expect(result.audio.subarray(0, 4).toString("ascii")).toBe("RIFF");
  });
});
