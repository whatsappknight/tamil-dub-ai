import { describe, expect, it } from "vitest";
import { buildExportRenderPlan } from "./services/export-presets";

describe("delivery export presets", () => {
  it("keeps source output stream-copyable when no subtitle filter is required", () => {
    expect(buildExportRenderPlan("source")).toEqual({ videoArgs: ["-c:v", "copy"], filenameSuffix: "source" });
  });

  it("builds a YouTube landscape canvas and combines burned-subtitle filters", () => {
    const plan = buildExportRenderPlan("youtube", "subtitles=caption.srt");
    expect(plan.filenameSuffix).toBe("youtube");
    expect(plan.videoArgs.join(" ")).toContain("subtitles=caption.srt,scale=1920:1080");
    expect(plan.videoArgs).toContain("libx264");
  });

  it("builds vertical dimensions and WhatsApp compression for mobile-oriented exports", () => {
    expect(buildExportRenderPlan("shorts").videoArgs.join(" ")).toContain("scale=1080:1920");
    const whatsapp = buildExportRenderPlan("whatsapp");
    expect(whatsapp.videoArgs.join(" ")).toContain("scale=720:1280");
    expect(whatsapp.videoArgs).toContain("24");
  });
});
