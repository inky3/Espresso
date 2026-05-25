'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Plus, X, Map as MapIcon, Plane, Workflow, Code,
  Coffee, BookOpen, CupSoda, Croissant, Bean, SendHorizontal
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Firebase Import
import { auth, db } from '@/lib/firebase';
import { signInAnonymously, onAuthStateChanged, User } from "firebase/auth";
import { collection, addDoc, getDocs, updateDoc, doc, setDoc, serverTimestamp } from "firebase/firestore";

const appId = 'espresso-terminal'; 

type PanelKey = 'display' | 'whiteboard' | 'orderbook' | null;

const PANEL_META: Record<NonNullable<PanelKey>, { title: string; subtitle: string; icon: any; label: string; hint: string }> = {
  display: { title: "Display", subtitle: "Plated visuals", icon: CupSoda, label: "Display", hint: "images, maps, visuals" },
  whiteboard: { title: "Whiteboard", subtitle: "Notes · code · drafts", icon: Croissant, label: "Whiteboard", hint: "scratch space" },
  orderbook: { title: "Order Book", subtitle: "Permanent archive", icon: BookOpen, label: "Order Book", hint: "saved memory" },
};

// --- LOGO & ANIMATIONS ---
const EspressoMark = ({ size = 28 }: { size?: number }) => (
  <div style={{ width: size, height: size }} className="rounded-xl bg-[#D4AF37] grid place-items-center text-black shadow-[0_0_15px_rgba(212,175,55,0.4)]">
    <Coffee size={size * 0.55} />
  </div>
);

const Steam = ({ delay }: { delay: number }) => (
  <motion.div
    className="w-1.5 h-8 bg-[#D4AF37]/50 rounded-full blur-sm absolute bottom-0"
    initial={{ y: 0, opacity: 0, x: 0 }}
    animate={{ 
      y: -45, 
      opacity: [0, 1, 0], 
      x: [-5, 5, -5] 
    }}
    transition={{ duration: 2.5, repeat: Infinity, delay: delay, ease: "easeOut" }}
  />
);

const EspressoBootAnimation = ({ progress }: { progress: number }) => {
  return (
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
};

// --- ANIMATED MARKDOWN ---
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
        p: ({node, ...props}) => <p className="mb-4 leading-relaxed last:mb-0" {...props} />,
        strong: ({node, ...props}) => <strong className="font-semibold text-[#D4AF37]" {...props} />,
        em: ({node, ...props}) => <em className="italic text-zinc-400" {...props} />,
        ul: ({node, ...props}) => <ul className="list-disc pl-5 mb-4 space-y-2 marker:text-[#D4AF37]" {...props} />,
        ol: ({node, ...props}) => <ol className="list-decimal pl-5 mb-4 space-y-2 marker:text-[#D4AF37]" {...props} />,
        code: ({node, inline, ...props}: any) => inline 
          ? <code className="bg-[#D4AF37]/10 text-[#D4AF37] px-1.5 py-0.5 rounded-md text-[13px] font-mono border border-[#D4AF37]/20" {...props} />
          : <code className="block bg-[#0A0A0A] border border-zinc-800 p-4 rounded-xl text-[13px] font-mono overflow-x-auto mb-4 mt-2 text-zinc-300 shadow-inner" {...props} />,
      }}
    >
      {displayedText}
    </ReactMarkdown>
  );
}

