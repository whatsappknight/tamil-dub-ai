import { mkdtemp, rm, stat } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { probeDurationSeconds, runFfmpeg } from "./services/ffmpeg";

let workDir = "";

afterEach(async () => {
  if (workDir) await rm(workDir, { recursive: true, force: true });
  workDir = "";
});

describe("FFmpeg TamilDub render path", () => {
  it("creates a safe short MP4 with a replacement audio track and preserved duration", async () => {
    workDir = await mkdtemp(path.join(os.tmpdir(), "tamil-dub-render-test-"));
    const source = path.join(workDir, "source.mp4");
    const output = path.join(workDir, "dubbed.mp4");
    await runFfmpeg(["-f", "lavfi", "-i", "color=c=0x33245f:s=320x180:r=24", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=24000", "-t", "1.25", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", source]);
    await runFfmpeg(["-i", source, "-f", "lavfi", "-i", "sine=frequency=660:sample_rate=24000", "-map", "0:v:0", "-map", "1:a:0", "-t", "1.25", "-c:v", "copy", "-c:a", "aac", "-movflags", "+faststart", output]);
    const duration = await probeDurationSeconds(output);
    expect(duration).toBeGreaterThan(1);
    expect(duration).toBeLessThan(1.35);
    expect((await stat(output)).size).toBeGreaterThan(1_000);
  }, 30_000);
});
