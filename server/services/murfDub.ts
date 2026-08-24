import { createHmac, timingSafeEqual } from "crypto";
import { mkdtemp, rm } from "fs/promises";
import os from "os";
import path from "path";
import { createMediaFile, createProcessingJob, getLatestProcessingJob, getProjectForMurfJob, getProjectForProcessing, updateProcessingJob, updateProject } from "../db";
import { storageGetSignedUrl } from "../storage";
import { downloadSignedObject, probeDurationSeconds, uploadLocalFileToStorage } from "./ffmpeg";

const MURF_DUB_BASE_URL = "https://api.murf.ai/v1/murfdub";
const MURF_TAMIL_LOCALE = "ta_IN";
const MURF_TIMEOUT_MS = 30_000;

type MurfDownloadDetail = { locale?: string; status?: string; error_message?: string | null; download_url?: string; download_srt_url?: string };
export type MurfDubStatus = { job_id: string; status: string; project_id?: string | null; download_details?: MurfDownloadDetail[]; credits_used?: number; credits_remaining?: number; failure_reason?: string | null; failure_code?: string | null };
type MurfJobResponse = { job_id: string; project_id?: string | null; warning?: string | null };
type FetchRequest = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

function requireMurfDubApiKey() {
  const apiKey = process.env.MURF_DUB_API_KEY;
  if (!apiKey) throw new Error("Murf AI dubbing is not configured. Add MURF_DUB_API_KEY in managed secrets before starting a Murf project.");
  return apiKey;
}

export function murfDubConfigured() { return Boolean(process.env.MURF_DUB_API_KEY); }
export function murfWebhookSecret(projectId: number, signingKey = process.env.JWT_SECRET || "") {
  if (!signingKey) throw new Error("Murf webhook verification is unavailable because the server signing secret is missing.");
  return createHmac("sha256", signingKey).update(`murf-dub:${projectId}`).digest("hex");
}

export function verifyMurfWebhookSignature(input: { payload: string; timestamp: string | undefined; signature: string | undefined; secret: string; now?: number; toleranceMs?: number }) {
  if (!input.timestamp || !input.signature) return false;
  const timestamp = Number(input.timestamp);
  const now = input.now ?? Date.now();
  if (!Number.isFinite(timestamp) || Math.abs(now - timestamp) > (input.toleranceMs ?? 300_000)) return false;
  const expected = createHmac("sha256", input.secret).update(`${input.payload}.${input.timestamp}`).digest("hex");
  const received = Buffer.from(input.signature, "hex");
  const calculated = Buffer.from(expected, "hex");
  return received.length === calculated.length && timingSafeEqual(received, calculated);
}

function murfFailure(status: number) {
  if (status === 401 || status === 403) return "Murf AI could not authorize the Tamil dubbing request. Verify the managed Murf Dub API key and account access, then retry.";
  if (status === 402) return "Murf AI does not have enough available dubbing credits for this project. Add credits in Murf, then retry.";
  if (status === 429 || status === 503) return "Murf AI is temporarily unavailable or rate-limiting dubbing. Wait briefly, then retry.";
  return `Murf AI Tamil dubbing could not start (HTTP ${status}). Check the authorized upload and provider account, then retry.`;
}