// --- NETWORK STATUS HOOK ---
function useNetworkStatus(user: User | null) {
  const [status, setStatus] = useState<'full' | 'partial' | 'unstable' | 'poor' | 'offline'>('full');

  useEffect(() => {
    const checkNetwork = () => {
      if (!navigator.onLine) {
        setStatus('offline');
        return;
      }
      
      let isSlow = false;
      let isPoor = false;
      
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
    if ('connection' in navigator) {
      (navigator as any).connection.addEventListener('change', checkNetwork);
    }

    return () => {
      window.removeEventListener('online', checkNetwork);
      window.removeEventListener('offline', checkNetwork);
      if ('connection' in navigator) {
        (navigator as any).connection.removeEventListener('change', checkNetwork);
      }
    };
  }, [user]);

  return status;
}

// --- FIREBASE ENGINE ---
function useEspressoAI() {
  const [messages, setMessages] = useState<any[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<'idle' | 'pulling' | 'active'>('idle');
  const [activeDocument, setActiveDocument] = useState<{ name: string, text: string } | null>(null);
  const [displayScreen, setDisplayScreen] = useState<any>(null);
  const [orderBookItems, setOrderBookItems] = useState<any[]>([]);

  const netStatus = useNetworkStatus(user);

  useEffect(() => {
    if (!auth) return;
    const initAuth = async () => { try { await signInAnonymously(auth); } catch (e) { } };
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
    } catch (err) {}
  };

  const processCommand = async (text: string, openPanelFn: (k: PanelKey) => void) => {
    if (!text.trim()) return;
    const userMsg = { role: 'user', content: text, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    
    if (text === '/seed' && user && db) {
      setMessages(prev => [...prev, { role: 'assistant', content: `**[SYSTEM]** Injecting Matrix into L2 Cloud Memory...` }]);
      await setDoc(doc(db, 'artifacts', appId, 'memory', 'hard'), { content: "System Matrix Core active." });
      await setDoc(doc(db, 'artifacts', appId, 'memory', 'soft'), { content: "System Matrix Core active." });
      setMessages(prev => [...prev, { role: 'assistant', content: `**[SYSTEM]** Success. Matrix injected.` }]);
      return;
    }

    if (text.startsWith('/save') && user && db) {
      const title = text.replace('/save', '').trim() || `Order_${Date.now()}`;
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'archives'), {
        title, context: "Saved from active context.", createdAt: serverTimestamp(), status: 'order'
      });
      setMessages(prev => [...prev, { role: 'assistant', content: `**[SYSTEM]** Saved '${title}' to Order Book.` }]);
      fetchOrderBook();
      return;
    }

    setStatus('pulling');
    setIsTyping(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [...messages, userMsg], activeDocument }) 
      });
      const data = await res.json();
      const replyText = data.text;
      
      setMessages(prev => [...prev, { role: 'assistant', content: replyText, timestamp: Date.now() }]);
      
      // Auto-open panels based on tags
      const mapMatch = replyText.match(/\[MAP:\s*([^\]]+)\]/i);
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

    } catch (error) {
      setMessages(prev => [...prev, { role: 'assistant', content: "CRITICAL_ERROR: Link failed." }]);
    } finally { 
      setStatus('active');
      setIsTyping(false); 
    }
  };

  return { messages, isTyping, status, netStatus, displayScreen, setDisplayScreen, processCommand, fetchOrderBook, orderBookItems };
}

// --- NETWORK STATUS DOT ---
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
            {/* Arrow */}
            <div className="flex justify-center -mt-px">
              <div className="w-2 h-2 bg-[#0A0A0A] border-l border-t border-zinc-800 rotate-45 -mt-1" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// --- COMPONENTS ---
