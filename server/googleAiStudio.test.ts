import { describe, expect, it } from "vitest";
import { synthesizeTamilVoice } from "./providers/tts";

const liveIt = process.env.RUN_LIVE_GOOGLE_AI_STUDIO_VALIDATION === "true" ? it : it.skip;

describe("Google AI Studio project retry fallback", () => {
  liveIt("produces Tamil WAV audio after controlled primary and backup ElevenLabs failures", async () => {
    const result = await synthesizeTamilVoice(
      { text: "வணக்கம்.", voice: "female-1", style: "natural", speed: 1 },
      true,
      {
        primary: () => ({ synthesize: async () => { throw new Error("Controlled primary failure."); } }),
        elevenLabsBackup: () => ({ synthesize: async () => { throw new Error("Controlled backup failure."); } }),
      },
    );

    expect(result.contentType).toBe("audio/wav");
    expect(result.extension).toBe("wav");
    expect(result.audio.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(result.audio.length).toBeGreaterThan(1_000);
  }, 60_000);
});
