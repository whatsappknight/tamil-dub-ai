export const EXPORT_PRESETS = {
  source: {
    label: "Source quality",
    detail: "Keeps the uploaded video dimensions and quality.",
    outputLabel: "Source MP4",
  },
  youtube: {
    label: "YouTube landscape",
    detail: "1920×1080 landscape delivery with letterboxing when needed.",
    outputLabel: "YouTube 1080p MP4",
  },
  shorts: {
    label: "Shorts / Reels",
    detail: "1080×1920 vertical delivery with centered framing.",
    outputLabel: "Vertical 1080×1920 MP4",
  },
  whatsapp: {
    label: "WhatsApp share",
    detail: "720×1280 compressed vertical delivery for quick sharing.",
    outputLabel: "WhatsApp 720×1280 MP4",
  },
} as const;

export type ExportPreset = keyof typeof EXPORT_PRESETS;

const canvasFilters: Record<Exclude<ExportPreset, "source">, string> = {
  youtube: "scale=1920:1080:force_original_aspect_ratio=decrease:flags=lanczos,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black",
  shorts: "scale=1080:1920:force_original_aspect_ratio=decrease:flags=lanczos,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black",
  whatsapp: "scale=720:1280:force_original_aspect_ratio=decrease:flags=lanczos,pad=720:1280:(ow-iw)/2:(oh-ih)/2:color=black",
};

export function buildExportRenderPlan(preset: ExportPreset, subtitleFilter?: string | null) {
  const filters = [subtitleFilter, preset === "source" ? null : canvasFilters[preset]].filter((value): value is string => Boolean(value));
  if (!filters.length) return { videoArgs: ["-c:v", "copy"], filenameSuffix: "source" };
  const crf = preset === "whatsapp" ? "24" : "21";
  return {
    videoArgs: ["-vf", filters.join(","), "-c:v", "libx264", "-crf", crf, "-preset", "medium", "-pix_fmt", "yuv420p"],
    filenameSuffix: preset,
  };
}
