import { describe, expect, it } from "vitest";
import { AUTOMATIC_VOICE_RETRY_LIMIT, NATURAL_TAMIL_TEMPO_FLOOR, automaticVoiceRetryDelayMs, closeShortDialogueGaps, shouldAutomaticallyRetryVoiceStage, tamilVoiceAtempoFilter, tamilVoiceTempoForTarget, voiceGenerationProgress } from "./services/pipeline";

describe("Tamil voice duration fitting", () => {
  it("does not stretch a short Tamil voice below a natural speaking speed", () => {
    const tempo = tamilVoiceTempoForTarget(0.6, 2, 1);
    expect(tempo).toBe(NATURAL_TAMIL_TEMPO_FLOOR);
    expect(tamilVoiceAtempoFilter(tempo)).toBe("atempo=0.920");
  });

  it("keeps ordinary timing in one FFmpeg tempo stage", () => {
    const tempo = tamilVoiceTempoForTarget(1.8, 2, 1);
    expect(tamilVoiceAtempoFilter(tempo)).toBe("atempo=0.920");
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

  it("closes every positive dialogue gap for continuous reel speech", () => {
    const segments = [{ startSeconds: 0, endSeconds: 2 }, { startSeconds: 2.8, endSeconds: 4 }, { startSeconds: 7, endSeconds: 8 }];
    expect(closeShortDialogueGaps(segments)).toEqual([{ startSeconds: 0, endSeconds: 2.8 }, { startSeconds: 2.8, endSeconds: 7 }, { startSeconds: 7, endSeconds: 8 }]);
  });
});
