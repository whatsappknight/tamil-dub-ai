import { randomUUID } from "crypto";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { type PipelineStage, STAGE_PROGRESS, stageAtOrAfter } from "../../shared/pipeline";
import { createMediaFile, createProcessingJob, getProjectForProcessing, getProjectMediaByRole, getProjectSegments, normalizeProjectSegmentGaps, replaceProjectSegments, resetProjectSegmentVoices, updateProcessingJob, updateProject, updateProjectSegment } from "../db";
import { speechToTextProvider } from "../providers/stt";
import { tamilTranslationProvider } from "../providers/translation";
import { synthesizeTamilVoice, tamilTtsProvider } from "../providers/tts";
import { storageGetSignedUrl, storagePut } from "../storage";
import { buildSrt } from "./subtitles";
import { applyPronunciationRules, buildBurnedSubtitleFilter, parseLocalizationRules } from "./localization";
import { downloadSignedObject, duckedTamilBackgroundFilter, probeDurationSeconds, runFfmpeg, trimTamilTtsEdgeSilenceFilter, uploadLocalFileToStorage } from "./ffmpeg";

function shouldRun(start: PipelineStage, stage: PipelineStage) { return !stageAtOrAfter(start, stage) || start === stage; }
async function startStage(projectId: number, stage: PipelineStage, message: string) { const job = await createProcessingJob({ projectId, stage, message }); await updateProject(projectId, { status: "processing", currentStage: stage, progressPercent: STAGE_PROGRESS[stage], statusMessage: message, lastError: null }); return job; }
async function runStage<T>(projectId: number, stage: PipelineStage, message: string, work: () => Promise<T>) {
  const job = await startStage(projectId, stage, message);
  try { const result = await work(); await updateProcessingJob(job.id, { status: "completed", progressPercent: STAGE_PROGRESS[stage], message, completedAt: new Date() }); await updateProject(projectId, { progressPercent: STAGE_PROGRESS[stage], statusMessage: message }); return result; }
  catch (error) { const detail = error instanceof Error ? error.message : "Unexpected processing failure."; await updateProcessingJob(job.id, { status: "failed", message: detail, errorDetail: detail, completedAt: new Date() }); await updateProject(projectId, { status: "failed", currentStage: stage, statusMessage: `Failed during ${stage.replaceAll("_", " ")}.`, lastError: detail }); throw error; }
}
async function localObject(key: string, workDir: string, filename: string) { const target = path.join(workDir, filename); await downloadSignedObject(await storageGetSignedUrl(key), target); return target; }
export function needsVoiceGeneration(segment: { status: string; ttsAudioKey: string | null }) { return segment.status !== "voiced" || !segment.ttsAudioKey; }
export function closeShortDialogueGaps<T extends { startSeconds: number; endSeconds: number }>(segments: T[], maxGapSeconds = Number.POSITIVE_INFINITY) { return segments.map((segment, index) => { const next = segments[index + 1]; if (!next) return segment; const gap = next.startSeconds - segment.endSeconds; return gap > 0.05 && gap <= maxGapSeconds ? { ...segment, endSeconds: next.startSeconds } : segment; }); }
export function synchronizationProgressMessage(completedSegments: number, totalSegments: number) { return `Synchronizing Tamil speech segment ${Math.min(Math.max(completedSegments, 0), Math.max(totalSegments, 0))}/${Math.max(totalSegments, 0)}.`; }
export function voiceGenerationProgress(completedSegments: number, totalSegments: number) { const total = Math.max(totalSegments, 0); const completed = Math.min(Math.max(completedSegments, 0), total); return { progressPercent: total ? Math.round(68 + (completed / total) * 9) : 68, statusMessage: `Generating Tamil voice segment ${completed}/${total}.` }; }
export const AUTOMATIC_VOICE_RETRY_LIMIT = 3;
export function automaticVoiceRetryDelayMs(attempt: number) { return Math.min(30_000, 2_000 * 2 ** Math.max(0, attempt)); }
export function shouldAutomaticallyRetryVoiceStage(stage: PipelineStage) { return stage === "generating_voice"; }
async function extractAudio(source: string, target: string) { await runFfmpeg(["-i", source, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "24k", target]); }
async function chunkAudio(audioPath: string, workDir: string) {
  const duration = await probeDurationSeconds(audioPath);
  if (duration <= 3300) return [{ path: audioPath, offset: 0 }];
  const template = path.join(workDir, "chunk-%03d.mp3");
  await runFfmpeg(["-i", audioPath, "-f", "segment", "-segment_time", "3300", "-c", "copy", template]);
  const chunks: Array<{ path: string; offset: number }> = [];
  for (let index = 0; index * 3300 < duration; index += 1) { const candidate = path.join(workDir, `chunk-${String(index).padStart(3, "0")}.mp3`); try { await readFile(candidate); chunks.push({ path: candidate, offset: index * 3300 }); } catch { break; } }
  return chunks;
}
async function silentAudio(target: string, seconds: number) { await runFfmpeg(["-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono", "-t", Math.max(seconds, 0.02).toFixed(3), "-c:a", "pcm_s16le", target]); }
export const NATURAL_TAMIL_TEMPO_FLOOR = 0.92;
export function tamilVoiceTempoForTarget(originalSeconds: number, targetSeconds: number, speed: number) { return Math.min(2, Math.max(NATURAL_TAMIL_TEMPO_FLOOR, (originalSeconds / Math.max(targetSeconds, 0.25)) * speed)); }
export function tamilVoiceAtempoFilter(tempo: number) { let remaining = Math.min(2, Math.max(0.25, tempo)); const filters: string[] = []; while (remaining < 0.5) { filters.push("atempo=0.5"); remaining /= 0.5; } while (remaining > 2) { filters.push("atempo=2"); remaining /= 2; } filters.push(`atempo=${remaining.toFixed(3)}`); return filters.join(","); }
async function timedAudio(source: string, target: string, seconds: number, speed: number) {
  const trimmed = `${target}.trimmed.wav`;
  await runFfmpeg(["-i", source, "-af", trimTamilTtsEdgeSilenceFilter(), "-ac", "1", "-ar", "24000", "-c:a", "pcm_s16le", trimmed]);
  const original = await probeDurationSeconds(trimmed);
  const tempo = tamilVoiceTempoForTarget(original, seconds, speed);
  await runFfmpeg(["-i", trimmed, "-filter:a", `${tamilVoiceAtempoFilter(tempo)},apad=pad_dur=${Math.max(seconds, 0.25).toFixed(3)},atrim=duration=${Math.max(seconds, 0.25).toFixed(3)},aresample=24000`, "-ac", "1", "-c:a", "pcm_s16le", target]);
}
async function voiceTrack(projectId: number, duration: number, workDir: string) {
  const segments = await getProjectSegments(projectId);
  const audioPaths: string[] = []; let cursor = 0;
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index]!;
    if (!segment.ttsAudioKey) throw new Error(`Voice audio is missing for segment ${segment.id}.`);
    const start = Number(segment.startSeconds); const end = Number(segment.endSeconds);
    if (start > cursor + 0.01) { const silence = path.join(workDir, `gap-${index}.wav`); await silentAudio(silence, start - cursor); audioPaths.push(silence); }
    const source = await localObject(segment.ttsAudioKey, workDir, `segment-${segment.id}.mp3`); const normalized = path.join(workDir, `timed-${segment.id}.wav`); await timedAudio(source, normalized, end - start, Number(segment.speed)); audioPaths.push(normalized); cursor = Math.max(cursor, end); if (index === 0 || (index + 1) % 10 === 0 || index + 1 === segments.length) await updateProject(projectId, { statusMessage: synchronizationProgressMessage(index + 1, segments.length) });
  }
  if (cursor < duration) { const tail = path.join(workDir, "tail.wav"); await silentAudio(tail, duration - cursor); audioPaths.push(tail); }
  if (!audioPaths.length) throw new Error("No Tamil speech segments are available for timing synchronization.");
  const list = path.join(workDir, "voice-concat.txt"); await writeFile(list, audioPaths.map(file => `file '${file.replaceAll("'", "'\\''")}'`).join("\n"));
  const output = path.join(workDir, "tamil-voice-track.m4a"); await runFfmpeg(["-f", "concat", "-safe", "0", "-i", list, "-c:a", "aac", "-b:a", "96k", output]); return output;
}
async function saveSrt(projectId: number) {
  const segments = await getProjectSegments(projectId);
  const content = buildSrt(segments.map(segment => ({ startSeconds: Number(segment.startSeconds), endSeconds: Number(segment.endSeconds), text: segment.tamilText || "" })));
  const stored = await storagePut(`projects/${projectId}/subtitles/tamil-${randomUUID()}.srt`, content, "application/x-subrip");
  await createMediaFile({ projectId, role: "subtitle_srt", storageKey: stored.key, url: stored.url, filename: "tamil-subtitles.srt", mimeType: "application/x-subrip", sizeBytes: Buffer.byteLength(content), durationSeconds: null });
  await updateProject(projectId, { subtitleSrtKey: stored.key, subtitleSrtUrl: stored.url }); return { ...stored, content };
}

