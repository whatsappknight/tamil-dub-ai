import { and, desc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { mediaFiles, processingJobs, projects, projectSegments, type InsertMediaFile, type InsertProcessingJob, type InsertProject, type InsertProjectSegment, type InsertUser, users } from "../drizzle/schema";
import type { PipelineStage } from "../shared/pipeline";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try { _db = drizzle(process.env.DATABASE_URL); } catch (error) { console.warn("[Database] Failed to connect:", error); _db = null; }
  }
  return _db;
}

function requireDb(db: Awaited<ReturnType<typeof getDb>>) {
  if (!db) throw new Error("Database is unavailable. Confirm DATABASE_URL is configured.");
  return db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values: InsertUser = { openId: user.openId, lastSignedIn: user.lastSignedIn ?? new Date(), role: user.role ?? (user.openId === ENV.ownerOpenId ? "admin" : "user") };
  const updateSet: Record<string, unknown> = { lastSignedIn: values.lastSignedIn, role: values.role };
  for (const field of ["name", "email", "loginMethod"] as const) {
    if (user[field] !== undefined) { values[field] = user[field] ?? null; updateSet[field] = user[field] ?? null; }
  }
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  return (await db.select().from(users).where(eq(users.openId, openId)).limit(1))[0];
}

export async function createProjectDraft(input: { userId: number; projectName: string; originalLanguage: string; dubbingProvider: "local" | "murf"; voiceId: string; voiceStyle: string; terminologyRules: string; pronunciationRules: string; subtitleStyle: "minimal" | "studio" | "high_contrast"; allowVoiceProviderFallback: boolean; preserveBackgroundAudio: boolean; preserveSoundEffects: boolean; generateSubtitles: boolean; burnSubtitles: boolean; createSrt: boolean; copyrightOwnershipConfirmed: true; copyrightResponsibilityConfirmed: true }) {
  const db = requireDb(await getDb());
  const values: InsertProject = { userId: input.userId, projectName: input.projectName, originalLanguage: input.originalLanguage, targetLanguage: "Tamil", dubbingProvider: input.dubbingProvider, voiceId: input.voiceId, voiceStyle: input.voiceStyle, terminologyRules: input.terminologyRules || null, pronunciationRules: input.pronunciationRules || null, subtitleStyle: input.subtitleStyle, allowVoiceProviderFallback: input.allowVoiceProviderFallback, preserveBackgroundAudio: input.preserveBackgroundAudio, preserveSoundEffects: input.preserveSoundEffects, generateSubtitles: input.generateSubtitles, burnSubtitles: input.burnSubtitles, createSrt: input.createSrt, copyrightOwnershipConfirmed: input.copyrightOwnershipConfirmed, copyrightResponsibilityConfirmed: input.copyrightResponsibilityConfirmed, status: "draft", currentStage: "uploading", progressPercent: 0, statusMessage: "Draft created.", audioMode: "replace_original" };
  const result = await db.insert(projects).values(values);
  return (await db.select().from(projects).where(eq(projects.id, Number(result[0].insertId))).limit(1))[0]!;
}

export async function updateProject(projectId: number, patch: Partial<InsertProject>) {
  const db = requireDb(await getDb());
  await db.update(projects).set(patch).where(eq(projects.id, projectId));
}

export async function completeProjectUpload(projectId: number, file: { filename: string; mimeType: string; sizeBytes: number }) {
  const db = requireDb(await getDb());
  const project = (await db.select().from(projects).where(eq(projects.id, projectId)).limit(1))[0];
  if (!project?.sourceFileKey || !project.sourceFileUrl) throw new Error("Upload storage reference is missing.");
  await db.update(projects).set({ status: "ready", currentStage: "uploading", progressPercent: 8, statusMessage: "Video uploaded. Configure and start Tamil dubbing.", sourceFilename: file.filename, sourceMimeType: file.mimeType, sourceFileSizeBytes: file.sizeBytes }).where(eq(projects.id, projectId));
  await db.insert(mediaFiles).values({ projectId, role: "source_video", storageKey: project.sourceFileKey, url: project.sourceFileUrl, filename: file.filename, mimeType: file.mimeType, sizeBytes: file.sizeBytes, durationSeconds: null });
  return (await db.select().from(projects).where(eq(projects.id, projectId)).limit(1))[0]!;
}

export async function getProjectForUser(projectId: number, userId: number) {
  const db = requireDb(await getDb());
  return (await db.select().from(projects).where(and(eq(projects.id, projectId), eq(projects.userId, userId))).limit(1))[0];
}

export async function getProjectForProcessing(projectId: number) {
  const db = requireDb(await getDb());
  return (await db.select().from(projects).where(eq(projects.id, projectId)).limit(1))[0];
}

