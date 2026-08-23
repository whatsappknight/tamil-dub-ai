import { beforeEach, describe, expect, it, vi } from "vitest";

const db = {
  createProjectDraft: vi.fn(), completeProjectUpload: vi.fn(), getProjectForUser: vi.fn(), getProjectSegment: vi.fn(), getProjectWithDetails: vi.fn(),
  getUserProjectSummary: vi.fn(), listProjectsForUser: vi.fn(), updateProject: vi.fn(), updateProjectSegment: vi.fn(), updateSegmentsForSpeaker: vi.fn(),
};
const pipeline = { enqueueProjectPipeline: vi.fn(), inspectProjectSourceMedia: vi.fn(), regenerateOneSegmentAndRender: vi.fn(), regenerateSpeakerAndRender: vi.fn() };

vi.mock("./db", () => db);
vi.mock("./storage", () => ({ storageCreatePresignedUpload: vi.fn(async () => ({ key: "projects/77/source/77.mp4", url: "/manus-storage/projects/77/source/77.mp4" })) }));
vi.mock("./services/pipeline", () => pipeline);
vi.mock("./services/upload-validation", () => ({ validateDirectVideoUpload: vi.fn() }));

const { projectRouter } = await import("./routers/projects");

function caller() {
  return projectRouter.createCaller({ user: { id: 1 }, req: {} as never, res: {} as never } as never);
}

describe("speaker and style project router workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.getProjectForUser.mockResolvedValue({ id: 77, userId: 1, sourceFileKey: "projects/77/source/77.mp4" });
    db.createProjectDraft.mockResolvedValue({ id: 77 });
    db.updateProject.mockResolvedValue(undefined);
    db.updateSegmentsForSpeaker.mockResolvedValue(undefined);
    pipeline.regenerateSpeakerAndRender.mockResolvedValue(undefined);
  });

  it("bulk-regenerates every manually labelled speaker profile after assignment", async () => {
    const result = await caller().applySpeakerVoice({ projectId: 77, speaker: "Host", voiceId: "narrator", voiceStyle: "cinematic" });
    expect(result).toEqual({ accepted: true });
    expect(db.updateSegmentsForSpeaker).toHaveBeenCalledWith(77, "Host", expect.objectContaining({ voiceId: "narrator", voiceStyle: "cinematic", status: "translated", ttsAudioKey: null }));
    expect(db.updateProject).toHaveBeenCalledWith(77, expect.objectContaining({ status: "queued", currentStage: "generating_voice" }));
    expect(pipeline.regenerateSpeakerAndRender).toHaveBeenCalledWith(77, "Host");
  });

  it("accepts and persists a dramatic Tamil speaking style during project creation", async () => {
    const result = await caller().prepareUpload({ projectName: "Dramatic Tamil", originalLanguage: "en", voiceId: "female-1", voiceStyle: "dramatic", terminologyRules: "", pronunciationRules: "", subtitleStyle: "studio", allowVoiceProviderFallback: true, preserveBackgroundAudio: false, preserveSoundEffects: false, generateSubtitles: false, burnSubtitles: false, createSrt: false, copyrightOwnershipConfirmed: true, copyrightResponsibilityConfirmed: true, filename: "authorized.mp4", mimeType: "video/mp4", sizeBytes: 1_024 });
    expect(result).toEqual({ projectId: 77, uploadPath: "/api/projects/77/source-upload" });
    expect(db.createProjectDraft).toHaveBeenCalledWith(expect.objectContaining({ voiceStyle: "dramatic", voiceId: "female-1" }));
  });
});
