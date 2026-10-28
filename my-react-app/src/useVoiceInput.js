// Dictation for the web, the browser twin of the mobile app's hooks/use-voice-input.js.
// Records with MediaRecorder, sends the clip to the backend, hands back the text; the
// caller decides where the text goes (InspectionForm appends it to a field).
//
//   clip → POST /api/v1/ask/transcribeReport   (multipart: audio, language?, context?)
//        ← AiResponse { answer: [{ key: "-", answer: transcript }] }
//
// Same route as mobile (record → upload → server transcribes) for the same reason: the
// server model auto-detects and copes with Darija mixed into French; the browser's own
// speech recognition doesn't.
//
// The browser only gives the mic to a secure page (https, or localhost while developing).
import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient } from "./apiClient";

// Chrome and Firefox record webm/opus, Safari mp4 (AAC); the transcriber reads all of them.
// The first one the browser supports wins.
const MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

// the file name tells the transcriber the container, so it follows the recorded type
const fileNameFor = (mimeType) =>
  mimeType.startsWith("audio/mp4") ? "question.m4a" : mimeType.startsWith("audio/ogg") ? "question.ogg" : "question.webm";

// Speech needs nothing like the default bitrate: 32 kbps keeps a minute around 240 KB.
const BITS_PER_SECOND = 32000;

// Shorter than this is a mis-click, not a sentence.
const MIN_DURATION_MS = 700;

const MESSAGES = {
  en: {
    unsupported: "This browser can't record audio here (the page must be served over HTTPS).",
    denied: "Microphone permission denied.",
    startFailed: "Could not start recording.",
    recordFailed: "Recording failed.",
    uploadFailed: "Transcription failed. Check your connection and try again.",
    noSpeech: "Could not make out any speech. Try again.",
  },
  fr: {
    unsupported: "Ce navigateur ne peut pas enregistrer ici (la page doit être en HTTPS).",
    denied: "Accès au micro refusé. L'autoriser dans les réglages du navigateur.",
    startFailed: "Impossible de démarrer l'enregistrement.",
    recordFailed: "L'enregistrement a échoué.",
    uploadFailed: "Transcription impossible. Vérifier la connexion et réessayer.",
    noSpeech: "Aucune parole reconnue. Réessayer.",
  },
};

// the browser's "recording" indicator stays on until every track is stopped
const releaseMic = (recorder) => {
  recorder.current?.stream.getTracks().forEach((track) => track.stop());
  recorder.current = null;
};

// AiResponse → plain text; the transcript is the single answer keyed "-"
const transcriptOf = (data) =>
  (Array.isArray(data?.answer) ? data.answer : [])
    .map(({ key, answer }) => (key && key !== "-" ? `${key} ${answer}` : answer))
    .join("\n")
    .trim();

/**
 * @param {{ language?: string }} [options] ISO-639-1 code sent to the transcriber
 *   ('fr' on the forms page); omitted, it auto-detects.
 * @returns {{
 *   status: 'idle'|'recording'|'transcribing',
 *   error: string|null,
 *   durationMillis: number,
 *   start: () => Promise<void>,
 *   stopReport: (context?: string) => Promise<string|null>,
 * }}
 */
export function useVoiceInput({ language } = {}) {
  const t = MESSAGES[language] ?? MESSAGES.fr;

  const [status, setStatus] = useState("idle");
  const [error, setError] = useState(null);
  const [durationMillis, setDurationMillis] = useState(0);

  const recorder = useRef(null);
  const chunks = useRef([]);
  const startedAt = useRef(0);

  // leaving the page mid-recording must not leave the mic open
  useEffect(() => () => releaseMic(recorder), []);

  // the elapsed time shown under the field while recording
  useEffect(() => {
    if (status !== "recording") return;
    const timer = setInterval(() => setDurationMillis(Date.now() - startedAt.current), 250);
    return () => clearInterval(timer);
  }, [status]);

  const start = useCallback(async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError(t.unsupported);
      return;
    }
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1 } });
    } catch (e) {
      console.log("useVoiceInput: no microphone", e);
      setError(e?.name === "NotAllowedError" ? t.denied : t.startFailed);
      return;
    }
    try {
      const mimeType = MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
      const rec = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: BITS_PER_SECOND });
      chunks.current = [];
      rec.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.current.push(event.data);
      };
      recorder.current = rec;
      rec.start();
      startedAt.current = Date.now();
      setDurationMillis(0);
      setStatus("recording");
    } catch (e) {
      console.log("useVoiceInput.start failed", e);
      stream.getTracks().forEach((track) => track.stop());
      setError(t.startFailed);
    }
  }, [t]);

  // Resolves to the transcript, or null when there is nothing usable. `context` says
  // what is being talked about, so the transcriber spells the item's words right.
  const stopReport = useCallback(
    async (context) => {
      const rec = recorder.current;
      if (status !== "recording" || !rec) return null;

      const heldFor = Date.now() - startedAt.current;
      try {
        // the last chunk arrives just before onstop
        await new Promise((resolve, reject) => {
          rec.onstop = resolve;
          rec.onerror = (event) => reject(event.error);
          rec.stop();
        });
      } catch (e) {
        console.log("useVoiceInput.stop failed", e);
        releaseMic(recorder);
        setStatus("idle");
        setError(t.recordFailed);
        return null;
      }
      releaseMic(recorder);

      const mimeType = rec.mimeType || "audio/webm";
      const clip = new Blob(chunks.current, { type: mimeType });
      if (!clip.size || heldFor < MIN_DURATION_MS) {
        setStatus("idle");
        return null;
      }

      setStatus("transcribing");
      const formData = new FormData();
      formData.append("audio", clip, fileNameFor(mimeType));
      if (language) formData.append("language", language);
      if (context) formData.append("context", context);
      try {
        const { data } = await apiClient.post("/api/v1/ask/transcribeReport", formData);
        const text = transcriptOf(data);
        if (!text) {
          setError(t.noSpeech);
          return null;
        }
        return text;
      } catch (e) {
        console.log("transcription failed", e);
        setError(t.uploadFailed);
        return null;
      } finally {
        setStatus("idle");
      }
    },
    [status, language, t]
  );

  return { status, error, durationMillis, start, stopReport };
}
