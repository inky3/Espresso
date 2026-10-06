'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Plus, X, Map as MapIcon, Plane, Workflow, Code,
  Coffee, BookOpen, CupSoda, Croissant, Bean, SendHorizontal,
  FilePlus, Paperclip, Copy, Check, PenSquare
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Firebase Import
import { auth, db } from '@/lib/firebase';
import { signInAnonymously, onAuthStateChanged, User } from "firebase/auth";
import { collection, addDoc, getDocs, updateDoc, deleteDoc, doc, setDoc, serverTimestamp } from "firebase/firestore";

const appId = 'espresso-terminal'; 

type PanelKey = 'display' | 'whiteboard' | 'orderbook' | null;

// ─── SESSION CACHE (Feature #7) ───────────────────────────────────────────────
const SESSION_KEY = 'espresso_chat_session';

function loadSessionMessages(): any[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveSessionMessages(msgs: any[]) {
  if (typeof window === 'undefined') return;
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(msgs)); } catch {}
}

// ─── SLASH COMMANDS ──────────────────────────────────────────────────────────
const SLASH_COMMANDS = [
  { cmd: '/save',   desc: 'Save to Order Book',   hint: '/save [title]' },
  { cmd: '/recall', desc: 'Load from Order Book', hint: '/recall [name]' },
  { cmd: '/clear',  desc: 'Clear this session',   hint: '/clear' },
  { cmd: '/map',    desc: 'Show a location',      hint: '/map [place]' },
  { cmd: '/update', desc: 'Force update skills',  hint: '/update [rule]' }, // 👈 NEW DEV COMMAND
];

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const PANEL_META: Record<NonNullable<PanelKey>, { title: string; subtitle: string; icon: any; label: string; hint: string }> = {
  display:    { title: "Display",    subtitle: "Plated visuals",      icon: CupSoda,   label: "Display",    hint: "images, maps, visuals" },
  whiteboard: { title: "Whiteboard", subtitle: "Notes · code · drafts", icon: Croissant, label: "Whiteboard", hint: "scratch space" },
  orderbook:  { title: "Order Book", subtitle: "Permanent archive",   icon: BookOpen,  label: "Order Book", hint: "saved memory" },
};

// ─── LOGO & ANIMATIONS ────────────────────────────────────────────────────────
const EspressoMark = ({ size = 28 }: { size?: number }) => (
  <div style={{ width: size, height: size }} className="rounded-xl bg-[#D4AF37] grid place-items-center text-black shadow-[0_0_15px_rgba(212,175,55,0.4)]">
    <Coffee size={size * 0.55} />
  </div>
);

const Steam = ({ delay }: { delay: number }) => (
  <motion.div
    className="w-1.5 h-8 bg-[#D4AF37]/50 rounded-full blur-sm absolute bottom-0"
    initial={{ y: 0, opacity: 0, x: 0 }}
    animate={{ y: -45, opacity: [0, 1, 0], x: [-5, 5, -5] }}
    transition={{ duration: 2.5, repeat: Infinity, delay, ease: "easeOut" }}
  />
);

const EspressoBootAnimation = ({ progress }: { progress: number }) => (
  <div className="flex flex-col items-center justify-center relative mt-8">
    <div className="relative w-16 h-12 flex justify-center -mb-2 z-0">
      <Steam delay={0} />
      <div className="ml-6"><Steam delay={0.8} /></div>
      <div className="-ml-6"><Steam delay={1.6} /></div>
    </div>
    <div className="relative w-24 h-28 border-[3px] border-[#D4AF37] rounded-b-[2rem] rounded-t-lg overflow-hidden flex items-end p-1 shadow-[0_0_30px_rgba(212,175,55,0.15)] bg-black z-10">
      <motion.div
        className="w-full bg-gradient-to-t from-[#4B3022] to-[#D4AF37] rounded-b-[1.5rem] rounded-t-sm"
        initial={{ height: "0%" }}
        animate={{ height: `${progress}%` }}
        transition={{ ease: "easeInOut", duration: 0.4 }}
      />
      <Coffee size={36} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-black mix-blend-overlay opacity-50" />
    </div>
    <div className="w-32 h-2.5 bg-[#D4AF37] rounded-full mt-2 shadow-[0_0_20px_rgba(212,175,55,0.4)]" />
  </div>
);

