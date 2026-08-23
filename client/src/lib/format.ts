export function formatDuration(seconds?: number | null) {
  if (!seconds || !Number.isFinite(seconds)) return "—";
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remaining = total % 60;
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}` : `${minutes}:${String(remaining).padStart(2, "0")}`;
}

export function formatBytes(bytes?: number | null) {
  if (!bytes || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, exponent)).toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

export function formatDate(value?: Date | string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function stageLabel(stage?: string | null) {
  if (!stage) return "Waiting";
  return stage.replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase());
}
