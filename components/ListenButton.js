'use client';

import { useEffect, useRef, useState } from 'react';

// "Listen": reads the page's story aloud with the device's own voice
// (the browser's speech synthesis). Free, no account, works offline once the
// page is loaded. Hidden where the browser has no speech.
//
// iPhone and iPad Safari stop a single utterance after roughly 15 seconds,
// so the text is spoken a sentence or two at a time, in a queue.
//
// Props:
//   parts  array of strings, read in order with a short pause between
//   label  optional button text (default "Listen")

const MAX_CHUNK = 220;

function chunks(text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const sentences = clean.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) || [clean];
  const out = [];
  let cur = '';
  for (const s of sentences) {
    if ((cur + s).length > MAX_CHUNK && cur) {
      out.push(cur.trim());
      cur = '';
    }
    if (s.length > MAX_CHUNK) {
      // A very long sentence: split at commas or spaces.
      let rest = s;
      while (rest.length > MAX_CHUNK) {
        let cut = rest.lastIndexOf(', ', MAX_CHUNK);
        if (cut < 60) cut = rest.lastIndexOf(' ', MAX_CHUNK);
        if (cut < 1) cut = MAX_CHUNK;
        out.push(rest.slice(0, cut + 1).trim());
        rest = rest.slice(cut + 1);
      }
      cur = rest;
    } else {
      cur += s;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

// Prefer a natural-sounding English voice when the device has one.
function pickVoice() {
  const voices = window.speechSynthesis.getVoices() || [];
  const en = voices.filter((v) => /^en(-|_|$)/i.test(v.lang));
  const prefer = [/premium|enhanced|natural|neural/i, /samantha|ava|allison|karen|daniel|google us english/i];
  for (const re of prefer) {
    const v = en.find((x) => re.test(x.name));
    if (v) return v;
  }
  return en.find((v) => /en-US/i.test(v.lang)) || en[0] || null;
}

export default function ListenButton({ parts, label = 'Listen' }) {
  const [supported, setSupported] = useState(false);
  const [state, setState] = useState('idle'); // idle | playing | paused
  const queue = useRef([]);
  const idx = useRef(0);
  const stopped = useRef(false);

  useEffect(() => {
    const ok = typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
    setSupported(ok);
    if (ok) window.speechSynthesis.getVoices(); // starts loading the voice list
    return () => {
      stopped.current = true;
      try {
        if (ok) window.speechSynthesis.cancel();
      } catch {
        /* ignore */
      }
    };
  }, []);

  function speakNext() {
    if (stopped.current) return;
    if (idx.current >= queue.current.length) {
      setState('idle');
      return;
    }
    const u = new SpeechSynthesisUtterance(queue.current[idx.current]);
    const v = pickVoice();
    if (v) {
      u.voice = v;
      u.lang = v.lang;
    } else {
      u.lang = 'en-US';
    }
    u.rate = 1;
    u.onend = () => {
      idx.current += 1;
      speakNext();
    };
    u.onerror = (e) => {
      // "interrupted"/"canceled" come from our own Stop; anything else, move on.
      if (e && (e.error === 'interrupted' || e.error === 'canceled')) return;
      idx.current += 1;
      speakNext();
    };
    window.speechSynthesis.speak(u);
  }

  function play() {
    const synth = window.speechSynthesis;
    if (state === 'paused') {
      synth.resume();
      setState('playing');
      return;
    }
    synth.cancel();
    queue.current = (parts || []).flatMap(chunks);
    idx.current = 0;
    stopped.current = false;
    if (!queue.current.length) return;
    setState('playing');
    speakNext();
  }

  function pause() {
    window.speechSynthesis.pause();
    setState('paused');
  }

  function stop() {
    stopped.current = true;
    window.speechSynthesis.cancel();
    idx.current = 0;
    setState('idle');
  }

  if (!supported) return null;

  return (
    <div style={styles.wrap} className="no-print">
      {state === 'playing' ? (
        <button type="button" onClick={pause} style={styles.btn} aria-label="Pause reading">
          ❚❚ Pause
        </button>
      ) : (
        <button type="button" onClick={play} style={styles.btn} aria-label={state === 'paused' ? 'Resume reading' : 'Read this page aloud'}>
          ▶ {state === 'paused' ? 'Resume' : label}
        </button>
      )}
      {state !== 'idle' && (
        <button type="button" onClick={stop} style={styles.stop} aria-label="Stop reading">
          ■ Stop
        </button>
      )}
    </div>
  );
}

const styles = {
  wrap: { display: 'flex', gap: '0.5rem', alignItems: 'center', margin: '0.9rem 0 0' },
  btn: {
    background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: '999px', padding: '0.55rem 1.1rem',
    fontWeight: 600, fontSize: '0.92rem', cursor: 'pointer', fontFamily: "'Outfit', -apple-system, BlinkMacSystemFont, sans-serif",
  },
  stop: {
    background: '#fff', color: '#1a1a2e', border: '1.5px solid #e2e2e2', borderRadius: '999px', padding: '0.5rem 1rem',
    fontWeight: 600, fontSize: '0.92rem', cursor: 'pointer', fontFamily: "'Outfit', -apple-system, BlinkMacSystemFont, sans-serif",
  },
};