export async function runProjectPipeline(projectId: number, startFromStage: PipelineStage = "extracting_audio") {
  const project = await getProjectForProcessing(projectId); if (!project?.sourceFileKey) throw new Error("Project source video is unavailable.");
  const workDir = await mkdtemp(path.join(os.tmpdir(), `tamil-dub-${projectId}-`));
  try {
    const sourcePath = await localObject(project.sourceFileKey, workDir, `source${path.extname(project.sourceFilename || "video.mp4") || ".mp4"}`); const sourceDuration = await probeDurationSeconds(sourcePath); await updateProject(projectId, { sourceDurationSeconds: sourceDuration });
    let extractedKey = (await getProjectMediaByRole(projectId, "extracted_audio"))?.storageKey;
    if (shouldRun(startFromStage, "extracting_audio")) extractedKey = await runStage(projectId, "extracting_audio", "Extracting a transcription-ready audio track.", async () => { const audio = path.join(workDir, "source-audio.mp3"); await extractAudio(sourcePath, audio); const stored = await uploadLocalFileToStorage(audio, `projects/${projectId}/audio/source-audio.mp3`, "audio/mpeg"); await createMediaFile({ projectId, role: "extracted_audio", storageKey: stored.key, url: stored.url, filename: "source-audio.mp3", mimeType: "audio/mpeg", sizeBytes: stored.bytes, durationSeconds: sourceDuration }); return stored.key; });
    if (!extractedKey) throw new Error("Extracted audio is unavailable for transcription.");
    if (shouldRun(startFromStage, "detecting_language") || shouldRun(startFromStage, "transcribing")) {
      await runStage(projectId, "detecting_language", "Detecting the spoken language from the uploaded audio.", async () => undefined);
      await runStage(projectId, "transcribing", "Creating timestamped speech segments.", async () => { const audio = await localObject(extractedKey!, workDir, "transcription-audio.mp3"); const chunks = await chunkAudio(audio, workDir); const all = [] as Array<{ startSeconds: number; endSeconds: number; sourceText: string; speaker: string | null }>; let detected = project.originalLanguage === "auto" ? "unknown" : project.originalLanguage; for (let index = 0; index < chunks.length; index += 1) { const chunk = chunks[index]!; const stored = await uploadLocalFileToStorage(chunk.path, `projects/${projectId}/processing/transcription-${index}.mp3`, "audio/mpeg"); const result = await speechToTextProvider.transcribe({ audioUrl: await storageGetSignedUrl(stored.key), languageHint: project.originalLanguage === "auto" ? undefined : project.originalLanguage, offsetSeconds: chunk.offset }); if (detected === "unknown" && result.detectedLanguage) detected = result.detectedLanguage; all.push(...result.segments.map(segment => ({ startSeconds: segment.startSeconds, endSeconds: segment.endSeconds, sourceText: segment.text, speaker: segment.speaker ?? null }))); } if (!all.length) throw new Error("No speech was detected in the uploaded video."); await replaceProjectSegments(projectId, closeShortDialogueGaps(all), project.voiceId, project.voiceStyle); await updateProject(projectId, { detectedLanguage: detected }); });
    }
    if (shouldRun(startFromStage, "translating")) await runStage(projectId, "translating", "Translating dialogue into natural Tamil conversation with paragraph context.", async () => { await normalizeProjectSegmentGaps(projectId); const segments = await getProjectSegments(projectId); if (!segments.length) throw new Error("Transcript segments are unavailable for translation."); const terminologyRules = parseLocalizationRules(project.terminologyRules); for (let offset = 0; offset < segments.length; offset += 40) { const batch = segments.slice(offset, offset + 40); const paragraphContext = batch.map(segment => segment.sourceText).join(" "); const translations = await tamilTranslationProvider.translateToTamil({ terminologyRules, paragraphContext, segments: batch.map(segment => ({ segmentId: segment.id, sourceText: segment.sourceText, targetDurationSeconds: Number(segment.endSeconds) - Number(segment.startSeconds) })) }); for (const translation of translations) await updateProjectSegment(translation.segmentId, { tamilText: translation.tamilText, status: "translated" }); } });
    const needsVoiceRepair = !shouldRun(startFromStage, "generating_voice") && (await getProjectSegments(projectId)).some(segment => needsVoiceGeneration(segment));
    if (shouldRun(startFromStage, "generating_voice") || needsVoiceRepair) await runStage(projectId, "generating_voice", needsVoiceRepair ? "Repairing missing Tamil voice segments before synchronization." : "Generating one consistent Tamil voice across the entire video.", async () => { if (startFromStage === "generating_voice" || startFromStage === "translating") await resetProjectSegmentVoices(projectId); const segments = await getProjectSegments(projectId); const total = segments.length; let completed = segments.filter(segment => !needsVoiceGeneration(segment)).length; await updateProject(projectId, voiceGenerationProgress(completed, total)); for (const segment of segments) { if (!needsVoiceGeneration(segment)) continue; if (!segment.tamilText) throw new Error(`Tamil translation is missing for segment ${segment.id}.`); const audio = await synthesizeTamilVoice({ text: applyPronunciationRules(segment.tamilText, project.pronunciationRules, segment.pronunciationHint), voice: project.voiceId, style: project.voiceStyle, speed: Number(segment.speed) }, project.allowVoiceProviderFallback); const stored = await storagePut(`projects/${projectId}/tts/segment-${segment.id}.${audio.extension}`, audio.audio, audio.contentType); await updateProjectSegment(segment.id, { voiceId: project.voiceId, voiceStyle: project.voiceStyle, ttsAudioKey: stored.key, ttsAudioUrl: stored.url, status: "voiced" }); completed += 1; await updateProject(projectId, voiceGenerationProgress(completed, total)); } });
    let voiceKey = (await getProjectMediaByRole(projectId, "tamil_voice_track"))?.storageKey;
    if (shouldRun(startFromStage, "synchronizing_audio")) voiceKey = await runStage(projectId, "synchronizing_audio", "Synchronizing Tamil speech with the original video timing.", async () => { const track = await voiceTrack(projectId, sourceDuration, workDir); const stored = await uploadLocalFileToStorage(track, `projects/${projectId}/audio/tamil-voice-track.m4a`, "audio/mp4"); await createMediaFile({ projectId, role: "tamil_voice_track", storageKey: stored.key, url: stored.url, filename: "tamil-voice-track.m4a", mimeType: "audio/mp4", sizeBytes: stored.bytes, durationSeconds: sourceDuration }); return stored.key; });
    if (!voiceKey) throw new Error("Synchronized Tamil voice track is unavailable.");
    if (shouldRun(startFromStage, "preserving_background")) await runStage(projectId, "preserving_background", "Removing the original audio and using Tamil voice only.", async () => { await updateProject(projectId, { audioMode: "replace_original", preserveBackgroundAudio: false, preserveSoundEffects: false }); });
    let mixedKey = (await getProjectMediaByRole(projectId, "mixed_audio"))?.storageKey;
    if (shouldRun(startFromStage, "mixing_audio")) mixedKey = await runStage(projectId, "mixing_audio", "Replacing the original audio with the synchronized Tamil voice only.", async () => { const voice = await localObject(voiceKey!, workDir, "voice-track.m4a"); const output = path.join(workDir, "final-mix.m4a"); await runFfmpeg(["-i", voice, "-c:a", "aac", "-b:a", "128k", "-t", sourceDuration.toFixed(3), output]); const stored = await uploadLocalFileToStorage(output, `projects/${projectId}/audio/final-mix.m4a`, "audio/mp4"); await createMediaFile({ projectId, role: "mixed_audio", storageKey: stored.key, url: stored.url, filename: "final-mix.m4a", mimeType: "audio/mp4", sizeBytes: stored.bytes, durationSeconds: sourceDuration }); return stored.key; });
    if (!mixedKey) throw new Error("Final Tamil audio mix is unavailable.");
    const subtitle = project.generateSubtitles || project.burnSubtitles || project.createSrt ? await saveSrt(projectId) : null;
    if (shouldRun(startFromStage, "rendering_video")) await runStage(projectId, "rendering_video", "Rendering the final Tamil-dubbed MP4.", async () => { const audio = await localObject(mixedKey!, workDir, "mixed-track.m4a"); const output = path.join(workDir, "tamil-dubbed.mp4"); const args = ["-i", sourcePath, "-i", audio, "-map", "0:v:0", "-map", "1:a:0"]; if (project.burnSubtitles && subtitle) { const srtPath = path.join(workDir, "tamil-subtitles.srt"); await writeFile(srtPath, subtitle.content); args.push("-vf", buildBurnedSubtitleFilter(srtPath, project.subtitleStyle), "-c:v", "libx264", "-crf", "19", "-preset", "medium"); } else args.push("-c:v", "copy"); args.push("-c:a", "aac", "-b:a", "128k", "-t", sourceDuration.toFixed(3), "-movflags", "+faststart", output); await runFfmpeg(args); const stored = await uploadLocalFileToStorage(output, `projects/${projectId}/output/tamil-dubbed.mp4`, "video/mp4"); await createMediaFile({ projectId, role: "final_video", storageKey: stored.key, url: stored.url, filename: "tamil-dubbed.mp4", mimeType: "video/mp4", sizeBytes: stored.bytes, durationSeconds: sourceDuration }); const thumbnailPath = path.join(workDir, "thumbnail.jpg"); await runFfmpeg(["-ss", Math.min(1, Math.max(0, sourceDuration / 2)).toFixed(2), "-i", sourcePath, "-frames:v", "1", "-q:v", "3", thumbnailPath]); const thumbnail = await uploadLocalFileToStorage(thumbnailPath, `projects/${projectId}/output/thumbnail.jpg`, "image/jpeg"); await createMediaFile({ projectId, role: "thumbnail", storageKey: stored.key, url: stored.url, filename: "tamil-thumbnail.jpg", mimeType: "image/jpeg", sizeBytes: thumbnail.bytes, durationSeconds: null }); await updateProject(projectId, { finalVideoKey: stored.key, finalVideoUrl: stored.url, thumbnailUrl: thumbnail.url, outputDurationSeconds: sourceDuration }); });
    const job = await startStage(projectId, "completed", "Tamil-dubbed video is ready to preview and download."); await updateProcessingJob(job.id, { status: "completed", progressPercent: 100, completedAt: new Date() }); await updateProject(projectId, { status: "completed", currentStage: "completed", progressPercent: 100, completedAt: new Date() });
  } finally { await rm(workDir, { recursive: true, force: true }); }
}

