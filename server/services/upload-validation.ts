const allowedExtensions = ["mp4", "mov", "mkv", "webm"] as const;
const allowedMimeTypes = ["video/mp4", "video/quicktime", "video/x-matroska", "video/webm"] as const;

export type UploadedVideoMetadata = { filename: string; mimeType: string; sizeBytes: number };

export function validateDirectVideoUpload(file: UploadedVideoMetadata, maximumBytes = Number(process.env.MAX_UPLOAD_BYTES || 209_715_200)) {
  const extension = file.filename.split(".").pop()?.toLowerCase();
  if (!extension || !allowedExtensions.includes(extension as (typeof allowedExtensions)[number])) throw new Error("Only MP4, MOV, MKV, and WebM videos can be uploaded.");
  if (!allowedMimeTypes.includes(file.mimeType as (typeof allowedMimeTypes)[number])) throw new Error("The selected file does not have a supported video MIME type.");
  if (!Number.isSafeInteger(file.sizeBytes) || file.sizeBytes <= 0) throw new Error("The selected file has an invalid size.");
  if (file.sizeBytes > maximumBytes) throw new Error(`The selected file exceeds the ${(maximumBytes / 1024 / 1024).toFixed(0)} MB upload limit.`);
}
