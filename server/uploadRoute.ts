import type { Express, Request, Response } from "express";
import { Readable } from "stream";
import { getProjectForUser } from "./db";
import { sdk } from "./_core/sdk";
import { storageCreatePresignedUploadForKey } from "./storage";

const maximumBytes = Number(process.env.MAX_UPLOAD_BYTES || 209_715_200);

function requestSize(request: Request) {
  const value = request.headers["content-length"];
  const parsed = typeof value === "string" ? Number.parseInt(value, 10) : Array.isArray(value) ? Number.parseInt(value[0] || "", 10) : NaN;
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function registerProjectUploadRoute(app: Express) {
  app.post("/api/projects/:projectId/source-upload", async (req: Request, res: Response) => {
    let user;
    try { user = await sdk.authenticateRequest(req); } catch { user = null; }
    if (!user) return res.status(401).json({ error: "Sign in before uploading a video." });

    const projectId = Number.parseInt(req.params.projectId, 10);
    if (!Number.isSafeInteger(projectId) || projectId <= 0) return res.status(400).json({ error: "Invalid project upload request." });
    const project = await getProjectForUser(projectId, user.id);
    if (!project?.sourceFileKey) return res.status(404).json({ error: "Project upload destination was not found." });
    if (project.status !== "uploading" && project.status !== "draft") return res.status(409).json({ error: "This project is not accepting another source upload." });

    const size = requestSize(req);
    if (size === null || size <= 0) return res.status(411).json({ error: "A valid video content length is required." });
    if (size > maximumBytes) return res.status(413).json({ error: `Video exceeds the ${(maximumBytes / 1024 / 1024).toFixed(0)} MB upload limit.` });

    const contentType = req.headers["content-type"] || project.sourceMimeType || "application/octet-stream";
    try {
      const { uploadUrl } = await storageCreatePresignedUploadForKey(project.sourceFileKey, contentType);
      const uploadResponse = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": contentType, "Content-Length": String(size) },
        body: Readable.toWeb(req) as unknown as BodyInit,
        duplex: "half",
      } as RequestInit);
      if (!uploadResponse.ok) {
        const detail = await uploadResponse.text().catch(() => uploadResponse.statusText);
        return res.status(502).json({ error: `Secure storage rejected the video upload (${uploadResponse.status}).`, detail: detail.slice(0, 300) });
      }
      return res.status(201).json({ uploaded: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected secure upload failure.";
      return res.status(500).json({ error: message });
    }
  });
}
