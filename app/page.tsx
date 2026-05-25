'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ShieldCheck, SendHorizontal, Plus,
  Map as MapIcon, Workflow, Plane, X, Code, TerminalSquare, FileText, Pin, CheckCircle2, Circle, ArrowRight,
  Coffee, Droplet, Package, Library // Added Library back since we use it in the UI
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// ✅ Clean Firebase Import
import { auth, db } from '@/lib/firebase';
import { signInAnonymously, onAuthStateChanged, User } from "firebase/auth";
import { collection, addDoc, getDocs, updateDoc, doc, setDoc, serverTimestamp } from "firebase/firestore";

// --- ESPRESSO THEME COLORS ---
const ESPRESSO = '#4B3022';
const COFFEE = '#6F4E37';
const appId = 'espresso-terminal'; 

// --- ANIMATED MARKDOWN COMPONENT ---
function TypewriterMarkdown({ text }: { text: string }) {
  const [displayedText, setDisplayedText] = useState('');

  useEffect(() => {
    let i = 0;
    const speed = 10; 
    const timer = setInterval(() => {
      setDisplayedText(text.slice(0, i));
      i += 4; 
      if (i > text.length) {
        setDisplayedText(text);
        clearInterval(timer);
      }
    }, speed);
    return () => clearInterval(timer);
  }, [text]);

  return (
    <ReactMarkdown 
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({node, ...props}) => <p className="mb-4 leading-relaxed last:mb-0" {...props} />,
        strong: ({node, ...props}) => <strong className="font-semibold text-[#6F4E37]" {...props} />,
        em: ({node, ...props}) => <em className="italic text-zinc-400" {...props} />,
        ul: ({node, ...props}) => <ul className="list-disc pl-5 mb-4 space-y-2 marker:text-[#4B3022]" {...props} />,
        ol: ({node, ...props}) => <ol className="list-decimal pl-5 mb-4 space-y-2 marker:text-[#4B3022]" {...props} />,
        li: ({node, ...props}) => <li className="pl-2" {...props} />,
        h1: ({node, ...props}) => <h1 className="text-xl font-bold text-white mb-4 mt-6" {...props} />,
        h2: ({node, ...props}) => <h2 className="text-lg font-bold text-white mb-3 mt-5 border-b border-[#4B3022]/30 pb-2" {...props} />,
        h3: ({node, ...props}) => <h3 className="text-base font-medium text-white mb-2 mt-4" {...props} />,
        code: ({node, inline, ...props}: any) => 
          inline ? (
            <code className="bg-[#4B3022]/20 text-[#6F4E37] px-1.5 py-0.5 rounded text-[13px] font-mono border border-[#4B3022]/30" {...props} />
          ) : (
            <code className="block bg-[#050505] border border-[#4B3022]/30 p-4 rounded-xl text-[13px] font-mono overflow-x-auto mb-4 mt-2 text-zinc-300 shadow-sm" {...props} />
          ),
        blockquote: ({node, ...props}) => <blockquote className="border-l-2 border-[#6F4E37] pl-4 italic text-zinc-400 mb-4 bg-[#4B3022]/10 py-2 pr-4 rounded-r-lg" {...props} />
      }}
    >
      {displayedText}
    </ReactMarkdown>
  );
}

// --- DISPLAY SCREEN TYPES ---
type DisplayView = { type: 'map' | 'flight' | 'code' | 'image', title: string, data: string, language?: string, isPinned?: boolean } | null;

