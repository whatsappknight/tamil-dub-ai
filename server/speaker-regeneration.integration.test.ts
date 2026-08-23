import { beforeEach, describe, expect, it, vi } from "vitest";

const db = { getProjectForProcessing: vi.fn(), getProjectSegments: vi.fn(), updateProjectSegment: vi.fn() };
const storage = { storagePut: vi.fn() };
const tts = { synthesizeTamilVoice: vi.fn() };

vi.mock("./db", () => db);
vi.mock("./storage", () => storage);
vi.mock("./providers/tts", () => ({ synthesizeTamilVoice: tts.synthesizeTamilVoice, tamilTtsProvider: { synthesize: vi.fn() } }));

const { regenerateSpeakerAndRender } = await import("./services/pipeline");

describe("bulk speaker regeneration", () => {
  const seededSegments = [
    { id: 11, speaker: "Host", tamilText: "வணக்கம்", voiceId: "narrator", voiceStyle: "cinematic", pronunciationHint: null, speed: "1.00" },
    { id: 12, speaker: "Guest", tamilText: "நன்றி", voiceId: "female-1", voiceStyle: "friendly", pronunciationHint: null, speed: "1.00" },
    { id: 13, speaker: "Host", tamilText: "தொடரலாம்", voiceId: "narrator", voiceStyle: "cinematic", pronunciationHint: null, speed: "1.05" },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    db.getProjectForProcessing.mockResolvedValue({ voiceId: "female-1", voiceStyle: "natural", pronunciationRules: null, allowVoiceProviderFallback: true });
    db.getProjectSegments.mockResolvedValue(seededSegments.map(segment => ({ ...segment })));
    tts.synthesizeTamilVoice.mockResolvedValue({ extension: "mp3", audio: Buffer.from("voice"), contentType: "audio/mpeg" });
    storage.storagePut.mockResolvedValueOnce({ key: "host-11-refreshed", url: "/manus-storage/host-11-refreshed.mp3" }).mockResolvedValueOnce({ key: "host-13-refreshed", url: "/manus-storage/host-13-refreshed.mp3" });
    db.updateProjectSegment.mockResolvedValue(undefined);
  });

  it("replaces every matching speaker voice, leaves other speaker labels intact, and resumes synchronization", async () => {
    const queue = vi.fn();
    await regenerateSpeakerAndRender(7, "Host", queue);
    expect(tts.synthesizeTamilVoice).toHaveBeenCalledTimes(2);
    expect(db.updateProjectSegment).toHaveBeenNthCalledWith(1, 11, { ttsAudioKey: "host-11-refreshed", ttsAudioUrl: "/manus-storage/host-11-refreshed.mp3", status: "voiced" });
    expect(db.updateProjectSegment).toHaveBeenNthCalledWith(2, 13, { ttsAudioKey: "host-13-refreshed", ttsAudioUrl: "/manus-storage/host-13-refreshed.mp3", status: "voiced" });
    expect(db.updateProjectSegment).not.toHaveBeenCalledWith(12, expect.anything());
    expect((await db.getProjectSegments()).map(segment => segment.speaker)).toEqual(["Host", "Guest", "Host"]);
    expect(queue).toHaveBeenCalledWith(7, "synchronizing_audio");
  });
});
