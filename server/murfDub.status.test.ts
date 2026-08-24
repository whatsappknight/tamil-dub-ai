import { createHmac } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fakes = vi.hoisted(() => ({
  createMediaFile: vi.fn(),
  createProcessingJob: vi.fn(),
  getLatestProcessingJob: vi.fn(),
  getProjectForMurfJob: vi.fn(),
  getProjectForProcessing: vi.fn(),
  updateProcessingJob: vi.fn(),
  updateProject: vi.fn(),
  storageGetSignedUrl: vi.fn(),
  downloadSignedObject: vi.fn(),
  probeDurationSeconds: vi.fn(),
  uploadLocalFileToStorage: vi.fn(),
}));

vi.mock("./db", () => ({
  createMediaFile: fakes.createMediaFile,
  createProcessingJob: fakes.createProcessingJob,
  getLatestProcessingJob: fakes.getLatestProcessingJob,
  getProjectForMurfJob: fakes.getProjectForMurfJob,
  getProjectForProcessing: fakes.getProjectForProcessing,
  updateProcessingJob: fakes.updateProcessingJob,
  updateProject: fakes.updateProject,
}));
vi.mock("./storage", () => ({ storageGetSignedUrl: fakes.storageGetSignedUrl }));
vi.mock("./services/ffmpeg", () => ({
  downloadSignedObject: fakes.downloadSignedObject,
  probeDurationSeconds: fakes.probeDurationSeconds,
  uploadLocalFileToStorage: fakes.uploadLocalFileToStorage,
}));

import { acceptMurfWebhook, applyMurfDubStatus, murfWebhookSecret } from "./services/murfDub";

describe("Murf Dub status ingestion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JWT_SECRET = "murf-status-test-signing-key";
    fakes.getProjectForProcessing.mockResolvedValue({ id: 12, sourceDurationSeconds: 24.5, finalVideoKey: null });
    fakes.getLatestProcessingJob.mockResolvedValue({ id: 55, status: "processing" });
    fakes.downloadSignedObject.mockResolvedValue(undefined);
    fakes.probeDurationSeconds.mockResolvedValue(24.5);
    fakes.uploadLocalFileToStorage
      .mockResolvedValueOnce({ key: "projects/12/output/murf.mp4", url: "/manus-storage/projects/12/output/murf.mp4", bytes: 1234 })
      .mockResolvedValueOnce({ key: "projects/12/subtitles/murf.srt", url: "/manus-storage/projects/12/subtitles/murf.srt", bytes: 456 });
  });

  it("imports completed Tamil MP4 and SRT outputs, then exposes them on the completed project", async () => {
    const result = await applyMurfDubStatus(12, {
      job_id: "job-complete",
      status: "COMPLETED",
      download_details: [{ locale: "ta_IN", status: "COMPLETED", download_url: "https://provider.example/final.mp4", download_srt_url: "https://provider.example/final.srt" }],
    });

    expect(result).toEqual({ completed: true, imported: true });
    expect(fakes.downloadSignedObject).toHaveBeenCalledWith("https://provider.example/final.mp4", expect.stringContaining("tamil-dubbed.mp4"));
    expect(fakes.downloadSignedObject).toHaveBeenCalledWith("https://provider.example/final.srt", expect.stringContaining("tamil-subtitles.srt"));
    expect(fakes.createMediaFile).toHaveBeenCalledWith(expect.objectContaining({ role: "murf_final_video", storageKey: "projects/12/output/murf.mp4" }));
    expect(fakes.createMediaFile).toHaveBeenCalledWith(expect.objectContaining({ role: "murf_subtitle_srt", storageKey: "projects/12/subtitles/murf.srt" }));
    expect(fakes.updateProject).toHaveBeenCalledWith(12, expect.objectContaining({ subtitleSrtUrl: "/manus-storage/projects/12/subtitles/murf.srt" }));
    expect(fakes.updateProject).toHaveBeenCalledWith(12, expect.objectContaining({ status: "completed", finalVideoUrl: "/manus-storage/projects/12/output/murf.mp4" }));
    expect(fakes.updateProcessingJob).toHaveBeenCalledWith(55, expect.objectContaining({ status: "completed", progressPercent: 100 }));
  });

  it("marks a terminal provider failure as a retryable failed generating-voice stage", async () => {
    const result = await applyMurfDubStatus(12, { job_id: "job-failed", status: "FAILED", failure_reason: "No credits" });
    expect(result).toEqual({ completed: false, failed: true });
    expect(fakes.updateProcessingJob).toHaveBeenCalledWith(55, expect.objectContaining({ status: "failed" }));
    expect(fakes.updateProject).toHaveBeenCalledWith(12, expect.objectContaining({ status: "failed", currentStage: "generating_voice", murfStatus: "FAILED" }));
  });

  it("accepts only a valid signed DUB_JOB callback for the matching stored Murf job", async () => {
    const payload = JSON.stringify({ eventName: "DUB_JOB", data: { job_id: "job-webhook", status: "PROCESSING" } });
    const timestamp = String(Date.now());
    fakes.getProjectForMurfJob.mockResolvedValue({ id: 12 });
    const signature = createHmac("sha256", murfWebhookSecret(12)).update(`${payload}.${timestamp}`).digest("hex");

    await expect(acceptMurfWebhook({ rawBody: payload, timestamp, signature })).resolves.toEqual({ projectId: 12, status: { job_id: "job-webhook", status: "PROCESSING" } });
    await expect(acceptMurfWebhook({ rawBody: payload, timestamp, signature: "deadbeef" })).resolves.toBeNull();
  });
});
