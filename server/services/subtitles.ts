export type SubtitleSegment = { startSeconds: number; endSeconds: number; text: string };

function formatTimestamp(seconds: number) {
  const totalMilliseconds = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(totalMilliseconds / 3_600_000);
  const minutes = Math.floor((totalMilliseconds % 3_600_000) / 60_000);
  const remainingSeconds = Math.floor((totalMilliseconds % 60_000) / 1000);
  const milliseconds = totalMilliseconds % 1000;
  return [hours, minutes, remainingSeconds].map(value => String(value).padStart(2, "0")).join(":") + `,${String(milliseconds).padStart(3, "0")}`;
}

export function buildSrt(segments: SubtitleSegment[]) {
  return segments.filter(segment => segment.text.trim().length > 0 && segment.endSeconds > segment.startSeconds).map((segment, index) => `${index + 1}\n${formatTimestamp(segment.startSeconds)} --> ${formatTimestamp(segment.endSeconds)}\n${segment.text.trim()}\n`).join("\n");
}
