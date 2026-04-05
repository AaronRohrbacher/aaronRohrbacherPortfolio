'use client';

// AI agent disabled — see AI_COMMENTED_OUT.md at repo root.
// This file is no longer imported (ChatAgentLoader returns null and the loader
// is unmounted from src/app/layout.jsx). Code preserved intact below.

import React, { useState, useRef, useEffect, useCallback } from 'react';
import Style from './ChatAgent.module.scss';
import { findRelevantFacts, DOMAIN_RE } from '../constants/aaronChatFacts';

const GREETING = `Hey! I'm Aaron's AI assistant — I run right in your browser, no servers involved.\n\nAsk me about Aaron's skills, experience, or projects. Or use the buttons to get in touch!`;

const QUICK_ACTIONS = [
  { id: 'ask', icon: 'fa-solid fa-brain', label: 'Ask about Aaron' },
  { id: 'message', icon: 'fa-solid fa-envelope', label: 'Leave a message' },
  { id: 'contact', icon: 'fa-solid fa-address-card', label: 'Request contact info' },
  { id: 'chat', icon: 'fa-solid fa-comments', label: 'Live chat' },
  { id: 'call', icon: 'fa-solid fa-phone', label: 'Voice call' },
  { id: 'video', icon: 'fa-solid fa-video', label: 'Video call' },
];

// Suggestion chips rotate after each response
const SUGGESTION_SETS = [
  ['What languages does he know?', 'Tell me about his AI work', 'What cloud platforms?'],
  ['What did he do at Forbes?', 'What about SPARQ?', 'What has he built?'],
  ['Does he know Rust?', 'AWS certifications?', 'What\'s his background?'],
  ['Mobile development?', 'Security experience?', 'Where is he based?'],
];

// ── Knowledge base: only edge cases where a tiny local model often misfires ──
// Professional Q&A is handled by the worker (`ai.worker.js`). Add patterns here
// sparingly — each match skips the model entirely.
const KNOWLEDGE_BASE = [
  // Age / body / private trivia — never invent
  [/\b(old|age|born|birthday|tall|height|weight)\b/i,
    "Ha! I don't have that info — I just know the professional stuff. Want to ask Aaron yourself? Just say \"connect me\" and I'll open a live chat, or I can take a message!"],
  // Spoken vs programming "languages" — disambiguate without hallucinating
  [/\b(speak|spoken|human|fluent|bilingual)\b.*\b(language)\b/i,
    "I only have info about Aaron's programming languages, not spoken ones. Want to ask him directly? Just say \"connect me\" and I'll open a live chat!"],
  [/\b(language)\b.*\b(speak|spoken|human|fluent)\b/i,
    "I only have info about Aaron's programming languages, not spoken ones. Want to ask him directly? Just say \"connect me\" and I'll open a live chat!"],
];

