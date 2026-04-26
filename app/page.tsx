'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Cpu, ShieldCheck, Plus, SendHorizontal, LayoutPanelLeft, 
  Workflow, ZoomIn, ZoomOut, Maximize, Copy, Check, Code, X, Plane, FileText
} from 'lucide-react';

// Firebase Imports
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, signInAnonymously, onAuthStateChanged, User } from "firebase/auth";
import { 
  collection, 
  addDoc, 
  serverTimestamp,
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager,
  getDocs
} from "firebase/firestore";

// --- FIREBASE CONFIGURATION ---
const firebaseConfig = {
  apiKey: "AIzaSyCia58uUHOSKPJuLPbWkkhtqsRRk7wOG_k",
  authDomain: "sebai-a4e6c.firebaseapp.com",
  projectId: "sebai-a4e6c",
  storageBucket: "sebai-a4e6c.firebasestorage.app",
  messagingSenderId: "524305789553",
  appId: "1:524305789553:web:8212c9a9d0f23a258821d0",
  measurementId: "G-XJN0QXFJM7"
};

// Next.js hot-reloading safeguard
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});

const appId = 'seb-ai-terminal'; 

// --- CORE AI HOOK ---
function useSebAI() {
  const [messages, setMessages] = useState<any[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'online' | 'offline'>('offline');
  const [showVisuals, setShowVisuals] = useState(false);
  const [mapCoords, setMapCoords] = useState<{ lat: number, lon: number } | null>(null);
  const [activeDocument, setActiveDocument] = useState<{ name: string, text: string } | null>(null);

  // AUTH HANDSHAKE
  useEffect(() => {
    if (!auth) return;
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (err) { console.error("SebOS Auth Error:", err); }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setConnectionStatus(u ? 'online' : 'offline');
    });
    return () => unsubscribe();
  }, []);

  // PERSISTENCE: Restore document from memory on reload
  useEffect(() => {
    if (!user || !db) return;

    const restoreMemory = async () => {
      try {
        console.log("SebOS: Attempting cloud memory recall...");
        // RULE 2: Simple collection query, no limit/orderBy to prevent index errors
        const docRef = collection(db, 'artifacts', appId, 'public', 'data', 'documents');
        const querySnapshot = await getDocs(docRef);
        
        if (!querySnapshot.empty) {
          // Fetch all and sort in memory by createdAt to get the latest
          const allDocs = querySnapshot.docs.map(d => ({ 
            id: d.id, 
            ...d.data() 
          } as any));
          
          // Sort by createdAt descending
          allDocs.sort((a: any, b: any) => {
            const timeA = a.createdAt?.seconds || 0;
            const timeB = b.createdAt?.seconds || 0;
            return timeB - timeA;
          });

          const latestDoc = allDocs[0];
          setActiveDocument({ name: latestDoc.name, text: latestDoc.text });
          
          setMessages(prev => [...prev, { 
            role: 'assistant', 
            content: `Neural link restored. Active document: [${latestDoc.name}]. I am ready to discuss the data.`, 
            timestamp: Date.now() 
          }]);
          console.log("SebOS: Cloud memory sync complete.");
        }
      } catch (err: any) {
        console.error("SebOS Memory Recall Failed:", err.message);
      }
    };

    restoreMemory();
  }, [user]);

  const processCommand = async (text: string) => {
    if (!text.trim()) return;
    const userMsg = { role: 'user', content: text, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setIsTyping(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMsg],
          activeDocument: activeDocument 
        })
      });
      const data = await response.json();
      const assistantMsg = { role: 'assistant', content: data.text, timestamp: Date.now() };
      
      const mapMatch = data.text.match(/\[MAP:\s*(-?\d+\.?\d*),\s*(-?\d+\.?\d*)\]/);
      if (mapMatch) {
        setMapCoords({ lat: parseFloat(mapMatch[1]), lon: parseFloat(mapMatch[2]) });
        setShowVisuals(true);
      }
      
      setMessages(prev => [...prev, assistantMsg]);
    } catch (error) {
      setMessages(prev => [...prev, { role: 'assistant', content: "CRITICAL_ERROR: Neural Link failed.", timestamp: Date.now() }]);
    } finally { setIsTyping(false); }
  };

  const handleFileUpload = async (file: File) => {
    if (!file || file.type !== 'application/pdf') {
      setMessages(prev => [...prev, { role: 'assistant', content: "SYSTEM_ALERT: Only PDF files are accepted.", timestamp: Date.now() }]);
      return;
    }

    setIsTyping(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/pdf', { method: 'POST', body: formData });
      const data = await res.json();
      
      if (data.text) {
        const docData = { name: data.name, text: data.text };
        setActiveDocument(docData);

        // SAVE TO FIREBASE (RULE 1 Path)
        if (user && db) {
          try {
            await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'documents'), {
              ...docData,
              owner: user.uid,
              createdAt: serverTimestamp()
            });
            console.log("SebOS: Document committed to cloud memory.");
          } catch (dbErr: any) {
            console.error("SebOS Cloud Write Failed:", dbErr.message);
            setMessages(prev => [...prev, { role: 'assistant', content: "SYSTEM_ALERT: Cloud Sync failed. Check Firebase Rules.", timestamp: Date.now() }]);
          }
        }

        setMessages(prev => [...prev, { role: 'assistant', content: `Document [${data.name}] integrated and synced.`, timestamp: Date.now() }]);
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: "SYSTEM_ALERT: PDF processing failed.", timestamp: Date.now() }]);
    } finally { setIsTyping(false); }
  };

  return { messages, isTyping, connectionStatus, showVisuals, setShowVisuals, processCommand, mapCoords, handleFileUpload, user };
}