function SidePanel({ open, title, subtitle, icon: Icon, onClose, isWide, children }: any) {
  // Dynamically expands to EXACTLY 2/3 of the screen for Maps/Displays using Tailwind fractions
  const widthClass = isWide ? 'md:w-2/3' : 'md:w-[400px] lg:w-[450px]';

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ x: '100%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className={`absolute right-0 top-0 bottom-0 w-full ${widthClass} bg-[#050505] border-l border-zinc-800 shadow-2xl z-40 flex flex-col`}
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

function PlusMenu({ openPanel, onPick }: { openPanel: PanelKey, onPick: (k: PanelKey) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <div className="relative">
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

// --- MAIN APP ---
export default function App() {
  const [openPanel, setOpenPanel] = useState<PanelKey>(null);
  const [inputText, setInputText] = useState('');
  const taRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const [isBooting, setIsBooting] = useState(true);
  const [bootStep, setBootStep] = useState(0);

  const { messages, isTyping, status, netStatus, displayScreen, setDisplayScreen, processCommand, fetchOrderBook, orderBookItems } = useEspressoAI();

  const bootMessages = [
    "GRINDING BEANS...",
    "TAMPING NEURAL MATRIX...",
    "APPLYING 9 BARS OF PRESSURE...",
    "EXTRACTING WORKSPACE...",
    "PULL COMPLETE. SYSTEM ONLINE."
  ];

  useEffect(() => {
    let stepIndex = 0;
    const interval = setInterval(() => {
      stepIndex++;
      if (stepIndex < bootMessages.length) {
        setBootStep(stepIndex);
      } else {
        clearInterval(interval);
        setTimeout(() => setIsBooting(false), 900);
      }
    }, 600);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => { if (openPanel === 'orderbook') fetchOrderBook(); }, [openPanel]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [messages, isTyping]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputText.trim() || isTyping) return;
    processCommand(inputText, setOpenPanel);
    setInputText('');
  };

  const netColors = {
    full: 'bg-[#10B981] shadow-[0_0_8px_rgba(16,185,129,0.5)]', 
    partial: 'bg-[#84CC16] shadow-[0_0_8px_rgba(132,204,22,0.5)]', 
    unstable: 'bg-[#EAB308] shadow-[0_0_8px_rgba(234,179,8,0.5)]', 
    poor: 'bg-[#F97316] shadow-[0_0_8px_rgba(249,115,22,0.5)]', 
    offline: 'bg-[#EF4444] shadow-[0_0_8px_rgba(239,68,68,0.5)]', 
  };
  
  const netLabels = {
    full: 'SYNCED & BREWING',
    partial: 'LOCAL ONLY',
    unstable: 'UNSTABLE FLOW',
    poor: 'POOR EXTRACTION',
    offline: 'MACHINE OFFLINE'
  };

  const getLatestCode = () => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role === 'assistant') {
        const match = msg.content.match(/```([\w-]*)\n([\s\S]*?)```/);
        if (match) return { language: match[1], code: match[2] };
      }
    }
    return null;
  };
  const latestCode = getLatestCode();

  // Dynamic layout constraint. Uses fraction `md:mr-2/3` to perfectly align with SidePanel.
  const mainMarginClass = openPanel === 'display' ? 'md:mr-2/3' : openPanel ? 'md:mr-[400px] lg:mr-[450px]' : 'mr-0';

  return (
    <div className="relative flex h-screen w-full bg-[#050505] text-zinc-300 overflow-hidden font-sans">
      
      {/* --- BOOT SCREEN OVERLAY --- */}
      <AnimatePresence>
        {isBooting && (
          <motion.div 
            className="absolute inset-0 z-[100] flex flex-col items-center justify-center bg-[#050505] text-[#D4AF37] font-mono"
            exit={{ opacity: 0, scale: 1.05 }}
            transition={{ duration: 0.6, ease: "easeInOut" }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5 }}
              className="flex flex-col items-center"
            >
              <EspressoBootAnimation progress={((bootStep + 1) / bootMessages.length) * 100} />
              <div className="mt-10 h-4 text-[11px] tracking-widest uppercase opacity-80 text-center w-72">
                {bootMessages[bootStep]}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- Main Chat Region --- */}
      <main className={`flex-1 flex flex-col items-center relative min-w-0 transition-all duration-300 ${mainMarginClass}`}>
        
        {/* Premium Header */}
        <header className="w-full px-6 sm:px-12 py-5 flex justify-between items-center shrink-0 z-10 bg-gradient-to-b from-[#050505] to-transparent">
          <div className="flex items-center gap-4">
            <EspressoMark size={32} />
            <div className="flex items-center gap-3">
              <p className="font-serif italic text-xl text-white tracking-wide">espresso</p>
              {/* Coffee-Themed Network Status — dot only, hover for details */}
              <NetworkStatusDot netStatus={netStatus} netColors={netColors} netLabels={netLabels} />
            </div>
          </div>
        </header>

        {/* Conversation Area */}
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
                let mapMatch = null;
                let flightMatch = null;

                if (m.role === 'assistant') {
                  mapMatch = cleanText.match(/\[MAP:\s*([^\]]+)\]/i);
                  flightMatch = cleanText.match(/\[FLIGHT:\s*([^\]]+)\]/i);
                  if (mapMatch) cleanText = cleanText.replace(mapMatch[0], '').trim();
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
                       
                       {/* Action Buttons: Allow reopening maps if the user closes the panel */}
                       {(mapMatch || flightMatch) && m.role === 'assistant' && (
                         <div className="flex flex-wrap gap-2 mt-4">
                           {mapMatch && (
                             <button 
                               onClick={() => {
                                 setDisplayScreen({ type: 'map', title: mapMatch[1], data: mapMatch[1] });
                                 setOpenPanel('display');
                               }} 
                               className="flex items-center gap-2 px-3 py-2 bg-[#D4AF37]/10 border border-[#D4AF37]/30 rounded-lg text-[#D4AF37] hover:bg-[#D4AF37]/20 transition-all font-mono shadow-sm"
                             >
                               <MapIcon size={14} />
                               <span className="text-[10px] font-bold tracking-wider uppercase">Open Map: {mapMatch[1]}</span>
                             </button>
                           )}
                           {flightMatch && (
                             <button 
                               onClick={() => {
                                 setDisplayScreen({ type: 'flight', title: flightMatch[1], data: flightMatch[1] });
                                 setOpenPanel('display');
                               }} 
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

        {/* Premium Composer */}
        <form onSubmit={handleSubmit} className="w-full max-w-3xl px-6 pb-8 pt-4 shrink-0 mx-auto bg-gradient-to-t from-[#050505] via-[#050505] to-transparent">
          <div className="relative flex items-end gap-2 rounded-2xl border border-zinc-800 bg-[#0A0A0A]/80 backdrop-blur-md px-3 py-2 focus-within:border-[#D4AF37]/60 transition-colors shadow-2xl">
            
            <PlusMenu openPanel={openPanel} onPick={(k) => setOpenPanel(openPanel === k ? null : k)} />
            
            <textarea
              ref={taRef}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
              rows={1}
              placeholder="What's brewing?"
              className="flex-1 resize-none bg-transparent py-2 px-1 text-sm text-white placeholder:text-zinc-600 focus:outline-none max-h-40 scrollbar-hide pt-2.5"
              autoFocus
            />
            
            <button
              type="submit"
              disabled={isTyping || !inputText.trim()}
              className={`size-9 rounded-full grid place-items-center shrink-0 transition-all ${isTyping || !inputText.trim() ? 'bg-zinc-900 text-zinc-600' : 'bg-[#D4AF37] text-black hover:brightness-110 shadow-[0_0_15px_rgba(212,175,55,0.3)]'}`}
            >
              <SendHorizontal size={16} />
            </button>
          </div>
          <p className="mt-3 text-center font-mono text-[9px] uppercase tracking-[0.25em] text-zinc-600">
            no history · order book remembers · ⏎ to send
          </p>
        </form>
      </main>

      {/* Side Panels (Slide Over) */}
      {Object.entries(PANEL_META).map(([key, meta]) => (
        <SidePanel 
          key={key} 
          open={openPanel === key} 
          title={meta.title} 
          subtitle={meta.subtitle} 
          icon={meta.icon} 
          isWide={key === 'display'} // Makes display panel explicitly 2/3 width
          onClose={() => setOpenPanel(null)}
        >
          
          {/* Order Book Content */}
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
                   <div key={i} className="p-5 bg-[#0A0A0A] border border-zinc-800 rounded-2xl hover:border-[#D4AF37]/40 transition-colors group cursor-pointer">
                     <h4 className="text-white font-medium mb-2 group-hover:text-[#D4AF37] transition-colors">{item.title}</h4>
                     <p className="text-zinc-500 text-sm line-clamp-3 leading-relaxed">{item.context}</p>
                     <div className="mt-4 flex justify-between items-center text-[10px] font-mono text-zinc-600 uppercase">
                       <span>{item.id.substring(0, 8)}</span>
                       <span>{item.createdAt?.seconds ? new Date(item.createdAt.seconds * 1000).toLocaleDateString() : 'Just now'}</span>
                     </div>
                   </div>
                 ))
               )}
             </div>
          )}

          {/* Whiteboard Content */}
          {key === 'whiteboard' && (
            <div className="h-full border border-zinc-800 rounded-2xl bg-[#0A0A0A] font-mono text-sm text-zinc-300 shadow-inner overflow-hidden flex flex-col">
              <div className="p-3 border-b border-zinc-800 bg-zinc-900/50 flex justify-between items-center text-xs text-zinc-500 uppercase tracking-widest">
                 <div className="flex items-center gap-2">
                   <Code size={14} className="text-[#D4AF37]" /> 
                   <span>{latestCode ? `workspace.${latestCode.language || 'txt'}` : 'WORKSPACE_EMPTY'}</span>
                 </div>
              </div>
              <div className="p-6 overflow-y-auto flex-1">
                {latestCode ? (
                  <pre className="text-[#D4AF37] text-xs leading-relaxed"><code>{latestCode.code}</code></pre>
                ) : (
                  <>
                    <span className="text-zinc-600">{'//'} Ready for notes and code</span><br/><br/>
                    <span className="text-[#D4AF37]">const</span> workspace = <span className="text-blue-400">ready</span>;<br/>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Display Content (Maps/Images) */}
          {key === 'display' && (
            displayScreen ? (
              <div className="h-full w-full rounded-2xl overflow-hidden border border-zinc-800 bg-black shadow-inner">
                {displayScreen.type === 'map' && (
                  <iframe
                    title="Map View"
                    width="100%"
                    height="100%"
                    style={{ border: 0, filter: 'invert(90%) hue-rotate(180deg) contrast(100%) grayscale(20%)' }} // Night mode map trick
                    loading="lazy"
                    src={`https://maps.google.com/maps?q=${encodeURIComponent(displayScreen.data)}&t=k&z=14&ie=UTF8&iwloc=&output=embed`}
                  />
                )}
                {displayScreen.type === 'flight' && (
                   <iframe title="Flight Radar" width="100%" height="100%" style={{ border: 0 }} src={`https://www.flightradar24.com/simple_index.php?query=${encodeURIComponent(displayScreen.data)}`} />
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