// ── Rhyming redirect engine ──────────────────────────────────────────────────
// When the model classifies a question as off-topic, we craft a fun rhyming
// redirect using the last word of the user's message.
// Maps common word endings → tech/career words that rhyme with them.
const RHYME_WORDS = {
  'ace': 'database', 'ack': 'stack', 'ade': 'upgrade', 'ail': 'email',
  'ain': 'domain', 'ake': 'make', 'all': 'install', 'an': 'plan',
  'ar': 'seminar', 'ark': 'benchmark', 'art': 'smart', 'ash': 'Bash',
  'at': 'chat', 'ate': 'create', 'ay': 'array', 'ear': 'engineer',
  'eat': 'feat', 'eck': 'tech', 'eed': 'speed', 'eek': 'geek',
  'eer': 'career', 'ell': 'shell', 'end': 'backend', 'er': 'developer',
  'est': 'test', 'ew': 'review', 'ice': 'device', 'ide': 'guide',
  'ife': 'life', 'ight': 'insight', 'ill': 'skill', 'ime': 'runtime',
  'in': 'plugin', 'ine': 'pipeline', 'ing': 'debugging', 'ink': 'link',
  'ip': 'ship', 'ire': 'hire', 'it': 'commit', 'ite': 'website',
  'ive': 'live', 'ize': 'optimize', 'ob': 'job', 'ock': 'unlock',
  'ode': 'code', 'og': 'blog', 'oke': 'invoke', 'ol': 'protocol',
  'ole': 'role', 'oll': 'control', 'one': 'milestone', 'ong': 'strong',
  'ood': 'good', 'ook': 'hook', 'ool': 'tool', 'oom': 'Zoom',
  'oo': 'to-do', 'oose': 'produce', 'op': 'laptop', 'ore': 'explore',
  'ork': 'framework', 'orm': 'platform', 'ort': 'port', 'ose': 'verbose',
  'ost': 'host', 'ot': 'bot', 'ote': 'remote', 'ound': 'background',
  'out': 'checkout', 'ow': 'workflow', 'own': 'shutdown', 'ub': 'GitHub',
  'ue': 'queue', 'ug': 'debug', 'ull': 'pull', 'un': 'run',
  'up': 'startup', 'ure': 'architecture', 'ush': 'push', 'ust': 'Rust',
  'ut': 'output', 'oss': 'boss', 'ess': 'process', 'ool': 'tool',
};

const RHYME_TEMPLATES = [
  (w, r) => `"${w}"? That rhymes with "${r}" — and THAT's my cue to talk about Aaron! Ask about his skills, projects, or career!`,
  (w, r) => `From "${w}" to "${r}" in one hop! I'm like a GPS that only knows one destination: Aaron's career. Ask away!`,
  (w, r) => `"${w}"... "${r}"... Aaron! Three degrees of separation. What do you want to know about his work?`,
  (w, r) => `Ha! "${w}" makes me think of "${r}", and that's my cue to talk about Aaron! What do you want to know?`,
  (w, r) => `"${w}" -> "${r}" — I can rhyme AND redirect! Now ask about Aaron's tech stack or projects!`,
  (w, r) => `Nice, "${w}"! Know what rhymes with that? "${r}." And you know what THAT makes me think of? Aaron's career!`,
];

const FALLBACK_REDIRECTS = [
  "Ha! I appreciate the creativity, but I'm basically a one-trick pony — and that trick is talking about Aaron. Try asking about his tech stack, projects, or experience!",
  "Love the energy, but my entire brain is just Aaron Facts. Ask me what he's built, what languages he codes in, or where he's worked!",
  "Points for originality! But I only know about Aaron's career. Try me — ask about his skills, experience, or projects!",
  "Hah, nice try! But I'm a strictly Aaron-only zone. Ask me about his tech skills, career, or what he's built!",
  "I'm gonna pretend you didn't just ask me that. Want to hear about Aaron's work? He's got some impressive stuff.",
];

