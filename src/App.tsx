/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from "react";
import {
  Send,
  FileText,
  Route,
  Loader2,
  Trash2,
  Layers,
  HelpCircle
} from "lucide-react";
import { UploadedFile, Message, AgentResponse, ExtractedContent, ToolStep } from "./types";
import UploadZone from "./components/UploadZone";
import CustomMarkdown from "./components/CustomMarkdown";
import ExtractedViewer from "./components/ExtractedViewer";
import AgentPlanTrace from "./components/AgentPlanTrace";
import CostEstimator from "./components/CostEstimator";
import ArchitectureDiagram from "./components/ArchitectureDiagram";

export default function App() {
  const [prompt, setPrompt] = useState("");
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeTab, setActiveTab] = useState<"trace" | "extracted" | "architecture">("trace");

  // Streaming real-time progress states
  const [currentTrace, setCurrentTrace] = useState<ToolStep[]>([]);
  const [currentExtracted, setCurrentExtracted] = useState<ExtractedContent[]>([]);
  const [currentStreamedText, setCurrentStreamedText] = useState("");
  const [currentInputTokens, setCurrentInputTokens] = useState(0);
  const [currentOutputTokens, setCurrentOutputTokens] = useState(0);
  const [currentCost, setCurrentCost] = useState(0);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messages.length > 0 || currentStreamedText) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, currentStreamedText]);

  // Quick preset loader helper
  const handleLoadTestCase = (id: number) => {
    if (id === 1) {
      setPrompt("Transcribe this audio file and produce: a 1-line summary, 3 bullet points, and a 5-sentence summary. Also mention the duration.");
      setFiles([]);
    } else if (id === 2) {
      setPrompt("What are the action items in this meeting notes PDF?");
      setFiles([]);
    } else if (id === 3) {
      setPrompt("Explain this code snippet. Detect any bugs and warn me about time and space complexity.");
      setFiles([]);
    } else if (id === 4) {
      setPrompt("Hit the YouTube URL in this PDF and give me a full summary of it: 1-line summary, 3 bullet points, and a 5-sentence summary.");
      setFiles([]);
    } else if (id === 5) {
      setPrompt("Do the audio file and the PDF document discuss the same topic? Compare their content and give a detailed comparative analysis.");
      setFiles([]);
    }
  };

  const handleClear = () => {
    setMessages([]);
    setPrompt("");
    setFiles([]);
    setCurrentTrace([]);
    setCurrentExtracted([]);
    setCurrentStreamedText("");
    setCurrentInputTokens(0);
    setCurrentOutputTokens(0);
    setCurrentCost(0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() && files.length === 0) return;

    const userText = prompt;
    const userFiles = [...files];

    // Reset current streaming states
    setPrompt("");
    setFiles([]);
    setIsGenerating(true);
    setCurrentTrace([]);
    setCurrentExtracted([]);
    setCurrentStreamedText("");
    setCurrentInputTokens(0);
    setCurrentOutputTokens(0);
    setCurrentCost(0);

    // Append User Message to history
    const userMsgId = Date.now().toString();
    const newUserMessage: Message = {
      id: userMsgId,
      role: "user",
      content: userText,
      files: userFiles.map((f) => ({ name: f.name, mimeType: f.mimeType, size: f.size })),
      timestamp: new Date().toLocaleTimeString(),
    };

    setMessages((prev) => [...prev, newUserMessage]);

    // Prepare history payload for follow-ups
    const chatHistory = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    try {
      const response = await fetch("/api/agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: userText,
          files: userFiles,
          chatHistory,
        }),
      });

      if (!response.ok) {
        throw new Error(`Server returned status code: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("Failed to initialize modern HTTP stream reader.");
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine) continue;

          if (trimmedLine.startsWith("data: ")) {
            try {
              const eventData = JSON.parse(trimmedLine.slice(6));

              if (eventData.type === "step") {
                setCurrentTrace((prev) => {
                  const existsIdx = prev.findIndex((s) => s.name === eventData.step.name);
                  if (existsIdx > -1) {
                    const cloned = [...prev];
                    cloned[existsIdx] = eventData.step;
                    return cloned;
                  }
                  return [...prev, eventData.step];
                });
                setActiveTab("trace");
              } else if (eventData.type === "chunk") {
                setCurrentStreamedText((prev) => prev + eventData.text);
              } else if (eventData.type === "done") {
                const finalResponse: AgentResponse = eventData.response;

                // Assemble Assistant message
                const assistantMsg: Message = {
                  id: (Date.now() + 1).toString(),
                  role: "assistant",
                  content: finalResponse.isFollowUpRequired
                    ? finalResponse.followUpQuestion || ""
                    : finalResponse.finalResult || "",
                  responseDetails: finalResponse,
                  timestamp: new Date().toLocaleTimeString(),
                };

                setMessages((prev) => [...prev, assistantMsg]);
                setCurrentStreamedText("");

                if (finalResponse.extractedContents) {
                  setCurrentExtracted(finalResponse.extractedContents);
                }
                setCurrentInputTokens(finalResponse.estimatedInputTokens);
                setCurrentOutputTokens(finalResponse.estimatedOutputTokens);
                setCurrentCost(finalResponse.estimatedCostUsd);
              } else if (eventData.type === "error") {
                throw new Error(eventData.message);
              }
            } catch (pErr) {
              // Ignore partial JSON buffer strings
            }
          }
        }
      }
    } catch (err: any) {
      console.error(err);
      const errMsg: Message = {
        id: Date.now().toString() + "_err",
        role: "assistant",
        content: `⛔ **Agent Pipeline Error:** ${err.message || "An unresolved exception occurred."}`,
        timestamp: new Date().toLocaleTimeString(),
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans select-none antialiased">
      {/* Header */}
      <header id="app-header" className="sticky top-0 z-40 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-base font-bold text-gray-900 tracking-tight">Agentic Multimodal Orchestrator</h1>
            <p className="text-xs text-gray-400">Simultaneous Voice, Documents, Code OCR, and YouTube Transcribing Workspace</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleClear}
            className="flex items-center gap-2 px-3 py-1.5 border border-gray-200 hover:border-gray-300 rounded-lg text-xs font-semibold text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-all cursor-pointer"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear Chat
          </button>
        </div>
      </header>

      {/* Main Split Panel Workspace */}
      <div className="flex-1 max-w-[1700px] w-full mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Side: Client Console & Chat Flow (Col Span 7) */}
        <section id="chat-section" className="lg:col-span-7 flex flex-col bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden h-[calc(100vh-120px)]">
          
          {/* Scrollable Messages Panel */}
          <div className="flex-1 overflow-y-auto p-5 space-y-6 min-h-0">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center text-center max-w-md mx-auto space-y-5 py-6">
                <div>
                  <h3 className="text-base font-bold text-gray-800">Multimodal Orchestrator</h3>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Upload multiple files simultaneously (Images for OCR, searchable or scanned PDFs, Audio file transcriptions) and input text. The agent autonomously plans reasoning routes and fetches YouTube transcriptions dynamically.
                  </p>
                </div>

                {/* Quick Test Cases Panel */}
                <div className="w-full space-y-2">
                  <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest pl-1">
                    Try Guided Pipeline Queries
                  </h4>
                  <div className="grid grid-cols-1 gap-2">
                    {[
                      { id: 1, title: "Audio Transcription + Summary", sub: "Submit audio file → 1-line + 3 bullets + 5-sentence summary" },
                      { id: 2, title: "PDF + Natural Language Query", sub: 'Upload meeting notes PDF → ask "What are the action items?"' },
                      { id: 3, title: "Image with Code", sub: "Upload code screenshot → OCR + explain + bug detection" },
                      { id: 4, title: "Cross-Input YouTube Chain", sub: "PDF with YouTube URL → fetch transcript → full summary" },
                      { id: 5, title: "Multi-File Unified Query", sub: "Audio + PDF → compare topics across both files" },
                    ].map(({ id, title, sub }) => (
                      <button
                        key={id}
                        onClick={() => handleLoadTestCase(id)}
                        className="w-full text-left p-3 border border-gray-200 hover:border-indigo-400 hover:bg-slate-50 rounded-xl transition duration-150 flex items-start gap-2 text-xs"
                      >
                        <span className="p-1 bg-indigo-50 text-indigo-600 rounded-md font-mono mt-0.5 shrink-0">Preset {id}</span>
                        <div>
                          <p className="font-semibold text-gray-700">{title}</p>
                          <p className="text-[10px] text-gray-400">{sub}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex flex-col gap-2 ${msg.role === "user" ? "items-end" : "items-start"}`}
                  >
                    {/* Role badge */}
                    <span className="text-[9px] text-gray-400 uppercase tracking-widest px-1">
                      {msg.role} • {msg.timestamp}
                    </span>

                    {/* Speech Bubble */}
                    <div
                      className={`max-w-[90%] rounded-2xl p-4.5 shadow-sm text-left ${
                        msg.role === "user"
                          ? "bg-indigo-600 text-white rounded-tr-none"
                          : "bg-slate-50 border border-gray-200 text-gray-800 rounded-tl-none"
                      }`}
                    >
                      {/* Attached files summary */}
                      {msg.files && msg.files.length > 0 && (
                        <div className="mb-3.5 flex flex-wrap gap-1.5">
                          {msg.files.map((f, fIdx) => (
                            <span
                              key={fIdx}
                              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-semibold border ${
                                msg.role === "user"
                                  ? "bg-indigo-700 text-indigo-150 border-indigo-500"
                                  : "bg-white text-gray-600 border-gray-100"
                              }`}
                            >
                              <FileText className="h-3.5 w-3.5" />
                              {f.name}
                            </span>
                          ))}
                        </div>
                      )}

                      {msg.role === "user" ? (
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                      ) : (
                        <div className="space-y-4">
                          <CustomMarkdown content={msg.content} />

                          {/* Mandatory Follow-up Prompt indicator */}
                          {msg.responseDetails?.isFollowUpRequired && (
                            <div className="mt-4 p-3 bg-indigo-50 border border-indigo-100 rounded-xl flex items-start gap-2.5">
                              <HelpCircle className="h-5 w-5 text-indigo-600 shrink-0 mt-0.5" />
                              <div className="text-left">
                                <p className="text-xs font-bold text-indigo-900">Mandatory Follow-Up Prompt required</p>
                                <p className="text-xs text-indigo-700 mt-0.5">Please clarify your task in the input bar below.</p>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {/* Dynamically streamed content typing indicator */}
                {isGenerating && currentStreamedText && (
                  <div className="flex flex-col gap-2 items-start">
                    <span className="text-[9px] text-gray-400 uppercase tracking-widest px-1">
                      assistant • streaming
                    </span>
                    <div className="max-w-[90%] rounded-2xl p-4.5 shadow-sm bg-slate-50 border border-gray-200 text-gray-800 rounded-tl-none text-left">
                      <CustomMarkdown content={currentStreamedText} />
                    </div>
                  </div>
                )}
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Persistent typing/generation visual helper status */}
          {isGenerating && (
            <div className="px-5 py-2.5 bg-slate-50 border-t border-b border-gray-100 flex items-center justify-between text-xs text-gray-500">
              <span className="flex items-center gap-2 font-medium">
                <Loader2 className="h-4 w-4 text-indigo-600 animate-spin" />
                Orchestrating multi-agent tool chains...
              </span>
              <span className="text-[10px] text-slate-400 font-mono">
                {currentTrace.slice(-1)[0]?.name || "Extracting Multimodal Media"}
              </span>
            </div>
          )}

          {/* Form Composer Footer */}
          <form onSubmit={handleSubmit} className="p-4 border-t border-gray-200 bg-white space-y-4">
            <UploadZone files={files} onChange={setFiles} />

            <div className="flex gap-2.5 items-center">
              <input
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={
                  isGenerating
                    ? "Thinking..."
                    : messages.slice(-1)[0]?.responseDetails?.isFollowUpRequired
                    ? "Provide clarifying answers here to proceed..."
                    : "Enter query prompt, task, or paste YouTube link..."
                }
                disabled={isGenerating}
                className="flex-1 bg-slate-50 hover:bg-slate-50/70 focus:bg-white border border-gray-200 focus:border-indigo-400 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100 placeholder-gray-400 transition"
              />
              <button
                type="submit"
                disabled={isGenerating || (!prompt.trim() && files.length === 0)}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-100 disabled:text-gray-400 text-white rounded-xl p-3 shadow-md shadow-indigo-100 disabled:shadow-none hover:shadow-lg transition cursor-pointer flex items-center justify-center shrink-0"
              >
                <Send className="h-5 w-5" />
              </button>
            </div>
          </form>
        </section>

        {/* Right Side: Execution Dashboard & Plan Trace (Col Span 5) */}
        <aside id="execution-aside" className="lg:col-span-5 flex flex-col gap-5 h-[calc(100vh-120px)] overflow-hidden">
          
          {/* Navigation Tab Panel */}
          <div className="bg-white border border-gray-200 p-1.5 rounded-xl flex shadow-xs gap-1">
            <button
              onClick={() => setActiveTab("trace")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3.5 text-xs font-bold rounded-lg transition ${
                activeTab === "trace"
                  ? "bg-indigo-600 text-white shadow-xs"
                  : "text-gray-500 hover:text-gray-700 hover:bg-slate-50"
              }`}
            >
              <Route className="h-3.5 w-3.5" />
              Reasoning Trace
            </button>
            <button
              onClick={() => setActiveTab("extracted")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3.5 text-xs font-bold rounded-lg transition ${
                activeTab === "extracted"
                  ? "bg-indigo-600 text-white shadow-xs"
                  : "text-gray-500 hover:text-gray-700 hover:bg-slate-50"
              }`}
            >
              <FileText className="h-3.5 w-3.5" />
              Extracted Media
            </button>
            <button
              onClick={() => setActiveTab("architecture")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3.5 text-xs font-bold rounded-lg transition ${
                activeTab === "architecture"
                  ? "bg-indigo-600 text-white shadow-xs"
                  : "text-gray-500 hover:text-gray-700 hover:bg-slate-50"
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              Architecture
            </button>
          </div>

          {/* Active Tab Panel Body */}
          <div className="flex-1 overflow-y-auto space-y-5 pr-1">
            {activeTab === "trace" && (
              <div className="space-y-4">
                <AgentPlanTrace steps={currentTrace} />
                <CostEstimator
                  inputTokens={currentInputTokens}
                  outputTokens={currentOutputTokens}
                  costUsd={currentCost}
                />
                {currentTrace.length === 0 && (
                  <div className="bg-white border border-gray-100 rounded-xl p-8 text-center text-gray-400 text-xs">
                    No active runs monitored. Trace steps will populate live as tools are executed.
                  </div>
                )}
              </div>
            )}

            {activeTab === "extracted" && (
              <ExtractedViewer contents={currentExtracted} />
            )}

            {activeTab === "architecture" && (
              <ArchitectureDiagram />
            )}
          </div>
        </aside>

      </div>
    </div>
  );
}
