import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Sparkles, 
  X, 
  Send, 
  MessageSquareCode, 
  ArrowDownCircle, 
  HelpCircle, 
  CheckCircle, 
  Layers, 
  RefreshCw,
  Bolt
} from "lucide-react";
import api from "../services/api";

interface ChatMessage {
  id: string;
  role: "user" | "model";
  text: string;
  timestamp: Date;
}

export default function AiAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [isLowLatency, setIsLowLatency] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "model",
      text: "Hello! I am your BRIMS Intelligent AI Assistant. I can help guide you through the application, answer questions about active **Product Masters (Inventory)**, look up recent **batch sheet issuance history**, and explain GMP compliance workflows. How can I help you today?",
      timestamp: new Date(),
    },
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const suggestions = [
    { label: "📋 List active products", prompt: "List active product masters in my branch" },
    { label: "⏱️ Show recent batches", prompt: "Show me the last 10 issued production batches" },
    { label: "💡 How do I request a batch?", prompt: "How do I request a new batch sheet print?" },
    { label: "🔒 What is GMP sign-off?", prompt: "Explain the GMP double verification sign-off process in BRIMS" },
  ];

  // Auto scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
      // Auto focus input
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [messages, isOpen]);

  const handleSend = async (textToSend: string) => {
    if (!textToSend.trim() || isLoading) return;

    const userMsg: ChatMessage = {
      id: Math.random().toString(36).substring(7),
      role: "user",
      text: textToSend,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setMessage("");
    setIsLoading(true);
    setErrorMsg("");

    try {
      // Prepare history in the format backend expects: { role, text }
      const historyPayload = messages.map((m) => ({
        role: m.role,
        text: m.text,
      }));

      const response = await api.post("/assistant/chat", {
        message: textToSend,
        history: historyPayload,
        lowLatency: isLowLatency,
      });

      if (response.data?.success) {
        const assistantMsg: ChatMessage = {
          id: Math.random().toString(36).substring(7),
          role: "model",
          text: response.data.reply,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
      } else {
        throw new Error(response.data?.message || "Failed to receive response from assistant.");
      }
    } catch (err: any) {
      console.error("[FRONTEND_ASSISTANT] Chat failed:", err);
      setErrorMsg(err.response?.data?.message || err.message || "Connection timed out. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSend(message);
    }
  };

  const clearChat = () => {
    setMessages([
      {
        id: "welcome",
        role: "model",
        text: "Hello! I am your BRIMS Intelligent AI Assistant. I can help guide you through the application, answer questions about active **Product Masters (Inventory)**, look up recent **batch sheet issuance history**, and explain GMP compliance workflows. How can I help you today?",
        timestamp: new Date(),
      },
    ]);
    setErrorMsg("");
  };

  // Simple Markdown Parser for beautiful outputs
  const parseInline = (text: string): React.ReactNode[] => {
    const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g);
    return parts.map((part, index) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return (
          <strong key={index} className="font-semibold text-slate-800">
            {part.slice(2, -2)}
          </strong>
        );
      }
      if (part.startsWith("`") && part.endsWith("`")) {
        return (
          <code key={index} className="bg-slate-150 px-1.5 py-0.5 rounded text-xs font-mono text-indigo-600 border border-slate-200">
            {part.slice(1, -1)}
          </code>
        );
      }
      return part;
    });
  };

  const renderFormattedText = (text: string) => {
    const lines = text.split("\n");
    return lines.map((line, idx) => {
      // Headers
      if (line.startsWith("### ")) {
        return (
          <h4 key={idx} className="text-base font-semibold mt-3 mb-1 text-slate-800 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-indigo-500" />
            {parseInline(line.substring(4))}
          </h4>
        );
      }
      if (line.startsWith("## ") || line.startsWith("# ")) {
        const headerText = line.startsWith("## ") ? line.substring(3) : line.substring(2);
        return (
          <h3 key={idx} className="text-sm font-bold uppercase tracking-wider mt-4 mb-2 text-indigo-700 border-b border-indigo-50 pb-1">
            {parseInline(headerText)}
          </h3>
        );
      }

      // Check for bullet list
      const isBullet = line.trim().startsWith("* ") || line.trim().startsWith("- ");
      const isNumbered = /^\s*\d+\.\s/.test(line);

      if (isBullet || isNumbered) {
        const bulletText = isBullet ? line.trim().substring(2) : line.trim().replace(/^\d+\.\s/, "");
        return (
          <div key={idx} className="flex items-start gap-2 ml-3 my-1.5 text-sm text-slate-700 leading-relaxed">
            <span className="text-indigo-500 font-bold select-none shrink-0">{isBullet ? "•" : line.match(/\d+/)?.[0] + "."}</span>
            <span className="flex-1">{parseInline(bulletText)}</span>
          </div>
        );
      }

      // Empty spacing
      if (line.trim() === "") {
        return <div key={idx} className="h-1.5" />;
      }

      // Regular paragraph
      return (
        <p key={idx} className="text-sm text-slate-700 my-1 leading-relaxed">
          {parseInline(line)}
        </p>
      );
    });
  };

  return (
    <>
      {/* Floating Action Button */}
      <div className="fixed bottom-6 right-6 z-50">
        <motion.button
          id="ai-assistant-fab"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setIsOpen(!isOpen)}
          className={`flex items-center justify-center w-14 h-14 rounded-full shadow-lg cursor-pointer border-2 border-indigo-200 ${
            isOpen ? "bg-slate-800 text-white" : "bg-gradient-to-tr from-indigo-600 to-indigo-500 text-white"
          } transition-all duration-200`}
        >
          {isOpen ? (
            <X className="w-6 h-6 animate-spin-once" />
          ) : (
            <div className="relative">
              <MessageSquareCode className="w-6 h-6" />
              <span className="absolute -top-1.5 -right-1.5 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
            </div>
          )}
        </motion.button>
      </div>

      {/* Chat Window Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            id="ai-assistant-window"
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-22 right-6 w-[calc(100vw-3rem)] sm:w-[460px] md:w-[520px] h-[600px] max-h-[82vh] bg-white rounded-2xl shadow-2xl border border-slate-150 flex flex-col z-50 overflow-hidden"
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-indigo-700 via-indigo-600 to-slate-800 text-white px-4 py-3.5 flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 bg-white/10 rounded-lg">
                  <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-sm font-bold leading-tight flex items-center gap-1.5">
                    BRIMS AI Assistant
                  </h3>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-xs text-indigo-100 font-mono">Real-time DB Active</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button 
                  onClick={clearChat}
                  title="Reset conversation"
                  className="p-1.5 hover:bg-white/10 rounded transition-all duration-150 cursor-pointer"
                >
                  <RefreshCw className="w-4 h-4 text-indigo-100 hover:text-white" />
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 hover:bg-white/10 rounded transition-all duration-150 cursor-pointer"
                >
                  <X className="w-4 h-4 text-indigo-100 hover:text-white" />
                </button>
              </div>
            </div>

            {/* Mode Controls */}
            <div className="bg-slate-100 border-b border-slate-150 px-3.5 py-2 flex items-center justify-between text-xs font-medium text-slate-600 shrink-0">
              <div className="flex items-center gap-2">
                {/* Low Latency Mode */}
                <button
                  onClick={() => {
                    setIsLowLatency(!isLowLatency);
                  }}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all cursor-pointer text-xs ${
                    isLowLatency
                      ? "bg-amber-100 text-amber-800 border border-amber-200 font-semibold"
                      : "bg-white hover:bg-slate-50 text-slate-600 border border-slate-200"
                  }`}
                  title="Fast response mode using gemini-2.5-flash"
                >
                  <Bolt className={`w-3.5 h-3.5 ${isLowLatency ? "text-amber-500 fill-amber-500" : ""}`} />
                  Low-latency
                </button>
              </div>
              <span className="text-xs text-slate-400 font-mono select-none">
                {isLowLatency ? "Lite" : "Flash"}
              </span>
            </div>

            {/* Chat Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-slate-50/50">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl p-3.5 text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-indigo-600 text-white rounded-br-none shadow-sm shadow-indigo-100"
                        : "bg-white text-slate-800 border border-slate-100 rounded-bl-none shadow-sm"
                    }`}
                  >
                    {msg.role === "user" ? (
                      <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.text}</p>
                    ) : (
                      <div className="space-y-1">
                        {renderFormattedText(msg.text)}
                      </div>
                    )}
                    <div
                      className={`text-[10px] mt-1.5 text-right block font-mono ${
                        msg.role === "user" ? "text-indigo-200" : "text-slate-400"
                      }`}
                    >
                      {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              ))}

              {/* Typing Loader */}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-white border border-slate-100 rounded-2xl rounded-bl-none p-3.5 shadow-sm max-w-[80%] flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              )}

              {/* Error State */}
              {errorMsg && (
                <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-rose-700 text-xs text-center font-medium">
                  {errorMsg}
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Quick Suggestions Area */}
            {messages.length === 1 && !isLoading && (
              <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100">
                <p className="text-xs text-slate-500 font-medium mb-1.5 flex items-center gap-1">
                  <HelpCircle className="w-3.5 h-3.5 text-indigo-500" /> Suggested Questions:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {suggestions.map((s, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSend(s.prompt)}
                      className="text-xs bg-white border border-slate-200 text-slate-700 px-2.5 py-1 rounded-full hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700 transition-all duration-150 cursor-pointer select-none truncate max-w-full"
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Input Footer */}
            <div className="p-3 bg-white border-t border-slate-100 flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                placeholder="Ask assistant about inventory, active batch..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                disabled={isLoading}
                className="flex-1 bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white focus:outline-none rounded-xl px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-400 transition-all"
              />
              <button
                onClick={() => handleSend(message)}
                disabled={!message.trim() || isLoading}
                className={`p-2.5 rounded-xl flex items-center justify-center cursor-pointer transition-all ${
                  message.trim() && !isLoading
                    ? "bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm"
                    : "bg-slate-100 text-slate-400 cursor-not-allowed"
                }`}
              >
                <Send className="w-4.5 h-4.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
