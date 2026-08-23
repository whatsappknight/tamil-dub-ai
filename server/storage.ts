// Preconfigured storage helpers for Manus WebDev templates
// Uploads via Forge Server presigned URL to S3 (PUT direct).
// Downloads return /manus-storage/{key} paths served via 307 redirect.

import { ENV } from "./_core/env";

function getForgeConfig() {
  const forgeUrl = ENV.forgeApiUrl;
  const forgeKey = ENV.forgeApiKey;

  if (!forgeUrl || !forgeKey) {
    throw new Error(
      "Storage config missing: set BUILT_IN_FORGE_API_URL and BUILT_IN_FORGE_API_KEY",
    );
  }

  return { forgeUrl: forgeUrl.replace(/\/+$/, ""), forgeKey };
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function appendHashSuffix(relKey: string): string {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  const { forgeUrl, forgeKey } = getForgeConfig();
  const key = appendHashSuffix(normalizeKey(relKey));

  // 1. Get presigned PUT URL from Forge
  const presignUrl = new URL("v1/storage/presign/put", forgeUrl + "/");
  presignUrl.searchParams.set("path", key);

  const presignResp = await fetch(presignUrl, {
    headers: { Authorization: `Bearer ${forgeKey}` },
  });

  if (!presignResp.ok) {
    const msg = await presignResp.text().catch(() => presignResp.statusText);
    throw new Error(`Storage presign failed (${presignResp.status}): ${msg}`);
  }

  const { url: s3Url } = (await presignResp.json()) as { url: string };
  if (!s3Url) throw new Error("Forge returned empty presign URL");

  // 2. PUT a known-length binary body directly to S3. This avoids chunked transfer
  // semantics that some presigned object-storage endpoints reject for processing output.
  const bytes = typeof data === "string" ? Buffer.from(data) : Buffer.from(data);

  const uploadResp = await fetch(s3Url, {
    method: "PUT",
    headers: { "Content-Type": contentType, "Content-Length": String(bytes.byteLength) },
    body: bytes,
  });

  if (!uploadResp.ok) {
    const detail = await uploadResp.text().catch(() => uploadResp.statusText);
    throw new Error(`Storage upload to S3 failed (${uploadResp.status}): ${detail.slice(0, 300)}`);
  }

  return { key, url: `/manus-storage/${key}` };
}

/** Issues a one-time object-storage upload URL so large video bytes bypass the database and application memory. */
export async function storageCreatePresignedUpload(
  relKey: string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string; uploadUrl: string }> {
  const key = appendHashSuffix(normalizeKey(relKey));
  return storageCreatePresignedUploadForKey(key, contentType);
}

/** Issues a short-lived upload URL for an already-authorized object key. Use only after server-side project ownership checks. */
export async function storageCreatePresignedUploadForKey(
  relKey: string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string; uploadUrl: string }> {
  const { forgeUrl, forgeKey } = getForgeConfig();
  const key = normalizeKey(relKey);
  const presignUrl = new URL("v1/storage/presign/put", forgeUrl + "/");
  presignUrl.searchParams.set("path", key);
  const response = await fetch(presignUrl, { headers: { Authorization: `Bearer ${forgeKey}` } });
  if (!response.ok) {
    const detail = await response.text().catch(() => response.statusText);
    throw new Error(`Storage upload URL request failed (${response.status}): ${detail}`);
  }
  const payload = await response.json() as { url?: string };
  if (!payload.url) throw new Error("Storage service returned an empty upload URL.");
  return { key, url: `/manus-storage/${key}`, uploadUrl: payload.url };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  return { key, url: `/manus-storage/${key}` };
}

export async function storageGetSignedUrl(relKey: string): Promise<string> {
  const { forgeUrl, forgeKey } = getForgeConfig();
  const key = normalizeKey(relKey);

  const getUrl = new URL("v1/storage/presign/get", forgeUrl + "/");
  getUrl.searchParams.set("path", key);

  const resp = await fetch(getUrl, {
    headers: { Authorization: `Bearer ${forgeKey}` },
  });

  if (!resp.ok) {
    const msg = await resp.text().catch(() => resp.statusText);
    throw new Error(`Storage signed URL failed (${resp.status}): ${msg}`);
  }

  const { url } = (await resp.json()) as { url: string };
  return url;
}
