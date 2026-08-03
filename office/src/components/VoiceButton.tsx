"use client";

import { useRef } from "react";
import { useOffice } from "../lib/store";
import type { CommandAction } from "../lib/control";

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: Array<Array<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
};

export function VoiceButton() {
  const listening = useOffice((state) => state.listening);
  const setListening = useOffice((state) => state.setListening);
  const pushSubtitle = useOffice((state) => state.pushSubtitle);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const toggle = () => {
    const SR = (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike })
      .SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition;
    if (!SR) {
      pushSubtitle("AI: Speech recognition is not available in this browser.");
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const recognition = new SR();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.onresult = async (event) => {
      const text = event.results[0][0].transcript;
      setListening(false);
      pushSubtitle(`You: ${text}`);
      try {
        const response = await fetch("/api/command", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text })
        });
        const data = (await response.json()) as { action: CommandAction; response: string; subject?: string | null };
        // The command actually takes effect in the office (pause/resume/prioritize/stop/retry).
        useOffice.getState().applyControl(data.action, data.subject ?? undefined);
        pushSubtitle(`AI: ${data.response}`);
      } catch {
        pushSubtitle("AI: The local command endpoint is unavailable.");
      }
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  };

  return (
    <button
      onClick={toggle}
      style={{
        background: listening ? "#7c3aed" : "#0f172a",
        color: "#f8fafc",
        border: "1px solid #334155",
        borderRadius: 8,
        padding: "8px 12px",
        cursor: "pointer",
        fontSize: 13
      }}
    >
      {listening ? "● Listening…" : "🎤 Voice"}
    </button>
  );
}
