import { describe, expect, it, vi } from "vitest";
import { selectTamilTtsProvider } from "./providers/tts";

const liveIt = process.env.RUN_LIVE_GOOGLE_AI_STUDIO_VALIDATION === "true" ? it : it.skip;
const validateBackupCredential = process.env.RUN_LIVE_GOOGLE_AI_STUDIO_BACKUP_VALIDATION === "true";

describe("Google AI Studio Tamil voice provider", () => {
  liveIt("produces Tamil WAV audio when selected directly for a resumed project", async () => {
    vi.stubEnv("TTS_PROVIDER", "google-ai-studio");
    if (validateBackupCredential) vi.stubEnv("GOOGLE_AI_STUDIO_API_KEY", process.env.GOOGLE_AI_STUDIO_BACKUP_API_KEY || "");
    try {
      const result = await selectTamilTtsProvider().synthesize({ text: "வணக்கம்.", voice: "female-1", style: "natural", speed: 1 });

      expect(result.contentType).toBe("audio/wav");
      expect(result.extension).toBe("wav");
      expect(result.audio.subarray(0, 4).toString("ascii")).toBe("RIFF");
      expect(result.audio.length).toBeGreaterThan(1_000);
    } finally {
      vi.unstubAllEnvs();
    }
  }, 60_000);
});
