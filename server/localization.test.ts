import { describe, expect, it } from "vitest";
import { applyPronunciationRules, parseLocalizationRules, subtitleForceStyle } from "./services/localization";

describe("Tamil localization controls", () => {
  it("parses concise terminology entries and ignores malformed lines", () => {
    expect(parseLocalizationRules("Dashboard => டாஷ்போர்டு\nAI=செயற்கை நுண்ணறிவு\ninvalid line")).toEqual([
      { source: "Dashboard", target: "டாஷ்போர்டு" },
      { source: "AI", target: "செயற்கை நுண்ணறிவு" },
    ]);
  });

  it("applies configured Tamil pronunciation replacements before voice synthesis", () => {
    expect(applyPronunciationRules("OpenAI uses SaaS", "OpenAI => ஓபன் ஏஐ\nSaaS => சாஸ்")).toBe("ஓபன் ஏஐ uses சாஸ்");
  });

  it("produces distinct FFmpeg subtitle styles with Tamil-capable typography", () => {
    expect(subtitleForceStyle("studio")).toContain("Noto Sans Tamil");
    expect(subtitleForceStyle("minimal")).not.toEqual(subtitleForceStyle("high_contrast"));
  });
});
