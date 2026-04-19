/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Send, 
  Plus, 
  MessageSquare, 
  Trash2, 
  Menu, 
  X, 
  Bot, 
  User, 
  Loader2,
  Sparkles,
  Mic,
  MicOff,
  Paperclip,
  Image as ImageIcon,
  FileText,
  X as CloseIcon,
  Settings,
  Database,
  Save,
  Upload,
  Key,
  Cpu,
  Check,
  Smartphone,
  Copy,
  Activity,
  MessageCircle
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Message, ChatSession, Attachment, KnowledgeBase, AISettings } from './types';
import { sendMessageStream, generateTitle } from './services/gemini';

export default function App() {
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    const saved = localStorage.getItem('aura-sessions');
    return saved ? JSON.parse(saved) : [];
  });
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [knowledgeBase, setKnowledgeBase] = useState<KnowledgeBase>(() => {
    const saved = localStorage.getItem('aura-knowledge');
    const parsed = saved ? JSON.parse(saved) : { text: '' };
    // Migration: handle old 'image' property if it exists
    if (parsed.image && !parsed.images) {
      parsed.images = [parsed.image];
      delete parsed.image;
    }
    if (!parsed.images) parsed.images = [];
    return parsed;
  });
  const [aiSettings, setAiSettings] = useState<AISettings>(() => {
    const saved = localStorage.getItem('aura-settings');
    return saved ? JSON.parse(saved) : { 
      apiKey: '', 
      model: 'gemini-3-flash-preview', 
      provider: 'gemini',
      whatsapp: {
        accessToken: '',
        phoneNumberId: '',
        verifyToken: 'aura_nexus_secret',
        isActive: false
      },
      qrIntegration: {
        apiUrl: 'https://gate.whapi.cloud', // Default example
        apiKey: '',
        isActive: false
      }
    };
  });
  const [activeTab, setActiveTab] = useState<'knowledge' | 'model' | 'integration'>('knowledge');
  const [integrationMode, setIntegrationMode] = useState<'official' | 'barcode'>('official');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [isFetchingQr, setIsFetchingQr] = useState(false);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const knowledgeImageRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'id-ID';

      recognitionRef.current.onresult = (event: any) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }
        
        if (finalTranscript) {
          setInput(prev => prev + (prev.length > 0 ? ' ' : '') + finalTranscript);
        }
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error', event.error);
        setIsListening(false);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }
  }, []);

  const toggleListening = () => {
    if (!recognitionRef.current) {
      alert('Browser Anda tidak mendukung pengenalan suara.');
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
    } else {
      recognitionRef.current.start();
      setIsListening(true);
    }
  };

  const currentSession = sessions.find(s => s.id === currentSessionId);

  useEffect(() => {
    localStorage.setItem('aura-sessions', JSON.stringify(sessions));
  }, [sessions]);

  useEffect(() => {
    localStorage.setItem('aura-knowledge', JSON.stringify(knowledgeBase));
  }, [knowledgeBase]);

  useEffect(() => {
    localStorage.setItem('aura-settings', JSON.stringify(aiSettings));
    // Sync settings to server for backend access (WhatsApp)
    fetch('/api/sync-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: aiSettings, knowledge: knowledgeBase })
    }).catch(err => console.error('Failed to sync settings to server:', err));
  }, [aiSettings, knowledgeBase]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [currentSession?.messages, isTyping]);

  const createNewSession = () => {
    const newSession: ChatSession = {
      id: crypto.randomUUID(),
      messages: [],
      title: 'Percakapan Baru'
    };
    setSessions(prev => [newSession, ...prev]);
    setCurrentSessionId(newSession.id);
    setIsSidebarOpen(false);
  };

  const deleteSession = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setSessions(prev => prev.filter(s => s.id !== id));
    if (currentSessionId === id) {
      setCurrentSessionId(null);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newAttachments: Attachment[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const reader = new FileReader();
      
      const promise = new Promise<void>((resolve) => {
        reader.onload = () => {
          newAttachments.push({
            id: crypto.randomUUID(),
            name: file.name,
            type: file.type,
            size: file.size,
            url: URL.createObjectURL(file),
            base64: reader.result as string
          });
          resolve();
        };
      });

      reader.readAsDataURL(file);
      await promise;
    }

    setPendingAttachments(prev => [...prev, ...newAttachments]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removePendingAttachment = (id: string) => {
    setPendingAttachments(prev => prev.filter(a => a.id !== id));
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    const newAttachments: Attachment[] = [];

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          const reader = new FileReader();
          const promise = new Promise<void>((resolve) => {
            reader.onload = () => {
              newAttachments.push({
                id: crypto.randomUUID(),
                name: `Pasted Image ${new Date().toLocaleTimeString()}`,
                type: file.type,
                size: file.size,
                url: URL.createObjectURL(file),
                base64: reader.result as string
              });
              resolve();
            };
          });
          reader.readAsDataURL(file);
          await promise;
        }
      }
    }

    if (newAttachments.length > 0) {
      setPendingAttachments(prev => [...prev, ...newAttachments]);
    }
  };

  const fetchQrCode = async () => {
    if (!aiSettings.qrIntegration?.apiKey || !aiSettings.qrIntegration?.apiUrl) {
      alert("Masukkan API Key dan API URL terlebih dahulu!");
      return;
    }
    setIsFetchingQr(true);
    try {
      const resp = await fetch('/api/whatsapp/qr');
      const data = await resp.json();
      if (data.base64) {
        setQrCode(data.base64);
      } else if (data.qr) {
        setQrCode(data.qr);
      } else {
        alert("Gagal mendapatkan QR. Pastikan API Key benar.");
      }
    } catch (err) {
      console.error(err);
      alert("Terjadi kesalahan saat mengambil QR.");
    } finally {
      setIsFetchingQr(false);
    }
  };

  const handleSend = async () => {
    if ((!input.trim() && pendingAttachments.length === 0) || isTyping) return;

    let sessionId = currentSessionId;
    let currentSessions = [...sessions];

    if (!sessionId) {
      const newSession: ChatSession = {
        id: crypto.randomUUID(),
        messages: [],
        title: 'Percakapan Baru'
      };
      sessionId = newSession.id;
      currentSessions = [newSession, ...currentSessions];
      setSessions(currentSessions);
      setCurrentSessionId(sessionId);
    }

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input,
      timestamp: Date.now(),
      attachments: pendingAttachments
    };

    const updatedSessions = currentSessions.map(s => 
      s.id === sessionId ? { ...s, messages: [...s.messages, userMessage] } : s
    );
    setSessions(updatedSessions);
    const lastInput = input;
    const lastAttachments = [...pendingAttachments];
    setInput('');
    setPendingAttachments([]);
    setIsTyping(true);

    try {
      const session = updatedSessions.find(s => s.id === sessionId);
      if (!session) return;

      // Update title if it's the first message
      if (session.messages.length === 1) {
        generateTitle(lastInput || "File Upload", aiSettings).then(title => {
          setSessions(prev => prev.map(s => 
            s.id === sessionId ? { ...s, title } : s
          ));
        });
      }

      const history = session.messages.slice(0, -1).map(m => ({
        role: (m.role === 'user' ? 'user' : 'model') as 'user' | 'model',
        parts: [
          { text: m.content },
          ...(m.attachments || []).map(att => ({
            inlineData: {
              mimeType: att.type,
              data: att.base64?.split(',')[1] || ''
            }
          }))
        ]
      }));

      const assistantMessageId = crypto.randomUUID();
      let assistantContent = '';

      // Initialize assistant message in state
      setSessions(prev => prev.map(s => 
        s.id === sessionId ? { 
          ...s, 
          messages: [...s.messages, {
            id: assistantMessageId,
            role: 'assistant',
            content: '',
            timestamp: Date.now()
          }] 
        } : s
      ));

      const stream = sendMessageStream(history, lastInput, lastAttachments, knowledgeBase, aiSettings);
      
      for await (const chunk of stream) {
        assistantContent += chunk;
        setSessions(prev => prev.map(s => 
          s.id === sessionId ? {
            ...s,
            messages: s.messages.map(m => 
              m.id === assistantMessageId ? { ...m, content: assistantContent } : m
            )
          } : s
        ));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="flex h-screen w-full bg-[#fcfcfc] relative overflow-hidden font-sans">
      {/* Mobile Backdrop */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 app-sidebar z-50 transform transition-transform duration-300 lg:relative lg:translate-x-0
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="flex flex-col h-full p-6">
          <div className="flex items-center gap-2.5 mb-8">
            <div className="w-6 h-6 bg-black rounded-[6px] flex items-center justify-center">
              <Sparkles className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-bold text-lg tracking-tight text-[#1a1a1a]">Nexus AI</span>
          </div>

          <button 
            onClick={createNewSession}
            className="clean-button-primary w-full flex items-center justify-center gap-2 mb-8"
          >
            <Plus className="w-4 h-4" />
            <span>New Conversation</span>
          </button>

          <div className="flex-1 overflow-y-auto pr-2 scrollbar-none">
            <span className="history-label">Recent Conversations</span>
            <div className="space-y-1">
              {sessions.map(s => (
                <div 
                  key={s.id}
                  onClick={() => {
                    setCurrentSessionId(s.id);
                    setIsSidebarOpen(false);
                  }}
                  className={`
                    flex items-center justify-between group p-2 rounded-md cursor-pointer transition-all
                    ${currentSessionId === s.id 
                      ? 'text-[#000] font-medium' 
                      : 'text-[#444] hover:text-[#000]'}
                  `}
                >
                  <div className="flex items-center gap-3 truncate">
                    <span className="truncate text-[14px]">{s.title}</span>
                  </div>
                  <button 
                    onClick={(e) => deleteSession(e, s.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-[#f0f0f0] rounded transition-all text-[#888]"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-auto pt-4 border-t border-[#eeeeee]">
            <div className="space-y-1">
              <button 
                onClick={() => {
                  setActiveTab('knowledge');
                  setIsSettingsOpen(true);
                }}
                className="clean-button-ghost w-full text-left flex items-center gap-2"
              >
                <Database className="w-4 h-4" />
                Knowledge Base
              </button>
              <button 
                onClick={() => {
                  setActiveTab('model');
                  setIsSettingsOpen(true);
                }}
                className="clean-button-ghost w-full text-left flex items-center gap-2"
              >
                <Settings className="w-4 h-4" />
                AI Model Settings
              </button>
              <button 
                onClick={() => {
                  setActiveTab('integration');
                  setIsSettingsOpen(true);
                }}
                className="clean-button-ghost w-full text-left flex items-center gap-2"
              >
                <Smartphone className="w-4 h-4" />
                Integrasi WA Business
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full relative z-10">
        {/* Header */}
        <header className="header-minimal flex items-center justify-between sticky top-0 z-20">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 hover:bg-[#f0f0f0] rounded-lg lg:hidden text-[#888]"
            >
              <Menu className="w-6 h-6" />
            </button>
            <h2 className="text-[14px] font-medium text-[#666] truncate max-w-xs sm:max-w-md">
              {currentSession?.title || 'New Conversation'}
            </h2>
          </div>
          <div className="flex items-center gap-2">
             <div className="text-[12px] text-[#999] bg-[#f0f0f0] px-2 py-0.5 rounded-full">
               Model: {aiSettings.model.replace(/-/g, ' ').toUpperCase()}
             </div>
          </div>
        </header>

        {/* Message Area */}
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto scroll-smooth chat-viewport-minimal"
        >
          {currentSession ? (
            <>
              {/* Knowledge Visual Reference (If exists) */}
              {knowledgeBase.images && knowledgeBase.images.length > 0 && (
                <div className="mb-10 p-4 bg-[#f9f9f9] border border-[#eee] rounded-2xl">
                  <div className="flex items-center gap-2 mb-3">
                    <Database className="w-4 h-4 text-black" />
                    <span className="text-[12px] font-bold text-[#888] uppercase tracking-wider">Referensi Visual Basis Pengetahuan</span>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {knowledgeBase.images.map(img => (
                      <div key={img.id} className="relative group/att">
                        <img 
                          src={img.base64 || img.url} 
                          alt={img.name} 
                          className="h-24 w-auto object-cover rounded-lg border border-white shadow-sm hover:scale-105 transition-transform cursor-zoom-in"
                          referrerPolicy="no-referrer"
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover/att:bg-black/5 transition-colors rounded-lg" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {currentSession.messages.map((m) => (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  key={m.id}
                  className="message-container"
                >
                  <div className={`avatar-minimal ${m.role === 'user' ? 'avatar-user uppercase' : 'avatar-ai'}`}>
                    {m.role === 'user' ? 'JD' : 'AI'}
                  </div>
                  
                  <div className="message-content-minimal">
                    {m.attachments && m.attachments.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-3">
                        {m.attachments.map(att => (
                          <div key={att.id} className="relative group/att">
                            {att.type.startsWith('image/') ? (
                              <img 
                                src={att.base64 || att.url} 
                                alt={att.name} 
                                className="h-32 w-auto object-cover rounded-md border border-[#eee]"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <div className="flex items-center gap-2 p-2 bg-[#f9f9f9] border border-[#eee] rounded-md text-[13px] text-[#444]">
                                <FileText className="w-4 h-4 text-[#888]" />
                                <span className="max-w-[150px] truncate">{att.name}</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="markdown-body">
                      <ReactMarkdown
                        components={{
                          p: ({ children }) => {
                            if (typeof children === 'string' && children.includes('[[KB_IMAGE:')) {
                              const parts = children.split(/(\[\[KB_IMAGE:\d+\]\])/g);
                              return (
                                <p>
                                  {parts.map((part, i) => {
                                    const match = part.match(/\[\[KB_IMAGE:(\d+)\]\]/);
                                    if (match) {
                                      const index = parseInt(match[1]);
                                      const img = knowledgeBase.images?.[index];
                                      if (img) {
                                        return (
                                          <span key={i} className="block my-4">
                                            <img 
                                              src={img.base64 || img.url} 
                                              alt={`Ref ${index}`} 
                                              className="max-w-full h-auto rounded-xl border border-[#eee] shadow-md hover:scale-[1.02] transition-transform cursor-zoom-in"
                                              referrerPolicy="no-referrer"
                                            />
                                            <span className="text-[11px] text-[#999] mt-1 block italic underline font-bold">Referensi Visual Basis Pengetahuan: {img.name}</span>
                                          </span>
                                        );
                                      }
                                      return part;
                                    }
                                    return part;
                                  })}
                                </p>
                              );
                            }
                            return <p>{children}</p>;
                          }
                        }}
                      >
                        {m.content}
                      </ReactMarkdown>
                    </div>
                  </div>
                </motion.div>
              ))}
              {isTyping && (
                <div className="message-container">
                  <div className="avatar-minimal avatar-ai">AI</div>
                  <div className="flex items-center py-2">
                    <Loader2 className="w-4 h-4 animate-spin text-[#aaa]" />
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-xl mx-auto space-y-8">
               <div className="w-16 h-16 bg-black rounded-xl flex items-center justify-center">
                 <Sparkles className="w-8 h-8 text-white" />
               </div>
               <div className="space-y-3">
                 <h2 className="text-[32px] font-bold text-[#1a1a1a] tracking-tight leading-tight">Mulai analisismu dengan Nexus AI</h2>
                 <p className="text-[15px] text-[#666] max-w-md mx-auto">Asisten cerdas yang dirancang untuk membantu produktivitas harian Anda dengan antarmuka yang bersih dan fokus.</p>
               </div>
               
               <div className="flex flex-wrap items-center justify-center gap-2 w-full mt-4">
                  {[
                    "Sektor Fintech",
                    "E-commerce",
                    "Prediksi 2025",
                    "Python Debug",
                    "Market Analysis"
                  ].map((suggestion, i) => (
                    <button 
                      key={i}
                      onClick={() => setInput(suggestion)}
                      className="tag-minimal"
                    >
                      {suggestion}
                    </button>
                  ))}
               </div>
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="input-area-gradient sticky bottom-0 z-20">
          <div className="max-w-4xl mx-auto flex flex-col gap-2">
            {pendingAttachments.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2 p-2 glass-card bg-white/50 border border-[#eee] rounded-xl">
                {pendingAttachments.map(att => (
                  <div key={att.id} className="relative group/item">
                    {att.type.startsWith('image/') ? (
                      <img 
                        src={att.base64 || att.url} 
                        alt={att.name} 
                        className="h-16 w-16 object-cover rounded-lg border border-[#eee]"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="h-16 flex items-center gap-2 px-3 bg-[#f9f9f9] border border-[#eee] rounded-lg text-[12px] text-[#666]">
                        <FileText className="w-4 h-4" />
                        <span className="max-w-[80px] truncate">{att.name}</span>
                      </div>
                    )}
                    <button 
                      onClick={() => removePendingAttachment(att.id)}
                      className="absolute -top-1.5 -right-1.5 p-0.5 bg-black text-white rounded-full opacity-0 group-hover/item:opacity-100 transition-opacity"
                    >
                      <CloseIcon className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            
            <div className="input-container-minimal">
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                className="hidden" 
                multiple 
                accept="image/*,application/pdf,text/*"
              />
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="p-1 rounded text-[#888] hover:text-[#000] hover:bg-[#f0f0f0] transition-all"
                title="Unggah file"
              >
                <Paperclip className="w-5 h-5" />
              </button>
              
              <textarea 
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Ketik pesan Anda di sini..."
                className="flex-1 bg-transparent border-none focus:ring-0 text-[#1a1a1a] placeholder-[#aaa] py-2 resize-none scrollbar-none max-h-40 min-h-[24px] text-[15px]"
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = 'auto';
                  target.style.height = `${target.scrollHeight}px`;
                }}
                onPaste={handlePaste}
              />
              
              <div className="flex items-center gap-1.5 px-1 border-l border-[#eee] ml-2">
                <button 
                  onClick={toggleListening}
                  className={`p-1.5 rounded transition-all ${isListening ? 'bg-red-500 text-white animate-pulse' : 'text-[#888] hover:text-[#000] hover:bg-[#f0f0f0]'}`}
                  title={isListening ? 'Berhenti mendengarkan' : 'Mulai input suara'}
                >
                  {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>
                
                <button 
                  onClick={handleSend}
                  disabled={(!input.trim() && pendingAttachments.length === 0) || isTyping}
                  className="p-1.5 rounded bg-black disabled:opacity-20 text-white transition-opacity shadow-lg"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Settings Modal */}
      <AnimatePresence>
        {isSettingsOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSettingsOpen(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="px-6 py-4 border-b border-[#eee] flex items-center justify-between bg-[#fcfcfc]">
                <div className="flex items-center gap-4">
                  <button 
                    onClick={() => setActiveTab('knowledge')}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all text-[14px] font-bold ${activeTab === 'knowledge' ? 'bg-black text-white' : 'text-[#888] hover:bg-[#f0f0f0]'}`}
                  >
                    <Database className="w-4 h-4" />
                    Knowledge
                  </button>
                  <button 
                    onClick={() => setActiveTab('model')}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all text-[14px] font-bold ${activeTab === 'model' ? 'bg-black text-white' : 'text-[#888] hover:bg-[#f0f0f0]'}`}
                  >
                    <Settings className="w-4 h-4" />
                    AI Model
                  </button>
                  <button 
                    onClick={() => setActiveTab('integration')}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all text-[14px] font-bold ${activeTab === 'integration' ? 'bg-black text-white' : 'text-[#888] hover:bg-[#f0f0f0]'}`}
                  >
                    <Smartphone className="w-4 h-4" />
                    Integrasi
                  </button>
                </div>
                <button 
                  onClick={() => setIsSettingsOpen(false)}
                  className="p-2 hover:bg-[#f0f0f0] rounded-full transition-colors"
                >
                  <CloseIcon className="w-5 h-5 text-[#888]" />
                </button>
              </div>

              <div className="p-6 overflow-y-auto min-h-[400px]">
                {activeTab === 'knowledge' ? (
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <label className="text-[13px] font-bold text-[#888] uppercase tracking-wider">
                        Pengetahuan Teks
                      </label>
                      <p className="text-[13px] text-[#666]">
                        Berikan informasi tambahan atau konteks yang ingin selalu diingat oleh AI.
                      </p>
                      <textarea 
                        value={knowledgeBase.text}
                        onChange={(e) => setKnowledgeBase(prev => ({ ...prev, text: e.target.value }))}
                        placeholder="Contoh: Perusahaan kami bernama TechNova, fokus pada pengembangan AI untuk UMKM..."
                        className="w-full h-40 p-4 bg-[#fcfcfc] border border-[#e5e5e5] rounded-xl focus:ring-2 focus:ring-black focus:border-transparent text-[14px] resize-none outline-none"
                      />
                    </div>

                    <div className="space-y-3">
                      <label className="text-[13px] font-bold text-[#888] uppercase tracking-wider">
                        Referensi Visual ({knowledgeBase.images?.length || 0})
                      </label>
                      <p className="text-[13px] text-[#666]">
                        Unggah gambar (logo, diagram, atau panduan gaya) yang akan digunakan AI sebagai rujukan visual utama.
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        {knowledgeBase.images?.map((img) => (
                          <div key={img.id} className="relative group aspect-square">
                            <img 
                              src={img.base64 || img.url} 
                              alt="preview" 
                              className="w-full h-full object-cover rounded-xl border border-[#eee]"
                              referrerPolicy="no-referrer"
                            />
                            <button 
                              onClick={() => setKnowledgeBase(prev => ({ 
                                ...prev, 
                                images: prev.images?.filter(i => i.id !== img.id) 
                              }))}
                              className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                            >
                              <CloseIcon className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                        <div 
                          onClick={() => knowledgeImageRef.current?.click()}
                          className="aspect-square border-2 border-dashed border-[#e5e5e5] rounded-xl flex flex-col items-center justify-center cursor-pointer hover:bg-[#fcfcfc] transition-all group relative"
                        >
                          <Upload className="w-6 h-6 text-[#888] group-hover:text-black transition-colors" />
                          <span className="text-[11px] text-[#888] mt-2">Masal</span>
                          <input 
                            type="file" 
                            ref={knowledgeImageRef}
                            accept="image/*"
                            multiple
                            className="hidden"
                            onChange={async (e) => {
                              const files = e.target.files;
                              if (!files) return;

                              const newImages: Attachment[] = [];
                              for (let i = 0; i < files.length; i++) {
                                const file = files[i];
                                const reader = new FileReader();
                                const promise = new Promise<void>((resolve) => {
                                  reader.onload = () => {
                                    newImages.push({
                                      id: crypto.randomUUID(),
                                      name: file.name,
                                      type: file.type,
                                      size: file.size,
                                      url: URL.createObjectURL(file),
                                      base64: reader.result as string
                                    });
                                    resolve();
                                  };
                                });
                                reader.readAsDataURL(file);
                                await promise;
                              }
                              setKnowledgeBase(prev => ({
                                ...prev,
                                images: [...(prev.images || []), ...newImages]
                              }));
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="flex bg-[#f3f3f3] p-1 rounded-xl gap-1">
                       <button 
                         onClick={() => setIntegrationMode('official')}
                         className={`flex-1 py-2 text-[13px] font-bold rounded-lg transition-all ${integrationMode === 'official' ? 'bg-white shadow-sm text-black' : 'text-[#888]'}`}
                       >
                         Official API (Meta)
                       </button>
                       <button 
                         onClick={() => setIntegrationMode('barcode')}
                         className={`flex-1 py-2 text-[13px] font-bold rounded-lg transition-all ${integrationMode === 'barcode' ? 'bg-white shadow-sm text-black' : 'text-[#888]'}`}
                       >
                         Barcode (Third Party)
                       </button>
                    </div>

                    {integrationMode === 'official' ? (
                      <div className="space-y-6">
                        <div className="p-4 bg-green-50 border border-green-100 rounded-xl flex items-start gap-4">
                           <MessageCircle className="w-6 h-6 text-green-600 mt-1" />
                           <div>
                             <h4 className="font-bold text-green-800">WhatsApp Business Integration</h4>
                             <p className="text-[13px] text-green-700">Hubungkan Nexus AI langsung ke nomor WhatsApp bisnis Anda. AI akan merespons pesan pelanggan secara otomatis berdasarkan Basis Pengetahuan yang Anda buat.</p>
                           </div>
                        </div>

                        <div className="space-y-4">
                           <div className="space-y-2">
                             <label className="text-[13px] font-bold text-[#888] uppercase tracking-wider">Webhook URL (Copy ke Meta Developer Portal)</label>
                             <div className="flex items-center gap-2 p-3 bg-white border border-[#eee] rounded-xl">
                                <code className="text-[12px] flex-1 truncate">{window.location.origin.replace('http://', 'https://')}/api/whatsapp/webhook</code>
                                <button 
                                  onClick={() => {
                                    navigator.clipboard.writeText(`${window.location.origin.replace('http://', 'https://')}/api/whatsapp/webhook`);
                                    alert('Webhook URL disalin!');
                                  }}
                                  className="p-1.5 hover:bg-[#f0f0f0] rounded-lg transition-all"
                                >
                                  <Copy className="w-4 h-4" />
                                </button>
                             </div>
                           </div>

                           <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <label className="text-[13px] font-bold text-[#888] uppercase tracking-wider">Verify Token</label>
                                <input 
                                  type="text"
                                  value={aiSettings.whatsapp?.verifyToken}
                                  onChange={(e) => setAiSettings(prev => ({ 
                                    ...prev, 
                                    whatsapp: { ...prev.whatsapp!, verifyToken: e.target.value } 
                                  }))}
                                  className="w-full p-3 bg-[#fcfcfc] border border-[#e5e5e5] rounded-xl text-[14px] outline-none"
                                />
                              </div>
                              <div className="space-y-2">
                                <label className="text-[13px] font-bold text-[#888] uppercase tracking-wider">Phone Number ID</label>
                                <input 
                                  type="text"
                                  value={aiSettings.whatsapp?.phoneNumberId}
                                  onChange={(e) => setAiSettings(prev => ({ 
                                    ...prev, 
                                    whatsapp: { ...prev.whatsapp!, phoneNumberId: e.target.value } 
                                  }))}
                                  className="w-full p-3 bg-[#fcfcfc] border border-[#e5e5e5] rounded-xl text-[14px] outline-none"
                                />
                              </div>
                           </div>

                           <div className="space-y-2">
                             <label className="text-[13px] font-bold text-[#888] uppercase tracking-wider">System Access Token (Permanent)</label>
                             <input 
                               type="password"
                               value={aiSettings.whatsapp?.accessToken}
                               onChange={(e) => setAiSettings(prev => ({ 
                                 ...prev, 
                                 whatsapp: { ...prev.whatsapp!, accessToken: e.target.value } 
                               }))}
                               className="w-full p-3 bg-[#fcfcfc] border border-[#e5e5e5] rounded-xl text-[14px] outline-none"
                             />
                           </div>

                           <div className="pt-4 flex items-center justify-between p-4 bg-[#fcfcfc] border border-[#eee] rounded-xl">
                              <div className="flex items-center gap-3">
                                <div className={`w-3 h-3 rounded-full ${aiSettings.whatsapp?.isActive ? 'bg-green-500 animate-pulse' : 'bg-red-400'}`} />
                                <span className="font-bold text-[14px]">{aiSettings.whatsapp?.isActive ? 'WhatsApp Bot Aktif' : 'WhatsApp Bot Nonaktif'}</span>
                              </div>
                              <button 
                                onClick={() => setAiSettings(prev => ({ 
                                  ...prev, 
                                  whatsapp: { ...prev.whatsapp!, isActive: !prev.whatsapp?.isActive } 
                                }))}
                                className={`px-4 py-1.5 rounded-full text-[13px] font-bold transition-all ${aiSettings.whatsapp?.isActive ? 'bg-red-100 text-red-600 hover:bg-red-200' : 'bg-black text-white hover:bg-black/80'}`}
                              >
                                {aiSettings.whatsapp?.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                              </button>
                           </div>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl flex items-start gap-4">
                           <Smartphone className="w-6 h-6 text-blue-600 mt-1" />
                           <div>
                             <h4 className="font-bold text-blue-800">Barcode / QR Connection (Via External API)</h4>
                             <p className="text-[13px] text-blue-700">Gunakan API pihak ketiga (seperti Whapi.cloud atau GreenAPI) untuk menghubungkan WhatsApp cukup dengan memindai barcode. Lebih mudah daripada API resmi.</p>
                           </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                           <div className="space-y-4">
                              <div className="space-y-2">
                                <label className="text-[13px] font-bold text-[#888] uppercase tracking-wider">External API URL</label>
                                <input 
                                  type="text"
                                  value={aiSettings.qrIntegration?.apiUrl}
                                  placeholder="e.g., https://gate.whapi.cloud"
                                  onChange={(e) => setAiSettings(prev => ({ 
                                    ...prev, 
                                    qrIntegration: { ...prev.qrIntegration!, apiUrl: e.target.value } 
                                  }))}
                                  className="w-full p-3 bg-[#fcfcfc] border border-[#e5e5e5] rounded-xl text-[14px] outline-none"
                                />
                              </div>
                              <div className="space-y-2">
                                <label className="text-[13px] font-bold text-[#888] uppercase tracking-wider">External API Key / Token</label>
                                <input 
                                  type="password"
                                  value={aiSettings.qrIntegration?.apiKey}
                                  placeholder="API Key dari provider eksternal"
                                  onChange={(e) => setAiSettings(prev => ({ 
                                    ...prev, 
                                    qrIntegration: { ...prev.qrIntegration!, apiKey: e.target.value } 
                                  }))}
                                  className="w-full p-3 bg-[#fcfcfc] border border-[#e5e5e5] rounded-xl text-[14px] outline-none"
                                />
                              </div>
                              <div className="space-y-2">
                                <label className="text-[13px] font-bold text-[#888] uppercase tracking-wider">Webhook URL (Paste ke Provider)</label>
                                <div className="flex items-center gap-2 p-3 bg-[#f9f9f9] border border-[#eee] rounded-xl">
                                   <code className="text-[11px] flex-1 truncate">{window.location.origin.replace('http:', 'https:')}/api/whatsapp/external-webhook</code>
                                   <button 
                                     onClick={() => {
                                       navigator.clipboard.writeText(`${window.location.origin.replace('http:', 'https:')}/api/whatsapp/external-webhook`);
                                       alert('External Webhook URL disalin!');
                                     }}
                                     className="p-1.5 hover:bg-[#e0e0e0] rounded-lg transition-all"
                                   >
                                     <Copy className="w-3.5 h-3.5" />
                                   </button>
                                </div>
                              </div>
                           </div>

                           <div className="flex flex-col items-center justify-center border-2 border-dashed border-[#eee] rounded-2xl p-6 min-h-[250px]">
                              {qrCode ? (
                                <div className="flex flex-col items-center gap-4">
                                   <img src={qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`} alt="QR Code" className="w-48 h-48 shadow-lg rounded-lg" />
                                   <button 
                                     onClick={fetchQrCode}
                                     className="text-[12px] font-bold text-blue-600 hover:underline"
                                   >
                                     Refresh Barcode
                                   </button>
                                </div>
                              ) : (
                                <button 
                                  onClick={fetchQrCode}
                                  disabled={isFetchingQr}
                                  className="flex flex-col items-center gap-3 group"
                                >
                                   {isFetchingQr ? (
                                     <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
                                   ) : (
                                     <Smartphone className="w-12 h-12 text-[#ccc] group-hover:text-blue-500 transition-colors" />
                                   )}
                                   <span className="text-[13px] font-bold text-[#888] group-hover:text-blue-600">Klik untuk Munculkan Barcode</span>
                                </button>
                              )}
                           </div>
                        </div>

                        <div className="pt-4 flex items-center justify-between p-4 bg-[#fcfcfc] border border-[#eee] rounded-xl">
                          <div className="flex items-center gap-3">
                            <div className={`w-3 h-3 rounded-full ${aiSettings.qrIntegration?.isActive ? 'bg-blue-500 animate-pulse' : 'bg-[#ccc]'}`} />
                            <span className="font-bold text-[14px]">{aiSettings.qrIntegration?.isActive ? 'Barcode Bot Aktif' : 'Barcode Bot Nonaktif'}</span>
                          </div>
                          <button 
                            onClick={() => setAiSettings(prev => ({ 
                              ...prev, 
                              qrIntegration: { ...prev.qrIntegration!, isActive: !prev.qrIntegration?.isActive } 
                            }))}
                            className={`px-4 py-1.5 rounded-full text-[13px] font-bold transition-all ${aiSettings.qrIntegration?.isActive ? 'bg-red-100 text-red-600 hover:bg-red-200' : 'bg-black text-white hover:bg-black/80'}`}
                          >
                            {aiSettings.qrIntegration?.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                          </button>
                       </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="p-6 border-t border-[#eee] flex justify-end gap-3 bg-[#fcfcfc]">
                <button 
                  onClick={() => setIsSettingsOpen(false)}
                  className="px-5 py-2.5 text-[14px] font-medium text-[#666] hover:bg-[#f0f0f0] rounded-lg transition-all"
                >
                  Tutup
                </button>
                <button 
                  onClick={() => setIsSettingsOpen(false)}
                  className="px-5 py-2.5 text-[14px] font-bold bg-black text-white rounded-lg flex items-center gap-2 hover:bg-[#333] transition-all"
                >
                  <Save className="w-4 h-4" />
                  Simpan Pengaturan
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
