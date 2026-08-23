import { mkdtemp, readFile, rm } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { storageGetSignedUrl, storagePut } from "./storage";
import { runFfmpeg, uploadLocalFileToStorage } from "./services/ffmpeg";

let workDir = "";

afterEach(async () => {
  if (workDir) await rm(workDir, { recursive: true, force: true });
  workDir = "";
});

describe("processing-output storage", () => {
  it("stores and retrieves a small known-length binary output through the server-side path", async () => {
    const payload = Buffer.from("tamil-dub-storage-check", "utf8");
    const stored = await storagePut("verification/server-output.bin", payload, "application/octet-stream");
    const signedUrl = await storageGetSignedUrl(stored.key);
    const response = await fetch(signedUrl);
    expect(response.ok).toBe(true);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(payload);
  }, 30_000);

  it("stores an FFmpeg-generated extraction output through the same server-side path", async () => {
    workDir = await mkdtemp(path.join(os.tmpdir(), "tamil-dub-storage-extraction-"));
    const audioPath = path.join(workDir, "extracted.wav");
    await runFfmpeg(["-f", "lavfi", "-i", "sine=frequency=523.25:sample_rate=24000", "-t", "0.5", "-vn", "-ac", "1", "-ar", "24000", audioPath]);
    const audio = await readFile(audioPath);
    const stored = await uploadLocalFileToStorage(audioPath, "verification/extracted-audio.wav", "audio/wav");
    const response = await fetch(await storageGetSignedUrl(stored.key));
    expect(response.ok).toBe(true);
    expect((await response.arrayBuffer()).byteLength).toBe(audio.byteLength);
  }, 30_000);

  it("fails safely when signed-URL preparation stalls", async () => {
    vi.useFakeTimers();
    const request = vi.fn((_input: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))) as Promise<Response>);
    const pending = storageGetSignedUrl("projects/120001/tts/segment-1.mp3", request as typeof fetch);
    const assertion = expect(pending).rejects.toThrow(/timed out preparing a processing-input download/i);
    await vi.advanceTimersByTimeAsync(20_000);
    await assertion;
    vi.useRealTimers();
  });
});
