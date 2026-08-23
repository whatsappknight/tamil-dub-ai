import { describe, expect, it } from "vitest";
import { DEFAULT_SPEAKER_LABEL } from "./providers/stt";
import { selectSpeakerSegments } from "./services/pipeline";

describe("speaker workflow helpers", () => {
  it("uses a consistent manual label when diarization is unavailable", () => {
    expect(DEFAULT_SPEAKER_LABEL).toBe("Speaker 1");
  });

  it("selects every and only the dialogue segments affected by a speaker profile update", () => {
    const segments = [{ id: 1, speaker: "Host" }, { id: 2, speaker: "Guest" }, { id: 3, speaker: "Host" }, { id: 4, speaker: null }];
    expect(selectSpeakerSegments(segments, "Host").map(segment => segment.id)).toEqual([1, 3]);
  });
});
