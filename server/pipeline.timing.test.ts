import { describe, expect, it } from "vitest";
import { AUTOMATIC_VOICE_RETRY_LIMIT, automaticVoiceRetryDelayMs, shouldAutomaticallyRetryVoiceStage, tamilVoiceAtempoFilter, tamilVoiceTempoForTarget, voiceGenerationProgress } from "./services/pipeline";

describe("Tamil voice duration fitting", () => {
  it("stretches a short trimmed voice enough to fill its dialogue interval instead of leaving trailing padding", () => {
    const tempo = tamilVoiceTempoForTarget(0.6, 2, 1);
    expect(tempo).toBeCloseTo(0.3, 3);
    expect(tamilVoiceAtempoFilter(tempo)).toBe("atempo=0.5,atempo=0.600");
  });

  it("keeps ordinary timing in one FFmpeg tempo stage", () => {
    const tempo = tamilVoiceTempoForTarget(1.8, 2, 1);
    expect(tamilVoiceAtempoFilter(tempo)).toBe("atempo=0.900");
  });

  it("reports segment-level progress while generating voice", () => {
    expect(voiceGenerationProgress(0, 10)).toEqual({ progressPercent: 68, statusMessage: "Generating Tamil voice segment 0/10." });
    expect(voiceGenerationProgress(5, 10)).toEqual({ progressPercent: 73, statusMessage: "Generating Tamil voice segment 5/10." });
    expect(voiceGenerationProgress(10, 10)).toEqual({ progressPercent: 77, statusMessage: "Generating Tamil voice segment 10/10." });
  });

  it("bounds automatic voice retries with increasing delays", () => {
    expect(AUTOMATIC_VOICE_RETRY_LIMIT).toBe(3);
    expect(shouldAutomaticallyRetryVoiceStage("generating_voice")).toBe(true);
    expect(shouldAutomaticallyRetryVoiceStage("rendering_video")).toBe(false);
    expect(automaticVoiceRetryDelayMs(0)).toBe(2000);
    expect(automaticVoiceRetryDelayMs(1)).toBe(4000);
    expect(automaticVoiceRetryDelayMs(20)).toBe(30000);
  });
});
