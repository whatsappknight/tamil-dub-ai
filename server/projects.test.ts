import { describe, expect, it } from "vitest";
import { isRetryableStage, stageAtOrAfter } from "../shared/pipeline";
import { selectTamilTtsProvider, ElevenLabsTamilTtsProvider, GenericOpenAiCompatibleTamilTtsProvider } from "./providers/tts";
import { buildSrt } from "./services/subtitles";
import { validateDirectVideoUpload } from "./services/upload-validation";

describe("TamilDub AI pipeline utilities", () => {
  it("marks media-processing failures as retryable while excluding terminal states", () => { expect(isRetryableStage("rendering_video")).toBe(true); expect(isRetryableStage("completed")).toBe(false); });
  it("orders stages so a later retry can reuse persisted outputs", () => { expect(stageAtOrAfter("rendering_video", "translating")).toBe(true); expect(stageAtOrAfter("extracting_audio", "generating_voice")).toBe(false); });
  it("creates Tamil-compatible SRT timing without empty captions", () => { const srt = buildSrt([{ startSeconds: 0, endSeconds: 1.25, text: "வணக்கம்" }, { startSeconds: 2, endSeconds: 2, text: "skip" }]); expect(srt).toContain("00:00:00,000 --> 00:00:01,250"); expect(srt).toContain("வணக்கம்"); expect(srt).not.toContain("skip"); });
  it("accepts direct video formats only within the configured upload limit", () => {
    expect(() => validateDirectVideoUpload({ filename: "demo.webm", mimeType: "video/webm", sizeBytes: 5_000 }, 10_000)).not.toThrow();
    expect(() => validateDirectVideoUpload({ filename: "remote.mp4.exe", mimeType: "video/mp4", sizeBytes: 5_000 }, 10_000)).toThrow(/MP4, MOV, MKV, and WebM/);
    expect(() => validateDirectVideoUpload({ filename: "large.mp4", mimeType: "video/mp4", sizeBytes: 10_001 }, 10_000)).toThrow(/upload limit/);
  });
  it("selects only supported Tamil TTS adapters", () => {
    expect(selectTamilTtsProvider("elevenlabs")).toBeInstanceOf(ElevenLabsTamilTtsProvider);
    expect(selectTamilTtsProvider("generic-openai")).toBeInstanceOf(GenericOpenAiCompatibleTamilTtsProvider);
    expect(() => selectTamilTtsProvider("unsupported-provider")).toThrow(/Unsupported configured Tamil TTS provider/);
  });
});
