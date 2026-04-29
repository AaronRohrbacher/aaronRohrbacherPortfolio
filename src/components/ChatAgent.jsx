'use client';

// A-A-Bot — the in-browser chat interface on this site. Text Q&A runs via
// wllama (llama.cpp WASM) for generation + Transformers.js (all-MiniLM) for
// RAG fact selection. Live chat with Aaron runs inside this same panel using
// amazon-connect-chatjs (no Connect-hosted widget UI).
//
// This component orchestrates:
//   • The floating FAB + panel UI
//   • A-A-Bot's quick actions (ask / message / contact info / live chat / voice / video)
//   • Online/offline detection via /api/connect-status (gates live chat/voice/video)
//   • In-panel live chat session (StartChatContact → ChatSession WebSocket)
//   • The "leave a message" and "request contact info" collecting flows
//     (always available; fall back to email via /api/chat-agent)
//
// Pure logic lives in src/lib/chatAgent.mjs and is unit-tested under
// tests/unit/chatAgent.test.mjs.

import React, { useState, useRef, useEffect, useCallback } from 'react';
import Style from './ChatAgent.module.scss';
import {
  detectIntent,
  isLikelyOffTopic,
  isBailOut,
  looksLikeQuestion,
  advanceCollectingFlow,
  cleanResponse,
  contactPolicy,
} from '@/lib/chatAgent.mjs';
import {
  FACT_CHUNKS,
  AARON_CHAT_SYSTEM_PROMPT,
} from '@/constants/aaronChatFacts';
import { Wllama } from '@wllama/wllama/esm/index.js';
import { pipeline as hfPipeline, env as tfEnv } from '@huggingface/transformers';

const GREETING = `Hey! I'm A-A-Bot, Aaron's AI assistant — fine-tuned on his background and running entirely in your browser. No servers, no API calls to OpenAI or anyone else.\n\nAsk me anything about Aaron's skills, experience, projects, or background. When you're ready, I can hand you off to a live chat with Aaron or take a message.`;

const OFFLINE_NOTICE = `Aaron's stepped away and live chat isn't available right now. I can take a message or send you his contact info — both reach him directly.`;

const LOAD_HINT = `Loading the model on first use. This happens once per device, then it's cached.`;

// ── UI data ──────────────────────────────────────────────────────────────────

const ONLINE_ACTIONS = [
  { id: 'ask', icon: 'fa-solid fa-brain', label: 'Ask about Aaron' },
  { id: 'schedule', icon: 'fa-solid fa-calendar-check', label: 'Schedule a call' },
  { id: 'message', icon: 'fa-solid fa-envelope', label: 'Leave a message' },
  { id: 'contact', icon: 'fa-solid fa-address-card', label: 'Request contact info' },
  { id: 'chat', icon: 'fa-solid fa-comments', label: 'Live chat' },
  { id: 'call', icon: 'fa-solid fa-phone', label: 'Voice call' },
  { id: 'video', icon: 'fa-solid fa-video', label: 'Video call' },
];

const OFFLINE_ACTIONS = [
  { id: 'ask', icon: 'fa-solid fa-brain', label: 'Ask about Aaron' },
  { id: 'schedule', icon: 'fa-solid fa-calendar-check', label: 'Schedule a call' },
  { id: 'message', icon: 'fa-solid fa-envelope', label: 'Leave a message' },
  { id: 'contact', icon: 'fa-solid fa-address-card', label: 'Request contact info' },
];

const SUGGESTION_SETS = [
  ['What languages does he know?', 'Tell me about his AI work', 'What cloud platforms?'],
  ['What did he do at Forbes?', 'What about SPARQ?', 'What has he built?'],
  ['Does he know Rust?', 'AWS certifications?', "What's his background?"],
  ['Mobile development?', 'Security experience?', 'Where is he based?'],
];

const OFFLINE_MESSAGE = `Aaron isn't available for live chat right now — but I can pass along a message and he'll get back to you.`;

// ─────────────────────────────────────────────────────────────────────────────