function getLastWord(text) {
  const cleaned = text.trim().replace(/[?!.,;:'"]+$/g, '');
  const words = cleaned.split(/\s+/);
  return words[words.length - 1]?.toLowerCase().replace(/[^a-z]/g, '') || '';
}

function getRhymingRedirect(userText) {
  const word = getLastWord(userText);
  if (word && word.length >= 2) {
    for (let len = Math.min(word.length - 1, 5); len >= 2; len--) {
      const suffix = word.slice(-len);
      if (RHYME_WORDS[suffix]) {
        const rhyme = RHYME_WORDS[suffix];
        // Don't echo the same word back ("good rhymes with good" is silly)
        if (rhyme.toLowerCase() === word.toLowerCase()) continue;
        const tpl = RHYME_TEMPLATES[Math.floor(Math.random() * RHYME_TEMPLATES.length)];
        return tpl(word, rhyme);
      }
    }
  }
  return FALLBACK_REDIRECTS[Math.floor(Math.random() * FALLBACK_REDIRECTS.length)];
}

// Try to answer from the knowledge base — returns string or null
function answerFromKB(text) {
  for (const [pattern, response] of KNOWLEDGE_BASE) {
    const match = text.match(pattern);
    if (match) {
      return typeof response === 'function' ? response(match) : response;
    }
  }
  return null;
}

// Strip markdown formatting
function cleanResponse(text) {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/^[*\-•]\s*/gm, '')
    .replace(/^\d+\.\s*/gm, '')
    .replace(/\n+/g, ' ')
    .trim();
}

// General grounding check for all-facts mode (when no specific fact was matched).
// "aaron"/"rohrbacher" alone don't count — the model can name-drop in any garbage.
const GROUNDING_RE = /\b(sparq|forbes|nuel|nordic|planet.?argon|portland|oregon|saxophone|javascript|typescript|python|ruby|java|kotlin|swift|rust|php|sql|bash|aws|gcp|azure|docker|kubernetes|terraform|cdk|sst|pytorch|llm|nlp|lex|polly|klear|thinger|session|appnow|move|cloud practitioner|developer associate|devops|next\.?js|qt|live chat|seeking|available|hire)\b/i;

// Hallucination markers — if any of these appear, the model is making stuff up
const HALLUCINATION_RE = /\b(not public|can't really tell|don't know|no information|unable to|I'm here to listen|not give advice|I'm not sure|cannot confirm|isn't available|no data|candidate|certified (?!cloud practitioner|developer)|the user asks|the user wants|the user is|this profile|hands-on advice|cutting-edge technology)\b/i;

// Intent detection for routing actions
function detectIntent(text) {
  const t = text.toLowerCase();
  const trimmed = text.trim().replace(/[?!.,]+$/, '').toLowerCase();
  if (/\b(call|voice|phone)\b/.test(t) && !/\bwhat|which|does|did|aaron.*(call|phone)\b/.test(t)) return 'call';
  if (/\b(video)\b/.test(t) && !/\bwhat|which|does|did\b/.test(t)) return 'video';
  if (
    /\b(live chat|open.*chat|start.*chat|launch.*chat|begin.*chat|chat.*now|connect me|connect.*(aaron|him)|chat with (aaron|him)|talk to (aaron|him)|speak (to|with) (aaron|him)|reach (aaron|him) now|get me aaron|is he (online|available|around))\b/.test(t)
    || /^(chat|connect)$/i.test(trimmed)
  ) return 'chat';
  if (/\b(contact info|contact details|phone number|email address|how.*(reach|contact))\b/.test(t)) return 'contact';
  if (/\b(leave.*(message|note)|tell aaron|message for|pass along|let him know)\b/.test(t)) return 'message';
  return null;
}

// After the model responds, auto-open Connect if the assistant reply suggests
// it is trying to route the user to a live chat. This catches cases where the
// user's phrasing slipped past detectIntent but the model correctly understood.
const MODEL_CONNECT_RE = /\b(open(ing)?.*(live )?chat|connect(ing)? you|i['’]ll (open|connect)|let me (open|connect)|live chat (with|to) aaron)\b/i;

// Bail-out patterns for collecting flows
const BAIL_RE = /^(no|nah|nope|cancel|nevermind|never\s?mind|stop|quit|back|exit)\.?!?$/i;
// Detect if user is asking a question rather than providing info
function looksLikeQuestion(text) {
  return text.includes('?') || /^(what|who|where|when|why|how|does|did|is|are|can|tell me|do you)\b/i.test(text.trim());
}

export default function ChatAgent() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [workerStatus, setWorkerStatus] = useState('idle');
  const [loadProgress, setLoadProgress] = useState(0);
  const [streamBuffer, setStreamBuffer] = useState('');
  const [collectingInfo, setCollectingInfo] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const suggestionIndex = useRef(0);
  const workerRef = useRef(null);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const connectOpening = useRef(false);
  const lastUserQuestion = useRef('');
  const acceptTokens = useRef(false);
  const lastFactValidation = useRef(null);  // validate regex for matched fact
  const lastRawFacts = useRef(null);         // raw fact text for fallback
  const sessionId = useRef(null);            // unique chat session ID
  const emailSent = useRef(false);           // whether session-start email has been sent

  // Initialize session ID once per mount
  if (sessionId.current === null) {
    sessionId.current = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `sess-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  // Log a chat message to the server (fire-and-forget). Sends one email on first message.
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
    }).catch(() => { /* logging must never block the UI */ });
  }, []);

  // Initialize worker
  useEffect(() => {
    const worker = new Worker(
      new URL('../workers/ai.worker.js', import.meta.url),
      { type: 'module' },
    );
    worker.onmessage = (e) => {
      const { type, status, progress, token, reply } = e.data;
      if (type === 'status') {
        setWorkerStatus(status);
        if (progress !== undefined) setLoadProgress(progress);
      }
      if (type === 'token' && acceptTokens.current) setStreamBuffer((prev) => prev + token);
      if (type === 'done') {
        acceptTokens.current = false;
        setStreamBuffer('');
        const cleaned = cleanResponse(reply || '');
        const validation = lastFactValidation.current;
        const rawFacts = lastRawFacts.current;

        let response;
        if (cleaned && validation && validation.test(cleaned) && !HALLUCINATION_RE.test(cleaned)) {
          // Model paraphrased the matched facts correctly
          response = cleaned;
        } else if (rawFacts && rawFacts.length > 0) {
          // Model hallucinated — fall back to the raw fact (always accurate)
          response = rawFacts.join(' ');
        } else if (cleaned && GROUNDING_RE.test(cleaned) && !HALLUCINATION_RE.test(cleaned)) {
          // All-facts mode, model response is grounded and not hallucinating
          response = cleaned;
        } else {
          // Nothing grounded — fun redirect
          response = getRhymingRedirect(lastUserQuestion.current);
        }

        lastFactValidation.current = null;
        lastRawFacts.current = null;
        setMessages((prev) => [
          ...prev.filter((m) => m.role !== '__stream__'),
          { role: 'assistant', content: response },
        ]);
        setWorkerStatus('idle');
        rotateSuggestions();

        // Auto-open Connect if the reply is routing the user to live chat
        // (catches phrasings that slipped past detectIntent).
        if (MODEL_CONNECT_RE.test(response)) {
          setTimeout(openConnect, 400);
        }
      }
      if (type === 'error') {
        console.error('[ChatAgent] Worker error:', e.data.message);
        acceptTokens.current = false;
        setStreamBuffer('');
        setMessages((prev) => [
          ...prev.filter((m) => m.role !== '__stream__'),
          { role: 'assistant', content: `Hmm, I tripped over that one. Try asking a different way, or use the buttons below to reach Aaron directly!` },
        ]);
        setWorkerStatus('idle');
        rotateSuggestions();
      }
    };
    workerRef.current = worker;
    return () => worker.terminate();
  }, []);

  // Stream buffer → messages (only while actively accepting tokens)
  useEffect(() => {
    if (!streamBuffer || !acceptTokens.current) return;
    setMessages((prev) => [
      ...prev.filter((m) => m.role !== '__stream__'),
      { role: '__stream__', content: streamBuffer },
    ]);
  }, [streamBuffer]);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, suggestions]);

  // Log newly finalized messages (skip stream buffer, skip already-logged)
  const loggedCount = useRef(0);
  useEffect(() => {
    const finalized = messages.filter((m) => m.role === 'user' || m.role === 'assistant');
    for (let i = loggedCount.current; i < finalized.length; i++) {
      logMessage(finalized[i].role, finalized[i].content);
    }
    loggedCount.current = finalized.length;
  }, [messages, logMessage]);

  // Focus input when opened
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Listen for external open requests
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

  // Open Amazon Connect — debounced, uses stored launch callback or button click
  const openConnect = useCallback(() => {
    if (connectOpening.current) return;
    connectOpening.current = true;

    const tryOpen = () => {
      // Strategy 1: use the programmatic launch callback stored by AmazonConnect.jsx
      if (typeof window.__connectLaunch === 'function') {
        window.__connectLaunch();
        return true;
      }
      // Strategy 2: click the widget's own open button
      const btn = document.getElementById('amazon-connect-open-widget-button');
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    };

    if (!tryOpen()) {
      let attempts = 0;
      const t = setInterval(() => {
        if (tryOpen()) {
          clearInterval(t);
          setTimeout(() => { connectOpening.current = false; }, 3000);
        } else if (++attempts > 20) {
          clearInterval(t);
          connectOpening.current = false;
          // Widget never loaded — tell the user
          setMessages((prev) => [...prev,
            { role: 'assistant', content: "The live chat widget didn't load — it may be blocked by an ad blocker or still initializing. Try refreshing the page, or say \"leave a message\" and I'll take one for Aaron instead!" },
          ]);
        }
      }, 500);
    } else {
      setTimeout(() => { connectOpening.current = false; }, 3000);
    }
  }, []);

  // Send message to AI worker — optionally with pre-selected relevant facts
  const sendToAI = useCallback((allMessages, relevantFacts = null) => {
    acceptTokens.current = !relevantFacts;
    const conversationForAI = allMessages.filter((m) => m.role === 'user' || m.role === 'assistant');
    workerRef.current?.postMessage({ type: 'generate', messages: conversationForAI, relevantFacts });
  }, []);

  // Submit message/contact info to API
  const submitToAPI = useCallback(async (endpoint, data) => {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return res.ok;
    } catch {
      return false;
    }
  }, []);

  // Handle collecting info flow
  const handleCollecting = useCallback(async (text) => {
    const state = collectingInfo;
    if (!state) return false;

    if (state.type === 'message') {
      if (state.step === 'name') {
        setCollectingInfo({ ...state, step: 'contact_method', data: { ...state.data, name: text } });
        setMessages((prev) => [...prev,
          { role: 'assistant', content: `Thanks, ${text}! What's the best way for Aaron to reach you? (email or phone number)` },
        ]);
        return true;
      }
      if (state.step === 'contact_method') {
        setCollectingInfo({ ...state, step: 'message', data: { ...state.data, contactMethod: text } });
        setMessages((prev) => [...prev,
          { role: 'assistant', content: `Got it. What would you like to tell Aaron?` },
        ]);
        return true;
      }
      if (state.step === 'message') {
        const payload = { name: state.data.name, contactMethod: state.data.contactMethod, message: text, type: 'message' };
        setMessages((prev) => [...prev,
          { role: 'assistant', content: `Sending your message to Aaron...` },
        ]);
        const ok = await submitToAPI('/api/chat-agent', payload);
        setMessages((prev) => [...prev.slice(0, -1),
          { role: 'assistant', content: ok
            ? `Done! Aaron will get back to you soon. Is there anything else I can help with?`
            : `I had trouble sending that. You can try again, or say "connect me" to open a live chat with Aaron.` },
        ]);
        setCollectingInfo(null);
        return true;
      }
    }

    if (state.type === 'contact') {
      if (state.step === 'name') {
        setCollectingInfo({ ...state, step: 'contact_method', data: { ...state.data, name: text } });
        setMessages((prev) => [...prev,
          { role: 'assistant', content: `Thanks, ${text}! Where should Aaron send his contact info? (email or phone number)` },
        ]);
        return true;
      }
      if (state.step === 'contact_method') {
        const payload = { name: state.data.name, contactMethod: text, type: 'contact_request' };
        setMessages((prev) => [...prev,
          { role: 'assistant', content: `Sending your request to Aaron...` },
        ]);
        const ok = await submitToAPI('/api/chat-agent', payload);
        setMessages((prev) => [...prev.slice(0, -1),
          { role: 'assistant', content: ok
            ? `Done! Aaron will send you his contact details shortly. Anything else?`
            : `I had trouble with that. Say "connect me" to open a live chat with Aaron instead.` },
        ]);
        setCollectingInfo(null);
        return true;
      }
    }

    return false;
  }, [collectingInfo, submitToAPI]);

  // Start a collection flow
  const startFlow = useCallback((type) => {
    if (type === 'message') {
      setCollectingInfo({ type: 'message', step: 'name', data: {} });
      setMessages((prev) => [...prev,
        { role: 'assistant', content: `I'd be happy to pass along a message to Aaron. What's your name?` },
      ]);
    } else if (type === 'contact') {
      setCollectingInfo({ type: 'contact', step: 'name', data: {} });
      setMessages((prev) => [...prev,
        { role: 'assistant', content: `Sure! Aaron will send you his contact info directly. What's your name?` },
      ]);
    }
  }, []);

  // Handle quick action buttons
  const handleAction = useCallback((id) => {
    if (id === 'chat' || id === 'call' || id === 'video') {
      setMessages((prev) => [...prev,
        { role: 'assistant', content: id === 'chat'
          ? `Opening the live chat widget — one moment!`
          : `Opening ${id === 'call' ? 'voice' : 'video'} call — the chat widget will start first, then you can escalate to ${id === 'call' ? 'audio' : 'video'}.` },
      ]);
      setTimeout(openConnect, 500);
      return;
    }
    if (id === 'message') { startFlow('message'); return; }
    if (id === 'contact') { startFlow('contact'); return; }
    if (id === 'ask') {
      setMessages((prev) => [...prev,
        { role: 'assistant', content: `Go ahead — ask me anything about Aaron's experience, skills, projects, or background!` },
      ]);
      rotateSuggestions();
    }
  }, [openConnect, startFlow, rotateSuggestions]);

  // ── Main send handler ──────────────────────────────────────────────────────
  const send = useCallback(async (text) => {
    const q = (text ?? input).trim();
    if (!q) return;
    setInput('');
    setSuggestions([]);

    const userMsg = { role: 'user', content: q };
    setMessages((prev) => [...prev, userMsg]);

    // ── Collecting flow ──
    if (collectingInfo) {
      // Bail out
      if (BAIL_RE.test(q)) {
        setCollectingInfo(null);
        setMessages((prev) => [...prev,
          { role: 'assistant', content: `No problem! What else can I help with?` },
        ]);
        rotateSuggestions();
        return;
      }
      // If user is asking a question, break out of collecting and answer it instead
      if (looksLikeQuestion(q)) {
        setCollectingInfo(null);
        // Fall through to normal Q&A handling below
      } else {
        const handled = await handleCollecting(q);
        if (handled) return;
      }
    }

    // ── Routing intents ──
    const intent = detectIntent(q);
    if (intent === 'call' || intent === 'video' || intent === 'chat') {
      handleAction(intent);
      return;
    }
    if (intent === 'message') { startFlow('message'); return; }
    if (intent === 'contact') { startFlow('contact'); return; }

    // ── Knowledge base lookup (instant, accurate) ──
    const kbAnswer = answerFromKB(q);
    if (kbAnswer) {
      setMessages((prev) => [...prev,
        { role: 'assistant', content: kbAnswer },
      ]);
      rotateSuggestions();
      return;
    }

    // ── Fact retrieval + model paraphrasing ──
    // 1. Match question to specific facts (deterministic, instant)
    // 2. If matched: model paraphrases only those facts (simple task, validated)
    // 3. If no match but on-topic: model tries with all facts
    // 4. If off-topic: instant rhyming redirect (no model needed)
    lastUserQuestion.current = q;
    const allMsgs = [...messages.filter((m) => m.role !== '__stream__'), userMsg];

    const matches = findRelevantFacts(q);
    if (matches.length > 0 && matches[0].score >= 1) {
      // Matched specific facts — send only those to the model for paraphrasing
      if (busy) return;
      lastFactValidation.current = matches[0].validate;
      lastRawFacts.current = matches.map((m) => m.fact);
      sendToAI(allMsgs, matches.map((m) => m.fact));
    } else if (DOMAIN_RE.test(q)) {
      // On-topic but no fact match — try model with all facts
      if (busy) return;
      lastFactValidation.current = null;
      lastRawFacts.current = null;
      sendToAI(allMsgs);
    } else {
      // Off-topic — instant redirect, no model download needed
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: getRhymingRedirect(q) },
      ]);
      rotateSuggestions();
    }
  }, [input, messages, busy, collectingInfo, handleCollecting, handleAction, startFlow, sendToAI, rotateSuggestions]);

  const showGreeting = messages.length === 0;

  return (
    <>
      {/* Floating toggle button */}
      <button
        className={[Style.fab, open ? Style.fabOpen : ''].join(' ')}
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Close chat' : 'Open chat'}
      >
        <i className={open ? 'fa-solid fa-xmark' : 'fa-solid fa-comments'} />
      </button>

      {/* Chat panel */}
      {open && (
        <div className={Style.panel}>
          <div className={Style.header}>
            <div className={Style.headerIcon}><i className="fa-solid fa-microchip-ai" /></div>
            <div>
              <strong>Aaron&apos;s AI Assistant</strong>
              <span>Ask anything or get in touch</span>
            </div>
          </div>

          <div className={Style.messages}>
            {/* Greeting */}
            {showGreeting && (
              <>
                <div className={[Style.bubble, Style.bubbleAI].join(' ')}>
                  {GREETING}
                </div>
                <div className={Style.quickActions}>
                  {QUICK_ACTIONS.map((a) => (
                    <button key={a.id} className={Style.quickBtn} onClick={() => handleAction(a.id)}>
                      <i className={a.icon} /> {a.label}
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* Messages */}
            {messages.map((m, i) => (
              <div
                key={i}
                className={[
                  Style.bubble,
                  m.role === 'user' ? Style.bubbleUser : Style.bubbleAI,
                  m.role === '__stream__' ? Style.bubbleStream : '',
                ].join(' ')}
              >
                {m.content}
                {m.role === '__stream__' && <span className={Style.cursor} />}
              </div>
            ))}

            {/* Loading indicator */}
            {workerStatus === 'loading' && (
              <div className={Style.loadingWrap}>
                <span className={Style.loadingLabel}>Loading AI model... {loadProgress}%</span>
                <div className={Style.loadingTrack}>
                  <div className={Style.loadingFill} style={{ width: `${loadProgress}%` }} />
                </div>
              </div>
            )}

            {/* Thinking dots */}
            {workerStatus === 'generating' && !streamBuffer && (
              <div className={Style.thinking}><span /><span /><span /></div>
            )}

            {/* Suggestion chips */}
            {suggestions.length > 0 && workerStatus === 'idle' && !collectingInfo && (
              <div className={Style.suggestions}>
                {suggestions.map((s, i) => (
                  <button key={i} className={Style.suggestionChip} onClick={() => send(s)}>
                    {s}
                  </button>
                ))}
              </div>
            )}

            {/* Persistent action buttons after conversation starts */}
            {messages.length > 0 && !collectingInfo && workerStatus === 'idle' && (
              <div className={Style.inlineActions}>
                <button onClick={() => startFlow('message')}><i className="fa-solid fa-envelope" /> Leave a message</button>
                <button onClick={() => startFlow('contact')}><i className="fa-solid fa-address-card" /> Request contact info</button>
                <button onClick={() => handleAction('chat')}><i className="fa-solid fa-comments" /> Live chat</button>
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
              placeholder={collectingInfo ? 'Type your answer...' : 'Ask about Aaron or leave a message...'}
              disabled={busy}
            />
            <button
              className={Style.sendBtn}
              onClick={() => send()}
              disabled={(busy && !collectingInfo) || !input.trim()}
            >
              {busy && !collectingInfo ? <i className="fa-solid fa-spinner fa-spin" /> : <i className="fa-solid fa-paper-plane" />}
            </button>
          </div>

          <p className={Style.disclaimer}>
            AI runs in your browser via Transformers.js. Nothing leaves your device except messages to Aaron.
          </p>
        </div>
      )}
    </>
  );
}
