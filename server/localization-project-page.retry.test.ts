import { readFile } from "fs/promises";
import path from "path";
import { describe, expect, it } from "vitest";

describe("Localization project retry control", () => {
  it("uses an explicit button action that dispatches the protected retry mutation and exposes progress feedback", async () => {
    const page = await readFile(path.resolve(import.meta.dirname, "../client/src/pages/LocalizationProjectPage.tsx"), "utf8");

    expect(page).toContain('data-testid="retry-failed-stage"');
    expect(page).toContain('type="button"');
    expect(page).toContain("onClick={retryFailedStage}");
    expect(page).toContain("retry.mutate({ projectId })");
    expect(page).toContain("disabled={retry.isPending}");
    expect(page).toContain('aria-live="polite"');
  });
});
