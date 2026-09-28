'use client';

import { useEffect, useRef, useState } from 'react';

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

function getRecognitionCtor(): (new () => Recognition) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function useSpeechToText(onText: (text: string) => void, lang = 'en-IN') {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const [error, setError] = useState('');
  const recRef = useRef<Recognition | null>(null);
  const detachedRef = useRef(false);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  useEffect(() => {
    setSupported(!!getRecognitionCtor());
    return () => recRef.current?.abort();
  }, []);

  const start = (baseText: string) => {
    const Ctor = getRecognitionCtor();
    if (!Ctor || recRef.current) return;
    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    const prefix = baseText.trim() ? baseText.trimEnd() + ' ' : '';
    let finalText = '';
    detachedRef.current = false;

    rec.onresult = (e) => {
      if (detachedRef.current) return;
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript.trim() + ' ';
        else interim += r[0].transcript;
      }
      onTextRef.current(prefix + finalText + interim);
    };
    rec.onerror = (e) => {
      if (detachedRef.current || e.error === 'aborted') return;
      setError(e.error === 'not-allowed' ? 'Microphone permission denied' : e.error === 'no-speech' ? '' : 'Voice input error: ' + e.error);
    };
    rec.onend = () => {
      recRef.current = null;
      setListening(false);
      if (!detachedRef.current) onTextRef.current((prefix + finalText).trimEnd());
    };

    setError('');
    recRef.current = rec;
    rec.start();
    setListening(true);
  };

  const stop = () => recRef.current?.stop();

  const cancel = () => {
    detachedRef.current = true;
    recRef.current?.abort();
  };

  return { listening, supported, error, start, stop, cancel };
}