function useEspressoAI() {
  const [messages, setMessages] = useState<any[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'online' | 'offline'>('offline');
  const [activeDocument, setActiveDocument] = useState<{ name: string, text: string } | null>(null);
  const [displayScreen, setDisplayScreen] = useState<DisplayView>(null);

  // Order Book State
  const [isOrderBookOpen, setIsOrderBookOpen] = useState(false);
  const [orderBookItems, setOrderBookItems] = useState<any[]>([]);

  useEffect(() => {
    if (!auth) return;
    const initAuth = async () => {
      try { await signInAnonymously(auth); } 
      catch (err) { console.error("Espresso Auth Error:", err); }
    };
    
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (u) {
        setUser(u);
        setConnectionStatus('online');
      } else {
        setConnectionStatus('offline');
        initAuth();
      }
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
    } catch (err) {
      console.error("Failed to fetch order book");
    }
  };

  const toggleOrderStatus = async (id: string, currentStatus: string) => {
    if (!db) return;
    const newStatus = currentStatus === 'archived' ? 'order' : 'archived';
    try {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'archives', id), { status: newStatus });
      setOrderBookItems(prev => prev.map(item => item.id === id ? { ...item, status: newStatus } : item));
    } catch (err) {
      console.error("Failed to update status");
    }
  };

  // --- COMMAND HANDLING (/save, /recall, /pin, /seed) ---
  const handleSlashCommand = async (text: string) => {
    const args = text.trim().split(' ');
    const command = args[0].toLowerCase();
    const payload = args.slice(1).join(' ');

    if (command === '/seed') {
      if (!user || !db) return true;
      try {
        setMessages(prev => [...prev, { role: 'assistant', content: `**[SYSTEM]** Initiating database seed sequence...` }]);
        
        await setDoc(doc(db, 'artifacts', appId, 'memory', 'hard'), {
          content: "# TECHNICAL STANDARDS\n- Framework: Next.js App Router (React), Tailwind CSS.\n- Code Generation: STRICT Single-File Mandate. All components, styling, and logic must be bundled into ONE functional file. No separate CSS files.\n- UI Components: Never use browser `alert()`. Use custom modal UI. Favor rounded corners (rounded-xl, rounded-2xl) and Espresso/Coffee color palettes (#4B3022, #6F4E37).\n- Database: Firebase Firestore strictly mapped to `/artifacts/{appId}/public/data/` paths. No complex compound queries."
        });
        
        await setDoc(doc(db, 'artifacts', appId, 'memory', 'soft'), {
          content: "# PREFERENCES & HABITS\n- Tone: Highly direct, collaborative, sharp. Ink hates robotic padding.\n- Workflow: Prefers solving issues via the Display Screen Workspace (Shared Whiteboard) rather than printing massive blocks of text into the chat stream.\n- Device: Assume standard desktop view but always ensure touch-targets are sized appropriately for mobile responsiveness."
        });

        setMessages(prev => [...prev, { role: 'assistant', content: `**[SYSTEM]** Success. Hard and Soft skills have been injected into Firebase.` }]);
      } catch (err) {
        setMessages(prev => [...prev, { role: 'assistant', content: `**[SYSTEM_ERROR]** Failed to seed database. Check permissions.` }]);
      }
      return true;
    }

    if (command === '/save') {
      const title = payload || `Order_${new Date().getTime()}`;
      if (!user || !db) return;
      try {
        const summary = messages.map(m => `${m.role}: ${m.content}`).join('\n').substring(0, 1000);
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'archives'), {
          title, context: summary, document: activeDocument, createdAt: serverTimestamp(), status: 'order'
        });
        setMessages(prev => [...prev, { role: 'assistant', content: `**[SYSTEM]** Order complete. '${title}' securely pinned to the Order Board.` }]);
      } catch (err) {
        setMessages(prev => [...prev, { role: 'assistant', content: `**[SYSTEM_ERROR]** Failed to save Order.` }]);
      }
      return true;
    }

    if (command === '/recall') {
      await fetchOrderBook();
      setIsOrderBookOpen(true);
      return true;
    }

    if (command === '/pin') {
       if (displayScreen) {
         setDisplayScreen({ ...displayScreen, isPinned: !displayScreen.isPinned });
         setMessages(prev => [...prev, { role: 'assistant', content: `**[SYSTEM]** Display Screen pinning ${!displayScreen.isPinned ? 'ENABLED' : 'DISABLED'}.` }]);
       } else {
         setMessages(prev => [...prev, { role: 'assistant', content: `**[SYSTEM]** Nothing active on the Display Screen to pin.` }]);
       }
       return true;
    }

    return false;
  };

  // Add this inside your useEspressoAI hook in app/page.tsx