// --- SUB-COMPONENTS ---
const MermaidChart = ({ chart }: { chart: string }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const loadMermaid = async () => {
      if (!(window as any).mermaid) {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js';
        script.async = true;
        script.onload = renderChart;
        document.head.appendChild(script);
      } else { renderChart(); }
    };
    const renderChart = async () => {
      const mermaid = (window as any).mermaid;
      if (ref.current && chart && mermaid) {
        try {
          mermaid.initialize({ startOnLoad: false, theme: 'dark', themeVariables: { fontFamily: 'monospace' } });
          const { svg } = await mermaid.render(`m-${Math.random().toString(36).substr(2, 9)}`, chart);
          if (ref.current) ref.current.innerHTML = svg;
        } catch (e) { console.error("Mermaid Render Error", e); }
      }
    };
    loadMermaid();
  }, [chart]);

  const handleWheel = (e: React.WheelEvent) => setScale(s => Math.min(Math.max(0.3, s - e.deltaY * 0.002), 3));
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };

  return (
    <div 
      className={`relative w-full h-full bg-[#0a0a0a] overflow-hidden flex flex-col ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
      onWheel={handleWheel} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={() => setIsDragging(false)} onMouseLeave={() => setIsDragging(false)}
    >
      <div className="absolute top-4 right-4 flex gap-2 z-10">
        <button onClick={() => setScale(s => Math.max(0.3, s - 0.2))} className="p-2 bg-zinc-950/80 border border-zinc-800 rounded-lg text-zinc-400 hover:text-white backdrop-blur-sm"><ZoomOut size={16} /></button>
        <button onClick={() => { setScale(1); setPosition({ x: 0, y: 0 }); }} className="p-2 bg-zinc-950/80 border border-zinc-800 rounded-lg text-zinc-400 hover:text-white backdrop-blur-sm"><Maximize size={16} /></button>
        <button onClick={() => setScale(s => Math.min(3, s + 0.2))} className="p-2 bg-zinc-950/80 border border-zinc-800 rounded-lg text-zinc-400 hover:text-white backdrop-blur-sm"><ZoomIn size={16} /></button>
      </div>
      <div className="flex-1 flex items-center justify-center p-8 pointer-events-none">
        <div ref={ref} className="text-zinc-300 origin-center pointer-events-auto transition-transform duration-75" style={{ transform: `translate(${position.x}px, ${position.y}px) scale(${scale})` }} />
      </div>
    </div>
  );
};

const CodeBlock = ({ code, language, onOpen }: { code: string, language: string, onOpen: () => void }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="my-2 rounded-xl overflow-hidden border border-zinc-800 bg-zinc-950 shadow-md w-full">
      <div className="flex items-center justify-between px-4 py-2 bg-zinc-900/80 border-b border-zinc-800">
        <span className="text-[10px] text-zinc-400 uppercase font-bold tracking-widest">{language || 'Code'}</span>
        <div className="flex items-center gap-3">
          <button onClick={onOpen} className="text-zinc-500 hover:text-blue-400"><Maximize size={14} /></button>
          <button onClick={handleCopy} className="text-zinc-500 hover:text-white transition-colors">
            {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
          </button>
        </div>
      </div>
      <pre className="p-4 overflow-x-auto text-zinc-300 text-xs font-mono"><code>{code}</code></pre>
    </div>
  );
};

const TypewriterText = ({ text }: { text: string }) => {
  const [displayed, setDisplayed] = useState("");
  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      setDisplayed(text.slice(0, i + 1));
      i++;
      if (i >= text.length) clearInterval(interval);
    }, 12);
    return () => clearInterval(interval);
  }, [text]);
  return <span>{displayed}</span>;
};

// --- MAIN APP ---
export default function App() {
  const { messages, isTyping, connectionStatus, showVisuals, setShowVisuals, processCommand, mapCoords, handleFileUpload } = useSebAI();
  const [isBooting, setIsBooting] = useState(true);
  const [inputText, setInputText] = useState('');
  const [vdMode, setVdMode] = useState<'map' | 'mermaid' | 'flight'>('map');
  const [activeMermaid, setActiveMermaid] = useState<string>('');
  const [showCoding, setShowCoding] = useState(false);
  const [activeCode, setActiveCode] = useState('');
  const [activeLang, setActiveLang] = useState('plaintext');
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => setIsBooting(false), 1000);
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, isTyping]);

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFile(true);
  };
  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFile(false);
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFile(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileUpload(file);
  };

  const triggerCodingScreen = (code: string, lang: string) => { setActiveCode(code); setActiveLang(lang); setShowCoding(true); };

  return (
    <div 
      className="h-dvh w-screen bg-black text-zinc-400 font-mono overflow-hidden relative flex flex-col md:flex-row"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <AnimatePresence>
        {isBooting ? (
          <motion.div exit={{ opacity: 0 }} className="absolute inset-0 z-[100] bg-black flex flex-col items-center justify-center">
             <Cpu size={42} className="text-blue-500 mb-4 animate-pulse" />
             <span className="text-[10px] tracking-widest text-zinc-700 uppercase">Neural_Core_Syncing...</span>
          </motion.div>
        ) : (
          <motion.div key="main" className="flex-1 flex flex-col md:flex-row overflow-hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {/* DRAG OVERLAY */}
            {isDraggingFile && (
              <motion.div 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="absolute inset-0 z-[200] bg-blue-600/10 backdrop-blur-md border-4 border-dashed border-blue-500/40 flex flex-col items-center justify-center pointer-events-none"
              >
                <FileText size={64} className="text-blue-500 mb-4 animate-bounce" />
                <span className="text-xl font-bold text-white uppercase tracking-widest">Drop into Seb's Core</span>
              </motion.div>
            )}

            {(showVisuals || showCoding) && (
              <motion.div 
                layout initial={{ x: -50, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
                className={`w-full md:h-full flex flex-col md:flex-row shrink-0 border-b md:border-b-0 md:border-r border-zinc-900 z-30 ${showVisuals && showCoding ? 'md:w-2/3' : 'md:w-1/2'}`}
              >
                {showCoding && (
                  <div className="flex-1 flex flex-col bg-[#09090b]">
                    <div className="p-3 border-b border-zinc-900 flex justify-between items-center bg-zinc-900/20">
                      <span className="text-[10px] text-blue-500 font-bold uppercase tracking-widest">Workspace // {activeLang}</span>
                      <button onClick={() => setShowCoding(false)} className="text-zinc-600 hover:text-red-400"><X size={14} /></button>
                    </div>
                    <textarea className="flex-1 w-full bg-transparent p-6 text-[13px] font-mono text-zinc-300 outline-none resize-none leading-relaxed" value={activeCode} readOnly spellCheck={false} />
                  </div>
                )}
                {showVisuals && (
                  <div className="flex-1 flex flex-col bg-black">
                    <div className="p-3 border-b border-zinc-900 flex justify-between items-center bg-zinc-900/20">
                      <span className="text-[10px] text-blue-500 font-bold uppercase tracking-widest">{vdMode.toUpperCase()}</span>
                      <button onClick={() => setShowVisuals(false)} className="text-zinc-600 hover:text-red-400"><X size={14} /></button>
                    </div>
                    <div className="flex-1 relative">
                      {vdMode === 'mermaid' ? <MermaidChart chart={activeMermaid} /> : 
                       vdMode === 'map' && mapCoords ? <iframe src={`https://www.openstreetmap.org/export/embed.html?bbox=${mapCoords.lon - 0.005},${mapCoords.lat - 0.005},${mapCoords.lon + 0.005},${mapCoords.lat + 0.005}&layer=mapnik&marker=${mapCoords.lat},${mapCoords.lon}`} className="w-full h-full opacity-80 saturate-50" /> :
                       <div className="h-full flex items-center justify-center text-[10px] text-zinc-800 tracking-widest uppercase">Awaiting_Data...</div>}
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            <motion.aside layout className="flex-1 flex flex-col min-h-0 bg-zinc-950">
              <div className="p-3 border-b border-zinc-900 flex justify-between items-center bg-black/40">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${connectionStatus === 'online' ? 'bg-blue-500' : 'bg-red-500'}`} />
                  <span className="text-[10px] font-bold text-zinc-100 uppercase tracking-widest">Seb_Terminal</span>
                </div>
                <div className="flex items-center gap-4">
                  <button onClick={() => setShowCoding(!showCoding)} className={`transition-colors ${showCoding ? 'text-blue-500' : 'text-zinc-600 hover:text-white'}`}><Code size={16} /></button>
                  <button onClick={() => setShowVisuals(!showVisuals)} className={`transition-colors ${showVisuals ? 'text-blue-500' : 'text-zinc-600 hover:text-white'}`}><LayoutPanelLeft size={16} /></button>
                  <ShieldCheck size={14} className="text-zinc-800" />
                </div>
              </div>
              <div ref={scrollRef} className="flex-1 p-4 overflow-y-auto space-y-4 text-xs scrollbar-hide">
                {messages.map((msg, i) => {
                  const parts = msg.content.split(/(```[\s\S]*?```)/g);
                  let hasMermaid = false;
                  let mermaidCode = '';

                  return (
                    <div key={i} className={`p-4 rounded-2xl border w-fit max-w-[88%] ${msg.role === 'user' ? 'bg-zinc-900 border-zinc-800 ml-auto text-zinc-100' : 'bg-blue-600/5 border-blue-500/10 text-zinc-300'}`}>
                      <span className="text-[7px] opacity-20 block uppercase font-black mb-1">{msg.role === 'user' ? 'Ink' : 'Seb'}</span>
                      <div className="flex flex-col gap-3">
                        {parts.map((part: string, partIndex: number) => {
                          if (part.startsWith('```')) {
                            const match = part.match(/```([\w-]*)\s*([\s\S]*?)```/);
                            if (match) {
                              const lang = match[1] || 'plaintext';
                              const code = match[2].trim();
                              if (lang === 'mermaid') { hasMermaid = true; mermaidCode = code; return null; }
                              return <CodeBlock key={partIndex} code={code} language={lang} onOpen={() => triggerCodingScreen(code, lang)} />;
                            }
                          }
                          if (!part.trim()) return null;
                          return msg.role === 'assistant' ? <TypewriterText key={partIndex} text={part} /> : <span key={partIndex}>{part}</span>;
                        })}
                      </div>
                      {hasMermaid && msg.role === 'assistant' && (
                        <button onClick={() => { setVdMode('mermaid'); setActiveMermaid(mermaidCode); setShowVisuals(true); }} className="flex items-center gap-2 px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-blue-500 hover:text-white transition-all w-fit mt-2">
                          <Workflow size={14} /> <span className="text-[10px] font-bold uppercase tracking-widest">Visual Analysis</span>
                        </button>
                      )}
                    </div>
                  );
                })}
                {isTyping && <div className="text-[9px] text-blue-500/40 animate-pulse pl-2 tracking-widest italic">THINKING...</div>}
              </div>
              <form onSubmit={(e) => { e.preventDefault(); processCommand(inputText); setInputText(''); }} className="p-3 border-t border-zinc-900 flex gap-2 items-center bg-black/20">
                <input type="file" ref={fileInputRef} accept=".pdf" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleFileUpload(e.target.files[0]); }} />
                <button type="button" onClick={() => fileInputRef.current?.click()} className="p-3 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-400 hover:text-white transition-colors"><Plus size={20} /></button>
                <input className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl p-3 px-4 text-white text-[15px] outline-none focus:border-blue-500/20" placeholder="Command Seb..." value={inputText} onChange={(e) => setInputText(e.target.value)} />
                <button type="submit" className="p-3 bg-blue-600 text-white rounded-xl disabled:opacity-50" disabled={!inputText.trim()}><SendHorizontal size={20} /></button>
              </form>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}