// ─── COPY CODE BUTTON ────────────────────────────────────────────────────────
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-zinc-500 hover:text-[#D4AF37] hover:bg-zinc-800 rounded-md transition-colors"
    >
      {copied ? <Check size={11} /> : <Copy size={11} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

// ─── IMAGE RENDERER COMPONENT ─────────────────────────────────────────────────
function MarkdownImage({ src, alt, ...props }: any) {
  const [hasError, setHasError] = useState(false);
  
  // 👉 ป้องกัน AI ลืมใส่ %20 ในเว้นวรรค
  let safeSrc = src;
  if (safeSrc && safeSrc.includes('pollinations.ai') && safeSrc.includes(' ')) {
    safeSrc = safeSrc.replace(/ /g, '%20');
  }

  if (hasError) {
    return (
      <span className="flex flex-col items-center justify-center p-6 my-5 rounded-xl border border-dashed border-zinc-800 bg-[#0A0A0A] text-zinc-500 font-mono shadow-inner w-full mx-auto">
        <span className="text-2xl mb-3 opacity-40">🖼️</span>
        <span className="text-xs uppercase tracking-widest text-[#D4AF37]/70 mb-1">Image Link Broken</span>
        <span className="text-[10px] text-zinc-600 text-center px-4 leading-relaxed">
          The AI attempted to generate an image, but the source URL is invalid or hallucinated.
        </span>
        {alt && (
          <span className="mt-4 text-[10px] text-zinc-400 bg-zinc-900/50 px-3 py-1.5 rounded-lg border border-zinc-800 break-words w-full text-center">
            Alt: {alt}
          </span>
        )}
      </span>
    );
  }
  
  return (
    <span className="block my-5">
      <img
        src={safeSrc}
        alt={alt || ''}
        className="rounded-xl max-w-full max-h-[400px] object-contain border border-zinc-800 shadow-md mx-auto bg-black"
        loading="lazy"
        onError={() => setHasError(true)}
        {...props}
      />
      {alt && <span className="block text-[11px] text-zinc-500 mt-2 font-mono text-center">{alt}</span>}
    </span>
  );
}

// ─── ANIMATED MARKDOWN ───────────────────────────────────────────────────────
function TypewriterMarkdown({ text }: { text: string }) {
  const [displayedText, setDisplayedText] = useState('');
  useEffect(() => {
    let i = 0;
    const timer = setInterval(() => {
      setDisplayedText(text.slice(0, i));
      i += 4;
      if (i > text.length) { setDisplayedText(text); clearInterval(timer); }
    }, 10);
    return () => clearInterval(timer);
  }, [text]);

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p:      ({node, ...props}) => <p className="mb-4 leading-relaxed last:mb-0" {...props} />,
        strong: ({node, ...props}) => <strong className="font-semibold text-[#D4AF37]" {...props} />,
        em:     ({node, ...props}) => <em className="italic text-zinc-400" {...props} />,
        ul:     ({node, ...props}) => <ul className="list-disc pl-5 mb-4 space-y-2 marker:text-[#D4AF37]" {...props} />,
        ol:     ({node, ...props}) => <ol className="list-decimal pl-5 mb-4 space-y-2 marker:text-[#D4AF37]" {...props} />,
        img:    MarkdownImage,
        
        // 👉 NEW: ระบบจัดการ UI Table ให้สวยงามและอ่านง่าย
        table:  ({node, ...props}) => <div className="overflow-x-auto my-6"><table className="w-full text-left border-collapse border border-zinc-800 text-[13px] shadow-sm rounded-lg overflow-hidden" {...props} /></div>,
        thead:  ({node, ...props}) => <thead className="bg-[#D4AF37]/10 text-[#D4AF37] border-b border-zinc-800 font-mono text-[11px] uppercase tracking-wider" {...props} />,
        tbody:  ({node, ...props}) => <tbody className="divide-y divide-zinc-800/50 bg-[#0A0A0A]/50" {...props} />,
        tr:     ({node, ...props}) => <tr className="hover:bg-zinc-900/50 transition-colors" {...props} />,
        th:     ({node, ...props}) => <th className="px-4 py-3 font-medium whitespace-nowrap border-r border-zinc-800/50 last:border-0" {...props} />,
        td:     ({node, ...props}) => <td className="px-4 py-3 leading-relaxed border-r border-zinc-800/50 last:border-0" {...props} />,

        code: ({node, inline, children, ...props}: any) => {
          const codeText = String(children).replace(/\n$/, '');
          if (inline) {
            return (
              <code className="bg-[#D4AF37]/10 text-[#D4AF37] px-1.5 py-0.5 rounded-md text-[13px] font-mono border border-[#D4AF37]/20" {...props}>
                {children}
              </code>
            );
          }
          return (
            <div className="relative group mb-4 mt-2">
              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                <CopyButton text={codeText} />
              </div>
              <code
                className="block bg-[#0A0A0A] border border-zinc-800 p-4 pr-16 rounded-xl text-[13px] font-mono text-zinc-300 shadow-inner whitespace-pre-wrap break-words"
                {...props}
              >
                {children}
              </code>
            </div>
          );
        },
      }}
    >
      {displayedText}
    </ReactMarkdown>
  );
}

// ─── DUAL STATUS HOOK ────────────────────────────────────────────────────────
type NetStatus = 'full' | 'partial' | 'unstable' | 'poor' | 'offline';
type DbStatus  = 'connected' | 'checking' | 'error';

function useDualStatus(user: User | null) {
  const [netStatus, setNetStatus] = useState<NetStatus>('full');
  const [dbStatus,  setDbStatus]  = useState<DbStatus>('checking');

  useEffect(() => {
    const check = () => {
      if (!navigator.onLine) { setNetStatus('offline'); return; }
      if ('connection' in navigator) {
        const conn = (navigator as any).connection;
        if (conn.downlink < 1 || conn.effectiveType === '2g') { setNetStatus('poor'); return; }
        if (conn.downlink < 3 || conn.effectiveType === '3g') { setNetStatus('unstable'); return; }
      }
      setNetStatus(user ? 'full' : 'partial');
    };
    check();
    window.addEventListener('online',  check);
    window.addEventListener('offline', check);
    if ('connection' in navigator) (navigator as any).connection.addEventListener('change', check);
    return () => {
      window.removeEventListener('online',  check);
      window.removeEventListener('offline', check);
      if ('connection' in navigator) (navigator as any).connection.removeEventListener('change', check);
    };
  }, [user]);

  useEffect(() => {
    const pingDb = async () => {
      if (!navigator.onLine) { setDbStatus('error'); return; }
      try {
        setDbStatus('checking');
        const res = await fetch(
          'https://firestore.googleapis.com/v1/projects/espresso-11e63/databases/(default)/documents/artifacts/espresso-terminal/memory/trace',
          { cache: 'no-store', signal: AbortSignal.timeout(5000) }
        );
        setDbStatus(res.ok || res.status === 404 ? 'connected' : 'error');
      } catch {
        setDbStatus('error');
      }
    };
    pingDb();
    const interval = setInterval(pingDb, 30000);
    return () => clearInterval(interval);
  }, []);

  return { netStatus, dbStatus };
}

