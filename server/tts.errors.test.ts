import { describe, expect, it, vi } from "vitest";
import { elevenLabsFailureMessage, requestVoiceWithTimeout, synthesizeTamilVoice } from "./providers/tts";

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

  it("reports a controlled timeout without provider metadata", async () => {
    vi.useFakeTimers();
    const request = vi.fn((_input: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))));
    const pending = requestVoiceWithTimeout(request, "https://voice.example.test", { method: "POST" });
    const timeoutAssertion = expect(pending).rejects.toThrow(/timed out/i);
    await vi.advanceTimersByTimeAsync(25_000);
    await timeoutAssertion;
    vi.useRealTimers();
  });
});
