import { describe, expect, it } from "vitest";
import { tamilVoiceAtempoFilter, tamilVoiceTempoForTarget, voiceGenerationProgress } from "./services/pipeline";

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
});