// ─── FIREBASE / AI ENGINE ────────────────────────────────────────────────────
function useEspressoAI() {
  const [messages, setMessages] = useState<any[]>([]); 
  const [isTyping, setIsTyping] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<'idle' | 'pulling' | 'active'>('idle');
  const [activeDocument, setActiveDocument] = useState<{ name: string; text: string } | null>(null);
  const [displayScreen, setDisplayScreen] = useState<any>(null);
  const [orderBookItems, setOrderBookItems] = useState<any[]>([]);
  const [workspaceContent, setWorkspaceContent] = useState<string>('');
  const [wbFiles, setWbFiles] = useState<{ name: string; content: string }[]>([]);
  const [wbActiveTab, setWbActiveTab] = useState(0);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);

  const { netStatus, dbStatus } = useDualStatus(user);
  const [sessionHydrated, setSessionHydrated] = useState(false);

  useEffect(() => {
    if (sessionHydrated) return;
    const savedMemory = localStorage.getItem('espresso_short_term_memory');
    if (savedMemory) {
      try {
        const parsed = JSON.parse(savedMemory);
        if (parsed.length > 0) setMessages(parsed);
      } catch (e) { console.error("Failed to load memory", e); }
    }
    setSessionHydrated(true);
  }, [sessionHydrated]);

  useEffect(() => {
    if (sessionHydrated && messages.length > 0) {
      localStorage.setItem('espresso_short_term_memory', JSON.stringify(messages));
    } else if (sessionHydrated && messages.length === 0) {
      localStorage.removeItem('espresso_short_term_memory');
    }
  }, [messages, sessionHydrated]);

  useEffect(() => {
    if (!auth) return;
    const initAuth = async () => { try { await signInAnonymously(auth); } catch {}  };
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (u) { setUser(u); setStatus('idle'); }
      else { setStatus('idle'); initAuth(); }
    });
    return () => unsubscribe();
  }, []);

  const fetchOrderBook = async () => {
    if (!user || !db) return;
    try {
      const snap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'archives'));
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      items.sort((a: any, b: any) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setOrderBookItems(items);
    } catch {}
  };

  const deleteOrder = async (id: string) => {
    if (!db) return;
    try { await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'archives', id)); } catch (e) {}
    fetchOrderBook();
  };

  const parseAndAttachFile = useCallback(async (file: File): Promise<{ name: string; text: string } | null> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      if (file.type.startsWith('image/')) {
        reader.onload = (e) => resolve({ name: file.name, text: `[IMAGE_BASE64:${file.type}]:${(e.target?.result as string)}` });
        reader.readAsDataURL(file);
      } else {
        reader.onload = (e) => resolve({ name: file.name, text: (e.target?.result as string).substring(0, 30000) });
        reader.readAsText(file);
      }
      reader.onerror = () => resolve(null);
    });
  }, []);

  const processCommand = useCallback(async (
    text: string,
    openPanelFn: (k: PanelKey) => void,
    attachedFile?: { name: string; text: string } | null,
  ) => {
    if (!text.trim() && !attachedFile) return;

    let userContent = text;
    if (attachedFile) {
      if (attachedFile.text.startsWith('[IMAGE_BASE64:')) {
        userContent = `${text}\n\n[Attached image: ${attachedFile.name}]`;
      } else {
        userContent = `${text}\n\n[Attached file: ${attachedFile.name}]\n\`\`\`\n${attachedFile.text.substring(0, 8000)}\n\`\`\``;
      }
    }

    const userMsg = { role: 'user', content: userContent, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);

    // ── /clear
    if (text.trim() === '/clear') {
      setMessages([]);
      setActiveOrderId(null);
      localStorage.removeItem('espresso_short_term_memory');
      return;
    }

    // ── /save
    if (text.startsWith('/save') && user && db) {
      const title = text.replace('/save', '').trim() || `Project_${Date.now()}`;
      setIsTyping(true);
      setStatus('pulling');
      try {
        const chatHistory = messages.slice(-20).map(m => `${m.role}: ${m.content}`).join('\n');
        const summaryRes = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [{
              role: 'user',
              content: `Based on this conversation, generate a project memory in EXACTLY this JSON format (no markdown):\n{"summary":"...","checkpoint":"...","nextSteps":"..."}\n\nConversation:\n${chatHistory}`
            }]
          })
        });

        const summaryData = await summaryRes.json();
        let parsedSummary = { summary: "Saved from active context.", checkpoint: "", nextSteps: "" };
        try {
          const cleanJson = summaryData.text.replace(/```json/i, '').replace(/```/g, '').trim();
          parsedSummary = JSON.parse(cleanJson);
        } catch (parseError) {}

        if (activeOrderId) {
          await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'archives', activeOrderId), {
            title, context: parsedSummary.summary, checkpoint: parsedSummary.checkpoint, nextSteps: parsedSummary.nextSteps, updatedAt: serverTimestamp(),
          });
          setMessages(prev => [...prev, { role: 'assistant', content: `**[SYSTEM]** Updated '${title}'.` }]);
        } else {
          const ref = await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'archives'), {
            title, context: parsedSummary.summary, checkpoint: parsedSummary.checkpoint, nextSteps: parsedSummary.nextSteps, createdAt: serverTimestamp(), status: 'order',
          });
          setActiveOrderId(ref.id);
          setMessages(prev => [...prev, { role: 'assistant', content: `**[SYSTEM]** Saved '${title}'.` }]);
        }
        fetchOrderBook();
      } catch (err) {
      } finally {
        setIsTyping(false);
        setStatus('active');
      }
      return;
    }

    // ── /recall
    if (text.startsWith('/recall')) {
      const query = text.replace('/recall', '').trim();
      if (!query) {
        const activeOrders = orderBookItems.filter(o => o.status !== 'archived').map(o => `- **${o.title}**`).join('\n');
        setMessages(prev => [...prev, { role: 'assistant', content: `**[SYSTEM]** Available Orders:\n${activeOrders || "No active orders found."}` }]);
        return;
      }
      const target = orderBookItems.find(o => o.title.toLowerCase() === query.toLowerCase());
      if (target) {
        setActiveOrderId(target.id); 
        userMsg.content = `[SYSTEM EVENT: Recalled project "${target.title}". Memory context: ${target.context}. Checkpoint: ${target.checkpoint || 'N/A'}. Next Steps: ${target.nextSteps || 'N/A'}. Acknowledge this.]`;
        openPanelFn(null);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: `**[SYSTEM]** Could not find order: '${query}'.` }]);
        return;
      }
    }

    // ── STANDARD CHAT PROCESSING
    setStatus('pulling');
    setIsTyping(true);
    try {
      const apiMessages = [...messages, userMsg].map(m => {
        let finalContent = m.content;
        
        // 👉 DEV COMMAND OVERRIDE: แอบแทรก System Prompt บังคับให้ AI อัปเดตสกิล
        if (m === userMsg && text.startsWith('/update')) {
          finalContent = `[SYSTEM OVERRIDE]: The user invoked a Developer Command. Force update logic matrix. \n\nCommand Input: "${text.replace('/update', '').trim()}"\n\nYou MUST evaluate this input. If it is a strict logic/factual rule, explicitly output [UPDATE_SKILL:hard:The Rule Explained]. If it is a user preference, output [UPDATE_SKILL:soft:The Preference]. Explain the logic or difference to the user as well.`;
        }

        if (attachedFile?.text.startsWith('[IMAGE_BASE64:') && m === userMsg) {
          const match = attachedFile.text.match(/^\[IMAGE_BASE64:([\s\S]*?)\]:([\s\S]*)/);
          if (match) {
            return {
              role: m.role,
              content: [
                { type: 'image', source: { type: 'base64', media_type: match[1], data: match[2].split(',')[1] } },
                { type: 'text', text: finalContent || 'Describe this image.' },
              ],
            };
          }
        }
        return { role: m.role, content: finalContent };
      });

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages, activeDocument, workspace: workspaceContent }),
      });
      const data = await res.json();
      const replyText = data.text;

      setMessages(prev => [...prev, { role: 'assistant', content: replyText, timestamp: Date.now() }]);

      const mapMatch    = replyText.match(/\[MAP:\s*([^\]]+)\]/i);
      const flightMatch = replyText.match(/\[FLIGHT:\s*([^\]]+)\]/i);

      if (mapMatch) {
        setDisplayScreen({ type: 'map', title: mapMatch[1], data: mapMatch[1] });
        openPanelFn('display');
      } else if (flightMatch) {
        setDisplayScreen({ type: 'flight', title: flightMatch[1], data: flightMatch[1] });
        openPanelFn('display');
      } else if (replyText.includes('```')) {
        openPanelFn('whiteboard');
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: "CRITICAL_ERROR: Link failed." }]);
    } finally {
      setStatus('active');
      setIsTyping(false);
    }
  }, [messages, isTyping, user, db, activeDocument, workspaceContent, orderBookItems, activeOrderId]);

  const clearSession = useCallback(() => {
    setMessages([]);
    setActiveOrderId(null);
    localStorage.removeItem('espresso_short_term_memory');
  }, []);

  return {
    messages, isTyping, status, netStatus, dbStatus, displayScreen, setDisplayScreen,
    processCommand, fetchOrderBook, orderBookItems,
    workspaceContent, setWorkspaceContent,
    wbFiles, setWbFiles, wbActiveTab, setWbActiveTab,
    deleteOrder,
    parseAndAttachFile,
    clearSession,
  };
}

