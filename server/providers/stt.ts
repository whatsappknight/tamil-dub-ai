import { transcribeAudio } from "../_core/voiceTranscription";
import type { SpeechToTextProvider } from "./types";

export const DEFAULT_SPEAKER_LABEL = "Speaker 1";

export class BuiltInWhisperSpeechToTextProvider implements SpeechToTextProvider {
  async transcribe(input: { audioUrl: string; languageHint?: string; offsetSeconds?: number }) {
    const result = await transcribeAudio({
      audioUrl: input.audioUrl,
      language: input.languageHint,
      prompt: "Transcribe spoken dialogue accurately with sentence-level timing.",
    });
    if ("error" in result) throw new Error(`Speech-to-text provider failed: ${result.error}`);
    const offset = input.offsetSeconds ?? 0;
    return {
      detectedLanguage: result.language || "unknown",
      segments: (result.segments ?? []).map(segment => ({
        startSeconds: Number(segment.start ?? 0) + offset,
        endSeconds: Number(segment.end ?? 0) + offset,
        text: String(segment.text ?? "").trim(),
        speaker: DEFAULT_SPEAKER_LABEL,
      })).filter(segment => segment.text.length > 0),
    };
  }
}

export const speechToTextProvider = new BuiltInWhisperSpeechToTextProvider();
