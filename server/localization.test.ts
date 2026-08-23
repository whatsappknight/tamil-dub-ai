import { afterEach, describe, expect, it, vi } from "vitest";
import { synthesizeTamilVoice } from "./providers/tts";
import { applyPronunciationRules, buildBurnedSubtitleFilter, parseLocalizationRules, subtitleForceStyle } from "./services/localization";

afterEach(() => vi.unstubAllEnvs());

describe("Tamil localization controls", () => {
  it("parses concise terminology entries and ignores malformed lines", () => {
    expect(parseLocalizationRules("Dashboard => டாஷ்போர்டு\nAI=செயற்கை நுண்ணறிவு\ninvalid line")).toEqual([{ source: "Dashboard", target: "டாஷ்போர்டு" }, { source: "AI", target: "செயற்கை நுண்ணறிவு" }]);
  });

  it("applies project pronunciation rules and preserves the per-segment hint", () => {
    expect(applyPronunciationRules("OpenAI", "OpenAI => ஓபன் ஏஐ", "ஓபன் ஏ ஐ")).toBe("ஓபன் ஏஐ <break time=\"120ms\"/> ஓபன் ஏ ஐ");
  });

  it("builds the selected studio style into the FFmpeg-ready subtitle filter", () => {
    const filter = buildBurnedSubtitleFilter("/tmp/tamil:subtitles.srt", "studio");
    expect(filter).toContain("tamil\\:subtitles.srt");
    expect(filter).toContain(subtitleForceStyle("studio"));
    expect(filter).toContain("Noto Sans Tamil");
  });

  it("does not invoke a fallback when the project disables provider fallback", async () => {
    const primary = { synthesize: vi.fn().mockRejectedValue(new Error("primary failed")) };
    const fallback = { synthesize: vi.fn() };
    await expect(synthesizeTamilVoice({ text: "வணக்கம்", voice: "female-1", style: "natural", speed: 1 }, false, { primary: () => primary, fallback: () => fallback })).rejects.toThrow("primary failed");
    expect(fallback.synthesize).not.toHaveBeenCalled();
  });

  it("rejects an unsupported fallback configuration without invoking an arbitrary provider", async () => {
    vi.stubEnv("TTS_FALLBACK_PROVIDER", "unsupported-provider");
    const primary = { synthesize: vi.fn().mockRejectedValue(new Error("primary failed")) };
    const elevenLabsBackup = { synthesize: vi.fn().mockRejectedValue(new Error("backup failed")) };
    const fallback = { synthesize: vi.fn() };
    await expect(synthesizeTamilVoice({ text: "வணக்கம்", voice: "female-1", style: "natural", speed: 1 }, true, { primary: () => primary, elevenLabsBackup: () => elevenLabsBackup, fallback: () => fallback })).rejects.toThrow("primary failed");
    expect(fallback.synthesize).not.toHaveBeenCalled();
  });
});
