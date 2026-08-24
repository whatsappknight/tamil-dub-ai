# Local Tamil TTS for Long Video Dubbing

## Purpose

This guide explains how to generate Tamil narration on **your own Windows computer** without Google AI Studio, provider API keys, daily TTS quotas, or per-minute voice charges. The recommended starting model is **AI4Bharat Indic Parler-TTS**. It supports Tamil, offers selectable voices and style control, and is released under the Apache-2.0 license. [1]

> Local generation removes external API limits. It does **not** make compute unlimited: rendering speed is limited by your computer’s GPU, RAM, disk space, and electricity.

## Recommended choice

| Model | Use it when | Tamil voice approach | License | Recommendation |
|---|---|---|---|---|
| **Indic Parler-TTS** | You need a consistent named Tamil voice plus style, pace, and emotion controls. | Select a built-in Tamil voice such as **Jaya** or **Kavitha**, then keep the exact same description for every segment. | Apache-2.0 | **Start here**. |
| **IndicF5** | You have a legally permitted reference voice recording and want that voice’s characteristics. | Provide Tamil text, reference audio, and the reference transcript. | MIT | Use later for consented voice cloning. |
| **Indic-TTS** | You need an older, simpler baseline and accept less expressive control. | Use its supplied Tamil FastPitch/HiFi-GAN checkpoints. | MIT | Fallback only. |

AI4Bharat states that Indic Parler-TTS officially supports Tamil, includes Tamil speakers such as **Kavitha** and **Jaya**, and supports emotion-specific prompts for Tamil. [1] IndicF5 also supports Tamil, but it requires reference audio and its transcript; its model card requires explicit permission before cloning a voice. [2]

## Computer requirements

| Hardware | Minimum for testing | Recommended for 10–30 minute video voiceovers |
|---|---|---|
| Operating system | Windows 11 with WSL2 Ubuntu, or Ubuntu Linux | Windows 11 + WSL2 Ubuntu, or Ubuntu Linux |
| GPU | CPU can test, but it is slow | NVIDIA GPU with **12 GB+ VRAM** |
| System RAM | 16 GB | **32 GB** |
| Free SSD space | 30 GB | **100 GB+** for models, temporary WAVs, and video renders |
| Python | 3.10 or 3.11 | 3.10 or 3.11 |

The recommendation above is an engineering target, not an AI4Bharat guarantee. Indic Parler-TTS is a 0.9B-parameter model, so a CUDA-capable NVIDIA GPU is strongly preferred for long narration. [1]

## Before you install

1. Use only a computer you control and keep it powered on while it generates voice segments.
2. If you use Windows, install WSL2 and Ubuntu first. Run the remaining commands inside the Ubuntu terminal.
3. Create a free Hugging Face account, open the **Indic Parler-TTS** model page, and accept its access conditions before downloading the model. The model files are gated even though the model is open-source. [1]
4. Use only voice material you own or have documented permission to use. Do not use IndicF5 to imitate another person without explicit permission. [2]

## Install Indic Parler-TTS locally

Open Ubuntu/WSL2, then run the following commands one at a time:

```bash
sudo apt update
sudo apt install -y ffmpeg python3-venv libsndfile1

mkdir -p ~/local-tamil-tts
cd ~/local-tamil-tts

python3 -m venv .venv
source .venv/bin/activate

python -m pip install --upgrade pip
pip install torch transformers accelerate soundfile sentencepiece
pip install git+https://github.com/huggingface/parler-tts.git
```

If Hugging Face asks for permission, accept the model’s conditions in the browser first. Then authenticate locally only if the download command asks you to do so:

```bash
pip install huggingface_hub
huggingface-cli login
```

Do not paste the Hugging Face access token into TamilDub AI or into a public chat. It belongs only on your own computer.

## Generate one Tamil voice test

Create a file named `generate_tamil.py` with the following content:

