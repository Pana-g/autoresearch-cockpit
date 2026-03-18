import { useState, useRef, useEffect, useCallback } from "react";
import { providers } from "@/lib/api";
import { Send, Bot, User, Loader2, X, MessageCircle, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Props {
  provider: string;
  model: string;
  credentialId?: string;
}

export function ModelChat({ provider, model, credentialId }: Props) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(scrollToBottom, [messages, scrollToBottom]);

  // Reset chat when model changes
  useEffect(() => {
    setMessages([]);
  }, [provider, model]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || streaming || !provider || !model) return;

    const userMsg: Message = { role: "user", content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setStreaming(true);

    // Add placeholder assistant message
    const assistantMsg: Message = { role: "assistant", content: "" };
    setMessages([...newMessages, assistantMsg]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await providers.chatStream({
        provider,
        model,
        credential_id: credentialId,
        messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
      });

      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      let buffer = "";

      while (true) {
        if (controller.signal.aborted) break;
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6);
          if (payload === "[DONE]") continue;

          try {
            const parsed = JSON.parse(payload);
            if (parsed.error) {
              accumulated += `\n\n⚠️ Error: ${parsed.error}`;
            } else if (parsed.text) {
              accumulated += parsed.text;
            }
          } catch {
            // skip malformed JSON
          }
        }

        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: "assistant", content: accumulated };
          return updated;
        });
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: "assistant",
            content: `⚠️ Failed to connect: ${err instanceof Error ? err.message : "Unknown error"}`,
          };
          return updated;
        });
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
    setStreaming(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!provider || !model) return null;

  return (
    <>
      {/* Toggle button */}
      {!open && (
        <motion.button
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 100); }}
          className="w-full flex items-center gap-2.5 h-9 px-3 rounded-lg text-xs font-medium border transition-all duration-150 active:scale-[0.98] bg-violet-500/10 hover:bg-violet-500/20 text-violet-400 border-violet-500/20"
        >
          <MessageCircle className="h-3.5 w-3.5" />
          Test Model
          <Sparkles className="h-3 w-3 ml-auto opacity-60" />
        </motion.button>
      )}

      {/* Chat panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="rounded-xl border border-violet-500/20 bg-black/20 overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-violet-500/[4%]">
                <div className="flex items-center gap-2">
                  <Bot className="h-3.5 w-3.5 text-violet-400" />
                  <span className="text-[11px] font-medium text-violet-300/80">
                    {model}
                  </span>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  className="h-5 w-5 rounded flex items-center justify-center text-muted-foreground hover:text-muted-foreground transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>

              {/* Messages */}
              <div
                ref={scrollRef}
                className="max-h-[300px] overflow-y-auto p-3 space-y-3"
              >
                {messages.length === 0 && (
                  <div className="text-center py-6">
                    <Bot className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
                    <p className="text-[11px] text-muted-foreground">
                      Send a message to test the model
                    </p>
                  </div>
                )}

                {messages.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex gap-2 ${msg.role === "user" ? "justify-end" : ""}`}
                  >
                    {msg.role === "assistant" && (
                      <div className="h-5 w-5 rounded bg-violet-500/15 flex items-center justify-center shrink-0 mt-0.5">
                        <Bot className="h-3 w-3 text-violet-400" />
                      </div>
                    )}
                    <div
                      className={`rounded-lg px-3 py-2 text-xs leading-relaxed max-w-[85%] ${
                        msg.role === "user"
                          ? "bg-primary/15 text-foreground border border-primary/20"
                          : "bg-muted/50 text-muted-foreground border border-border"
                      }`}
                    >
                      <p className="whitespace-pre-wrap break-words">
                        {msg.content}
                        {streaming && i === messages.length - 1 && msg.role === "assistant" && (
                          <span className="inline-block w-1.5 h-3.5 bg-violet-400/60 animate-pulse ml-0.5 -mb-0.5" />
                        )}
                      </p>
                    </div>
                    {msg.role === "user" && (
                      <div className="h-5 w-5 rounded bg-primary/15 flex items-center justify-center shrink-0 mt-0.5">
                        <User className="h-3 w-3 text-primary" />
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Input */}
              <div className="border-t border-border p-2 flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a message..."
                  rows={1}
                  disabled={streaming}
                  className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground px-2 py-1.5 resize-none focus:outline-none font-mono leading-relaxed disabled:opacity-50"
                />
                {streaming ? (
                  <button
                    onClick={handleStop}
                    className="h-7 w-7 rounded-md bg-red-500/20 hover:bg-red-500/30 text-red-400 flex items-center justify-center transition-all active:scale-90"
                  >
                    <Loader2 className="h-3 w-3 animate-spin" />
                  </button>
                ) : (
                  <button
                    onClick={handleSend}
                    disabled={!input.trim()}
                    className="h-7 w-7 rounded-md bg-violet-500/20 hover:bg-violet-500/30 text-violet-400 flex items-center justify-center disabled:opacity-30 disabled:pointer-events-none transition-all active:scale-90"
                  >
                    <Send className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
