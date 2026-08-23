import { invokeLLM } from "../_core/llm";
import type { TranslationProvider } from "./types";

type TranslationResponse = { segments: Array<{ segmentId: number; tamilText: string }> };

function responseContentToString(content: unknown) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map(item => typeof item === "string" ? item : item && typeof item === "object" && "text" in item ? String(item.text) : "").join("");
  return String(content ?? "");
}

export class BuiltInTamilTranslationProvider implements TranslationProvider {
  async translateToTamil(input: { segments: Array<{ segmentId: number; sourceText: string; targetDurationSeconds: number }>; terminologyRules?: Array<{ source: string; target: string }> }) {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: "You are an expert Tamil audiovisual localizer. Translate spoken dialogue into idiomatic, natural Tamil for Tamil-speaking viewers. Preserve meaning, speaker intent, technical terms that Tamil speakers naturally use in English, and segment order. Apply provided terminology rules exactly where relevant. Keep each line concise enough to fit its timing. Never add commentary or omit a segment." },
        { role: "user", content: JSON.stringify({ targetLanguage: "Tamil", terminologyRules: input.terminologyRules || [], segments: input.segments }) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "tamil_dubbing_translation",
          strict: true,
          schema: {
            type: "object",
            properties: { segments: { type: "array", items: { type: "object", properties: { segmentId: { type: "integer" }, tamilText: { type: "string" } }, required: ["segmentId", "tamilText"], additionalProperties: false } } },
            required: ["segments"],
            additionalProperties: false,
          },
        },
      },
    });
    const raw = responseContentToString(response.choices?.[0]?.message?.content);
    let parsed: TranslationResponse;
    try { parsed = JSON.parse(raw) as TranslationResponse; } catch { throw new Error("Translation provider returned an unreadable structured response."); }
    if (!Array.isArray(parsed.segments) || parsed.segments.length !== input.segments.length) throw new Error("Translation provider returned an incomplete segment set.");
    return parsed.segments.map(segment => ({ segmentId: Number(segment.segmentId), tamilText: String(segment.tamilText).trim() }));
  }
}

export const tamilTranslationProvider = new BuiltInTamilTranslationProvider();
