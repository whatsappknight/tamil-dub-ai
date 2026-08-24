import { describe, expect, it } from "vitest";

const LIVE_VALIDATION_ENABLED = process.env.RUN_LIVE_MURF_DUB_VALIDATION === "true";

describe.skipIf(!LIVE_VALIDATION_ENABLED)("Murf Dub live credential validation", () => {
  it("authenticates against the destination-language endpoint without logging the API key", async () => {
    const apiKey = process.env.MURF_DUB_API_KEY;
    expect(apiKey, "MURF_DUB_API_KEY must be configured in managed secrets").toBeTruthy();

    const response = await fetch("https://api.murf.ai/v1/murfdub/list-destination-languages", {
      headers: { "api-key": apiKey! },
      signal: AbortSignal.timeout(15_000),
    });

    expect(response.status).toBe(200);
    const payload = await response.json() as unknown;
    expect(JSON.stringify(payload)).toMatch(/ta_IN/);
  }, 20_000);
});