async function murfRequest(url: string, init: RequestInit, request: FetchRequest = fetch) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MURF_TIMEOUT_MS);
  try {
    const response = await request(url, { ...init, signal: controller.signal });
    if (!response.ok) throw new Error(murfFailure(response.status));
    return response.json() as Promise<unknown>;
  } catch (error) {
    if (controller.signal.aborted) throw new Error("Murf AI did not respond within the safe request time. Retry the Murf dubbing project.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function createMurfDubJob(input: { fileUrl: string; fileName: string; webhookUrl?: string; webhookSecret?: string }, config: { apiKey?: string } = {}, request: FetchRequest = fetch): Promise<MurfJobResponse> {
  const form = new FormData();
  form.set("file_url", input.fileUrl);
  form.set("file_name", input.fileName);
  form.set("target_locales", MURF_TAMIL_LOCALE);
  form.set("priority", "NORMAL");
  if (input.webhookUrl && input.webhookSecret) {
    form.set("webhook_url", input.webhookUrl);
    form.set("webhook_secret", input.webhookSecret);
  }
  const payload = await murfRequest(`${MURF_DUB_BASE_URL}/jobs/create`, { method: "POST", headers: { "api-key": config.apiKey || requireMurfDubApiKey() }, body: form }, request) as MurfJobResponse;
  if (!payload.job_id) throw new Error("Murf AI did not return a dubbing job identifier. Retry the project.");
  return payload;
}

export async function getMurfDubJobStatus(jobId: string, config: { apiKey?: string } = {}, request: FetchRequest = fetch): Promise<MurfDubStatus> {
  return murfRequest(`${MURF_DUB_BASE_URL}/jobs/${encodeURIComponent(jobId)}/status`, { headers: { "api-key": config.apiKey || requireMurfDubApiKey() } }, request) as Promise<MurfDubStatus>;
}

function isTamilLocale(locale: string | undefined) { return locale?.toLowerCase().replaceAll("_", "-") === "ta-in"; }
function completedTamilOutput(status: MurfDubStatus) { return status.download_details?.find(detail => isTamilLocale(detail.locale) && detail.status === "COMPLETED" && detail.download_url); }
function terminalFailure(status: MurfDubStatus) { return ["FAILED", "CANCELLED"].includes(status.status); }

async function completeMurfProject(projectId: number, status: MurfDubStatus) {
  const tamilOutput = completedTamilOutput(status);
  if (!tamilOutput?.download_url) throw new Error("Murf AI completed without a downloadable Tamil video. Refresh status or retry the project.");
  const project = await getProjectForProcessing(projectId);
  if (!project) throw new Error("Murf project was not found.");
  if (project.finalVideoKey) return { completed: true, imported: false };
  const workDir = await mkdtemp(path.join(os.tmpdir(), `murf-dub-${projectId}-`));
  try {
    const videoPath = path.join(workDir, "tamil-dubbed.mp4");
    await downloadSignedObject(tamilOutput.download_url, videoPath);
    const video = await uploadLocalFileToStorage(videoPath, `projects/${projectId}/output/murf-tamil-dubbed.mp4`, "video/mp4");
    const duration = await probeDurationSeconds(videoPath).catch(() => Number(project.sourceDurationSeconds) || null);
    await createMediaFile({ projectId, role: "murf_final_video", storageKey: video.key, url: video.url, filename: "murf-tamil-dubbed.mp4", mimeType: "video/mp4", sizeBytes: video.bytes, durationSeconds: duration });
    if (tamilOutput.download_srt_url) {
      const srtPath = path.join(workDir, "tamil-subtitles.srt");
      await downloadSignedObject(tamilOutput.download_srt_url, srtPath);
      const srt = await uploadLocalFileToStorage(srtPath, `projects/${projectId}/subtitles/murf-tamil-subtitles.srt`, "application/x-subrip");
      await createMediaFile({ projectId, role: "murf_subtitle_srt", storageKey: srt.key, url: srt.url, filename: "murf-tamil-subtitles.srt", mimeType: "application/x-subrip", sizeBytes: srt.bytes, durationSeconds: null });
      await updateProject(projectId, { subtitleSrtKey: srt.key, subtitleSrtUrl: srt.url });
    }
    const job = await getLatestProcessingJob(projectId, "generating_voice");
    if (job && job.status !== "completed") await updateProcessingJob(job.id, { status: "completed", progressPercent: 100, message: "Murf AI Tamil-dubbed video is ready to preview and download.", completedAt: new Date() });
    await updateProject(projectId, { status: "completed", currentStage: "completed", progressPercent: 100, statusMessage: "Murf AI Tamil-dubbed video is ready to preview and download.", murfStatus: status.status, finalVideoKey: video.key, finalVideoUrl: video.url, outputDurationSeconds: duration, completedAt: new Date(), lastError: null });
    return { completed: true, imported: true };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

async function failMurfProject(projectId: number, status: MurfDubStatus) {
  const job = await getLatestProcessingJob(projectId, "generating_voice");
  const message = "Murf AI could not complete Tamil dubbing. Check Murf credits and source-file access, then retry.";
  if (job && job.status !== "failed") await updateProcessingJob(job.id, { status: "failed", message, errorDetail: message, completedAt: new Date() });
  await updateProject(projectId, { status: "failed", currentStage: "generating_voice", murfStatus: status.status, statusMessage: "Murf AI dubbing needs attention.", lastError: message });
  return { completed: false, failed: true };
}

export async function applyMurfDubStatus(projectId: number, status: MurfDubStatus) {
  if (completedTamilOutput(status)) return completeMurfProject(projectId, status);
  if (terminalFailure(status)) return failMurfProject(projectId, status);
  await updateProject(projectId, { status: "processing", currentStage: "generating_voice", progressPercent: 60, murfStatus: status.status, statusMessage: "Murf AI is translating, voicing, and synchronizing your Tamil dub." });
  return { completed: false, failed: false };
}

export async function startMurfDubbingProject(projectId: number, webhookUrl?: string) {
  const project = await getProjectForProcessing(projectId);
  if (!project?.sourceFileKey || !project.sourceFilename) throw new Error("Project source video is unavailable for Murf dubbing.");
  if (!murfDubConfigured()) throw new Error("Murf AI dubbing is not configured. Add MURF_DUB_API_KEY in managed secrets before starting a Murf project.");
  const job = await createProcessingJob({ projectId, stage: "generating_voice", message: "Sending the authorized upload to Murf AI for managed Tamil dubbing." });
  await updateProject(projectId, { status: "processing", currentStage: "generating_voice", progressPercent: 50, statusMessage: "Murf AI is preparing the Tamil dubbing job.", lastError: null, murfStatus: "SUBMITTING" });
  try {
    const response = await createMurfDubJob({ fileUrl: await storageGetSignedUrl(project.sourceFileKey), fileName: project.sourceFilename, webhookUrl, webhookSecret: webhookUrl ? murfWebhookSecret(projectId) : undefined });
    await updateProcessingJob(job.id, { progressPercent: 60, message: "Murf AI is translating, voicing, and synchronizing your Tamil dub." });
    await updateProject(projectId, { murfJobId: response.job_id, murfStatus: "PROCESSING", progressPercent: 60, statusMessage: "Murf AI is translating, voicing, and synchronizing your Tamil dub." });
    return { accepted: true, jobId: response.job_id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Murf AI Tamil dubbing could not start.";
    await updateProcessingJob(job.id, { status: "failed", message, errorDetail: message, completedAt: new Date() });
    await updateProject(projectId, { status: "failed", currentStage: "generating_voice", statusMessage: "Murf AI dubbing needs attention.", lastError: message });
    throw error;
  }
}

export async function refreshMurfDubbingProject(projectId: number) {
  const project = await getProjectForProcessing(projectId);
  if (!project?.murfJobId) throw new Error("This project does not have a Murf AI job to refresh.");
  return applyMurfDubStatus(projectId, await getMurfDubJobStatus(project.murfJobId));
}

export async function acceptMurfWebhook(input: { rawBody: string; timestamp: string | undefined; signature: string | undefined }) {
  let payload: { eventName?: string; data?: MurfDubStatus };
  try { payload = JSON.parse(input.rawBody) as typeof payload; } catch { return null; }
  const status = payload.data;
  if (payload.eventName !== "DUB_JOB" || !status?.job_id) return null;
  const project = await getProjectForMurfJob(status.job_id);
  if (!project || !verifyMurfWebhookSignature({ payload: input.rawBody, timestamp: input.timestamp, signature: input.signature, secret: murfWebhookSecret(project.id) })) return null;
  return { projectId: project.id, status };
}
