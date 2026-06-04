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
// sessionStorage ช่วยให้ refresh แชทไม่หาย แต่ปิดแท็บเบราว์เซอร์จะหายเพื่อ privacy
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

// ─── SLASH COMMANDS (Feature #4) ─────────────────────────────────────────────
const SLASH_COMMANDS = [
  { cmd: '/save',   desc: 'Save to Order Book',   hint: '/save [title]' },
  { cmd: '/recall', desc: 'Load from Order Book', hint: '/recall [name]' },
  { cmd: '/clear',  desc: 'Clear this session',   hint: '/clear' },
  { cmd: '/map',    desc: 'Show a location',       hint: '/map [place]' },
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

// ─── COPY CODE BUTTON (Feature #3) ───────────────────────────────────────────
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

// ─── ANIMATED MARKDOWN (with Copy Code Block) ────────────────────────────────
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
        code:   ({node, inline, children, ...props}: any) => {
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
              {/* Copy button top-right of code block — Feature #3 */}
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

// ─── NETWORK STATUS HOOK ──────────────────────────────────────────────────────
function useNetworkStatus(user: User | null) {
  const [status, setStatus] = useState<'full' | 'partial' | 'unstable' | 'poor' | 'offline'>('full');
  useEffect(() => {
    const checkNetwork = () => {
      if (!navigator.onLine) { setStatus('offline'); return; }
      let isSlow = false, isPoor = false;
      if ('connection' in navigator) {
        const conn = (navigator as any).connection;
        if (conn.downlink < 1 || conn.effectiveType === '2g') isPoor = true;
        else if (conn.downlink < 3 || conn.effectiveType === '3g') isSlow = true;
      }
      if (isPoor) setStatus('poor');
      else if (isSlow) setStatus('unstable');
      else if (!user) setStatus('partial');
      else setStatus('full');
    };
    checkNetwork();
    window.addEventListener('online', checkNetwork);
    window.addEventListener('offline', checkNetwork);
    if ('connection' in navigator) (navigator as any).connection.addEventListener('change', checkNetwork);
    return () => {
      window.removeEventListener('online', checkNetwork);
      window.removeEventListener('offline', checkNetwork);
      if ('connection' in navigator) (navigator as any).connection.removeEventListener('change', checkNetwork);
    };
  }, [user]);
  return status;
}

// ─── FIREBASE / AI ENGINE ────────────────────────────────────────────────────
function useEspressoAI() {
  const [messages, setMessages] = useState<any[]>([]);  // SSR-safe: always start empty
  const [isTyping, setIsTyping] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<'idle' | 'pulling' | 'active'>('idle');
  const [activeDocument, setActiveDocument] = useState<{ name: string; text: string } | null>(null);
  const [displayScreen, setDisplayScreen] = useState<any>(null);
  const [orderBookItems, setOrderBookItems] = useState<any[]>([]);
  const [workspaceContent, setWorkspaceContent] = useState<string>('');
  // Feature #8: Smart Auto-update — remember which order is currently "loaded"
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);

  const netStatus = useNetworkStatus(user);

  // Feature #7: Session cache — declared first so both effects can reference it
  const [sessionHydrated, setSessionHydrated] = useState(false);

  // Hydrate from sessionStorage after mount (client-only, avoids SSR mismatch)
  useEffect(() => {
    if (sessionHydrated) return;
    const saved = loadSessionMessages();
    if (saved.length > 0) setMessages(saved);
    setSessionHydrated(true);
  }, []);

  // Persist messages to sessionStorage whenever they change
  useEffect(() => { if (sessionHydrated) saveSessionMessages(messages); }, [messages, sessionHydrated]);

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
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'archives', id));
    } catch (e) { console.error("Delete failed:", e); }
    fetchOrderBook();
  };

  const archiveOrder = async (id: string, title: string, context: string) => {
    if (!db) return;
    setMessages(prev => [...prev, { role: 'assistant', content: `**[SYSTEM]** Archiving '${title}'. Updating Hard Skills matrix...\n[UPDATE_SKILL:hard:Archived Project: ${title} - ${context}]` }]);
    fetchOrderBook();
  };

  // ─── FILE UPLOAD PARSER (Feature #11/12/13) ────────────────────────────────
  // Option A: Frontend parse → Text + Base64 ตาม architecture ที่ตกลงไว้
  const parseAndAttachFile = useCallback(async (file: File): Promise<{ name: string; text: string } | null> => {
    return new Promise((resolve) => {
      const reader = new FileReader();

      if (file.type.startsWith('image/')) {
        // Vision path: read as base64 DataURL
        reader.onload = (e) => {
          const base64 = (e.target?.result as string) ?? '';
          resolve({ name: file.name, text: `[IMAGE_BASE64:${file.type}]:${base64}` });
        };
        reader.readAsDataURL(file);
      } else {
        // Text / code / JSON path: read as plain text
        reader.onload = (e) => {
          const raw = (e.target?.result as string) ?? '';
          resolve({ name: file.name, text: raw.substring(0, 30000) });
        };
        reader.readAsText(file);
      }
      reader.onerror = () => resolve(null);
    });
  }, []);

  // ─── COMMAND PROCESSOR ────────────────────────────────────────────────────
  const processCommand = useCallback(async (
    text: string,
    openPanelFn: (k: PanelKey) => void,
    attachedFile?: { name: string; text: string } | null,
  ) => {
    if (!text.trim() && !attachedFile) return;

    // Build user content — append file context if present
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

    // ── /clear ────────────────────────────────────────────────────────────────
    if (text.trim() === '/clear') {
      setMessages([]);
      setActiveOrderId(null);
      return;
    }

    // ── /save ─────────────────────────────────────────────────────────────────
    if (text.startsWith('/save') && user && db) {
      const title = text.replace('/save', '').trim() || `Order_${Date.now()}`;
      const ctx = messages.slice(-4).map(m => `${m.role}: ${m.content}`).join(' | ');

      if (activeOrderId) {
        // Feature #8: Smart Auto-update — overwrite existing order instead of creating new
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'archives', activeOrderId), {
          title, context: ctx, updatedAt: serverTimestamp(),
        });
        setMessages(prev => [...prev, { role: 'assistant', content: `**[SYSTEM]** Updated '${title}' in Order Book.` }]);
      } else {
        const ref = await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'archives'), {
          title, context: ctx, createdAt: serverTimestamp(), status: 'order',
        });
        setActiveOrderId(ref.id);
        setMessages(prev => [...prev, { role: 'assistant', content: `**[SYSTEM]** Saved '${title}' to Order Book.` }]);
      }
      fetchOrderBook();
      return;
    }

    // ── /recall ───────────────────────────────────────────────────────────────
    if (text.startsWith('/recall')) {
      const query = text.replace('/recall', '').trim();
      if (!query) {
        const activeOrders = orderBookItems.filter(o => o.status !== 'archived').map(o => `- **${o.title}**`).join('\n');
        setMessages(prev => [...prev, { role: 'assistant', content: `**[SYSTEM]** Available Orders:\n${activeOrders || "No active orders found."}\n\n*Use /recall [name] to load one.*` }]);
        return;
      }
      const target = orderBookItems.find(o => o.title.toLowerCase() === query.toLowerCase());
      if (target) {
        setActiveOrderId(target.id); // Feature #8: remember loaded ID for future /save
        userMsg.content = `[SYSTEM EVENT: The user recalled the project "${target.title}". Memory context: ${target.context}. Acknowledge this conversationally and ask what they want to do next.]`;
        // Feature #6: Auto-close panel after recall — handled in App component via callback
        openPanelFn(null);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: `**[SYSTEM]** Could not find order: '${query}'.` }]);
        return;
      }
    }

    setStatus('pulling');
    setIsTyping(true);
    try {
      // Build messages array — for images, send base64 directly as Anthropic vision content
      const apiMessages = [...messages, userMsg].map(m => {
        if (attachedFile?.text.startsWith('[IMAGE_BASE64:') && m === userMsg) {
          const match = attachedFile.text.match(/^\[IMAGE_BASE64:([\s\S]*?)\]:([\s\S]*)/);
          if (match) {
            return {
              role: m.role,
              content: [
                { type: 'image', source: { type: 'base64', media_type: match[1], data: match[2].split(',')[1] } },
                { type: 'text', text: text || 'Describe this image.' },
              ],
            };
          }
        }
        return { role: m.role, content: m.content };
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

  // Feature #1 — clear messages (for New Chat button)
  const clearSession = useCallback(() => {
    setMessages([]);
    setActiveOrderId(null);
    saveSessionMessages([]);
  }, []);

  return {
    messages, isTyping, status, netStatus, displayScreen, setDisplayScreen,
    processCommand, fetchOrderBook, orderBookItems,
    workspaceContent, setWorkspaceContent,
    deleteOrder, archiveOrder,
    parseAndAttachFile,
    clearSession,
  };
}

// ─── NETWORK STATUS DOT ───────────────────────────────────────────────────────
const NET_DETAILS: Record<string, { desc: string }> = {
  full:     { desc: "Internet connected · Database synced" },
  partial:  { desc: "Internet connected · Database offline" },
  unstable: { desc: "Internet unstable or slow" },
  poor:     { desc: "Very poor connection · 2G or lower" },
  offline:  { desc: "No internet connection" },
};

function NetworkStatusDot({ netStatus, netColors, netLabels }: { netStatus: string; netColors: Record<string, string>; netLabels: Record<string, string> }) {
  const [visible, setVisible] = useState(false);
  const detail = NET_DETAILS[netStatus];
  const isPulsing = netStatus === 'unstable' || netStatus === 'poor';
  return (
    <div className="relative flex items-center" onMouseEnter={() => setVisible(true)} onMouseLeave={() => setVisible(false)} onClick={() => setVisible(v => !v)}>
      <div className="relative cursor-pointer p-1">
        <div className={`size-2 rounded-full ${netColors[netStatus]} ${isPulsing ? 'animate-pulse' : ''}`} />
      </div>
      <AnimatePresence>
        {visible && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-50 pointer-events-none"
          >
            <div className="bg-[#0A0A0A] border border-zinc-800 rounded-xl px-3 py-2.5 shadow-2xl min-w-[180px] text-center">
              <div className="flex items-center justify-center gap-2 mb-1">
                <div className={`size-1.5 rounded-full ${netColors[netStatus]}`} />
                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-100">{netLabels[netStatus]}</span>
              </div>
              <p className="font-mono text-[9px] text-zinc-500 leading-relaxed">{detail.desc}</p>
            </div>
            <div className="flex justify-center -mt-px">
              <div className="w-2 h-2 bg-[#0A0A0A] border-l border-t border-zinc-800 rotate-45 -mt-1" />
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
  const heightClass = isWide
    ? 'h-[50vh] md:h-auto md:bottom-0 border-b border-zinc-800 md:border-b-0'
    : 'bottom-0';
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ x: '100%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className={`absolute right-0 top-0 w-full ${widthClass} ${heightClass} bg-[#050505] border-l border-zinc-800 shadow-2xl z-40 flex flex-col`}
        >
          <div className="px-6 py-5 border-b border-zinc-800 flex items-center justify-between bg-[#0A0A0A]">
            <div className="flex items-center gap-4">
              <div className="size-10 bg-zinc-900 rounded-xl flex items-center justify-center text-[#D4AF37] border border-zinc-800 shadow-[0_0_10px_rgba(212,175,55,0.1)]">
                <Icon size={20} />
              </div>
              <div>
                <h3 className="text-zinc-100 font-medium text-base">{title}</h3>
                <p className="text-zinc-500 text-[10px] uppercase tracking-[0.2em] font-mono mt-0.5">{subtitle}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 text-zinc-500 hover:text-white hover:bg-zinc-900 rounded-full transition-colors"><X size={18} /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-6 bg-[#050505]">
            {children}
          </div>
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
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    if (isOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);
  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="size-9 rounded-full grid place-items-center shrink-0 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
      >
        <Plus size={18} className={`transition-transform duration-200 ${isOpen ? 'rotate-45' : ''}`} />
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-full left-0 mb-3 w-64 p-2 bg-[#0A0A0A] border border-zinc-800 rounded-2xl shadow-2xl z-50 flex flex-col"
          >
            <p className="px-3 py-2 font-mono text-[9px] uppercase tracking-[0.25em] text-zinc-500">
              <Bean className="inline size-3 mr-1.5 -mt-0.5 text-[#D4AF37]" /> Workspace
            </p>
            <div className="flex flex-col gap-1 mt-1">
              {Object.entries(PANEL_META).map(([key, meta]) => (
                <button
                  key={key}
                  onClick={() => { onPick(key as PanelKey); setIsOpen(false); }}
                  className={`w-full flex items-center gap-3 px-2 py-2 rounded-xl text-left transition-colors ${openPanel === key ? 'bg-zinc-900 text-white' : 'text-zinc-400 hover:bg-zinc-900 hover:text-white'}`}
                >
                  <div className={`size-8 rounded-lg grid place-items-center shrink-0 transition-colors ${openPanel === key ? 'bg-[#D4AF37] text-black' : 'bg-[#050505] border border-zinc-800 text-[#D4AF37]'}`}>
                    <meta.icon size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="block text-sm font-medium">{meta.label}</span>
                    <span className="block font-mono text-[9px] uppercase tracking-[0.18em] text-zinc-500 mt-0.5">{meta.hint}</span>
                  </div>
                  {openPanel === key && <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#D4AF37] pr-2">open</span>}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── PINNED FILE CAPSULE (Feature #13) ───────────────────────────────────────
function PinnedFileCapsule({ file, onRemove }: { file: { name: string }; onRemove: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 4, scale: 0.95 }}
      transition={{ duration: 0.15 }}
      className="flex items-center gap-2 px-3 py-1.5 bg-[#0A0A0A] border border-[#D4AF37]/30 rounded-full text-[11px] font-mono text-[#D4AF37] shadow-sm"
    >
      <Paperclip size={11} />
      <span className="max-w-[160px] truncate">{file.name}</span>
      <button onClick={onRemove} className="ml-0.5 text-zinc-500 hover:text-white transition-colors">
        <X size={11} />
      </button>
    </motion.div>
  );
}

// ─── SLASH COMMAND MENU (Feature #4) ─────────────────────────────────────────
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
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 6, scale: 0.97 }}
      transition={{ duration: 0.13 }}
      className="absolute bottom-full left-0 mb-2 w-72 bg-[#0A0A0A] border border-zinc-800 rounded-2xl shadow-2xl z-50 overflow-hidden"
    >
      <p className="px-4 pt-3 pb-1.5 font-mono text-[9px] uppercase tracking-[0.25em] text-zinc-600">Commands</p>
      {filtered.map((c, i) => (
        <button
          key={c.cmd}
          onClick={() => onSelect(c.cmd + ' ')}
          className={`w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors ${i === active ? 'bg-zinc-900' : 'hover:bg-zinc-900/60'}`}
        >
          <div>
            <span className="font-mono text-[13px] text-[#D4AF37]">{c.cmd}</span>
            <span className="ml-2 text-zinc-500 text-[11px]">{c.desc}</span>
          </div>
          <span className="font-mono text-[10px] text-zinc-600">{c.hint}</span>
        </button>
      ))}
    </motion.div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [openPanel, setOpenPanel] = useState<PanelKey>(null);
  const [inputText, setInputText]  = useState('');
  const [isDragging, setIsDragging] = useState(false);                   // Feature #12
  const [pendingFile, setPendingFile] = useState<{ name: string; text: string } | null>(null); // Feature #11-13
  const [showSlash, setShowSlash]   = useState(false);                    // Feature #4
  const fileInputRef = useRef<HTMLInputElement>(null);
  const taRef        = useRef<HTMLTextAreaElement>(null);
  const scrollRef    = useRef<HTMLDivElement>(null);
  const composerRef  = useRef<HTMLDivElement>(null);

  const [isBooting, setIsBooting] = useState(true);
  const [bootStep, setBootStep]   = useState(0);

  const {
    messages, isTyping, status, netStatus, displayScreen, setDisplayScreen,
    processCommand, fetchOrderBook, orderBookItems,
    workspaceContent, setWorkspaceContent,
    deleteOrder, archiveOrder,
    parseAndAttachFile,
    clearSession,
  } = useEspressoAI();

  const bootMessages = [
    "GRINDING BEANS...",
    "TAMPING NEURAL MATRIX...",
    "APPLYING 9 BARS OF PRESSURE...",
    "EXTRACTING WORKSPACE...",
    "PULL COMPLETE. SYSTEM ONLINE.",
  ];

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
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, isTyping]);

  // ── Feature #1: Auto-resize textarea ──────────────────────────────────────
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    const lineH = 24;
    const maxH  = lineH * 8;
    ta.style.height = Math.min(ta.scrollHeight, maxH) + 'px';
  }, [inputText]);

  // ── Feature #4: Slash command visibility ──────────────────────────────────
  useEffect(() => {
    const isSlash = inputText.startsWith('/') && !inputText.includes(' ');
    setShowSlash(isSlash);
  }, [inputText]);

  // ── Feature #5: Global Hotkeys ────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Esc: close active panel
      if (e.key === 'Escape') {
        setOpenPanel(null);
        setShowSlash(false);
        return;
      }
      // Cmd/Ctrl + K: focus chat input
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        taRef.current?.focus();
        return;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ── Feature #12: Drag & Drop ──────────────────────────────────────────────
  useEffect(() => {
    const onDragOver  = (e: DragEvent) => { e.preventDefault(); setIsDragging(true); };
    const onDragLeave = (e: DragEvent) => { if (!e.relatedTarget) setIsDragging(false); };
    const onDrop      = async (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;
      const parsed = await parseAndAttachFile(file);
      if (parsed) setPendingFile(parsed);
    };
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, [parseAndAttachFile]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const parsed = await parseAndAttachFile(file);
    if (parsed) setPendingFile(parsed);
    e.target.value = ''; // reset input so same file can be re-selected
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if ((!inputText.trim() && !pendingFile) || isTyping) return;
    processCommand(inputText, setOpenPanel, pendingFile);
    setInputText('');
    setPendingFile(null);
  };

  const netColors = {
    full:     'bg-[#10B981] shadow-[0_0_8px_rgba(16,185,129,0.5)]',
    partial:  'bg-[#84CC16] shadow-[0_0_8px_rgba(132,204,22,0.5)]',
    unstable: 'bg-[#EAB308] shadow-[0_0_8px_rgba(234,179,8,0.5)]',
    poor:     'bg-[#F97316] shadow-[0_0_8px_rgba(249,115,22,0.5)]',
    offline:  'bg-[#EF4444] shadow-[0_0_8px_rgba(239,68,68,0.5)]',
  };
  const netLabels = {
    full:     'SYNCED & BREWING',
    partial:  'LOCAL ONLY',
    unstable: 'UNSTABLE FLOW',
    poor:     'POOR EXTRACTION',
    offline:  'MACHINE OFFLINE',
  };

  const mainLayoutClass = openPanel === 'display'
    ? 'pt-[50vh] md:pt-0 md:w-1/3 flex-none'
    : openPanel
      ? 'flex-1 md:mr-[400px] lg:mr-[450px]'
      : 'flex-1 mr-0';

  return (
    <div className="fixed inset-0 flex w-full bg-[#050505] text-zinc-300 overflow-hidden font-sans">

      {/* ── BOOT SCREEN ─────────────────────────────────────────────────── */}
      <AnimatePresence>
        {isBooting && (
          <motion.div
            className="absolute inset-0 z-[100] flex flex-col items-center justify-center bg-[#050505] text-[#D4AF37] font-mono"
            exit={{ opacity: 0, scale: 1.05 }}
            transition={{ duration: 0.6, ease: "easeInOut" }}
          >
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.5 }} className="flex flex-col items-center">
              <EspressoBootAnimation progress={((bootStep + 1) / bootMessages.length) * 100} />
              <div className="mt-10 h-4 text-[11px] tracking-widest uppercase opacity-80 text-center w-72">
                {bootMessages[bootStep]}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── DRAG & DROP OVERLAY (Feature #12) ───────────────────────────── */}
      <AnimatePresence>
        {isDragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[90] flex items-center justify-center bg-[#050505]/80 backdrop-blur-sm border-2 border-dashed border-[#D4AF37]/50 pointer-events-none"
          >
            <div className="flex flex-col items-center gap-3 text-[#D4AF37]">
              <Paperclip size={40} className="opacity-70" />
              <p className="font-mono text-sm uppercase tracking-[0.2em]">Drop to attach</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── MAIN CHAT REGION ─────────────────────────────────────────────── */}
      <main className={`flex-1 flex flex-col items-center relative min-w-0 transition-all duration-300 ${mainLayoutClass}`}>

        {/* Header */}
        <header className="w-full px-6 sm:px-12 py-5 flex justify-between items-center shrink-0 z-10 bg-gradient-to-b from-[#050505] to-transparent">
          <div className="flex items-center gap-4">
            <EspressoMark size={32} />
            <div className="flex items-center gap-3">
              <p className="font-serif italic text-xl text-white tracking-wide">espresso</p>
              <NetworkStatusDot netStatus={netStatus} netColors={netColors} netLabels={netLabels} />
            </div>
          </div>
          {/* Feature #2: New Chat Button */}
          <button
            onClick={clearSession}
            title="New Chat (clear session)"
            className="p-2 text-zinc-500 hover:text-[#D4AF37] hover:bg-zinc-900 rounded-xl transition-colors"
          >
            <PenSquare size={18} />
          </button>
        </header>

        {/* Conversation area */}
        <div ref={scrollRef} className="w-full flex-1 overflow-y-auto scrollbar-hide">
          <div className="mx-auto w-full max-w-3xl px-6 gap-12 pt-10 pb-6 flex flex-col">

            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center pt-24 text-center">
                <EspressoMark size={56} />
                <h2 className="text-xl font-medium text-white mt-8 mb-2">A fresh pull, ready when you are.</h2>
                <p className="text-sm text-zinc-500 max-w-md leading-relaxed">
                  Ask anything. Espresso replies in this stream and keeps nothing across sessions — unless it's worth saving to the Order Book.
                </p>
              </div>
            ) : (
              messages.map((m, i) => {
                let cleanText = m.content;
                let mapMatch = null, flightMatch = null;
                if (m.role === 'assistant') {
                  mapMatch    = cleanText.match(/\[MAP:\s*([^\]]+)\]/i);
                  flightMatch = cleanText.match(/\[FLIGHT:\s*([^\]]+)\]/i);
                  if (mapMatch)    cleanText = cleanText.replace(mapMatch[0], '').trim();
                  if (flightMatch) cleanText = cleanText.replace(flightMatch[0], '').trim();
                }
                return (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    key={i}
                    className={`flex flex-col mb-10 w-full ${m.role === 'user' ? 'items-end' : 'items-start'}`}
                  >
                    {m.role === 'assistant' && (
                      <p className="text-zinc-500 font-mono text-[10px] mb-2 uppercase tracking-[0.2em] ml-1">Espresso</p>
                    )}
                    <div className={`text-[15px] leading-relaxed ${m.role === 'user' ? 'bg-[#0A0A0A] border border-zinc-800 text-zinc-200 px-5 py-3 rounded-2xl max-w-[85%] shadow-sm' : 'text-zinc-300 w-full'}`}>
                      {m.role === 'assistant' ? <TypewriterMarkdown text={cleanText} /> : cleanText}

                      {(mapMatch || flightMatch) && m.role === 'assistant' && (
                        <div className="flex flex-wrap gap-2 mt-4">
                          {mapMatch && (
                            <button
                              onClick={() => { setDisplayScreen({ type: 'map', title: mapMatch[1], data: mapMatch[1] }); setOpenPanel('display'); }}
                              className="flex items-center gap-2 px-3 py-2 bg-[#D4AF37]/10 border border-[#D4AF37]/30 rounded-lg text-[#D4AF37] hover:bg-[#D4AF37]/20 transition-all font-mono shadow-sm"
                            >
                              <MapIcon size={14} />
                              <span className="text-[10px] font-bold tracking-wider uppercase">Open Map: {mapMatch[1]}</span>
                            </button>
                          )}
                          {flightMatch && (
                            <button
                              onClick={() => { setDisplayScreen({ type: 'flight', title: flightMatch[1], data: flightMatch[1] }); setOpenPanel('display'); }}
                              className="flex items-center gap-2 px-3 py-2 bg-[#D4AF37]/10 border border-[#D4AF37]/30 rounded-lg text-[#D4AF37] hover:bg-[#D4AF37]/20 transition-all font-mono shadow-sm"
                            >
                              <Plane size={14} />
                              <span className="text-[10px] font-bold tracking-wider uppercase">Track: {flightMatch[1]}</span>
                            </button>
                          )}
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

        {/* ── COMPOSER ─────────────────────────────────────────────────────── */}
        <form onSubmit={handleSubmit} className="w-full max-w-3xl px-6 pb-8 pt-4 shrink-0 mx-auto bg-gradient-to-t from-[#050505] via-[#050505] to-transparent">

          {/* Feature #13: Pinned File Capsule */}
          <AnimatePresence>
            {pendingFile && (
              <div className="mb-2 flex items-center">
                <PinnedFileCapsule file={pendingFile} onRemove={() => setPendingFile(null)} />
              </div>
            )}
          </AnimatePresence>

          <div ref={composerRef} className="relative flex items-end gap-2 rounded-2xl border border-zinc-800 bg-[#0A0A0A]/80 backdrop-blur-md px-3 py-2 focus-within:border-[#D4AF37]/60 transition-colors shadow-2xl">

            {/* Feature #4: Slash Command Menu */}
            <AnimatePresence>
              {showSlash && (
                <SlashMenu
                  query={inputText}
                  onSelect={(cmd) => {
                    setInputText(cmd);
                    setShowSlash(false);
                    taRef.current?.focus();
                  }}
                />
              )}
            </AnimatePresence>

            <PlusMenu openPanel={openPanel} onPick={(k) => setOpenPanel(openPanel === k ? null : k)} />

            {/* Feature #11: File Upload Button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Attach file"
              className="size-9 rounded-full grid place-items-center shrink-0 text-zinc-500 hover:text-[#D4AF37] hover:bg-zinc-800 transition-colors"
            >
              <Paperclip size={16} />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".txt,.md,.json,.js,.ts,.tsx,.jsx,.py,.css,.html,.csv,image/*"
              onChange={handleFileSelect}
            />

            {/* Feature #1: Auto-resize Textarea */}
            <textarea
              ref={taRef}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !showSlash) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              rows={1}
              placeholder="What's brewing?"
              className="flex-1 resize-none bg-transparent py-1.5 px-2 text-base text-white placeholder:text-zinc-600 focus:outline-none scrollbar-hide min-h-[36px]"
              style={{ maxHeight: '192px' }} // 8 lines × 24px
              autoFocus
            />

            <button
              type="submit"
              disabled={isTyping || (!inputText.trim() && !pendingFile)}
              className={`size-9 rounded-full grid place-items-center shrink-0 transition-all ${isTyping || (!inputText.trim() && !pendingFile) ? 'bg-zinc-900 text-zinc-600' : 'bg-[#D4AF37] text-black hover:brightness-110 shadow-[0_0_15px_rgba(212,175,55,0.3)]'}`}
            >
              <SendHorizontal size={16} />
            </button>
          </div>

          <p className="mt-3 text-center font-mono text-[9px] uppercase tracking-[0.25em] text-zinc-600">
            no history · order book remembers · ⏎ to send · ⌘K to focus
          </p>
        </form>
      </main>

      {/* ── SIDE PANELS ──────────────────────────────────────────────────── */}
      {Object.entries(PANEL_META).map(([key, meta]) => (
        <SidePanel
          key={key}
          open={openPanel === key}
          title={meta.title}
          subtitle={meta.subtitle}
          icon={meta.icon}
          isWide={key === 'display'}
          onClose={() => setOpenPanel(null)}
        >
          {/* Order Book */}
          {key === 'orderbook' && (
            <div className="space-y-4">
              {orderBookItems.length === 0 ? (
                <div className="p-12 flex flex-col items-center justify-center text-center border border-dashed border-zinc-800 rounded-2xl">
                  <BookOpen size={32} className="text-zinc-700 mb-4" />
                  <p className="text-zinc-500 font-mono text-xs uppercase tracking-widest">Archive Empty</p>
                  <p className="text-zinc-600 text-xs mt-2">Use /save in chat to store memories.</p>
                </div>
              ) : (
                orderBookItems.map((item, i) => (
                  <div key={i} className="p-5 bg-[#0A0A0A] border border-zinc-800 rounded-2xl hover:border-[#D4AF37]/40 transition-colors group">
                    <h4 className="text-white font-medium mb-1">{item.title}</h4>
                    <p className="text-zinc-500 text-xs line-clamp-2 mb-4 leading-relaxed">{item.context}</p>
                    <div className="flex gap-2 mb-3 border-t border-zinc-800/50 pt-3">
                      {/* Feature #6: Auto-close panel on Recall — processCommand calls openPanelFn(null) */}
                      <button
                        onClick={() => processCommand(`/recall ${item.title}`, setOpenPanel)}
                        className="text-[10px] uppercase tracking-wider font-mono bg-zinc-900 text-[#D4AF37] px-2 py-1 rounded hover:bg-zinc-800"
                      >
                        Recall
                      </button>
                      <button
                        onClick={() => archiveOrder(item.id, item.title, item.context)}
                        className="text-[10px] uppercase tracking-wider font-mono bg-zinc-900 text-blue-400 px-2 py-1 rounded hover:bg-zinc-800"
                      >
                        Archive
                      </button>
                      <button
                        onClick={() => deleteOrder(item.id)}
                        className="text-[10px] uppercase tracking-wider font-mono bg-zinc-900 text-red-500 px-2 py-1 rounded hover:bg-zinc-800 ml-auto"
                      >
                        Delete
                      </button>
                    </div>
                    <div className="flex justify-between items-center text-[9px] font-mono text-zinc-600 uppercase">
                      <span>{item.id?.substring(0, 8)}</span>
                      <span>{item.status === 'archived' ? 'ARCHIVED' : 'ACTIVE'}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Whiteboard */}
          {key === 'whiteboard' && (
            <div className="h-full border border-zinc-800 rounded-2xl bg-[#0A0A0A] font-mono text-sm shadow-inner overflow-hidden flex flex-col">
              <div className="p-3 border-b border-zinc-800 bg-zinc-900/50 flex justify-between items-center text-xs text-zinc-500 uppercase tracking-widest">
                <div className="flex items-center gap-2">
                  <Code size={14} className="text-[#D4AF37]" />
                  <span>workspace.txt</span>
                </div>
              </div>
              <textarea
                className="flex-1 w-full bg-transparent p-6 text-blue-300 outline-none resize-none font-mono text-xs leading-relaxed whitespace-pre-wrap break-words"
                value={workspaceContent}
                onChange={(e) => setWorkspaceContent(e.target.value)}
                placeholder="// Ready for notes and code. Type here, Espresso is watching."
                spellCheck={false}
              />
            </div>
          )}

          {/* Display */}
          {key === 'display' && (
            displayScreen ? (
              <div className="h-full w-full rounded-2xl overflow-hidden border border-zinc-800 bg-black shadow-inner">
                {displayScreen.type === 'map' && (
                  <iframe
                    title="Map View"
                    width="100%"
                    height="100%"
                    style={{ border: 0, filter: 'invert(90%) hue-rotate(180deg) contrast(100%) grayscale(20%)' }}
                    loading="lazy"
                    src={`http://googleusercontent.com/maps.google.com/${encodeURIComponent(displayScreen.data)}&t=k&z=14&ie=UTF8&iwloc=&output=embed`}
                  />
                )}
                {displayScreen.type === 'flight' && (
                  <iframe
                    title="Flight Tracker"
                    width="100%"
                    height="100%"
                    style={{ border: 0 }}
                    src={`https://globe.adsbexchange.com/?ident=${encodeURIComponent(displayScreen.data)}`}
                  />
                )}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center border border-dashed border-zinc-800 rounded-2xl p-8 text-center bg-[#0A0A0A]">
                <CupSoda size={48} className="text-zinc-800 mb-6" />
                <h3 className="text-zinc-300 font-medium text-lg mb-2">No active visual plated</h3>
                <p className="text-zinc-600 text-sm max-w-[200px]">Ask Espresso to generate a map or track a flight to populate this view.</p>
              </div>
            )
          )}
        </SidePanel>
      ))}

    </div>
  );
}