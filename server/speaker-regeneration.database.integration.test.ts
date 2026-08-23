import { afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { projectSegments, projects } from "../drizzle/schema";
import { createProjectDraft, getDb, getProjectSegments, replaceProjectSegments, updateProjectSegment } from "./db";
import { regenerateSpeakerAndRender } from "./services/pipeline";

describe("bulk speaker regeneration with persisted segments", () => {
  let projectId: number | undefined;

  afterEach(async () => {
    if (!projectId) return;
    const db = await getDb();
    if (db) {
      await db.delete(projectSegments).where(eq(projectSegments.projectId, projectId));
      await db.delete(projects).where(eq(projects.id, projectId));
    }
    projectId = undefined;
  });

  it("preserves stored manual labels and refreshes only every matching speaker voice", async () => {
    const project = await createProjectDraft({ userId: 1, projectName: "[test] speaker regeneration", originalLanguage: "en", voiceId: "female-1", voiceStyle: "natural", terminologyRules: "", pronunciationRules: "", subtitleStyle: "studio", allowVoiceProviderFallback: true, preserveBackgroundAudio: false, preserveSoundEffects: false, generateSubtitles: false, burnSubtitles: false, createSrt: false, copyrightOwnershipConfirmed: true, copyrightResponsibilityConfirmed: true });
    projectId = project.id;
    await replaceProjectSegments(projectId, [
      { startSeconds: 0, endSeconds: 1, sourceText: "one", speaker: "Host" },
      { startSeconds: 1, endSeconds: 2, sourceText: "two", speaker: "Guest" },
      { startSeconds: 2, endSeconds: 3, sourceText: "three", speaker: "Host" },
    ], "female-1", "dramatic");
    const seeded = await getProjectSegments(projectId);
    for (const segment of seeded) await updateProjectSegment(segment.id, { tamilText: `தமிழ் ${segment.id}`, status: "translated", ttsAudioKey: `original-${segment.id}`, ttsAudioUrl: `/original-${segment.id}.mp3` });

    const enqueue = vi.fn();
    let storageSequence = 0;
    await regenerateSpeakerAndRender(projectId, "Host", enqueue, {
      synthesize: async () => ({ extension: "mp3", audio: Buffer.from("Tamil voice"), contentType: "audio/mpeg" }),
      store: async key => ({ key: `${key}-stored-${++storageSequence}`, url: `/manus-storage/${storageSequence}.mp3` }),
    });

    const reloaded = await getProjectSegments(projectId);
    const hostSegments = reloaded.filter(segment => segment.speaker === "Host");
    const guest = reloaded.find(segment => segment.speaker === "Guest");
    expect(reloaded.map(segment => segment.speaker)).toEqual(["Host", "Guest", "Host"]);
    expect(hostSegments).toHaveLength(2);
    expect(hostSegments.every(segment => segment.status === "voiced" && segment.ttsAudioKey?.includes("speaker-regenerated.mp3-stored-"))).toBe(true);
    expect(new Set(hostSegments.map(segment => segment.ttsAudioKey)).size).toBe(2);
    expect(guest).toMatchObject({ ttsAudioKey: `original-${guest?.id}`, ttsAudioUrl: `/original-${guest?.id}.mp3`, status: "translated" });
    expect(enqueue).toHaveBeenCalledWith(projectId, "synchronizing_audio");
  });
});
