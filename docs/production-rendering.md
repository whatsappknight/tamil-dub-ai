# TamilDub AI Rendering Architecture

TamilDub AI keeps source videos, extracted audio, generated segment audio, subtitle files, thumbnails, and rendered MP4 outputs in object storage. The database stores only their storage keys, safe application URLs, metadata, pipeline state, error information, and timestamped textual segments. The browser uploads directly to a short-lived, project-scoped storage URL issued by the authenticated server. This avoids routing large video bytes through the application database or treating external platforms as a source of content.

The application server runs the authenticated dashboard, validation, provider selection, project APIs, storage-url issuance, metadata persistence, and status retrieval. The processing module uses explicit interfaces for timestamped speech-to-text, Tamil translation, Tamil text-to-speech, and media rendering. Its built-in implementations use timestamped transcription and a structured translation call, while the TTS adapter is intentionally configured through environment variables so a provider can be replaced without changing UI or data-model code.

## Development and production rendering modes

| Mode | Intended use | Behavior | Important limit |
| --- | --- | --- | --- |
| `inline` | Local development and short controlled test videos | Starts the persisted stage pipeline in the application process after a project is queued. | An autoscaling request container is not reliable for long work and has strict CPU, memory, temporary-disk, and request-time budgets. |
| Durable FFmpeg worker | Production, longer uploads, retries, and concurrent renders | A separately managed FFmpeg-capable worker consumes the persisted project/job state and writes updates to the same database and storage. | The worker must retain access to the same database, storage credentials, and configured providers. |

The included container installs FFmpeg and Tamil-capable Noto fonts. It is suitable for short, request-bound rendering tests. For production use, run long renders in a durable worker environment with bounded concurrency, streamed downloads/uploads, object-storage lifecycle controls, and a retry policy that starts from the failed persisted stage. Do not depend on an in-process detached task in an autoscaling web container for a long MP4 render.

## Pipeline and failure handling

The persisted stages are extraction, language detection, transcription, Tamil translation, voice generation, timing synchronization, background-audio fallback or preservation, audio mixing, and MP4 rendering. Each stage creates a job record with a message, progress percentage, timestamps, attempt number, and error detail. Retrying reuses durable inputs such as source media, transcript segments, translations, generated audio, and subtitle files whenever the selected failed stage permits it.

When a configured speech/background separation adapter is unavailable or fails, the pipeline records the **replace-original-audio** fallback and continues with the Tamil voice track. The interface never claims that background music or effects were preserved unless a separation capability is configured and completes successfully.