function scheduleAutomaticVoiceRetry(projectId: number, stage: PipelineStage, attempt: number) { const delay = automaticVoiceRetryDelayMs(attempt); void updateProject(projectId, { status: "queued", currentStage: stage, progressPercent: STAGE_PROGRESS[stage], statusMessage: `Provider keys exhausted. Automatic retry ${attempt + 1}/${AUTOMATIC_VOICE_RETRY_LIMIT} in ${Math.ceil(delay / 1000)} seconds.`, lastError: null }); setTimeout(() => { void runProjectPipelineWithAutomaticRetry(projectId, stage, attempt + 1); }, delay); }
async function runProjectPipelineWithAutomaticRetry(projectId: number, stage: PipelineStage, attempt = 0) { try { await runProjectPipeline(projectId, stage); } catch (error) { if (shouldAutomaticallyRetryVoiceStage(stage) && attempt < AUTOMATIC_VOICE_RETRY_LIMIT) scheduleAutomaticVoiceRetry(projectId, stage, attempt); } }
export function enqueueProjectPipeline(projectId: number, stage: PipelineStage = "extracting_audio") { if (process.env.PROCESSING_EXECUTION_MODE === "worker" && process.env.RENDER_WORKER_URL) { void fetch(process.env.RENDER_WORKER_URL, { method: "POST", headers: { "Content-Type": "application/json", ...(process.env.RENDER_WORKER_TOKEN ? { Authorization: `Bearer ${process.env.RENDER_WORKER_TOKEN}` } : {}) }, body: JSON.stringify({ projectId, startStage: stage }) }).catch(async error => { await updateProject(projectId, { status: "failed", lastError: `Unable to dispatch render worker: ${error.message}` }); }); return; } void runProjectPipelineWithAutomaticRetry(projectId, stage); }
export async function regenerateOneSegmentAndRender(projectId: number, segmentId: number) { const project = await getProjectForProcessing(projectId); const segment = (await getProjectSegments(projectId)).find(item => item.id === segmentId); if (!project || !segment?.tamilText) throw new Error("The selected translated segment is unavailable."); const audio = await tamilTtsProvider.synthesize({ text: segment.tamilText, voice: project.voiceId, style: project.voiceStyle, speed: Number(segment.speed) }); const stored = await storagePut(`projects/${projectId}/tts/segment-${segment.id}-regenerated.${audio.extension}`, audio.audio, audio.contentType); await updateProjectSegment(segment.id, { voiceId: project.voiceId, voiceStyle: project.voiceStyle, ttsAudioKey: stored.key, ttsAudioUrl: stored.url, status: "voiced" }); enqueueProjectPipeline(projectId, "synchronizing_audio"); }