export async function getProjectForMurfJob(murfJobId: string) {
  const db = requireDb(await getDb());
  return (await db.select().from(projects).where(eq(projects.murfJobId, murfJobId)).limit(1))[0];
}

export async function listProjectsForUser(userId: number) {
  const db = requireDb(await getDb());
  return db.select().from(projects).where(eq(projects.userId, userId)).orderBy(desc(projects.updatedAt));
}

export async function getUserProjectSummary(userId: number) {
  const db = requireDb(await getDb());
  const rows = await db.select({ status: projects.status, total: sql<number>`count(*)` }).from(projects).where(eq(projects.userId, userId)).groupBy(projects.status);
  const summary = { total: 0, recent: 0, processing: 0, completed: 0, failed: 0 };
  for (const row of rows) {
    const total = Number(row.total);
    summary.total += total;
    if (["queued", "processing", "uploading"].includes(row.status)) summary.processing += total;
    if (row.status === "completed") summary.completed += total;
    if (row.status === "failed") summary.failed += total;
  }
  summary.recent = Math.min(summary.total, 5);
  return summary;
}

export async function getProjectWithDetails(projectId: number, userId: number) {
  const db = requireDb(await getDb());
  const project = await getProjectForUser(projectId, userId);
  if (!project) return undefined;
  const [segments, jobs, files] = await Promise.all([
    db.select().from(projectSegments).where(eq(projectSegments.projectId, projectId)).orderBy(projectSegments.sortOrder),
    db.select().from(processingJobs).where(eq(processingJobs.projectId, projectId)).orderBy(desc(processingJobs.createdAt)),
    db.select().from(mediaFiles).where(eq(mediaFiles.projectId, projectId)).orderBy(desc(mediaFiles.createdAt)),
  ]);
  return { project, segments, jobs, files };
}

export async function createMediaFile(input: InsertMediaFile) { const db = requireDb(await getDb()); await db.insert(mediaFiles).values(input); }
export async function getProjectMediaByRole(projectId: number, role: string) { const db = requireDb(await getDb()); return (await db.select().from(mediaFiles).where(and(eq(mediaFiles.projectId, projectId), eq(mediaFiles.role, role))).orderBy(desc(mediaFiles.createdAt)).limit(1))[0]; }

export async function createProcessingJob(input: { projectId: number; stage: PipelineStage; message: string }) {
  const db = requireDb(await getDb());
  const attemptRows = await db.select({ total: sql<number>`count(*)` }).from(processingJobs).where(and(eq(processingJobs.projectId, input.projectId), eq(processingJobs.stage, input.stage)));
  const values: InsertProcessingJob = { projectId: input.projectId, stage: input.stage, status: "processing", progressPercent: 0, message: input.message, attempt: Number(attemptRows[0]?.total ?? 0) + 1, startedAt: new Date() };
  const result = await db.insert(processingJobs).values(values);
  return { id: Number(result[0].insertId), ...values };
}

export async function updateProcessingJob(jobId: number, patch: Partial<InsertProcessingJob>) { const db = requireDb(await getDb()); await db.update(processingJobs).set(patch).where(eq(processingJobs.id, jobId)); }
export async function getLatestProcessingJob(projectId: number, stage: PipelineStage) { const db = requireDb(await getDb()); return (await db.select().from(processingJobs).where(and(eq(processingJobs.projectId, projectId), eq(processingJobs.stage, stage))).orderBy(desc(processingJobs.createdAt)).limit(1))[0]; }
export async function getProjectSegments(projectId: number) { const db = requireDb(await getDb()); return db.select().from(projectSegments).where(eq(projectSegments.projectId, projectId)).orderBy(projectSegments.sortOrder); }
export async function getProjectSegment(segmentId: number) { const db = requireDb(await getDb()); return (await db.select().from(projectSegments).where(eq(projectSegments.id, segmentId)).limit(1))[0]; }

export async function replaceProjectSegments(projectId: number, segments: Array<{ startSeconds: number; endSeconds: number; sourceText: string; speaker: string | null }>, voiceId: string, voiceStyle: string) {
  const db = requireDb(await getDb());
  await db.delete(projectSegments).where(eq(projectSegments.projectId, projectId));
  if (!segments.length) return;
  const values: InsertProjectSegment[] = segments.map((segment, index) => ({ projectId, sortOrder: index, startSeconds: segment.startSeconds, endSeconds: segment.endSeconds, sourceText: segment.sourceText, speaker: segment.speaker, tamilText: null, voiceId, voiceStyle, pronunciationHint: null, speed: "1.00", status: "transcribed" }));
  await db.insert(projectSegments).values(values);
}

export async function updateProjectSegment(segmentId: number, patch: Partial<InsertProjectSegment>) { const db = requireDb(await getDb()); await db.update(projectSegments).set(patch).where(eq(projectSegments.id, segmentId)); }