const processCommand = async (text: string) => {
  if (!text.trim()) return;
  
  const userMsg = { role: 'user', content: text, timestamp: Date.now() };
  setMessages(prev => [...prev, userMsg]);

  if (text.startsWith('/')) {
    const isCommand = await handleSlashCommand(text);
    if (isCommand) return;
  }

  setIsTyping(true);
  try {
    const requestBody = { 
      messages: [...messages, userMsg], 
      activeDocument,
      workspaceData: displayScreen?.type === 'code' ? displayScreen.data : null,
      visionImage: displayScreen?.type === 'image' ? displayScreen.data : null 
    };

    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody) 
    });
    const data = await response.json();
    const reply = data.text;

    // --- SELF-EVOLUTION INTERCEPTOR ---
    // Matches: [UPDATE_SKILL: hard | Your new content here]
    const updateMatch = reply.match(/\[UPDATE_SKILL:\s*(hard|soft)\s*\|\s*(.*?)\]/i);
    
    if (updateMatch && db) {
      const category = updateMatch[1].toLowerCase();
      const content = updateMatch[2];
      
      try {
        // Espresso commits the update directly to Firebase
        await setDoc(doc(db, 'artifacts', appId, 'memory', category), { content });
        
        // Notify the user in the UI
        setMessages(prev => [...prev, 
          { role: 'assistant', content: reply.replace(updateMatch[0], '').trim() }, 
          { role: 'assistant', content: `**[SYSTEM]** Skill Matrix updated: ${category.toUpperCase()} memory rewritten.` }
        ]);
        return; 
      } catch (e) {
        setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
      }
    } else {
      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
    }

  } catch (error) {
    setMessages(prev => [...prev, { role: 'assistant', content: "CRITICAL_ERROR: Link failed." }]);
  } finally { setIsTyping(false); }
};

  // --- FILE & IMAGE UPLOAD HANDLING ---
  const handleFileUpload = async (file: File) => {
    if (!file) return;

    if (file.type.startsWith('image/')) {
       const reader = new FileReader();
       reader.onload = (e) => {
         const base64 = e.target?.result as string;
         setDisplayScreen({ type: 'image', title: file.name, data: base64, isPinned: true });
         setMessages(prev => [...prev, { role: 'assistant', content: `**[SYSTEM]** Visual reference [${file.name}] pinned to Display Screen. Ready for analysis.`, timestamp: Date.now() }]);
       };
       reader.readAsDataURL(file);
       return;
    }

    setIsTyping(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch('/api/pdf', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.text) {
        setActiveDocument({ name: data.name, text: data.text });
        setMessages(prev => [...prev, { role: 'assistant', content: `**[SYSTEM]** Document [${data.name}] integrated and synced to active context.`, timestamp: Date.now() }]);
      }
    } catch (err) { 
      setMessages(prev => [...prev, { role: 'assistant', content: `**[SYSTEM_ERROR]** Failed to parse document.`, timestamp: Date.now() }]);
    } finally { setIsTyping(false); }
  };

  const loadOrderToActive = (order: any) => {
    if (order.document) setActiveDocument(order.document);
    setMessages(prev => [...prev, { role: 'assistant', content: `**[SYSTEM]** Order '${order.title}' recalled. Active neural link established.` }]);
    setIsOrderBookOpen(false);
  };

  return { 
    messages, isTyping, connectionStatus, activeDocument, displayScreen, setDisplayScreen, 
    processCommand, handleFileUpload, fetchOrderBook, isOrderBookOpen, setIsOrderBookOpen, 
    orderBookItems, toggleOrderStatus, loadOrderToActive 
  };
}