```python
import torch
import soundfile as sf
from parler_tts import ParlerTTSForConditionalGeneration
from transformers import AutoTokenizer

MODEL = "ai4bharat/indic-parler-tts"
DEVICE = "cuda:0" if torch.cuda.is_available() else "cpu"

model = ParlerTTSForConditionalGeneration.from_pretrained(MODEL).to(DEVICE)
tokenizer = AutoTokenizer.from_pretrained(MODEL)
description_tokenizer = AutoTokenizer.from_pretrained(model.config.text_encoder._name_or_path)

# Keep this exact description for every segment in one video.
voice_style = (
    "Jaya speaks Tamil in a clear, natural and moderately paced narration. "
    "The recording is clean, close and expressive, with no background noise."
)
tamil_text = "வணக்கம். இது உள்ளூர் கணினியில் உருவாக்கப்பட்ட தமிழ் குரல் சோதனை."

description = description_tokenizer(voice_style, return_tensors="pt").to(DEVICE)
prompt = tokenizer(tamil_text, return_tensors="pt").to(DEVICE)

with torch.inference_mode():
    audio = model.generate(
        input_ids=description.input_ids,
        attention_mask=description.attention_mask,
        prompt_input_ids=prompt.input_ids,
        prompt_attention_mask=prompt.attention_mask,
    )

sf.write("tamil_test.wav", audio.cpu().numpy().squeeze(), model.config.sampling_rate)
print("Created tamil_test.wav")
```

Run it:

```bash
source ~/local-tamil-tts/.venv/bin/activate
cd ~/local-tamil-tts
python generate_tamil.py
```

The first run downloads the model and may take time. Later runs reuse the local copy. If CUDA is available, the script uses the NVIDIA GPU; otherwise it uses CPU and is slower.

## Generate a long video voiceover safely

Do **not** send a full 10-minute Tamil script to a model in one request. Keep the existing TamilDub approach: generate small timestamped dialogue segments, normally **one sentence or 5–20 seconds of speech at a time**.

| Step | Local workflow |
|---|---|
| 1 | Transcribe and translate the authorized video into Tamil segments with start/end timestamps. |
| 2 | Save the segment list as JSON or CSV. |
| 3 | Generate one WAV per Tamil segment with the same `Jaya` description. |
| 4 | Trim leading/trailing silence and fit each WAV to its original dialogue slot. |
| 5 | Mix the Tamil segments and any permitted background audio with FFmpeg. |
| 6 | Render the final MP4 and subtitle file. |

Use the **same voice name and exact style description** for every segment in a video. This is the simplest way to maintain a consistent Tamil narrator without provider rate limits.

## How this fits TamilDub AI

The hosted TamilDub AI website cannot run Indic Parler-TTS directly because local-model inference needs more memory and, ideally, a GPU. Use one of these safe approaches:

| Approach | How it works | Cost | Best for |
|---|---|---|
| **Manual local generation** | Export Tamil text segments, generate WAV files on your computer, then import them for sync/rendering. | No TTS API charge | Testing one video now. |
| **Local worker integration** | Run a small authenticated service on your computer that receives a queued segment, generates a WAV, and returns it to TamilDub AI. | No TTS API charge; uses your computer | Repeated personal projects. |
| **Hosted GPU worker** | Deploy the local model to a GPU-enabled server. | Server cost | Larger-scale production work. |

Start with the **manual local generation** approach. It proves Tamil quality and hardware speed before adding a persistent local-worker integration.

## Troubleshooting

| Problem | What to check |
|---|---|
| Download is denied | Accept the model access conditions on Hugging Face, then log in locally with `huggingface-cli login`. |
| `cuda` is unavailable | Confirm your NVIDIA driver/WSL CUDA setup; CPU generation still works but can be slow. |
| Tamil pronunciation is weak | Use complete Tamil script, avoid mixed English spellings where possible, and write important foreign names phonetically in Tamil. |
| Voice changes between segments | Use the exact same speaker name and style description for every segment. |
| Video takes too long | Shorten each text segment and use an NVIDIA GPU; keep generated WAVs so rerenders do not require new synthesis. |

## References

[1] AI4Bharat, “Indic Parler-TTS model card,” Hugging Face. https://huggingface.co/ai4bharat/indic-parler-tts

[2] AI4Bharat, “IndicF5 model card,” Hugging Face. https://huggingface.co/ai4bharat/IndicF5

[3] AI4Bharat, “Speech Synthesis,” AI4Bharat. https://ai4bharat.iitm.ac.in/areas/tts/

[4] AI4Bharat, “IndicF5,” GitHub. https://github.com/AI4Bharat/IndicF5
