# TamilDub AI Provider Configuration

TamilDub AI stores all provider credentials in managed server-side environment settings. Do not put secret values in the browser, committed source files, client-side variables, or a public repository.

| Variable | Required | Purpose |
| --- | --- | --- |
| `TTS_PROVIDER` | Yes for real voice synthesis | Set to `elevenlabs` for the included ElevenLabs adapter, or `generic-openai` for a compatible future adapter. |
| `TTS_API_URL` | Yes | For ElevenLabs, use the official `/v1/text-to-speech/{voice_id}` endpoint. The voice identifier is part of this server-side URL. |
| `TTS_API_KEY` | Yes | Full provider secret used only by the backend. A valid ElevenLabs secret normally begins with `sk_`. |
| `TTS_MODEL` | Recommended | Use `eleven_multilingual_v2` for the currently configured ElevenLabs path. |
| `MAX_UPLOAD_BYTES` | Recommended | Maximum accepted direct-upload size. The implemented default is 200 MB. |
| `PROCESSING_EXECUTION_MODE` | Production | Use `inline` only for short local development jobs; use a durable worker dispatch mode for long production renders. |
| `RENDER_WORKER_URL` | Production | Authenticated worker endpoint that receives persisted project identifiers and pipeline start stages. |
| `RENDER_WORKER_TOKEN` | Production | Optional shared token for authenticating render-worker dispatch. |

## Included adapter contract

The ElevenLabs adapter sends server-side `POST` requests with an `xi-api-key` header and a JSON body containing `text`, `model_id`, `voice_settings`, and `output_format`. It does not send generic OpenAI `input`, `model`, or `voice` fields. Timing speed remains a segment-level post-processing responsibility, handled by the FFmpeg synchronization stage after generated audio is returned.

## Credential validation

The live Vitest credential smoke test is intentionally opt-in because it synthesizes a short audio sample against the real provider. Run it only when validating or rotating a credential:

```bash
RUN_LIVE_TTS_VALIDATION=true pnpm vitest run server/tts.secret.test.ts
```

Routine project tests skip this live request while retaining local coverage for provider-independent timing, retry, and subtitle utilities.