export default function App() {
  const { 
    messages, isTyping, connectionStatus, activeDocument, displayScreen, setDisplayScreen, 
    processCommand, handleFileUpload, fetchOrderBook, isOrderBookOpen, setIsOrderBookOpen, 
    orderBookItems, toggleOrderStatus, loadOrderToActive 
  } = useEspressoAI();
  
  const [isBooting, setIsBooting] = useState(true);
  const [inputText, setInputText] = useState('');
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [orderTab, setOrderTab] = useState<'order' | 'archived'>('order');
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setTimeout(() => setIsBooting(false), 1000); }, []);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [messages, isTyping]);

  const getLatestAction = (type: 'code' | 'map') => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role === 'assistant') {
        if (type === 'code') {
          const codeRegex = new RegExp('`{3}([\\w-]*)\\s*\\n([\\s\\S]*?)`{3}', 'i');
          const match = msg.content.match(codeRegex);
          if (match) return { language: match[1] || 'PLAINTEXT', data: match[2] };
        }
        if (type === 'map') {
          const match = msg.content.match(/\[MAP:\s*([^\]]+)\]/i);
          if (match) return { data: match[1] };
        }
      }
    }
    return type === 'code' ? { language: 'PLAINTEXT', data: '// Initialize empty workspace...' } : { data: 'Earth' };
  };

  return (
    <div className="flex flex-col md:flex-row h-dvh w-screen bg-[#050505] text-zinc-400 font-sans overflow-hidden relative">
      {isBooting ? (
        <div className="absolute inset-0 bg-[#050505] z-50 flex items-center justify-center">
          <Coffee size={42} className="text-[#6F4E37] animate-pulse" />
        </div>
      ) : (
        <>
          {/* ========================================= */}
          {/* THE DISPLAY SCREEN */}
          {/* ========================================= */}
          <AnimatePresence>
            {displayScreen && (
              <motion.div
                layout
                initial={{ opacity: 0, flexBasis: '0%' }}
                animate={{ opacity: 1, flexBasis: displayScreen.type === 'map' || displayScreen.type === 'flight' || displayScreen.type === 'image' ? '66.666%' : '50%' }}
                exit={{ opacity: 0, flexBasis: '0%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className={`relative flex flex-col bg-[#050505] border-b md:border-b-0 md:border-r border-[#4B3022]/30 z-20 shadow-2xl overflow-hidden
                  ${displayScreen.type === 'map' || displayScreen.type === 'flight' || displayScreen.type === 'image' ? 'h-1/2 md:h-full md:w-2/3' : 'h-1/2 md:h-full md:w-1/2'}`}
              >
                {/* Header */}
                <div className="p-3 border-b border-[#4B3022]/30 flex justify-between items-center bg-[#050505]">
                  <div className="flex items-center gap-2 text-[#6F4E37]">
                    <span className="text-[10px] font-bold uppercase tracking-widest font-mono">
                      DISPLAY SCREEN // {displayScreen.type === 'map' ? 'SAT-LINK' : displayScreen.type === 'flight' ? 'RADAR' : displayScreen.type === 'image' ? 'INSPECTOR' : `WORKSPACE [${displayScreen.language || 'RAW'}]`}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <button onClick={() => setDisplayScreen({ ...displayScreen, isPinned: !displayScreen.isPinned })} className={`p-1 transition-colors ${displayScreen.isPinned ? 'text-[#6F4E37]' : 'text-zinc-600 hover:text-[#6F4E37]'}`} title="Pin Display">
                      <Pin size={14} className={displayScreen.isPinned ? 'fill-current' : ''} />
                    </button>
                    <button onClick={() => setDisplayScreen(null)} className="text-zinc-600 hover:text-[#6F4E37] transition-colors p-1">
                      <X size={16} />
                    </button>
                  </div>
                </div>
                
                {/* Content */}
                <div className="flex-1 relative overflow-hidden bg-[#000000]">
                  {displayScreen.type === 'map' && (
                    <iframe title="Map View" width="100%" height="100%" style={{ border: 0, filter: 'invert(90%) hue-rotate(180deg) contrast(100%) grayscale(20%)' }} loading="lazy" src={`https://maps.google.com/maps?q=${encodeURIComponent(displayScreen.data)}&t=k&z=14&ie=UTF8&iwloc=&output=embed`} />
                  )}
                  {displayScreen.type === 'flight' && (
                    <iframe title="Flight Radar" width="100%" height="100%" style={{ border: 0 }} src={`https://www.flightradar24.com/simple_index.php?query=${encodeURIComponent(displayScreen.data)}`} />
                  )}
                  {displayScreen.type === 'image' && (
                    <div className="h-full w-full flex items-center justify-center p-4">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={displayScreen.data} alt="Visual Reference" className="max-w-full max-h-full object-contain rounded-lg border border-[#4B3022]/20" />
                    </div>
                  )}
                  {displayScreen.type === 'code' && (
                    <textarea 
                      className="h-full w-full bg-transparent text-[#6F4E37] font-mono text-[13px] leading-relaxed outline-none resize-none p-6 scrollbar-hide"
                      value={displayScreen.data}
                      onChange={(e) => setDisplayScreen({ ...displayScreen, data: e.target.value })}
                      spellCheck={false}
                    />
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ========================================= */}
          {/* MAIN CHAT PANEL */}
          {/* ========================================= */}
          <motion.div layout className="flex flex-col flex-1 relative z-10 bg-[#050505] overflow-hidden">
            <div className="p-3 border-b border-[#4B3022]/30 bg-[#050505] flex justify-between items-center relative z-20">
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${connectionStatus === 'online' ? 'bg-[#6F4E37] shadow-[0_0_8px_#6F4E37]' : 'bg-red-500 shadow-[0_0_8px_#ef4444]'}`} />
                <span className="text-[10px] font-bold text-zinc-100 uppercase tracking-widest font-mono">Espresso_Terminal</span>
              </div>
              
              <div className="flex items-center gap-4 text-zinc-600">
                {activeDocument && (
                   <div className="flex items-center gap-2 px-2 py-1 bg-[#4B3022]/20 rounded-md border border-[#4B3022]/30">
                     <FileText size={10} className="text-[#6F4E37]" />
                     <span className="text-[9px] text-[#6F4E37] font-mono uppercase truncate max-w-[100px]">{activeDocument.name}</span>
                   </div>
                )}
                <button onClick={() => { const latest = getLatestAction('code'); setDisplayScreen({ type: 'code', title: 'Workspace', data: latest.data, language: latest.language }); }} className="hover:text-[#6F4E37] transition-colors" title="Recall Latest Code"><Code size={14} /></button>
                <button onClick={() => { const latest = getLatestAction('map'); setDisplayScreen({ type: 'map', title: 'Global', data: latest.data }); }} className="hover:text-[#6F4E37] transition-colors" title="Recall Latest Map"><MapIcon size={14} /></button>
                <ShieldCheck size={14} className="opacity-50" />
              </div>
            </div>

            <div ref={scrollRef} className="flex-1 p-4 md:p-8 overflow-y-auto scrollbar-hide relative z-10">
              <div className="max-w-4xl mx-auto space-y-10">
                {messages.length === 0 && (
                  <div className="text-[10px] text-zinc-600 mt-4 italic opacity-50 font-mono text-center">Handshake complete. Open Order Book to resume.</div>
                )}
                
                {messages.map((msg, i) => {
                  let cleanText = msg.content;
                  let mapMatch = null;
                  let flightMatch = null;
                  let codeMatch = null;

                  if (msg.role === 'assistant') {
                    mapMatch = cleanText.match(/\[MAP:\s*([^\]]+)\]/i);
                    flightMatch = cleanText.match(/\[FLIGHT:\s*([^\]]+)\]/i);
                    const codeRegex = new RegExp('`{3}([\\w-]*)\\s*\\n([\\s\\S]*?)`{3}', 'i');
                    codeMatch = cleanText.match(codeRegex);

                    if (mapMatch) cleanText = cleanText.replace(mapMatch[0], '').trim();
                    if (flightMatch) cleanText = cleanText.replace(flightMatch[0], '').trim();
                  }

                  return (
                    <div key={i} className={`flex flex-col w-full ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                       <div className="flex items-center gap-2 mb-2 pl-1">
                         {msg.role === 'assistant' && <div className="w-1.5 h-1.5 rounded-full bg-[#6F4E37]" />}
                         <span className="opacity-40 text-[10px] uppercase font-bold font-mono tracking-widest">
                           {msg.role === 'user' ? 'Ink' : 'Espresso'}
                         </span>
                       </div>
                       
                       <div className={`max-w-[95%] md:max-w-[85%] ${msg.role === 'user' ? 'bg-[#0A0A0A] px-5 py-3.5 rounded-2xl border border-[#4B3022]/20' : ''}`}>
                         {msg.role === 'assistant' ? (
                           <div className="text-[15px] text-zinc-300">
                             {cleanText && <TypewriterMarkdown text={cleanText} />}
                             
                             <div className="flex flex-wrap gap-2 mt-4">
                               {mapMatch && (
                                 <button onClick={() => setDisplayScreen({ type: 'map', title: mapMatch[1], data: mapMatch[1] })} className="flex items-center gap-2 px-4 py-2.5 bg-[#4B3022]/10 border border-[#4B3022]/40 rounded-xl text-[#6F4E37] hover:bg-[#4B3022]/30 transition-all font-mono">
                                   <MapIcon size={14} />
                                   <span className="text-[10px] font-bold tracking-wider uppercase">View Map: {mapMatch[1]}</span>
                                 </button>
                               )}
                               {flightMatch && (
                                 <button onClick={() => setDisplayScreen({ type: 'flight', title: flightMatch[1], data: flightMatch[1] })} className="flex items-center gap-2 px-4 py-2.5 bg-[#4B3022]/10 border border-[#4B3022]/40 rounded-xl text-[#6F4E37] hover:bg-[#4B3022]/30 transition-all font-mono">
                                   <Plane size={14} />
                                   <span className="text-[10px] font-bold tracking-wider uppercase">Track: {flightMatch[1]}</span>
                                 </button>
                               )}
                               {codeMatch && (
                                 <button onClick={() => setDisplayScreen({ type: 'code', title: 'Workspace', language: codeMatch[1], data: codeMatch[2] })} className="flex items-center gap-2 px-4 py-2.5 bg-[#0A0A0A] border border-[#4B3022]/50 rounded-xl text-zinc-300 hover:border-[#6F4E37] hover:text-[#6F4E37] transition-all font-mono">
                                   <TerminalSquare size={14} />
                                   <span className="text-[10px] font-bold tracking-wider uppercase">Open in Workspace</span>
                                 </button>
                               )}
                             </div>
                           </div>
                         ) : (
                           <div className="text-[15px] whitespace-pre-wrap leading-relaxed text-zinc-200">
                             {cleanText}
                           </div>
                         )}
                       </div>
                    </div>
                  );
                })}
                
                {isTyping && (
                  <div className="flex items-center gap-3 pl-1 pt-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#6F4E37] animate-pulse" />
                    <div className="text-[9px] text-[#6F4E37]/60 animate-pulse italic tracking-widest font-mono">BREWING...</div>
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 bg-[#050505]">
              <form 
                onSubmit={(e) => { 
                  e.preventDefault(); 
                  processCommand(inputText); 
                  setInputText(''); 
                  setShowActionMenu(false); 
                }} 
                className="flex gap-2 items-center p-2 border border-[#4B3022]/50 bg-[#0A0A0A] rounded-2xl max-w-4xl mx-auto focus-within:border-[#6F4E37]/80 transition-colors relative"
              >
                {/* Hidden File Input */}
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  accept="image/*,application/pdf"
                  onChange={(e) => {
                    if (e.target.files?.[0]) handleFileUpload(e.target.files[0]);
                    setShowActionMenu(false);
                  }} 
                />

                {/* Popover Action Menu */}
                <div className="relative">
                  <AnimatePresence>
                    {showActionMenu && (
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                        className="absolute bottom-full left-0 mb-4 w-56 bg-[#0A0A0A] border border-[#4B3022]/50 rounded-xl shadow-2xl overflow-hidden z-50 flex flex-col"
                      >
                        <button type="button" onClick={() => fileInputRef.current?.click()} className="flex items-center gap-3 px-4 py-3.5 text-sm font-mono text-zinc-300 hover:bg-[#4B3022]/20 hover:text-[#6F4E37] transition-colors text-left">
                          <Droplet size={16} /> Upload File / Image
                        </button>
                        <div className="h-px bg-[#4B3022]/30 w-full" />
                        <button type="button" onClick={() => { processCommand('/save'); setShowActionMenu(false); }} className="flex items-center gap-3 px-4 py-3.5 text-sm font-mono text-zinc-300 hover:bg-[#4B3022]/20 hover:text-[#6F4E37] transition-colors text-left">
                          <Package size={16} /> Save Order
                        </button>
                        <div className="h-px bg-[#4B3022]/30 w-full" />
                        <button type="button" onClick={() => { fetchOrderBook(); setIsOrderBookOpen(true); setShowActionMenu(false); }} className="flex items-center gap-3 px-4 py-3.5 text-sm font-mono text-zinc-300 hover:bg-[#4B3022]/20 hover:text-[#6F4E37] transition-colors text-left">
                          <Coffee size={16} /> Open Order Book
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <button 
                    type="button" 
                    onClick={() => setShowActionMenu(!showActionMenu)} 
                    className={`p-3 transition-colors rounded-xl flex items-center justify-center ${showActionMenu ? 'text-[#6F4E37] bg-[#4B3022]/20' : 'text-zinc-500 hover:text-[#6F4E37]'}`} 
                  >
                    <Plus size={20} className={`transition-transform duration-200 ${showActionMenu ? 'rotate-45' : 'rotate-0'}`} />
                  </button>
                </div>
                
                <input 
                  className="flex-1 bg-transparent text-white outline-none font-mono text-[14px] px-2" 
                  placeholder="Command Espresso..." 
                  value={inputText} 
                  onChange={(e) => setInputText(e.target.value)} 
                />
                <button type="submit" disabled={!inputText.trim()} className="p-3 text-[#6F4E37] hover:text-white disabled:opacity-30 disabled:hover:text-[#6F4E37] transition-colors rounded-xl">
                  <SendHorizontal size={20} />
                </button>
              </form>
            </div>
          </motion.div>

          {/* ========================================= */}
          {/* THE ORDER BOOK (OVERLAY) */}
          {/* ========================================= */}
          <AnimatePresence>
            {isOrderBookOpen && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="absolute inset-0 z-50 bg-[#050505]/95 backdrop-blur-md flex flex-col"
              >
                {/* Header & Tabs */}
                <div className="p-6 border-b border-[#4B3022]/30 flex justify-between items-center bg-[#0A0A0A]">
                  <div className="flex items-center gap-8">
                    <h2 className="text-xl font-bold text-white font-mono tracking-widest flex items-center gap-3">
                      <Coffee className="text-[#6F4E37]" /> ORDER BOOK
                    </h2>
                    <div className="flex gap-4 font-mono text-sm">
                      <button 
                        onClick={() => setOrderTab('order')}
                        className={`pb-1 transition-colors ${orderTab === 'order' ? 'text-[#6F4E37] border-b-2 border-[#6F4E37]' : 'text-zinc-500 hover:text-zinc-300'}`}
                      >
                        ACTIVE ORDERS
                      </button>
                      <button 
                        onClick={() => setOrderTab('archived')}
                        className={`pb-1 transition-colors ${orderTab === 'archived' ? 'text-[#6F4E37] border-b-2 border-[#6F4E37]' : 'text-zinc-500 hover:text-zinc-300'}`}
                      >
                        ARCHIVE
                      </button>
                    </div>
                  </div>
                  <button onClick={() => setIsOrderBookOpen(false)} className="text-zinc-500 hover:text-white p-2 bg-[#111] rounded-full border border-white/5">
                    <X size={20} />
                  </button>
                </div>

                {/* Body - Order Paper Style List */}
                <div className="flex-1 overflow-y-auto p-8 max-w-5xl mx-auto w-full">
                  <div className="space-y-4">
                    {orderBookItems
                      .filter(item => (orderTab === 'order' ? (item.status !== 'archived') : (item.status === 'archived')))
                      .map(item => (
                        <div key={item.id} className="bg-[#0A0A0A] border border-[#4B3022]/30 rounded-2xl p-6 flex flex-col md:flex-row gap-6 items-start md:items-center hover:border-[#6F4E37]/50 transition-colors group">
                          
                          {/* Info */}
                          <div className="flex-1">
                            <h3 className="text-lg font-bold text-white mb-2 font-sans">{item.title}</h3>
                            <p className="text-sm text-zinc-500 font-mono line-clamp-2 leading-relaxed">
                              {item.context || 'No visual context attached to this order.'}
                            </p>
                            <div className="flex gap-4 mt-4 text-[10px] font-mono text-zinc-600 uppercase">
                              <span>ID: {item.id.substring(0, 8)}</span>
                              <span>•</span>
                              <span>{item.createdAt?.seconds ? new Date(item.createdAt.seconds * 1000).toLocaleDateString() : 'Just now'}</span>
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-3 shrink-0">
                            <button 
                              onClick={() => toggleOrderStatus(item.id, item.status || 'order')}
                              className={`p-3 rounded-xl border transition-all ${item.status === 'archived' ? 'bg-[#4B3022]/20 border-[#4B3022]/50 text-[#6F4E37] hover:bg-transparent' : 'bg-transparent border-zinc-800 text-zinc-500 hover:border-[#6F4E37] hover:text-[#6F4E37]'}`}
                              title={item.status === 'archived' ? 'Reopen Order' : 'Mark as Finished'}
                            >
                              {item.status === 'archived' ? <CheckCircle2 size={20} /> : <Circle size={20} />}
                            </button>
                            <button 
                              onClick={() => loadOrderToActive(item)}
                              className="px-5 py-3 bg-[#4B3022]/10 border border-[#4B3022]/30 text-[#6F4E37] rounded-xl hover:bg-[#4B3022]/20 transition-colors font-mono text-xs font-bold tracking-wider flex items-center gap-2"
                            >
                              RESUME <ArrowRight size={14} />
                            </button>
                          </div>
                        </div>
                    ))}
                    
                    {orderBookItems.filter(item => (orderTab === 'order' ? (item.status !== 'archived') : (item.status === 'archived'))).length === 0 && (
                      <div className="text-center p-12 border border-dashed border-[#4B3022]/30 rounded-3xl text-zinc-600 font-mono">
                        No {orderTab === 'order' ? 'active orders' : 'archived receipts'} found.
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

        </>
      )}
    </div>
  );
}