export default function ChatAgent() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [workerStatus, setWorkerStatus] = useState('idle');
  const [loadProgress, setLoadProgress] = useState(0);
  const [streamBuffer, setStreamBuffer] = useState('');
  const [collectingInfo, setCollectingInfo] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [online, setOnline] = useState(null); // null = unknown, true/false once probed

  const [liveChatStatus, setLiveChatStatus] = useState('idle'); // idle | connecting | connected | ended
  const [rtcStatus, setRtcStatus] = useState('idle'); // idle | connecting | connected | ended
  const [rtcKind, setRtcKind] = useState(null); // 'voice' | 'video' | null
  const [remoteVideoTileId, setRemoteVideoTileId] = useState(null);

  const suggestionIndex = useRef(0);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const acceptTokens = useRef(false);
  const sessionId = useRef(null);
  const emailSent = useRef(false);
  const chatSessionRef = useRef(null);
  const rtcSessionRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const localVideoRef = useRef(null);

  // ── Session ID for chat-log ─────────────────────────────────────────────
  if (sessionId.current === null) {
    sessionId.current = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `sess-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  // Fire-and-forget chat logger. First user message also emails Aaron.
  const logMessage = useCallback((role, content) => {
    if (!content) return;
    const firstMessage = !emailSent.current;
    if (firstMessage) emailSent.current = true;
    fetch('/api/chat-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: sessionId.current,
        role,
        content,
        firstMessage,
      }),
    }).catch(() => { /* logging never blocks UI */ });
  }, []);

  // ── Hide the Amazon Connect widget button (A-A-Bot is the single UI) ────
  // The AC widget snippet in public/amazonConnect.js still loads but we no
  // longer use its hosted chat UI — live chat runs directly inside our panel
  // via amazon-connect-chatjs. Hide the widget button so visitors only ever
  // see the A-A-Bot FAB.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const id = 'a-a-bot-hide-connect-btn';
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = `
      #amazon-connect-open-widget-button,
      #amazon-connect-chat-widget { display: none !important; }
    `;
    document.head.appendChild(style);
    return () => {
      document.getElementById(id)?.remove();
    };
  }, []);

  // ── Online/offline probe ─────────────────────────────────────────────────
  // Fires when the user opens the panel AND polls every 30s while open so
  // an agent that goes Available mid-session is reflected in the UI without
  // a page reload. Idle (closed) pages still make zero network requests.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    async function probe() {
      try {
        const res = await fetch('/api/connect-status', { cache: 'no-store' });
        if (!res.ok) { if (!cancelled) setOnline(false); return; }
        const json = await res.json();
        if (!cancelled) setOnline(Boolean(json.online));
      } catch {
        if (!cancelled) setOnline(false);
      }
    }
    probe();
    const interval = setInterval(probe, 15000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [open]);

  // ── wllama model (llama.cpp WASM) ───────────────────────────────────────
  // wllama runs llama.cpp compiled to WASM with SIMD optimizations.
  // Multi-threaded when SharedArrayBuffer is available (COOP/COEP headers).
  // Loaded lazily on first chat so idle pages incur no cost.
  const wllamaRef = useRef(null);
  const loadingRef = useRef(null);

  const ensureModel = useCallback(async () => {
    if (wllamaRef.current) return wllamaRef.current;
    if (loadingRef.current) return loadingRef.current;

    const promise = (async () => {
      const tLoadStart = performance.now();
      const model = new Wllama({
        'single-thread/wllama.wasm': 'https://cdn.jsdelivr.net/npm/@wllama/wllama@2.3.7/src/single-thread/wllama.wasm',
        'multi-thread/wllama.wasm': 'https://cdn.jsdelivr.net/npm/@wllama/wllama@2.3.7/src/multi-thread/wllama.wasm',
      });

      const modelUrl = `${window.location.origin}/models/lfm2-700m-gguf/LFM2-700M-Q8_0-aaron.gguf`;
      const nThreads = Math.max(1, (navigator.hardwareConcurrency || 4));
      await model.loadModelFromUrl(modelUrl, {
        n_ctx: 4096,
        n_threads: nThreads,
        n_batch: 2048,                // Larger batches speed up prompt prefill
        cache_type_k: 'f16',          // q4_0 + flash_attn breaks cache rollback (wllama #189)
        cache_type_v: 'f16',
        flash_attn: true,             // Flash attention — faster attention computation
        embeddings: false,
        progressCallback: ({ loaded, total }) => {
          if (total > 0) setLoadProgress(Math.round((loaded / total) * 100));
        },
      });
      console.log(`[A-A-Bot] wllama loaded in ${((performance.now() - tLoadStart) / 1000).toFixed(1)}s`);

      // JIT warmup: first real inference pays a WASM kernel-compile cost.
      // Run a throwaway 1-token generation during pre-warm so the user's
      // first question doesn't eat the warmup.
      try {
        const tWarmStart = performance.now();
        const warmStream = await model.createChatCompletion(
          [{ role: 'user', content: 'hi' }],
          { nPredict: 1, stream: true, useCache: false },
        );
        for await (const _ of warmStream) { /* drain */ }
        console.log(`[A-A-Bot] JIT warmup done in ${((performance.now() - tWarmStart) / 1000).toFixed(1)}s`);
      } catch (e) {
        console.warn('[A-A-Bot] JIT warmup failed (non-fatal):', e);
      }

      wllamaRef.current = model;
      loadingRef.current = null;
      return model;
    })();

    loadingRef.current = promise;
    return promise;
  }, []);

  useEffect(() => {
    return () => {
      wllamaRef.current = null;
      loadingRef.current = null;
    };
  }, []);

  // ── Embeddings (RAG): select top-K facts per query to shrink the prompt ─
  // WASM prefill is compute-bound on prompt size. Instead of stuffing all 22
  // fact chunks (~2k tokens) into every turn, embed them once with a small
  // model (~23MB) and pick the handful most relevant to the user's question.
  const embedderRef = useRef(null);
  const factEmbeddingsRef = useRef(null);
  const embedderLoadingRef = useRef(null);

  const ensureEmbedder = useCallback(async () => {
    if (embedderRef.current && factEmbeddingsRef.current) return embedderRef.current;
    if (embedderLoadingRef.current) return embedderLoadingRef.current;

    const promise = (async () => {
      tfEnv.allowRemoteModels = true; // Embedder is fetched from HF Hub / CDN
      const embedder = await hfPipeline(
        'feature-extraction',
        'Xenova/all-MiniLM-L6-v2',
        { dtype: 'q8' },
      );
      const embeddings = [];
      for (const fact of FACT_CHUNKS) {
        const out = await embedder(fact, { pooling: 'mean', normalize: true });
        embeddings.push(Array.from(out.data));
      }
      embedderRef.current = embedder;
      factEmbeddingsRef.current = embeddings;
      embedderLoadingRef.current = null;
      console.log('[A-A-Bot] embedder ready, fact vectors cached');
      return embedder;
    })();

    embedderLoadingRef.current = promise;
    return promise;
  }, []);

  const cosineSim = useCallback((a, b) => {
    let s = 0;
    for (let i = 0; i < a.length; i++) s += a[i] * b[i];
    return s;
  }, []);

  const selectRelevantFacts = useCallback(async (query, topK = 5) => {
    await ensureEmbedder();
    const embedder = embedderRef.current;
    const factEmbs = factEmbeddingsRef.current;
    const out = await embedder(query, { pooling: 'mean', normalize: true });
    const queryVec = Array.from(out.data);
    const scored = factEmbs.map((v, i) => ({ i, score: cosineSim(queryVec, v) }));
    scored.sort((a, b) => b.score - a.score);
    const topIdx = new Set(scored.slice(0, topK).map((s) => s.i));
    topIdx.add(0); // Always anchor on identity
    return [...topIdx].sort((a, b) => a - b).map((i) => FACT_CHUNKS[i]);
  }, [ensureEmbedder, cosineSim]);

  // Pre-warm both models the moment the user opens the chat panel.
  useEffect(() => {
    if (!open) return;
    ensureModel().catch(() => { /* surfaced on send */ });
    ensureEmbedder().catch(() => { /* RAG falls back to full facts */ });
  }, [open, ensureModel, ensureEmbedder]);

  // ── Stream buffer → messages ────────────────────────────────────────────
  useEffect(() => {
    if (!streamBuffer || !acceptTokens.current) return;
    setMessages((prev) => [
      ...prev.filter((m) => m.role !== '__stream__'),
      { role: '__stream__', content: streamBuffer },
    ]);
  }, [streamBuffer]);

  // ── Auto-scroll + focus ─────────────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, suggestions]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Keep the cursor in the input field at all times while the panel is open
  // so a visitor can always start typing without clicking. The input gets
  // briefly disabled during model load/generation, which blurs it — refocus
  // whenever it becomes interactive again, and after any message append /
  // collecting-flow step / live-chat status change that might have stolen
  // focus (e.g. quick-action button clicks).
  useEffect(() => {
    if (!open) return;
    const el = inputRef.current;
    if (!el || el.disabled) return;
    if (document.activeElement === el) return;
    // Defer past React's commit so disabled→enabled transitions land first.
    const id = requestAnimationFrame(() => {
      if (inputRef.current && !inputRef.current.disabled) {
        inputRef.current.focus();
      }
    });
    return () => cancelAnimationFrame(id);
  }, [open, workerStatus, messages, collectingInfo, liveChatStatus, rtcStatus, suggestions, streamBuffer]);

  // ── Server log — only finalized messages, once each ─────────────────────
  const loggedCount = useRef(0);
  useEffect(() => {
    const finalized = messages.filter((m) => m.role === 'user' || m.role === 'assistant');
    for (let i = loggedCount.current; i < finalized.length; i++) {
      logMessage(finalized[i].role, finalized[i].content);
    }
    loggedCount.current = finalized.length;
  }, [messages, logMessage]);

  // ── External trigger: dispatchEvent('open-chat-agent') ──────────────────
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener('open-chat-agent', handler);
    return () => window.removeEventListener('open-chat-agent', handler);
  }, []);

  const busy = workerStatus === 'loading' || workerStatus === 'generating';

  const rotateSuggestions = useCallback(() => {
    const idx = suggestionIndex.current % SUGGESTION_SETS.length;
    setSuggestions(SUGGESTION_SETS[idx]);
    suggestionIndex.current++;
  }, []);

  // ── Canned-response typewriter ──────────────────────────────────────────
  // Every non-model reply (quick actions, collecting flows, offline notices,
  // error fallbacks) renders through this helper so it types out with the
  // same cursor-style streamer the worker uses. Keeps the UX consistent —
  // a visitor shouldn't be able to tell model text from hand-written text
  // by the way it appears on screen.
  //
  // Callers can `await` to sequence multiple messages; concurrent calls
  // would race on streamBuffer so don't fire two in parallel.
  const typeAssistantMessage = useCallback((fullText) => {
    if (!fullText) return Promise.resolve();
    return new Promise((resolve) => {
      acceptTokens.current = true;
      setStreamBuffer('');
      let i = 0;
      const CHARS_PER_TICK = 2;
      const TICK_MS = 14;
      const tick = () => {
        i = Math.min(i + CHARS_PER_TICK, fullText.length);
        setStreamBuffer(fullText.slice(0, i));
        if (i < fullText.length) {
          setTimeout(tick, TICK_MS);
        } else {
          acceptTokens.current = false;
          setStreamBuffer('');
          setMessages((prev) => [
            ...prev.filter((m) => m.role !== '__stream__'),
            { role: 'assistant', content: fullText },
          ]);
          resolve();
        }
      };
      setTimeout(tick, 40);
    });
  }, []);

  // ── Live chat (Amazon Connect ChatJS, in-panel) ─────────────────────────
  // StartChatContact (our /api/connect-start-chat route) returns a
  // ParticipantToken. We hand that to amazon-connect-chatjs ChatSession which
  // opens a WebSocket to Connect's participant service. Inbound messages
  // land here as 'agent' bubbles; outbound user input routes to
  // chatSession.sendMessage instead of the local AI model.
  const endLiveChat = useCallback(async ({ announce = true } = {}) => {
    const session = chatSessionRef.current;
    chatSessionRef.current = null;
    setLiveChatStatus('idle');
    if (session) {
      try { await session.disconnectParticipant(); } catch { /* already gone */ }
    }
    if (announce) {
      typeAssistantMessage(`The chat has disconnected. Let me know if I can answer any further questions, or if you'd like to re-connect.`);
    }
  }, [typeAssistantMessage]);

  const startLiveChat = useCallback(async () => {
    if (chatSessionRef.current || liveChatStatus === 'connecting') return;
    setLiveChatStatus('connecting');
    try {
      const res = await fetch('/api/connect-start-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: 'Website Visitor' }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`start-chat failed: ${res.status} ${errText}`);
      }
      const { contactId, participantId, participantToken, region } = await res.json();

      // Load the SDK (attaches to window.connect). Dynamic import keeps this
      // out of the main bundle until the visitor actually opens live chat.
      await import('amazon-connect-chatjs');
      const connect = (typeof window !== 'undefined' && window.connect);
      if (!connect?.ChatSession) throw new Error('amazon-connect-chatjs failed to initialize');

      connect.ChatSession.setGlobalConfig({
        region,
        loggerConfig: { useDefaultLogger: false },
      });

      const session = connect.ChatSession.create({
        chatDetails: {
          contactId,
          participantId,
          participantToken,
        },
        type: 'CUSTOMER',
        options: { region },
      });

      session.onMessage((event) => {
        const data = event?.data;
        if (!data) return;
        // Plain text/markdown from agent or system. Skip our own echoes.
        const isChat = data.ContentType === 'text/plain' || data.ContentType === 'text/markdown';
        if (!isChat) return;
        if (data.ParticipantRole === 'CUSTOMER') return; // our own message, already shown
        // Only label agent messages with a name. System (bot flow) messages
        // render as plain inbound bubbles — the "SYSTEM_MESSAGE" display
        // name from Connect isn't user-friendly.
        const isAgent = data.ParticipantRole === 'AGENT';
        const who = isAgent ? (data.DisplayName || 'Aaron') : null;
        setMessages((prev) => [
          ...prev.filter((m) => m.role !== '__stream__'),
          { role: 'agent', content: data.Content, displayName: who },
        ]);
      });

      session.onEnded(() => {
        chatSessionRef.current = null;
        setLiveChatStatus('ended');
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: `The chat has disconnected. Let me know if I can answer any further questions, or if you'd like to re-connect.` },
        ]);
      });

      await session.connect();
      chatSessionRef.current = session;
      setLiveChatStatus('connected');
    } catch (err) {
      console.error('[A-A-Bot] live chat start failed:', err);
      chatSessionRef.current = null;
      setLiveChatStatus('idle');
      typeAssistantMessage(`I couldn't open the live chat. Try "Leave a message" and I'll get it to Aaron directly.`);
    }
  }, [liveChatStatus, typeAssistantMessage]);

  // Close any active live chat on unmount.
  useEffect(() => {
    return () => {
      const session = chatSessionRef.current;
      chatSessionRef.current = null;
      if (session) { try { session.disconnectParticipant(); } catch { /* ignore */ } }
    };
  }, []);

  // ── WebRTC voice + video (amazon-chime-sdk-js) ──────────────────────────
  // StartWebRTCContact returns a Chime Meeting + Attendee. We spin up a
  // DefaultMeetingSession in the browser, bind mic (and camera for video)
  // to the session's device controller, attach the remote audio stream to
  // an <audio> element, and render remote video tiles into a <video>
  // element. Voice calls skip the video pieces entirely.
  const endRtcCall = useCallback(async ({ announce = true } = {}) => {
    const session = rtcSessionRef.current;
    rtcSessionRef.current = null;
    setRtcStatus('idle');
    setRtcKind(null);
    setRemoteVideoTileId(null);
    if (session) {
      try { session.audioVideo.stop(); } catch { /* ignore */ }
    }
    if (announce) {
      typeAssistantMessage(`The call has ended. Let me know if I can answer any further questions, or if you'd like to re-connect.`);
    }
  }, [typeAssistantMessage]);

  const startRtcCall = useCallback(async (kind /* 'voice' | 'video' */) => {
    if (rtcSessionRef.current || rtcStatus === 'connecting') return;
    setRtcStatus('connecting');
    setRtcKind(kind);
    try {
      const res = await fetch('/api/connect-start-rtc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: 'Website Visitor', video: kind === 'video' }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`start-rtc failed: ${res.status} ${errText}`);
      }
      const { connectionData } = await res.json();
      if (!connectionData?.Meeting || !connectionData?.Attendee) {
        throw new Error('RTC: missing Meeting/Attendee in response');
      }

      const chime = await import('amazon-chime-sdk-js');
      const {
        ConsoleLogger, LogLevel, DefaultDeviceController,
        DefaultMeetingSession, MeetingSessionConfiguration,
      } = chime;

      const logger = new ConsoleLogger('a-a-bot-rtc', LogLevel.WARN);
      const deviceController = new DefaultDeviceController(logger);
      const cfg = new MeetingSessionConfiguration(connectionData.Meeting, connectionData.Attendee);
      const session = new DefaultMeetingSession(cfg, logger, deviceController);

      // Mic
      const audioInputs = await session.audioVideo.listAudioInputDevices();
      if (audioInputs.length === 0) throw new Error('No microphone available');
      await session.audioVideo.startAudioInput(audioInputs[0].deviceId);

      // Remote audio sink
      if (remoteAudioRef.current) {
        await session.audioVideo.bindAudioElement(remoteAudioRef.current);
      }

      // Video observer — render remote tiles to the shared <video> element,
      // and bind our own local camera feed so the visitor sees themselves.
      session.audioVideo.addObserver({
        videoTileDidUpdate: (tileState) => {
          if (!tileState?.boundAttendeeId) return;
          if (tileState.localTile) {
            if (localVideoRef.current) {
              session.audioVideo.bindVideoElement(tileState.tileId, localVideoRef.current);
            }
          } else {
            if (remoteVideoRef.current) {
              session.audioVideo.bindVideoElement(tileState.tileId, remoteVideoRef.current);
              setRemoteVideoTileId(tileState.tileId);
            }
          }
        },
        videoTileWasRemoved: (tileId) => {
          setRemoteVideoTileId((cur) => (cur === tileId ? null : cur));
        },
        audioVideoDidStop: () => {
          // Agent hung up or call timed out — clean up on our side.
          rtcSessionRef.current = null;
          setRtcStatus('ended');
          setRtcKind(null);
          setRemoteVideoTileId(null);
          setMessages((prev) => [
            ...prev,
            { role: 'assistant', content: `The call has ended. Let me know if I can answer any further questions, or if you'd like to re-connect.` },
          ]);
        },
      });

      session.audioVideo.start();

      if (kind === 'video') {
        const videoInputs = await session.audioVideo.listVideoInputDevices();
        if (videoInputs.length > 0) {
          await session.audioVideo.startVideoInput(videoInputs[0].deviceId);
          session.audioVideo.startLocalVideoTile();
        } else {
          console.warn('[A-A-Bot] no camera available — continuing as voice-only');
        }
      }

      rtcSessionRef.current = session;
      setRtcStatus('connected');
    } catch (err) {
      console.error('[A-A-Bot] RTC start failed:', err);
      rtcSessionRef.current = null;
      setRtcStatus('idle');
      setRtcKind(null);
      typeAssistantMessage(`I couldn't start the ${kind} call (${err.message || 'unknown error'}). Try live chat, or leave a message with a number and Aaron will reach out.`);
    }
  }, [rtcStatus, typeAssistantMessage]);

  // Close any active RTC call on unmount.
  useEffect(() => {
    return () => {
      const session = rtcSessionRef.current;
      rtcSessionRef.current = null;
      if (session) { try { session.audioVideo.stop(); } catch { /* ignore */ } }
    };
  }, []);

  // ── Model send (wllama + LFM2-700M, WASM, with RAG) ─────────────────
  const sendToAI = useCallback(async (allMessages) => {
    acceptTokens.current = true;
    const currentUser = [...allMessages].reverse().find((m) => m.role === 'user');
    if (!currentUser) return;

    try {
      setWorkerStatus('loading');
      setLoadProgress(0);
      const model = await ensureModel();

      setWorkerStatus('generating');

      // RAG: include last user+assistant exchange in embed query so short
      // follow-ups like "what's his name?" carry enough context to match
      // the right facts. Fall back to full set if the embedder isn't ready.
      const priorExchange = allMessages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .slice(-3, -1)
        .map((m) => m.content)
        .join(' ');
      const embedQuery = priorExchange
        ? `${priorExchange} ${currentUser.content}`
        : currentUser.content;

      let relevantFacts;
      try {
        relevantFacts = await selectRelevantFacts(embedQuery, 5);
      } catch {
        relevantFacts = FACT_CHUNKS;
      }
      const facts = relevantFacts.join('\n\n');
      const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      const systemPrompt = `${AARON_CHAT_SYSTEM_PROMPT}\n\nToday's date is ${today}.\n\n${facts}`;

      // Full conversation history so wllama's useCache can match the prefix.
      const history = allMessages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({ role: m.role, content: m.content }));
      const chatMessages = [
        { role: 'system', content: systemPrompt },
        ...history,
      ];

      const tGenStart = performance.now();
      let firstTokenLogged = false;
      let reply = '';
      const stream = await model.createChatCompletion(chatMessages, {
        nPredict: 200,
        sampling: { temp: 0, top_k: 1, penalty_repeat: 1.2 },
        stream: true,
        useCache: true,
      });

      for await (const chunk of stream) {
        if (!firstTokenLogged) {
          firstTokenLogged = true;
          console.log(`[A-A-Bot] first token at ${((performance.now() - tGenStart) / 1000).toFixed(1)}s`);
        }
        const piece = new TextDecoder().decode(chunk.piece);
        reply += piece;
        if (acceptTokens.current) {
          setStreamBuffer((prev) => prev + piece);
        }
      }
      console.log(`[A-A-Bot] generation done in ${((performance.now() - tGenStart) / 1000).toFixed(1)}s`);

      acceptTokens.current = false;
      setStreamBuffer('');
      const cleaned = cleanResponse(reply || '');
      const content = cleaned || "I tripped over that one. Try asking a different way, or use a quick action to reach Aaron directly.";
      setMessages((prev) => [
        ...prev.filter((m) => m.role !== '__stream__'),
        { role: 'assistant', content },
      ]);
      setWorkerStatus('idle');
      rotateSuggestions();
    } catch (err) {
      console.error('[A-A-Bot] error:', err);
      acceptTokens.current = false;
      setStreamBuffer('');
      setMessages((prev) => prev.filter((m) => m.role !== '__stream__'));
      setWorkerStatus('idle');
      typeAssistantMessage("My model hiccuped. Try a different phrasing, or use a quick action below to reach Aaron directly.");
      rotateSuggestions();
    }
  }, [ensureModel, selectRelevantFacts, rotateSuggestions, typeAssistantMessage]);

  // ── Email submission for message/contact flows ──────────────────────────
  const submitToAPI = useCallback(async (payload) => {
    try {
      const res = await fetch('/api/chat-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return res.ok;
    } catch {
      return false;
    }
  }, []);

  // ── Google-Calendar-backed booking for schedule flow ───────────────────
  const submitBooking = useCallback(async ({ slotIso, name, contactMethod }) => {
    try {
      const res = await fetch('/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slotIso, customerName: name, contactMethod }),
      });
      if (!res.ok) return { ok: false };
      const json = await res.json();
      return { ok: true, ...json };
    } catch {
      return { ok: false };
    }
  }, []);

  // ── Collecting flow driver ──────────────────────────────────────────────
  const runCollectingStep = useCallback(async (text) => {
    const state = collectingInfo;
    if (!state) return false;

    // Break out to answer questions instead of treating them as field input.
    if (looksLikeQuestion(text) && !isBailOut(text)) {
      setCollectingInfo(null);
      return false;
    }

    const res = advanceCollectingFlow(state, text);
    setCollectingInfo(res.next);
    if (res.assistant) {
      await typeAssistantMessage(res.assistant);
    }
    if (res.submit) {
      if (res.submit.type === 'schedule_book') {
        const booking = await submitBooking({
          slotIso: res.submit.slotIso,
          name: res.submit.name,
          contactMethod: res.submit.contactMethod,
        });
        await typeAssistantMessage(
          booking.ok
            ? `Booked for ${booking.bookedLabel || res.submit.slotLabel}! Aaron will see you then${res.submit.contactMethod.includes('@') ? ' — check your email for the Google Calendar invite.' : ' — check your texts for confirmation.'}`
            : `I couldn't book that slot. Try picking a different time, or say "leave a message" and Aaron will reach out to schedule.`,
        );
      } else {
        const ok = await submitToAPI(res.submit);
        await typeAssistantMessage(
          ok
            ? (res.submit.type === 'contact_request'
              ? `Done! Aaron will send you his contact details shortly. Anything else?`
              : `Done! Aaron will get back to you soon. Is there anything else I can help with?`)
            : `I had trouble sending that. Try again, or say "connect me" for live chat.`,
        );
      }
      rotateSuggestions();
    }
    return true;
  }, [collectingInfo, submitToAPI, submitBooking, rotateSuggestions, typeAssistantMessage]);

  const startFlow = useCallback(async (type) => {
    if (type === 'message') {
      setCollectingInfo({ type: 'message', step: 'name', data: {} });
      await typeAssistantMessage(`I'd be happy to pass along a message to Aaron. What's your name?`);
      return;
    }
    if (type === 'contact') {
      setCollectingInfo({ type: 'contact', step: 'name', data: {} });
      await typeAssistantMessage(`Sure! Aaron will send you his contact info directly. What's your name?`);
      return;
    }
    if (type === 'schedule') {
      // Fetch real slots from Google Calendar via /api/schedule GET. If
      // scheduling isn't configured (503), fall back to taking a message.
      // Kick off typing and the fetch in parallel so the user sees words
      // while the API call is in-flight.
      const typingPromise = typeAssistantMessage(`Pulling Aaron's next open slots from his calendar...`);
      try {
        const res = await fetch('/api/schedule', { cache: 'no-store' });
        await typingPromise;
        if (res.status === 503) {
          await typeAssistantMessage(`Calendar booking isn't configured right now. Want to leave a message instead? Aaron will get back to you to schedule.`);
          return;
        }
        if (!res.ok) throw new Error('slots-fetch-failed');
        const json = await res.json();
        const slots = Array.isArray(json.slots) ? json.slots : [];
        if (slots.length === 0) {
          await typeAssistantMessage(`Aaron doesn't have any open slots in the next 90 days. Want to leave a message so he can follow up?`);
          return;
        }
        const lines = slots.map((s, i) => `${i + 1}. ${s.label}`).join('\n');
        setCollectingInfo({ type: 'schedule', step: 'pick_slot', data: { slots } });
        await typeAssistantMessage(
          `Here are Aaron's next open times for a 30-minute call:\n\n${lines}\n\nReply with a number 1–${slots.length} to pick one, or say "cancel" to go back.`,
        );
      } catch {
        await typingPromise.catch(() => {});
        await typeAssistantMessage(`I couldn't reach Aaron's calendar right now. Want to leave a message instead?`);
      }
    }
  }, [typeAssistantMessage]);

  // ── Quick action handler ────────────────────────────────────────────────
  const handleAction = useCallback((id) => {
    if (id === 'chat') {
      if (online === false) { typeAssistantMessage(OFFLINE_MESSAGE); return; }
      typeAssistantMessage(`Connecting you to Aaron — one moment!`);
      setTimeout(() => { startLiveChat(); }, 400);
      return;
    }
    if (id === 'call' || id === 'video') {
      if (online === false) { typeAssistantMessage(OFFLINE_MESSAGE); return; }
      const kind = id === 'call' ? 'voice' : 'video';
      typeAssistantMessage(
        kind === 'voice'
          ? `Starting a voice call with Aaron. Your browser will ask for microphone access.`
          : `Starting a video call with Aaron. Your browser will ask for camera + microphone access.`,
      );
      setTimeout(() => { startRtcCall(kind); }, 400);
      return;
    }
    if (id === 'message') { startFlow('message'); return; }
    if (id === 'contact') { startFlow('contact'); return; }
    if (id === 'schedule') { startFlow('schedule'); return; }
    if (id === 'ask') {
      typeAssistantMessage(`Go ahead — ask me anything about Aaron's experience, skills, projects, or background!`);
      rotateSuggestions();
    }
  }, [online, startLiveChat, startRtcCall, startFlow, rotateSuggestions, typeAssistantMessage]);

  // ── Main submit handler ─────────────────────────────────────────────────
  const send = useCallback(async (text) => {
    const q = (text ?? input).trim();
    if (!q) return;
    setInput('');
    setSuggestions([]);

    const userMsg = { role: 'user', content: q };
    setMessages((prev) => [...prev, userMsg]);

    // Live chat takes priority over everything — user is talking to a human.
    if (liveChatStatus === 'connected' && chatSessionRef.current) {
      try {
        await chatSessionRef.current.sendMessage({ message: q, contentType: 'text/plain' });
      } catch (err) {
        console.error('[A-A-Bot] live send failed:', err);
        typeAssistantMessage(`That didn't send — the live chat may have dropped. Try "Leave a message" instead.`);
      }
      return;
    }

    // Collecting flow takes priority.
    if (collectingInfo) {
      if (isBailOut(q)) {
        setCollectingInfo(null);
        typeAssistantMessage(`No problem! What else can I help with?`);
        rotateSuggestions();
        return;
      }
      const handled = await runCollectingStep(q);
      if (handled) return;
      // If runCollectingStep returned false (user asked a question), fall
      // through to normal handling.
    }

    // Intent routing.
    const intent = detectIntent(q);
    if (intent) {
      const decision = contactPolicy(intent, { online: online !== false });
      if (decision?.action === 'start') {
        startFlow(decision.flow);
        return;
      }
      if (decision?.action === 'launch') {
        handleAction(decision.channel);
        return;
      }
      if (decision?.action === 'offline_notice') {
        typeAssistantMessage(OFFLINE_MESSAGE);
        rotateSuggestions();
        return;
      }
    }

    // Narrow off-topic short-circuit — reserved for truly unrelated stuff
    // (weather, math, translation). Everything else goes through the model.
    if (isLikelyOffTopic(q)) {
      typeAssistantMessage(`That's outside my lane — I'm specifically trained on Aaron. Ask about his skills, projects, or career, or use a quick action below to reach him directly.`);
      rotateSuggestions();
      return;
    }

    // Everything else → model.
    if (busy) return;
    const allMsgs = [...messages.filter((m) => m.role !== '__stream__'), userMsg];
    sendToAI(allMsgs);
  }, [input, messages, busy, collectingInfo, runCollectingStep, handleAction, startFlow, sendToAI, rotateSuggestions, online, liveChatStatus, typeAssistantMessage]);

  const showGreeting = messages.length === 0;
  const actions = online === false ? OFFLINE_ACTIONS : ONLINE_ACTIONS;

  return (
    <>
      <button
        className={[Style.fab, open ? Style.fabOpen : ''].join(' ')}
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Close chat' : 'Open chat'}
      >
        <i className={open ? 'fa-solid fa-xmark' : 'fa-solid fa-comments'} />
      </button>

      {open && (
        <div className={Style.panel}>
          <div className={Style.header}>
            <div className={Style.headerIcon}><i className="fa-solid fa-microchip-ai" /></div>
            <div>
              <strong>A-A-Bot · Aaron&apos;s AI assistant</strong>
              <span>
                {liveChatStatus === 'connected'
                  ? 'Live chat with Aaron — you\'re talking to a human'
                  : liveChatStatus === 'connecting'
                    ? 'Connecting you to Aaron...'
                    : 'Fine-tuned LLM, runs in your browser'}
              </span>
            </div>
          </div>

          <div className={Style.messages}>
            {/* Always-visible presence banner. Shows Aaron's status and
                nudges visitors toward live chat when he's available. */}
            {rtcStatus === 'connected' ? (
              <div className={[Style.presence, Style.presenceLive].join(' ')}>
                <span className={Style.dot} /> {rtcKind === 'video' ? 'Video call' : 'Voice call'} with Aaron — live
              </div>
            ) : rtcStatus === 'connecting' ? (
              <div className={[Style.presence, Style.presenceLive].join(' ')}>
                <span className={[Style.dot, Style.dotPulse].join(' ')} /> Connecting {rtcKind === 'video' ? 'video' : 'voice'} call...
              </div>
            ) : liveChatStatus === 'connected' ? (
              <div className={[Style.presence, Style.presenceLive].join(' ')}>
                <span className={Style.dot} /> Live with Aaron — you&apos;re talking to a human
              </div>
            ) : liveChatStatus === 'connecting' ? (
              <div className={[Style.presence, Style.presenceLive].join(' ')}>
                <span className={[Style.dot, Style.dotPulse].join(' ')} /> Connecting you to Aaron...
              </div>
            ) : online === true ? (
              <button
                className={[Style.presence, Style.presenceOnline].join(' ')}
                onClick={() => handleAction('chat')}
                type="button"
              >
                <span className={Style.dot} /> Aaron is online — tap to start a live chat
              </button>
            ) : online === false ? (
              <div className={[Style.presence, Style.presenceOffline].join(' ')}>
                <span className={Style.dot} /> Aaron is offline — I can take a message
              </div>
            ) : null}

            {/* Video tiles for active video calls. Audio element is always
                rendered (hidden) so Chime has an audio sink to bind to. */}
            {rtcKind === 'video' && (rtcStatus === 'connected' || rtcStatus === 'connecting') && (
              <div className={Style.videoStage}>
                <video
                  ref={remoteVideoRef}
                  className={Style.remoteVideo}
                  autoPlay
                  playsInline
                  muted={false}
                />
                {!remoteVideoTileId && (
                  <div className={Style.videoPlaceholder}>
                    Waiting for Aaron&apos;s camera…
                  </div>
                )}
                <video
                  ref={localVideoRef}
                  className={Style.localVideo}
                  autoPlay
                  playsInline
                  muted
                />
              </div>
            )}

            {showGreeting && (
              <>
                <div className={[Style.bubble, Style.bubbleAI].join(' ')}>
                  {GREETING}
                </div>
                {online === false && (
                  <div className={[Style.bubble, Style.bubbleAI].join(' ')}>
                    {OFFLINE_NOTICE}
                  </div>
                )}
                <div className={Style.quickActions}>
                  {actions.map((a) => (
                    <button
                      key={a.id}
                      className={Style.quickBtn}
                      onClick={() => handleAction(a.id)}
                    >
                      <i className={a.icon} /> {a.label}
                    </button>
                  ))}
                </div>
              </>
            )}

            {messages.map((m, i) => (
              <div
                key={i}
                className={[
                  Style.bubble,
                  m.role === 'user' ? Style.bubbleUser : Style.bubbleAI,
                  m.role === '__stream__' ? Style.bubbleStream : '',
                  m.role === 'agent' ? Style.bubbleAgent : '',
                ].join(' ')}
              >
                {m.role === 'agent' && m.displayName && (
                  <span className={Style.agentName}>{m.displayName}</span>
                )}
                {m.content}
                {m.role === '__stream__' && <span className={Style.cursor} />}
              </div>
            ))}

            {liveChatStatus === 'connecting' && (
              <div className={[Style.bubble, Style.bubbleAI].join(' ')}>
                Connecting you to Aaron... <i className="fa-solid fa-spinner fa-spin" />
              </div>
            )}

            {workerStatus === 'loading' && (
              <div className={Style.loadingWrap}>
                <span className={Style.loadingLabel}>
                  {loadProgress > 0
                    ? `Loading A-A-Bot model... ${loadProgress}%`
                    : LOAD_HINT}
                </span>
                <div className={Style.loadingTrack}>
                  <div className={Style.loadingFill} style={{ width: `${loadProgress}%` }} />
                </div>
              </div>
            )}

            {workerStatus === 'generating' && !streamBuffer && (
              <div className={Style.thinking}><span /><span /><span /></div>
            )}

            {suggestions.length > 0 && workerStatus === 'idle' && !collectingInfo && liveChatStatus !== 'connected' && liveChatStatus !== 'connecting' && rtcStatus !== 'connected' && rtcStatus !== 'connecting' && (
              <div className={Style.suggestions}>
                {suggestions.map((s, i) => (
                  <button key={i} className={Style.suggestionChip} onClick={() => send(s)}>
                    {s}
                  </button>
                ))}
              </div>
            )}

            {messages.length > 0 && !collectingInfo && workerStatus === 'idle' && liveChatStatus !== 'connected' && liveChatStatus !== 'connecting' && rtcStatus !== 'connected' && rtcStatus !== 'connecting' && (
              <div className={Style.inlineActions}>
                <button onClick={() => startFlow('schedule')}><i className="fa-solid fa-calendar-check" /> Schedule a call</button>
                <button onClick={() => startFlow('message')}><i className="fa-solid fa-envelope" /> Leave a message</button>
                <button onClick={() => startFlow('contact')}><i className="fa-solid fa-address-card" /> Request contact info</button>
                {online !== false && (
                  <button onClick={() => handleAction('chat')}><i className="fa-solid fa-comments" /> Live chat</button>
                )}
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          <div className={Style.inputBar}>
            <input
              ref={inputRef}
              className={Style.field}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && send()}
              placeholder={
                liveChatStatus === 'connected'
                  ? 'Message Aaron...'
                  : collectingInfo
                    ? 'Type your answer...'
                    : 'Ask about Aaron or leave a message...'
              }
              disabled={busy && liveChatStatus !== 'connected'}
            />
            <button
              className={Style.sendBtn}
              onClick={() => send()}
              disabled={(busy && !collectingInfo && liveChatStatus !== 'connected') || !input.trim()}
            >
              {busy && !collectingInfo ? <i className="fa-solid fa-spinner fa-spin" /> : <i className="fa-solid fa-paper-plane" />}
            </button>
          </div>

          {liveChatStatus === 'connected' && (
            <div className={Style.liveActions}>
              <button className={Style.disconnectBtn} onClick={() => endLiveChat()}>
                <i className="fa-solid fa-xmark" /> Disconnect from Aaron
              </button>
            </div>
          )}

          {(rtcStatus === 'connected' || rtcStatus === 'connecting') && (
            <div className={Style.liveActions}>
              <button className={Style.disconnectBtn} onClick={() => endRtcCall()}>
                <i className="fa-solid fa-phone-slash" /> End {rtcKind === 'video' ? 'video' : 'voice'} call
              </button>
            </div>
          )}

          {/* Hidden <audio> always rendered when RTC is active so Chime has
              a stable element to bind the remote audio stream to. */}
          {(rtcStatus === 'connected' || rtcStatus === 'connecting') && (
            <audio ref={remoteAudioRef} autoPlay />
          )}

          <p className={Style.disclaimer}>
            A-A-Bot is Aaron&apos;s AI assistant — fine-tuned on his background and running entirely in your browser. Nothing leaves your device except messages to Aaron. A.I. makes mistakes and sometimes hallucinates facts — double-check anything important.
          </p>
        </div>
      )}
    </>
  );
}
