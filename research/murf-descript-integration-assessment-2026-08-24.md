# Murf AI and Descript Integration Assessment for TamilDub AI

**Date:** 24 August 2026  
**Prepared by:** Manus AI

## Conclusion

Both platforms can produce Tamil-dubbed media, but they fit TamilDub AI differently. **Murf Dub is the stronger candidate for a future automated-provider integration** because it offers a dedicated dubbing automation API with job creation, status polling or webhooks, final video download, SRT download, and a persistent-project mode for review and revisions. **Descript can also automate translate-and-dub workflows through its public API, but it is currently marked Early Access and relies on an AI editing agent**, which makes it less deterministic for a production default provider.

TamilDub AI should retain its existing in-house pipeline and Google AI Studio Tamil voice configuration. The best next addition is an **optional Murf provider**, not a replacement. A user could choose either the current detailed TamilDub workflow or a managed Murf Dub workflow for supported content. Descript is better considered a later, opt-in review/editing integration after a small proof-of-concept validates its Agent behavior and output consistency.

## Confirmed platform capabilities

| Capability | Murf AI | Descript |
|---|---|---|
| Tamil dubbing | Tamil is listed as a destination locale (`ta_IN`) in Murf Dub Automation. | Tamil is listed among supported stock-voice dubbing languages. |
| End-to-end video dubbing API | Yes. Dedicated dubbing-job API, asynchronous status, webhooks, final video link, and SRT link. | Yes, through media import plus an Agent instruction to translate/dub, then a separate publish job. |
| Edit/retry after generation | Yes, in persistent project mode; transient jobs are not editable and expire after 72 hours. | Yes in Descript’s editor; corrections to translated compositions are documented for Business and Enterprise drives. |
| Direct fit with TamilDub AI’s segment editor | Moderate. Murf owns its whole managed dubbing result; its project review tools are provider-side. | Low to moderate. Descript creates compositions and uses an agent rather than exposing a segment-level TTS provider contract. |
| Current implementation maturity | Purpose-built dubbing API. | Public API is explicitly Early Access and has documented reliability/feature limitations. |

## Murf AI: recommended future provider

Murf’s **Dubbing Automation API** is designed to receive a media file or a provider-accessible URL, create an asynchronous dubbing job, and report completion through polling or a signed webhook. Completion includes a dubbed-file download URL and an SRT URL. The API also supports a persistent-project option, which permits editing, re-synthesis, quality checks, and re-downloads; transient API-only dubs expire after 72 hours and cannot be edited. [1]

Tamil is explicitly shown as an automated dubbing destination language (`ta_IN`), and the product also advertises Tamil target-language dubbing. [1] [2] Murf’s separate Tamil text-to-speech service supports Tamil voices and returns audio such as MP3 or WAV, so it could alternatively be added as another per-segment TTS adapter to the current TamilDub pipeline. [3]

> **Recommended use of Murf:** add it as a managed, whole-video dubbing option. Keep the current pipeline as the default when users need TamilDub AI’s local transcript editing, speaker assignments, generated-audio reuse, timing repair, waveform controls, and final rendering under our own control.

### Proposed Murf workflow

1. TamilDub AI keeps its direct-upload and copyright-confirmation requirements.
2. The server sends the authorized upload to Murf via multipart upload or a short-lived, provider-readable URL. A public YouTube import must not be added.
3. The server creates a Murf Dub job targeting `ta_IN`, stores only its job/project identifiers and provider status, and receives a status callback through a signed webhook.
4. When complete, the server downloads the final MP4 and SRT into TamilDub AI storage, then exposes the existing preview and download controls.
5. If editable results are required, create Murf’s persistent-project job type and expose a safe “Open provider review” link rather than claiming that our local segment editor controls Murf’s generated assets.

Murf requires a **separate Murf Dub API key** for the dedicated dubbing API; it is not the same key used for its other services. API keys must remain server-side in managed secrets. [1]

### Murf limits and cost considerations

The documented Dub API free plan allows up to five concurrent jobs, videos up to one hour, up to 1080p output, and applies a watermark. Pay-as-you-go retains the listed five-job concurrency and removes the watermark; enterprise plans can provide higher concurrency. [1] Murf markets 100 free dubbing minutes for initial testing, but this should be treated as a trial and confirmed in the account before relying on it for user-facing production. [2]

For Tamil TTS only, Murf documents a free API trial of 100,000 characters. Its pay-as-you-go TTS API rate is listed as $0.03 per 1,000 characters with a $2 minimum purchase; its plan also raises the listed concurrency and rate limit. Those TTS figures are **not** the same as a quote for managed video dubbing. [4]

## Descript: viable, but do not make it the default now

Descript supports Tamil dubbing using stock voices. Its translate-and-dub workflow creates a new translated composition with a new voiceover; it can use timing-matched translation, and it can regenerate dubbed audio after translation edits. [5] [6]

Descript’s public API can import media, call its Underlord editing agent, monitor asynchronous jobs, and publish a composition to a public share URL plus a time-limited downloadable media URL. The product page says that workflows the Underlord can do—including translate and dub—can be automated via the API. [7] [8]