// ─── DUAL STATUS INDICATOR ───────────────────────────────────────────────────
const NET_META: Record<NetStatus, { label: string; color: string; pulse: boolean }> = {
  full:     { label: 'Online',    color: 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.7)]',  pulse: false },
  partial:  { label: 'Online',    color: 'bg-lime-400    shadow-[0_0_6px_rgba(163,230,53,0.6)]',  pulse: false },
  unstable: { label: 'Unstable',  color: 'bg-yellow-400  shadow-[0_0_6px_rgba(250,204,21,0.7)]',  pulse: true  },
  poor:     { label: 'Poor',      color: 'bg-orange-500  shadow-[0_0_6px_rgba(249,115,22,0.7)]',  pulse: true  },
  offline:  { label: 'Offline',   color: 'bg-red-500     shadow-[0_0_6px_rgba(239,68,68,0.7)]',   pulse: false },
};
const DB_META: Record<DbStatus, { label: string; color: string; pulse: boolean }> = {
  connected: { label: 'DB Synced',  color: 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.7)]',  pulse: false },
  checking:  { label: 'DB Pinging', color: 'bg-yellow-400  shadow-[0_0_6px_rgba(250,204,21,0.6)]',  pulse: true  },
  error:     { label: 'DB Error',   color: 'bg-red-500     shadow-[0_0_6px_rgba(239,68,68,0.7)]',   pulse: true  },
};

