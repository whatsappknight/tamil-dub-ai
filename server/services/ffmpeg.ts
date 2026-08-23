import { spawn } from "child_process";
import { createReadStream, createWriteStream } from "fs";
import { mkdir, stat } from "fs/promises";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import path from "path";
import { storageCreatePresignedUpload } from "../storage";

export async function runProcess(command: string, args: string[]) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", chunk => { stdout += chunk.toString(); });
    child.stderr.on("data", chunk => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve({ stdout, stderr }) : reject(new Error(`${command} exited with code ${code}: ${stderr.slice(-1200)}`)));
  });
}

export async function runFfmpeg(args: string[]) { await runProcess("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", ...args]); }

export async function probeDurationSeconds(filePath: string) {
  const { stdout } = await runProcess("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", filePath]);
  const duration = Number.parseFloat(stdout.trim());
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("Unable to determine video duration.");
  return duration;
}

export async function downloadSignedObject(url: string, targetPath: string) {
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(`Failed to download processing input (${response.status}).`);
  await mkdir(path.dirname(targetPath), { recursive: true });
  await pipeline(Readable.fromWeb(response.body as never), createWriteStream(targetPath));
}

export async function uploadLocalFileToStorage(filePath: string, storagePath: string, contentType: string) {
  const { uploadUrl, key, url } = await storageCreatePresignedUpload(storagePath, contentType);
  const file = await stat(filePath);
  const body = Readable.toWeb(createReadStream(filePath));
  const response = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": contentType, "Content-Length": String(file.size) }, body, duplex: "half" } as RequestInit);
  if (!response.ok) { const detail = await response.text().catch(() => response.statusText); throw new Error(`Failed to store processing output (${response.status}): ${detail.slice(0, 300)}`); }
  return { key, url, bytes: file.size };
}