However, this is not the same type of integration as a deterministic text-to-speech endpoint. The application would ask an AI agent to act on a project using a prompt such as: “Translate this composition into Tamil, create a Tamil dubbed voiceover, match timing, retain captions, and publish the finished composition.” The provider, not TamilDub AI, decides the detailed operations inside that job.

Descript labels its API **Early Access** and documents known issues, including occasional Agent-job connection failures, agent responses that may return successful while actions continue processing, limited project import behavior, and no explicit transcription-language selection. [9] These constraints make it unsuitable as TamilDub AI’s primary automated engine today.

Tamil is supported for stock-voice dubbing, but the documented “Recommended voices” for Business and Enterprise dubbing do not list Tamil. It is therefore important to run a quality trial using real Tamil dialogue before offering it as a premium output option. [5]

### Descript account, usage, and output constraints

Descript API access is available to paying users and uses the Media minutes and AI Credits in the connected Descript Drive. API tokens are scoped to a specific Drive and must be protected as server-only credentials. [7] [8]

Every imported video consumes Media minutes, while AI features—including the editing agent and AI speech—consume AI Credits. Both allocations reset monthly rather than carrying forward. [10] Published media is delivered with a time-limited direct download link, so TamilDub AI would need to import completed media into its own storage before the link expires. [8]

## Recommendation and decision

| Decision | Recommendation | Reason |
|---|---|---|
| Use Murf now? | **Yes, as the next provider to evaluate and optionally integrate.** | It has a purpose-built dubbing API with job status, webhook support, MP4/SRT outputs, Tamil target locale, and a persistent editing option. |
| Use Descript now? | **Not as the default engine.** | It supports Tamil dubbing and an API workflow, but its agent-led approach and Early Access constraints add operational uncertainty. |
| Replace current Google AI Studio pipeline? | **No.** | The current pipeline already preserves segment editing, timing control, speaker/voice settings, local rendering, and repaired no-stall audio synchronization. |
| Add billing UI to TamilDub AI? | **No.** | Provider subscription, billing, and API-credit management remain in the respective Murf or Descript account. TamilDub AI should only show safe provider availability/errors. |

## Safe implementation scope if Murf is approved

If the owner chooses Murf, the first implementation should be a contained **Murf Dub provider integration** with a feature flag. It should add a managed secret such as `MURF_DUB_API_KEY`, a provider adapter that creates/polls/verifies Murf jobs, an authenticated webhook endpoint, and stored provider-job metadata. It should preserve direct uploads, copyright confirmation, authenticated access, server-side credentials, and import of final results into TamilDub AI storage.

Before enabling the feature for users, run one short authorized MP4 through the provider, confirm Tamil language quality, inspect synchronization, test the SRT/MP4 ingestion path, verify a webhook signature, and confirm the provider plan’s actual credit and watermark rules. This requires a Murf Dub account/API key, but it does **not** require a new billing or payment flow inside TamilDub AI.

## Implementation references verified after assessment

Murf’s official job API accepts a multipart `POST` to `https://api.murf.ai/v1/murfdub/jobs/create` with an `api-key` header, a provider-readable `file_url` or uploaded file, the target locale list, and optional `webhook_url` / `webhook_secret`. Status is available at `GET /v1/murfdub/jobs/{job_id}/status`; a completed Tamil entry can include temporary MP4 and SRT download URLs. [11] [12]

Murf’s documented webhook sends `X-Signature-Timestamp` and `X-HMAC-Signature` headers. The receiving service must calculate a SHA-256 HMAC over `<raw payload>.<timestamp>` with the secret originally supplied for that job, compare it in constant time, and reject old timestamps to prevent replay. [13]

[11]: https://murf.ai/api/docs/api-reference/dubbing/jobs/create "Murf Dub job creation API"
[12]: https://murf.ai/api/docs/api-reference/dubbing/jobs/get-status "Murf Dub job status API"
[13]: https://murf.ai/api/docs/capabilities/dubbing/webhooks "Murf Dub webhooks"

## References

[1]: https://murf.ai/api/docs/capabilities/dubbing "Murf Dub Automation API documentation"
[2]: https://murf.ai/ai-dubbing "Murf AI Dubbing overview"
[3]: https://murf.ai/text-to-speech/tamil "Murf Tamil Text to Speech"
[4]: https://help.murf.ai/murf-api-plans-and-limits "Murf API plans and limits"
[5]: https://help.descript.com/repurpose/dubbing "Descript: Dub speech to add translated voiceover"
[6]: https://help.descript.com/repurpose/translate-overview "Descript: Translate and dub speech overview"
[7]: https://www.descript.com/api "Descript public API overview"
[8]: https://docs.descriptapi.com/ "Descript API documentation"
[9]: https://descript.notion.site/descript-apis-known-issues "Descript API Early Access known issues"
[10]: https://help.descript.com/billing-payments-plans/track-and-understand-your-media-minutes-and-ai-credits "Descript media minutes and AI credits"