function DualStatusIndicator({ netStatus, dbStatus }: { netStatus: NetStatus; dbStatus: DbStatus }) {
  const [visible, setVisible] = useState(false);
  const net = NET_META[netStatus];
  const db  = DB_META[dbStatus];

  const combinedOk = netStatus === 'full' && dbStatus === 'connected';
  const combinedError = netStatus === 'offline' || dbStatus === 'error';
  const dotColor = combinedOk ? 'bg-emerald-500' : combinedError ? 'bg-red-500' : 'bg-yellow-400';
  const dotPulse = !combinedOk;

  return (
    <div className="relative flex items-center" onMouseEnter={() => setVisible(true)} onMouseLeave={() => setVisible(false)} onClick={() => setVisible(v => !v)}>
      <div className="cursor-pointer p-1">
        <div className={`size-2 rounded-full ${dotColor} ${dotPulse ? 'animate-pulse' : ''} shadow-[0_0_6px_currentColor]`} />
      </div>
      <AnimatePresence>
        {visible && (
          <motion.div initial={{ opacity: 0, y: 6, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6, scale: 0.95 }} transition={{ duration: 0.15 }} className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-50 pointer-events-none">
            <div className="bg-[#0A0A0A] border border-zinc-800 rounded-2xl px-4 py-3 shadow-2xl w-52">
              <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-zinc-600 mb-3">System Status</p>
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-2"><div className={`size-1.5 rounded-full shrink-0 ${net.color} ${net.pulse ? 'animate-pulse' : ''}`} /><span className="text-[11px] text-zinc-400">Internet</span></div>
                <span className={`font-mono text-[10px] font-medium ${netStatus === 'full' ? 'text-emerald-400' : netStatus === 'offline' ? 'text-red-400' : 'text-yellow-400'}`}>{net.label}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2"><div className={`size-1.5 rounded-full shrink-0 ${db.color} ${db.pulse ? 'animate-pulse' : ''}`} /><span className="text-[11px] text-zinc-400">Database</span></div>
                <span className={`font-mono text-[10px] font-medium ${dbStatus === 'connected' ? 'text-emerald-400' : dbStatus === 'error' ? 'text-red-400' : 'text-yellow-400'}`}>{db.label}</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── SIDE PANEL ───────────────────────────────────────────────────────────────
function SidePanel({ open, title, subtitle, icon: Icon, onClose, isWide, children }: any) {
  const widthClass  = isWide ? 'md:w-2/3' : 'md:w-[400px] lg:w-[450px]';
  const heightClass = isWide ? 'h-[50vh] md:h-auto md:bottom-0 border-b border-zinc-800 md:border-b-0' : 'bottom-0';
  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ x: '100%', opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: '100%', opacity: 0 }} transition={{ type: 'spring', damping: 25, stiffness: 200 }} className={`absolute right-0 top-0 w-full ${widthClass} ${heightClass} bg-[#050505] border-l border-zinc-800 shadow-2xl z-40 flex flex-col`}>
          <div className="px-6 py-5 border-b border-zinc-800 flex items-center justify-between bg-[#0A0A0A]">
            <div className="flex items-center gap-4">
              <div className="size-10 bg-zinc-900 rounded-xl flex items-center justify-center text-[#D4AF37] border border-zinc-800"><Icon size={20} /></div>
              <div>
                <h3 className="text-zinc-100 font-medium text-base">{title}</h3>
                <p className="text-zinc-500 text-[10px] uppercase tracking-[0.2em] font-mono mt-0.5">{subtitle}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 text-zinc-500 hover:text-white hover:bg-zinc-900 rounded-full"><X size={18} /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-6 bg-[#050505]">{children}</div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── PLUS MENU ────────────────────────────────────────────────────────────────
function PlusMenu({ openPanel, onPick }: { openPanel: PanelKey; onPick: (k: PanelKey) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setIsOpen(false); };
    if (isOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);
  return (
    <div className="relative" ref={menuRef}>
      <button type="button" onClick={() => setIsOpen(!isOpen)} className="size-9 rounded-full grid place-items-center shrink-0 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800">
        <Plus size={18} className={`transition-transform duration-200 ${isOpen ? 'rotate-45' : ''}`} />
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div initial={{ opacity: 0, y: 10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.95 }} transition={{ duration: 0.15 }} className="absolute bottom-full left-0 mb-3 w-64 p-2 bg-[#0A0A0A] border border-zinc-800 rounded-2xl shadow-2xl z-50 flex flex-col">
            <p className="px-3 py-2 font-mono text-[9px] uppercase tracking-[0.25em] text-zinc-500"><Bean className="inline size-3 mr-1.5 -mt-0.5 text-[#D4AF37]" /> Workspace</p>
            <div className="flex flex-col gap-1 mt-1">
              {Object.entries(PANEL_META).map(([key, meta]) => (
                <button key={key} onClick={() => { onPick(key as PanelKey); setIsOpen(false); }} className={`w-full flex items-center gap-3 px-2 py-2 rounded-xl text-left transition-colors ${openPanel === key ? 'bg-zinc-900 text-white' : 'text-zinc-400 hover:bg-zinc-900 hover:text-white'}`}>
                  <div className={`size-8 rounded-lg grid place-items-center shrink-0 ${openPanel === key ? 'bg-[#D4AF37] text-black' : 'bg-[#050505] border border-zinc-800 text-[#D4AF37]'}`}><meta.icon size={14} /></div>
                  <div className="flex-1 min-w-0"><span className="block text-sm font-medium">{meta.label}</span><span className="block font-mono text-[9px] uppercase tracking-[0.18em] text-zinc-500 mt-0.5">{meta.hint}</span></div>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── PINNED FILE CAPSULE ─────────────────────────────────────────────────────
function PinnedFileCapsule({ file, onRemove }: { file: { name: string; previewUrl?: string }; onRemove: () => void }) {
  return (
    <motion.div initial={{ opacity: 0, y: 6, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 4, scale: 0.95 }} className="flex items-center gap-2">
      {file.previewUrl ? (
        <div className="relative group">
          <img src={file.previewUrl} alt={file.name} className="h-16 w-24 object-cover rounded-xl border border-[#D4AF37]/25 shadow-md" />
          <button onClick={onRemove} className="absolute -top-1.5 -right-1.5 size-4 bg-zinc-900 border border-zinc-700 rounded-full flex items-center justify-center text-zinc-400 hover:text-white"><X size={9} /></button>
        </div>
      ) : (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-[#0A0A0A] border border-[#D4AF37]/30 rounded-full text-[11px] font-mono text-[#D4AF37] shadow-sm">
          <Paperclip size={11} /><span className="max-w-[160px] truncate">{file.name}</span>
          <button onClick={onRemove} className="ml-0.5 text-zinc-500 hover:text-white"><X size={11} /></button>
        </div>
      )}
    </motion.div>
  );
}

// ─── SLASH COMMAND MENU ──────────────────────────────────────────────────────
function SlashMenu({ query, onSelect }: { query: string; onSelect: (cmd: string) => void }) {
  const filtered = SLASH_COMMANDS.filter(c => c.cmd.startsWith(query));
  const [active, setActive] = useState(0);

  useEffect(() => { setActive(0); }, [query]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!filtered.length) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => (a + 1) % filtered.length); }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setActive(a => (a - 1 + filtered.length) % filtered.length); }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); onSelect(filtered[active].cmd + ' '); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [filtered, active, onSelect]);

  if (!filtered.length) return null;
  return (
    <motion.div initial={{ opacity: 0, y: 8, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6, scale: 0.97 }} className="absolute bottom-full left-0 mb-2 w-72 bg-[#0A0A0A] border border-zinc-800 rounded-2xl shadow-2xl z-50 overflow-hidden">
      <p className="px-4 pt-3 pb-1.5 font-mono text-[9px] uppercase tracking-[0.25em] text-zinc-600">Commands</p>
      {filtered.map((c, i) => (
        <button key={c.cmd} onClick={() => onSelect(c.cmd + ' ')} className={`w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors ${i === active ? 'bg-zinc-900' : 'hover:bg-zinc-900/60'}`}>
          <div><span className="font-mono text-[13px] text-[#D4AF37]">{c.cmd}</span><span className="ml-2 text-zinc-500 text-[11px]">{c.desc}</span></div>
          <span className="font-mono text-[10px] text-zinc-600">{c.hint}</span>
        </button>
      ))}
    </motion.div>
  );
}

// ─── GRAIN OVERLAY ───────────────────────────────────────────────────────────
function GrainOverlay() {
  return (
    <div className="fixed inset-0 z-[1] pointer-events-none opacity-[0.035]" style={{ backgroundImage: `url("data:image/svg+xml,<svg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>")`, backgroundSize: '160px' }} />
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [openPanel, setOpenPanel] = useState<PanelKey>(null);
  const [inputText, setInputText]  = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [pendingFile, setPendingFile] = useState<{ name: string; text: string; previewUrl?: string } | null>(null);
  const [showSlash, setShowSlash]   = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const taRef        = useRef<HTMLTextAreaElement>(null);
  const scrollRef    = useRef<HTMLDivElement>(null);
  const composerRef  = useRef<HTMLDivElement>(null);

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => { setIsMobile(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || window.innerWidth < 768); }, []);

  const [isBooting, setIsBooting] = useState(true);
  const [bootStep, setBootStep]   = useState(0);

  const {
    messages, isTyping, status, netStatus, dbStatus, displayScreen, setDisplayScreen,
    processCommand, fetchOrderBook, orderBookItems,
    workspaceContent, setWorkspaceContent,
    wbFiles, setWbFiles, wbActiveTab, setWbActiveTab,
    deleteOrder,
    parseAndAttachFile,
    clearSession,
  } = useEspressoAI();

  const bootMessages = [
    "GRINDING BEANS...", "TAMPING NEURAL MATRIX...", "APPLYING 9 BARS OF PRESSURE...", "EXTRACTING WORKSPACE...", "PULL COMPLETE. SYSTEM ONLINE.",
  ];

  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes drift1 { from { transform: translate(0,0) scale(1); } to { transform: translate(40px,30px) scale(1.1); } }
      @keyframes drift2 { from { transform: translate(0,0) scale(1); } to { transform: translate(-30px,20px) scale(0.95); } }
      @keyframes drift3 { from { transform: translate(0,0) scale(1); } to { transform: translate(20px,-20px) scale(1.05); } }
    `;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  useEffect(() => {
    let stepIndex = 0;
    const interval = setInterval(() => {
      stepIndex++;
      if (stepIndex < bootMessages.length) setBootStep(stepIndex);
      else { clearInterval(interval); setTimeout(() => setIsBooting(false), 900); }
    }, 600);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => { if (openPanel === 'orderbook') fetchOrderBook(); }, [openPanel]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [messages, isTyping]);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 24 * 8) + 'px';
  }, [inputText]);

  useEffect(() => { setShowSlash(inputText.startsWith('/') && !inputText.includes(' ')); }, [inputText]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpenPanel(null); setShowSlash(false); return; }
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); taRef.current?.focus(); return; }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    const onDragOver  = (e: DragEvent) => { e.preventDefault(); setIsDragging(true); };
    const onDragLeave = (e: DragEvent) => { if (!e.relatedTarget) setIsDragging(false); };
    const onDrop      = async (e: DragEvent) => {
      e.preventDefault(); setIsDragging(false);
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;
      const parsed = await parseAndAttachFile(file);
      if (parsed) setPendingFile(parsed);
    };
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    return () => { window.removeEventListener('dragover', onDragOver); window.removeEventListener('dragleave', onDragLeave); window.removeEventListener('drop', onDrop); };
  }, [parseAndAttachFile]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const parsed = await parseAndAttachFile(file);
    if (parsed) setPendingFile(parsed);
    e.target.value = '';
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if ((!inputText.trim() && !pendingFile) || isTyping) return;
    processCommand(inputText, setOpenPanel, pendingFile);
    setInputText('');
    setPendingFile(null);
  };

  const mainLayoutClass = openPanel === 'display' ? 'pt-[50vh] md:pt-0 md:w-1/3 flex-none' : openPanel ? 'flex-1 md:mr-[400px] lg:mr-[450px]' : 'flex-1 mr-0';

  return (
    <div className="fixed inset-0 flex w-full bg-[#0a0a0a] text-zinc-300 overflow-hidden font-sans">
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute w-[500px] h-[500px] rounded-full opacity-[0.13] blur-[100px] bg-amber-700 -top-32 -left-20 animate-[drift1_14s_ease-in-out_infinite_alternate]" />
        <div className="absolute w-[400px] h-[400px] rounded-full opacity-[0.09] blur-[90px] bg-amber-900 top-20 -right-24 animate-[drift2_17s_ease-in-out_infinite_alternate]" />
        <div className="absolute w-[600px] h-[280px] rounded-full opacity-[0.14] blur-[110px] bg-orange-950 -bottom-16 left-[10%] animate-[drift3_20s_ease-in-out_infinite_alternate]" />
      </div>
      <GrainOverlay />
      
      <AnimatePresence>
        {isBooting && (
          <motion.div className="absolute inset-0 z-[100] flex flex-col items-center justify-center bg-[#050505] text-[#D4AF37] font-mono" exit={{ opacity: 0, scale: 1.05 }} transition={{ duration: 0.6, ease: "easeInOut" }}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.5 }} className="flex flex-col items-center">
              <EspressoBootAnimation progress={((bootStep + 1) / bootMessages.length) * 100} />
              <div className="mt-10 h-4 text-[11px] tracking-widest uppercase opacity-80 text-center w-72">{bootMessages[bootStep]}</div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isDragging && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-[90] flex items-center justify-center bg-[#050505]/80 backdrop-blur-sm border-2 border-dashed border-[#D4AF37]/50 pointer-events-none">
            <div className="flex flex-col items-center gap-3 text-[#D4AF37]"><Paperclip size={40} className="opacity-70" /><p className="font-mono text-sm uppercase tracking-[0.2em]">Drop to attach</p></div>
          </motion.div>
        )}
      </AnimatePresence>

      <main className={`flex-1 flex flex-col items-center relative min-w-0 transition-all duration-300 ${mainLayoutClass}`}>
        <header className="w-full px-6 sm:px-10 py-4 flex justify-between items-center shrink-0 z-10">
          <div className="flex items-center gap-3">
            <EspressoMark size={28} />
            <div className="flex items-center gap-2.5">
              <p className="text-sm font-medium text-white/90 tracking-[0.05em] lowercase">espresso</p>
              <DualStatusIndicator netStatus={netStatus} dbStatus={dbStatus} />
            </div>
          </div>
          <button onClick={clearSession} title="New Chat (clear session)" className="size-[30px] grid place-items-center text-white/25 hover:text-white/60 hover:bg-white/5 rounded-lg transition-colors"><PenSquare size={14} /></button>
        </header>

        <div ref={scrollRef} className="w-full flex-1 overflow-y-auto scrollbar-hide">
          <div className="mx-auto w-full max-w-3xl px-6 gap-12 pt-10 pb-6 flex flex-col min-h-full">
            {messages.length === 0 ? (
              <div className="flex flex-col items-start justify-center flex-1 pb-20 px-2">
                <p className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.22em] text-[#D4AF37]/60 mb-4"><span className="inline-block w-5 h-px bg-[#D4AF37]/40" />ready to brew</p>
                <h1 className="text-5xl sm:text-6xl font-black leading-[1.0] tracking-[-0.03em] text-white/95 mb-4">What&apos;s<br /><span className="text-[#D4AF37]">brewing</span><span className="font-light italic text-white/20">?</span></h1>
                <p className="text-sm font-light text-white/35 leading-relaxed max-w-[280px] mb-8">Ask anything. Nothing leaves this session unless you save it to the Order Book.</p>
                <div className="flex flex-wrap gap-2">
                  {["Plan my week", "Review my code", "Track a flight", "Show me a map", "Recall last order"].map((p) => (
                    <button key={p} onClick={() => setInputText(p)} className="px-3.5 py-1.5 rounded-full border border-white/10 bg-white/[0.03] text-white/40 text-[11.5px] hover:border-[#D4AF37]/45 hover:bg-[#D4AF37]/07 hover:text-white/70 transition-all backdrop-blur-sm">{p}</button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m, i) => {
                let cleanText = m.content;
                let mapMatch = null, flightMatch = null;
                let skillUpdates: { type: string, content: string }[] = []; // 👉 NEW: Array เก็บคิว Notification

                if (m.role === 'assistant') {
                  mapMatch    = cleanText.match(/\[MAP:\s*([^\]]+)\]/i);
                  flightMatch = cleanText.match(/\[FLIGHT:\s*([^\]]+)\]/i);
                  if (mapMatch)    cleanText = cleanText.replace(mapMatch[0], '').trim();
                  if (flightMatch) cleanText = cleanText.replace(flightMatch[0], '').trim();

                  // 👉 NEW: ค้นหาและดึง [UPDATE_SKILL:hard/soft:xxx] ออกจากข้อความ
                  const skillRegex = /\[UPDATE_SKILL:(hard|soft):(.*?)\]/gi;
                  let match;
                  while ((match = skillRegex.exec(cleanText)) !== null) {
                    skillUpdates.push({ type: match[1].toLowerCase(), content: match[2].trim() });
                  }
                  // ลบ Tag ออกจากข้อความ เพื่อไม่ให้รกหน้าจอแชท
                  cleanText = cleanText.replace(skillRegex, '').trim();
                }

                return (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} key={i} className={`flex flex-col mb-10 w-full ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                    {m.role === 'assistant' && <p className="text-zinc-500 font-mono text-[10px] mb-2 uppercase tracking-[0.2em] ml-1">Espresso</p>}
                    
                    <div className={`text-[15px] leading-relaxed break-words ${m.role === 'user' ? 'bg-[#0A0A0A] border border-zinc-800 text-zinc-200 px-5 py-3 rounded-2xl max-w-[85%] shadow-sm whitespace-pre-wrap' : 'text-zinc-300 w-full'}`}>
                       {m.role === 'assistant' ? <TypewriterMarkdown text={cleanText} /> : cleanText}

                      {(mapMatch || flightMatch) && m.role === 'assistant' && (
                        <div className="flex flex-wrap gap-2 mt-4">
                          {mapMatch && <button onClick={() => { setDisplayScreen({ type: 'map', title: mapMatch[1], data: mapMatch[1] }); setOpenPanel('display'); }} className="flex items-center gap-2 px-3 py-2 bg-[#D4AF37]/10 border border-[#D4AF37]/30 rounded-lg text-[#D4AF37] hover:bg-[#D4AF37]/20 transition-all font-mono shadow-sm"><MapIcon size={14} /><span className="text-[10px] font-bold tracking-wider uppercase">Open Map: {mapMatch[1]}</span></button>}
                          {flightMatch && <button onClick={() => { setDisplayScreen({ type: 'flight', title: flightMatch[1], data: flightMatch[1] }); setOpenPanel('display'); }} className="flex items-center gap-2 px-3 py-2 bg-[#D4AF37]/10 border border-[#D4AF37]/30 rounded-lg text-[#D4AF37] hover:bg-[#D4AF37]/20 transition-all font-mono shadow-sm"><Plane size={14} /><span className="text-[10px] font-bold tracking-wider uppercase">Track: {flightMatch[1]}</span></button>}
                        </div>
                      )}

                      {/* 👉 NEW: Render Skill Update Notifications */}
                      {skillUpdates.length > 0 && m.role === 'assistant' && (
                        <div className="flex flex-col gap-2 mt-5 border-t border-zinc-800/50 pt-4">
                          {skillUpdates.map((update, idx) => (
                            <motion.div 
                              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} key={idx} 
                              className={`flex items-start gap-3 px-4 py-3 bg-[#0A0A0A]/80 border rounded-xl max-w-fit shadow-sm ${update.type === 'hard' ? 'border-red-900/30' : 'border-blue-900/30'}`}
                            >
                              <div className="mt-0.5">
                                {update.type === 'hard' 
                                  ? <Workflow size={14} className="text-red-400" />
                                  : <BookOpen size={14} className="text-blue-400" />
                                }
                              </div>
                              <div>
                                <span className={`block text-[9px] uppercase font-mono tracking-[0.2em] mb-1 ${update.type === 'hard' ? 'text-red-400/70' : 'text-blue-400/70'}`}>
                                  {update.type === 'hard' ? 'Hard Skill Adjusted' : 'Soft Skill Learned'}
                                </span>
                                <span className="text-[12.5px] text-zinc-300 font-medium leading-relaxed">
                                  {update.content}
                                </span>
                              </div>
                            </motion.div>
                          ))}
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })
            )}

            {isTyping && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-start mb-8">
                <p className="text-zinc-500 font-mono text-[10px] mb-2 uppercase tracking-[0.2em] ml-1">Espresso</p>
                <div className="px-4 py-3 bg-[#0A0A0A] border border-zinc-800 rounded-2xl text-sm text-[#D4AF37] font-mono flex items-center gap-3 shadow-inner">
                  <div className="flex gap-1">
                    <div className="size-1.5 bg-[#D4AF37] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="size-1.5 bg-[#D4AF37] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="size-1.5 bg-[#D4AF37] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  Extracting...
                </div>
              </motion.div>
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="w-full max-w-3xl px-6 pb-8 pt-4 shrink-0 mx-auto bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/95 to-transparent">
          <AnimatePresence>
            {pendingFile && <div className="mb-2 flex items-center"><PinnedFileCapsule file={pendingFile} onRemove={() => setPendingFile(null)} /></div>}
          </AnimatePresence>

          <div ref={composerRef} className="relative flex items-end gap-2 border-b border-white/10 focus-within:border-[#D4AF37]/50 transition-colors pb-3">
            <AnimatePresence>
              {showSlash && <SlashMenu query={inputText} onSelect={(cmd) => { setInputText(cmd); setShowSlash(false); taRef.current?.focus(); }} />}
            </AnimatePresence>

            <PlusMenu openPanel={openPanel} onPick={(k) => setOpenPanel(openPanel === k ? null : k)} />
            <button type="button" onClick={() => fileInputRef.current?.click()} title="Attach file" className="size-9 rounded-full grid place-items-center shrink-0 text-zinc-500 hover:text-[#D4AF37] hover:bg-zinc-800"><Paperclip size={16} /></button>
            <input ref={fileInputRef} type="file" className="hidden" accept=".txt,.md,.json,.js,.ts,.tsx,.jsx,.py,.css,.html,.csv,image/*" onChange={handleFileSelect} />

            <textarea
              ref={taRef}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !showSlash) {
                  if (isMobile) return;
                  e.preventDefault(); handleSubmit();
                }
              }}
              onPaste={async (e) => {
                const items = Array.from(e.clipboardData?.items || []);
                const imageItem = items.find(item => item.type.startsWith('image/'));
                if (!imageItem) return;
                e.preventDefault();
                const file = imageItem.getAsFile();
                if (!file) return;
                const parsed = await parseAndAttachFile(file);
                if (parsed) { const previewUrl = URL.createObjectURL(file); setPendingFile({ ...parsed, previewUrl }); }
              }}
              rows={1}
              placeholder="What's brewing?"
              className="flex-1 resize-none bg-transparent py-1.5 px-2 text-base text-white placeholder:text-zinc-600 focus:outline-none scrollbar-hide min-h-[36px]"
              style={{ maxHeight: '192px' }} 
              autoFocus
            />

            <button type="submit" disabled={isTyping || (!inputText.trim() && !pendingFile)} className={`size-9 rounded-full grid place-items-center shrink-0 transition-all ${isTyping || (!inputText.trim() && !pendingFile) ? 'bg-zinc-900 text-zinc-600' : 'bg-[#D4AF37] text-black hover:brightness-110 shadow-[0_0_15px_rgba(212,175,55,0.3)]'}`}>
              <SendHorizontal size={16} />
            </button>
          </div>

          <p className="mt-3 text-center font-mono text-[9px] uppercase tracking-[0.2em] text-white/10">⏎ send · ⌘K focus · / commands</p>
        </form>
      </main>

      {Object.entries(PANEL_META).map(([key, meta]) => (
        <SidePanel key={key} open={openPanel === key} title={meta.title} subtitle={meta.subtitle} icon={meta.icon} isWide={key === 'display'} onClose={() => setOpenPanel(null)}>
          {key === 'orderbook' && (
            <div className="space-y-4">
              {orderBookItems.length === 0 ? (
                <div className="p-12 flex flex-col items-center justify-center text-center border border-dashed border-zinc-800 rounded-2xl">
                  <BookOpen size={32} className="text-zinc-700 mb-4" /><p className="text-zinc-500 font-mono text-xs uppercase tracking-widest">Archive Empty</p><p className="text-zinc-600 text-xs mt-2">Use /save in chat to store memories.</p>
                </div>
              ) : (
                orderBookItems.map((item, i) => (
                  <div key={i} className="bg-[#0A0A0A] border border-zinc-800 rounded-2xl hover:border-[#D4AF37]/30 transition-colors overflow-hidden">
                    <div className="px-5 pt-4 pb-3 flex items-start justify-between gap-2">
                      <h4 className="text-white font-medium text-sm leading-snug">{item.title}</h4>
                      <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-600 shrink-0 mt-0.5">{item.status === 'archived' ? 'archived' : 'active'}</span>
                    </div>
                    <div className="px-5 pb-4 space-y-3">
                      {item.summary && (<div><p className="font-mono text-[9px] uppercase tracking-[0.15em] text-[#D4AF37]/50 mb-1">📋 Summary</p><p className="text-zinc-400 text-xs leading-relaxed line-clamp-2">{item.summary}</p></div>)}
                      {item.checkpoint && (<div><p className="font-mono text-[9px] uppercase tracking-[0.15em] text-blue-400/50 mb-1">📍 Checkpoint</p><p className="text-zinc-400 text-xs leading-relaxed line-clamp-2">{item.checkpoint}</p></div>)}
                      {item.nextSteps && (<div><p className="font-mono text-[9px] uppercase tracking-[0.15em] text-emerald-400/50 mb-1">⏭ Next Steps</p><p className="text-zinc-400 text-xs leading-relaxed line-clamp-2">{item.nextSteps}</p></div>)}
                      {!item.summary && item.context && (<p className="text-zinc-500 text-xs line-clamp-2">{item.context}</p>)}
                    </div>
                    <div className="px-5 pb-4 flex gap-2 border-t border-zinc-800/50 pt-3">
                      <button onClick={() => processCommand(`/recall ${item.title}`, setOpenPanel)} className="text-[10px] uppercase tracking-wider font-mono bg-zinc-900 text-[#D4AF37] px-3 py-1.5 rounded-lg hover:bg-zinc-800 transition-colors">Recall</button>
                      <button onClick={() => deleteOrder(item.id)} className="text-[10px] uppercase tracking-wider font-mono bg-zinc-900 text-red-500 px-3 py-1.5 rounded-lg hover:bg-zinc-800 transition-colors ml-auto">Delete</button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {key === 'whiteboard' && (
            <div className="h-full border border-zinc-800 rounded-2xl bg-[#0A0A0A] font-mono text-sm shadow-inner overflow-hidden flex flex-col">
              {wbFiles.length > 0 ? (
                <>
                  <div className="flex items-center gap-0 border-b border-zinc-800 bg-zinc-900/60 overflow-x-auto scrollbar-hide">
                    {wbFiles.map((f, i) => (
                      <button key={i} onClick={() => setWbActiveTab(i)} className={`flex items-center gap-1.5 px-3 py-2.5 text-[10px] font-mono whitespace-nowrap border-r border-zinc-800 transition-colors shrink-0 ${wbActiveTab === i ? 'bg-[#0A0A0A] text-[#D4AF37] border-b-2 border-b-[#D4AF37] -mb-px' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'}`}>
                        <Code size={10} />{f.name.split('/').pop()}
                      </button>
                    ))}
                    <button onClick={() => setWbFiles([])} className="ml-auto px-3 py-2.5 text-zinc-600 hover:text-zinc-400 transition-colors shrink-0" title="Clear files"><X size={12} /></button>
                  </div>
                  <div className="px-4 py-1.5 text-[9px] text-zinc-600 font-mono border-b border-zinc-800/50 flex items-center justify-between">
                    <span>{wbFiles[wbActiveTab]?.name}</span>
                    <button onClick={() => navigator.clipboard.writeText(wbFiles[wbActiveTab]?.content || '')} className="flex items-center gap-1 text-zinc-600 hover:text-[#D4AF37] transition-colors"><Copy size={10} /><span>copy</span></button>
                  </div>
                  <pre className="flex-1 overflow-auto p-4 text-[12px] text-blue-300 leading-relaxed whitespace-pre-wrap break-words">{wbFiles[wbActiveTab]?.content}</pre>
                </>
              ) : (
                <>
                  <div className="p-3 border-b border-zinc-800 bg-zinc-900/50 flex justify-between items-center text-xs text-zinc-500 uppercase tracking-widest"><div className="flex items-center gap-2"><Code size={14} className="text-[#D4AF37]" /><span>workspace.txt</span></div></div>
                  <textarea className="flex-1 w-full bg-transparent p-6 text-blue-300 outline-none resize-none font-mono text-xs leading-relaxed whitespace-pre-wrap break-words" value={workspaceContent} onChange={(e) => setWorkspaceContent(e.target.value)} placeholder="// Ready for notes and code. Type here, Espresso is watching." spellCheck={false} />
                </>
              )}
            </div>
          )}

          {key === 'display' && (
            displayScreen ? (
              <div className="h-full w-full rounded-2xl overflow-hidden border border-zinc-800 bg-black shadow-inner">
                {displayScreen.type === 'map' && <iframe title="Map View" width="100%" height="100%" style={{ border: 0, filter: 'invert(90%) hue-rotate(180deg) contrast(100%) grayscale(20%)' }} loading="lazy" src={`http://googleusercontent.com/maps.google.com/${encodeURIComponent(displayScreen.data)}&t=k&z=14&ie=UTF8&iwloc=&output=embed`} />}
                {displayScreen.type === 'flight' && <iframe title="Flight Tracker" width="100%" height="100%" style={{ border: 0 }} src={`https://globe.adsbexchange.com/?ident=${encodeURIComponent(displayScreen.data)}`} />}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center border border-dashed border-zinc-800 rounded-2xl p-8 text-center bg-[#0A0A0A]">
                <CupSoda size={48} className="text-zinc-800 mb-6" /><h3 className="text-zinc-300 font-medium text-lg mb-2">No active visual plated</h3><p className="text-zinc-600 text-sm max-w-[200px]">Ask Espresso to generate a map or track a flight to populate this view.</p>
              </div>
            )
          )}
        </SidePanel>
      ))}
    </div>
  );
}