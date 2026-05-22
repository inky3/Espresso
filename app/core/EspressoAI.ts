'use client';

import { useState, useCallback, useEffect } from 'react';
import { db } from '../../lib/firebase'; 
import { doc, getDoc, setDoc, serverTimestamp, updateDoc, arrayUnion } from 'firebase/firestore'; 

export function useEspressoAI() {
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'online' | 'unstable' | 'offline'>('online');
  const [showVisuals, setShowVisuals] = useState(false);
  const [navData, setNavData] = useState<{ dist: string; time: string } | null>(null);
  const [mapCoords, setMapCoords] = useState<{lat: number, lon: number, name: string} | null>(null);
  
  // Expanded Memory Schema for Ink
  const [memory, setMemory] = useState<any>({ 
    home: null, 
    work: null, 
    projects: ["QueueCare", "Astro Portfolio"], 
    personal_tags: [],
    active_document: null // Temporary working memory for uploaded files
  });

  // 1. NEURAL INITIALIZATION & CLOUD CLAIM
  const silentInitialize = useCallback(async () => {
    const localSaved = localStorage.getItem('espresso_memory');
    const initial = localSaved ? JSON.parse(localSaved) : { home: null, work: null, projects: [] };
    
    const cloudTimeout = new Promise((_, reject) => 
      setTimeout(() => reject(new Error("Cloud Sync Timeout")), 3000)
    );

    try {
      const docRef = doc(db, "espresso_core", "B"); 
      const fetchDoc = getDoc(docRef).catch(() => null);
      const docSnap = await Promise.race([fetchDoc, cloudTimeout]) as any;

      if (docSnap && docSnap.exists()) {
        const cloudData = docSnap.data().memory;
        setMemory({ ...cloudData, active_document: null }); // Don't carry over old PDFs on refresh
        localStorage.setItem('espresso_memory', JSON.stringify(cloudData));
        setConnectionStatus('online');
      } else if (docSnap) {
        await setDoc(docRef, { owner: "B", identity: "3D & Motion Graphic Designer, Frontend Developer, and Strategist.", memory: initial, lastSync: serverTimestamp() });
        setMemory(initial);
        setConnectionStatus('online');
      } else {
        throw new Error("Network unreachable");
      }
    } catch (e) {
      console.warn("Neural Link Latency: Using Local Memory. Bypassing cloud sync to prevent timeout.");
      setMemory(initial);
      setConnectionStatus('unstable'); 
    }
  }, []);

  useEffect(() => { silentInitialize(); }, [silentInitialize]);

  // 2. ADAPTIVE MEMORY STORAGE
  const saveToMemory = useCallback(async (category: string, data: any) => {
    if (category === 'active_document') return; // Don't upload massive PDFs to Firebase

    const updatedMemory = { ...memory, [category]: data };
    setMemory(updatedMemory);
    localStorage.setItem('espresso_memory', JSON.stringify(updatedMemory));

    if (connectionStatus !== 'online') return;

    try {
      const docRef = doc(db, "espresso_core", "B"); 
      updateDoc(docRef, { [`memory.${category}`]: category === 'personal_tags' ? arrayUnion(data) : data, lastUpdate: serverTimestamp() }).catch(() => null);
    } catch (e) { console.error("Cloud Archive Failed:", e); }
  }, [memory, connectionStatus]);

  // 3. DOCUMENT UPLOAD & PARSING LOGIC
  const handleFileUpload = useCallback(async (file: File) => {
    if (!file) return;
    
    setMessages(prev => [...prev, { role: 'user', content: `[SYSTEM: Uploading & Analyzing ${file.name}...]` }]);
    setIsTyping(true);

    try {
      let extractedText = "";
      
      if (file.type === 'application/pdf') {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch('/api/pdf', { method: 'POST', body: formData });
        if (!res.ok) throw new Error("Server failed to parse PDF.");
        const data = await res.json();
        extractedText = data.text;
      } else {
        extractedText = await file.text();
      }

      const docContext = `[DOCUMENT NAME: ${file.name}]\n[CONTENT]:\n${extractedText.substring(0, 30000)}`;
      
      setMemory((prev: any) => ({ ...prev, active_document: docContext }));
      
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: `The document **${file.name}** has been successfully parsed and loaded into my active memory. What would you like to know about it?` 
      }]);
      
    } catch (error) {
      setMessages(prev => [...prev, { role: 'assistant', content: `[SYSTEM_ALERT: Failed to read file ${file.name}. Ensure it is a valid PDF or text document.]` }]);
    } finally {
      setIsTyping(false);
    }
  }, []);

  // 4. SPATIAL LOGIC (WITH ANTI-HALLUCINATION)
  const getRealLocation = (): Promise<{lat: number, lon: number, name: string} | null> => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) { resolve(null); return; }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude, name: "Current GPS Location" }),
        (err) => { resolve(null); },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    });
  };

  const findLocation = async (query: string): Promise<{lat: number, lon: number, name: string} | null> => {
    let searchQuery = query.trim();
    const normalized = searchQuery.toLowerCase();
    
    const selfTriggers = ['am i', 'where am i', 'where am i now', 'me', 'i', 'my location', 'here', 'current location'];
    if (!normalized || selfTriggers.includes(normalized)) return await getRealLocation();

    // Strict known locations
    if (normalized.includes('urt') || normalized.includes('surat thani') || normalized.includes('surattha')) return { lat: 9.1336, lon: 99.1336, name: "Surat Thani International Airport (URT)" };
    if (normalized.includes('hkt') || normalized.includes('phuket')) return { lat: 8.1132, lon: 98.3169, name: "Phuket International Airport (HKT)" };
    if (normalized.includes('bkk') || normalized.includes('suvarnabhumi')) return { lat: 13.6900, lon: 100.7501, name: "Suvarnabhumi Airport (BKK)" };
    if (normalized.includes('dmk') || normalized.includes('don mueang')) return { lat: 13.9126, lon: 100.6068, name: "Don Mueang International Airport (DMK)" };

    // Smart Context Anchor: If no region is specified, assume Phuket area to avoid wild guesses
    if (!normalized.includes('thailand') && !normalized.includes('phuket') && !normalized.includes('bangkok')) {
        searchQuery += ", Phuket, Thailand";
    }

    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=1`, { headers: { 'User-Agent': 'Espresso-Assistant' } });
      const data = await res.json();
      
      if (!data?.[0]) return null;

      const result = data[0];
      
      // REJECTION LOGIC: Prevent pinning a cafe onto an airplane runway
      if ((normalized.includes('cafe') || normalized.includes('food') || normalized.includes('breakfast')) && result.type === 'aeroway') {
          console.warn("Blocked map engine from placing a food pin on an airport runway.");
          return null;
      }

      return { lat: parseFloat(result.lat), lon: parseFloat(result.lon), name: result.display_name.split(',')[0] }; 
    } catch { return null; }
  };

  // 5. COMMAND PROCESSOR
  const processCommand = useCallback(async (userMsg: string) => {
    if (!userMsg.trim() || isTyping) return;
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsTyping(true);

    const input = userMsg.toLowerCase();
    let systemAlert = "";

    if (input.includes("remember") || input.includes("save")) {
      const tag = input.replace(/remember|that|i|save/g, '').trim();
      await saveToMemory('personal_tags', tag);
      systemAlert = `\n\n[NEURAL_NODE_SAVED]: ${tag}`;
    }

    if (input.match(/\b(open|show|expand)\s+(the\s+)?visual\s+dock\b/i)) setShowVisuals(true);
    if (input.match(/\b(close|hide|minimize)\s+(the\s+)?visual\s+dock\b/i)) setShowVisuals(false);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [...messages, { role: 'user', content: userMsg }], context: memory }),
      });
      const data = await res.json();
      let aiText = data.text;

      const mapRegex = /\[MAP:\s*([^\]]+)\]/i;
      const mapMatch = aiText.match(mapRegex);

      if (mapMatch) {
        const query = mapMatch[1].trim();
        aiText = aiText.replace(mapRegex, '').trim(); 
        const found = await findLocation(query); 
        
        if (found) { 
            setMapCoords(found); 
            setShowVisuals(true); 
        } else { 
            // If the map engine failed (or we rejected a runway pin), tell the user seamlessly
            systemAlert += `\n\n[SYSTEM_ALERT: Exact location coordinates unavailable. Location pin aborted.]`; 
        }
      }

      if (!mapMatch && aiText.match(/\[VISUAL_DOCK\]/i)) setShowVisuals(true);
      let cleanText = aiText.replace(/[-*]?\s*\\?\[VISUAL.*?DOCK\\?\].*/gi, '').trim();
      if (!cleanText) cleanText = mapMatch ? "Attempting to locate in Visual Dock..." : "Acknowledged.";

      setMessages(prev => [...prev, { role: 'assistant', content: cleanText + systemAlert }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: "SYSTEM_ALERT: Neural core timeout." }]);
    } finally { setIsTyping(false); }
  }, [messages, isTyping, memory, mapCoords, saveToMemory]);

  return { messages, setMessages, isTyping, connectionStatus, showVisuals, setShowVisuals, navData, mapCoords, processCommand, silentInitialize, surroundings: mapCoords?.name || "Ready.", handleFileUpload };
}