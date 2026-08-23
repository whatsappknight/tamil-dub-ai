import { describe, expect, it } from "vitest";
import { elevenLabsFailureMessage } from "./providers/tts";

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
});
