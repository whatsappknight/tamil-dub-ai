export const PIPELINE_STAGES = [
  "uploading",
  "extracting_audio",
  "detecting_language",
  "transcribing",
  "translating",
  "generating_voice",
  "synchronizing_audio",
  "preserving_background",
  "mixing_audio",
  "rendering_video",
  "completed",
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const RETRYABLE_STAGES: PipelineStage[] = [
  "extracting_audio",
  "detecting_language",
  "transcribing",
  "translating",
  "generating_voice",
  "synchronizing_audio",
  "preserving_background",
  "mixing_audio",
  "rendering_video",
];

export const STAGE_PROGRESS: Record<PipelineStage, number> = {
  uploading: 8,
  extracting_audio: 15,
  detecting_language: 24,
  transcribing: 36,
  translating: 52,
  generating_voice: 68,
  synchronizing_audio: 78,
  preserving_background: 84,
  mixing_audio: 89,
  rendering_video: 96,
  completed: 100,
};

export function stageAtOrAfter(stage: PipelineStage, target: PipelineStage) {
  return PIPELINE_STAGES.indexOf(stage) >= PIPELINE_STAGES.indexOf(target);
}

export function isRetryableStage(stage: PipelineStage) {
  return RETRYABLE_STAGES.includes(stage);
}
