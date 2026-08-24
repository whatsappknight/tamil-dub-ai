import { createHmac } from "crypto";
import { describe, expect, it } from "vitest";
import { createMurfDubJob, murfWebhookSecret, verifyMurfWebhookSignature } from "./services/murfDub";

describe("Murf Dub integration", () => {
  it("submits a Tamil managed-dub request with the documented server-only API header and multipart fields", async () => {
    let capturedUrl = "";
    let capturedHeaders: Headers | undefined;
    let form: FormData | undefined;
    const result = await createMurfDubJob({ fileUrl: "https://provider.example/source.mp4", fileName: "authorized-source.mp4" }, { apiKey: "test-key" }, async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      form = init?.body as FormData;
      return Response.json({ job_id: "murf-job-1" });
    });
    expect(capturedUrl).toBe("https://api.murf.ai/v1/murfdub/jobs/create");
    expect(capturedHeaders?.get("api-key")).toBe("test-key");
    expect(form?.get("file_url")).toBe("https://provider.example/source.mp4");
    expect(form?.get("file_name")).toBe("authorized-source.mp4");
    expect(form?.get("target_locales")).toBe("ta_IN");
    expect(result.job_id).toBe("murf-job-1");
  });

  it("accepts only a timely, valid Murf HMAC signature", () => {
    const now = 1_700_000_000_000;
    const payload = JSON.stringify({ eventName: "DUB_JOB", data: { job_id: "murf-job-1", status: "COMPLETED" } });
    const timestamp = String(now);
    const secret = murfWebhookSecret(240001, "test-signing-key");
    const signature = createHmac("sha256", secret).update(`${payload}.${timestamp}`).digest("hex");
    expect(verifyMurfWebhookSignature({ payload, timestamp, signature, secret, now })).toBe(true);
    expect(verifyMurfWebhookSignature({ payload, timestamp: String(now - 301_000), signature, secret, now })).toBe(false);
  });
});
