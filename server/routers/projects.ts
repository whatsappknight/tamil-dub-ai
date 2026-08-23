import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { isRetryableStage, type PipelineStage } from "../../shared/pipeline";
import { completeProjectUpload, createProjectDraft, getProjectForUser, getProjectSegment, getProjectWithDetails, getUserProjectSummary, listProjectsForUser, updateProject, updateProjectSegment } from "../db";
import { storageCreatePresignedUpload } from "../storage";
import { enqueueProjectPipeline, inspectProjectSourceMedia, regenerateOneSegmentAndRender } from "../services/pipeline";
import { validateDirectVideoUpload } from "../services/upload-validation";
import { protectedProcedure, router } from "../_core/trpc";

const voices = ["male-1", "male-2", "female-1", "female-2"] as const;
const styles = ["natural", "professional", "friendly", "documentary", "energetic"] as const;
const settings = z.object({ projectName: z.string().trim().min(1).max(160), originalLanguage: z.string().trim().min(2).max(24).default("auto"), voiceId: z.enum(voices), voiceStyle: z.enum(styles), preserveBackgroundAudio: z.boolean().default(false), preserveSoundEffects: z.boolean().default(false), generateSubtitles: z.boolean().default(false), burnSubtitles: z.boolean().default(false), createSrt: z.boolean().default(false), copyrightOwnershipConfirmed: z.literal(true), copyrightResponsibilityConfirmed: z.literal(true) });
const fileInput = z.object({ filename: z.string().trim().min(1).max(255), mimeType: z.string().trim(), sizeBytes: z.number().int().positive() });

function validateFile(file: z.infer<typeof fileInput>) { try { validateDirectVideoUpload(file); } catch (error) { throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "The selected video is invalid." }); } }
async function ownedProject(projectId: number, userId: number) { const project = await getProjectForUser(projectId, userId); if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found." }); return project; }
async function ownedSegment(projectId: number, segmentId: number, userId: number) { await ownedProject(projectId, userId); const segment = await getProjectSegment(segmentId); if (!segment || segment.projectId !== projectId) throw new TRPCError({ code: "NOT_FOUND", message: "Segment not found in this project." }); return segment; }

export const projectRouter = router({
  summary: protectedProcedure.query(({ ctx }) => getUserProjectSummary(ctx.user.id)),
  list: protectedProcedure.query(({ ctx }) => listProjectsForUser(ctx.user.id)),
  get: protectedProcedure.input(z.object({ projectId: z.number().int().positive() })).query(async ({ ctx, input }) => { const result = await getProjectWithDetails(input.projectId, ctx.user.id); if (!result) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found." }); return result; }),
  prepareUpload: protectedProcedure.input(settings.merge(fileInput)).mutation(async ({ ctx, input }) => {
    validateFile(input);
    const project = await createProjectDraft({ userId: ctx.user.id, ...input });
    const extension = input.filename.split(".").pop()?.toLowerCase() || "mp4";
    const upload = await storageCreatePresignedUpload(`projects/${project.id}/source/${project.id}.${extension}`, input.mimeType);
    await updateProject(project.id, { sourceFileKey: upload.key, sourceFileUrl: upload.url, sourceFilename: input.filename, sourceMimeType: input.mimeType, sourceFileSizeBytes: input.sizeBytes, status: "uploading", currentStage: "uploading", progressPercent: 0, statusMessage: "Waiting for secure video upload." });
    return { projectId: project.id, uploadPath: `/api/projects/${project.id}/source-upload` };
  }),
  completeUpload: protectedProcedure.input(z.object({ projectId: z.number().int().positive(), file: fileInput })).mutation(async ({ ctx, input }) => { validateFile(input.file); await ownedProject(input.projectId, ctx.user.id); const project = await completeProjectUpload(input.projectId, input.file); void inspectProjectSourceMedia(project.id).catch(() => undefined); return { projectId: project.id, status: project.status }; }),
  startProcessing: protectedProcedure.input(z.object({ projectId: z.number().int().positive() })).mutation(async ({ ctx, input }) => { const project = await ownedProject(input.projectId, ctx.user.id); if (!project.sourceFileKey || project.status === "uploading") throw new TRPCError({ code: "BAD_REQUEST", message: "Finish uploading the source video before starting Tamil dubbing." }); await updateProject(project.id, { status: "queued", currentStage: "extracting_audio", progressPercent: 10, statusMessage: "Queued for Tamil dubbing." }); enqueueProjectPipeline(project.id, "extracting_audio"); return { accepted: true }; }),
  retry: protectedProcedure.input(z.object({ projectId: z.number().int().positive() })).mutation(async ({ ctx, input }) => { const project = await ownedProject(input.projectId, ctx.user.id); const stage = project.currentStage as PipelineStage; if (project.status !== "failed" || !isRetryableStage(stage)) throw new TRPCError({ code: "BAD_REQUEST", message: "This project has no retryable failed stage." }); await updateProject(project.id, { status: "queued", progressPercent: Math.max(5, project.progressPercent - 4), statusMessage: `Retrying ${stage.replaceAll("_", " ")}.`, lastError: null }); enqueueProjectPipeline(project.id, stage); return { accepted: true, stage }; }),
  updateSegment: protectedProcedure.input(z.object({ projectId: z.number().int().positive(), segmentId: z.number().int().positive(), tamilText: z.string().trim().min(1).max(1600), voiceId: z.enum(voices), voiceStyle: z.enum(styles), speed: z.number().min(0.85).max(1.18) })).mutation(async ({ ctx, input }) => { await ownedSegment(input.projectId, input.segmentId, ctx.user.id); await updateProjectSegment(input.segmentId, { tamilText: input.tamilText, voiceId: input.voiceId, voiceStyle: input.voiceStyle, speed: input.speed.toFixed(2), status: "translated", ttsAudioKey: null, ttsAudioUrl: null }); await updateProject(input.projectId, { statusMessage: "Segment saved. Regenerate its voice to apply the change." }); return { saved: true }; }),
  regenerateSegment: protectedProcedure.input(z.object({ projectId: z.number().int().positive(), segmentId: z.number().int().positive() })).mutation(async ({ ctx, input }) => { await ownedSegment(input.projectId, input.segmentId, ctx.user.id); void regenerateOneSegmentAndRender(input.projectId, input.segmentId).catch(() => undefined); return { accepted: true }; }),
});