/** Best-effort source inspection is intentionally separate from the render pipeline so users can configure their project immediately after upload. */
export async function inspectProjectSourceMedia(projectId: number) {
  const project = await getProjectForProcessing(projectId);
  if (!project?.sourceFileKey) throw new Error("Project source video is unavailable for inspection.");
  const existingThumbnail = await getProjectMediaByRole(projectId, "source_thumbnail");
  if (project.sourceDurationSeconds && existingThumbnail?.url) return;
  const workDir = await mkdtemp(path.join(os.tmpdir(), `tamil-inspect-${projectId}-`));
  try {
    await updateProject(projectId, { statusMessage: "Inspecting video duration and preparing its thumbnail." });
    const sourcePath = await localObject(project.sourceFileKey, workDir, `source${path.extname(project.sourceFilename || "video.mp4") || ".mp4"}`);
    const duration = await probeDurationSeconds(sourcePath);
    const thumbnailPath = path.join(workDir, "source-thumbnail.jpg");
    await runFfmpeg(["-ss", Math.min(1, Math.max(0, duration / 2)).toFixed(2), "-i", sourcePath, "-frames:v", "1", "-q:v", "3", thumbnailPath]);
    const thumbnail = await uploadLocalFileToStorage(thumbnailPath, `projects/${projectId}/source/thumbnail.jpg`, "image/jpeg");
    await createMediaFile({ projectId, role: "source_thumbnail", storageKey: thumbnail.key, url: thumbnail.url, filename: "source-thumbnail.jpg", mimeType: "image/jpeg", sizeBytes: thumbnail.bytes, durationSeconds: null });
    await updateProject(projectId, { sourceDurationSeconds: duration, thumbnailUrl: thumbnail.url, statusMessage: "Video uploaded. Configure and start Tamil dubbing." });
  } finally { await rm(workDir, { recursive: true, force: true }); }
}
