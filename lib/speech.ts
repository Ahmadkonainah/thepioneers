import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

const DEFAULT_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb";

export class SpeechUnavailable extends Error {
  constructor(message = "Speech service is not available.") {
    super(message);
    this.name = "SpeechUnavailable";
  }
}

/** The SDK is constructed only when a request needs it, and only on the server. */
function client(): ElevenLabsClient {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new SpeechUnavailable("ELEVENLABS_API_KEY is not set.");
  return new ElevenLabsClient({ apiKey });
}

async function toBytes(audio: unknown): Promise<Uint8Array> {
  if (audio instanceof Uint8Array) return audio;
  if (typeof Blob !== "undefined" && audio instanceof Blob) {
    return new Uint8Array(await audio.arrayBuffer());
  }
  if (audio && typeof audio === "object" && "getReader" in audio) {
    const reader = (audio as ReadableStream<Uint8Array>).getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const step = await reader.read();
      if (step.done) break;
      if (!step.value) continue;
      chunks.push(step.value);
      total += step.value.byteLength;
    }
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return merged;
  }
  throw new SpeechUnavailable("Speech service returned no audio.");
}

/** Question text only. Corpus documents are never sent to the speech provider. */
export async function synthesizeSpeech(text: string): Promise<Uint8Array> {
  const audio = await client().textToSpeech.convert(process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID, {
    text,
    modelId: "eleven_multilingual_v2",
  });
  return toBytes(audio);
}

/** Audio stays in memory for this request. It is not written to disk. */
export async function transcribeSpeech(bytes: Uint8Array, mime: string): Promise<string> {
  const file = new File([Buffer.from(bytes)], "deposition", { type: mime });
  const result = await client().speechToText.convert({
    file,
    modelId: "scribe_v2",
    languageCode: "eng",
  });
  if ("text" in result && typeof result.text === "string" && result.text.trim()) return result.text.trim();
  throw new SpeechUnavailable("Speech service returned no transcript.");
}
