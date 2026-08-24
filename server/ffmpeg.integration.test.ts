import { mkdtemp, rm, stat } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadSignedObject, duckedTamilBackgroundFilter, probeDurationSeconds, runFfmpeg, trimTamilTtsEdgeSilenceFilter } from "./services/ffmpeg";

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

  it("mixes a ducked source-audio bed under Tamil voice without introducing a silent final track", async () => {
    workDir = await mkdtemp(path.join(os.tmpdir(), "tamil-dub-background-mix-"));
    const source = path.join(workDir, "source.mp4"); const voice = path.join(workDir, "tamil.m4a"); const mixed = path.join(workDir, "mixed.m4a");
    await runFfmpeg(["-f", "lavfi", "-i", "color=c=0x33245f:s=320x180:r=24", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=24000", "-t", "1.25", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", source]);
    await runFfmpeg(["-f", "lavfi", "-i", "sine=frequency=660:sample_rate=24000", "-t", "1.25", "-c:a", "aac", voice]);
    await runFfmpeg(["-i", source, "-i", voice, "-filter_complex", duckedTamilBackgroundFilter(), "-map", "[mixed]", "-c:a", "aac", mixed]);
    expect(await probeDurationSeconds(mixed)).toBeGreaterThan(1);
    expect((await stat(mixed)).size).toBeGreaterThan(1_000);
  }, 30_000);

  it("trims generated Tamil TTS edge silence before synchronization", async () => {
    workDir = await mkdtemp(path.join(os.tmpdir(), "tamil-dub-trim-test-"));
    const raw = path.join(workDir, "raw-tts.wav"); const trimmed = path.join(workDir, "trimmed-tts.wav");
    await runFfmpeg(["-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=24000", "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono", "-filter_complex", "[0:a]atrim=duration=0.25[a];[1:a]atrim=duration=0.25[b];[2:a]atrim=duration=0.30[c];[a][b][c]concat=n=3:v=0:a=1[out]", "-map", "[out]", "-c:a", "pcm_s16le", raw]);
    await runFfmpeg(["-i", raw, "-af", trimTamilTtsEdgeSilenceFilter(), "-c:a", "pcm_s16le", trimmed]);
    expect(await probeDurationSeconds(raw)).toBeGreaterThan(0.7);
    expect(await probeDurationSeconds(trimmed)).toBeLessThan(0.45);
  }, 30_000);

  it("fails safely instead of waiting indefinitely for a processing-input download", async () => {
    vi.useFakeTimers();
    const request = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))) as Promise<Response>);
    const pending = downloadSignedObject("https://storage.example.test/audio.mp3", "/tmp/unreachable-audio.mp3", request);
    const assertion = expect(pending).rejects.toThrow(/timed out downloading processing input/i);
    await vi.advanceTimersByTimeAsync(30_000);
    await assertion;
    vi.useRealTimers();
  });

  it("aborts a processing-input stream that stalls after response headers", async () => {
    vi.useFakeTimers();
    const neverEndingBody = new ReadableStream<Uint8Array>({ start() {} });
    const request = vi.fn(async () => new Response(neverEndingBody, { status: 200 }));
    const pending = downloadSignedObject("https://storage.example.test/stalled.mp3", "/tmp/stalled-audio.mp3", request as typeof fetch);
    const assertion = expect(pending).rejects.toThrow(/timed out downloading processing input/i);
    await vi.advanceTimersByTimeAsync(30_000);
    await assertion;
    vi.useRealTimers();
  });
});
