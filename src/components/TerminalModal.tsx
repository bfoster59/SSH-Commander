import React, { useState, useEffect, useRef } from "react";
import { X, Terminal, Trash2, RefreshCw, Command, ArrowRight, CornerDownLeft } from "lucide-react";

interface TerminalHistoryItem {
  type: "input" | "stdout" | "stderr" | "info" | "error";
  text: string;
}

interface TerminalModalProps {
  isOpen: boolean;
  onClose: () => void;
  paneId: "left" | "right";
  type: "local" | "remote";
  connectionId?: string;
  connectionName?: string;
  initialPath: string;
  onSyncCommanderPath?: (paneId: "left" | "right", path: string) => void;
}

export default function TerminalModal({
  isOpen,
  onClose,
  paneId,
  type,
  connectionId,
  connectionName,
  initialPath,
  onSyncCommanderPath,
}: TerminalModalProps) {
  const [currentPath, setCurrentPath] = useState(initialPath);
  const [history, setHistory] = useState<TerminalHistoryItem[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [executing, setExecuting] = useState(false);

  const historyEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Synchronize path with initial path on open
  useEffect(() => {
    if (isOpen) {
      setCurrentPath(initialPath);
      setHistory([
        {
          type: "info",
          text: `--- ACTIVE SHELL SESSION BOUND TO ${paneId.toUpperCase()} PANEL (${type.toUpperCase()}) ---`
        },
        {
          type: "info",
          text: `Directory: ${initialPath}`
        },
        {
          type: "info",
          text: type === "remote" 
            ? `Connection name: ${connectionName || "SSH Session"} (${connectionId})` 
            : "Connection name: Local Sandbox System"
        },
        {
          type: "info",
          text: "Type any shell commands (e.g. ls, pwd, cat, mkdir, grep, git...)."
        },
        {
          type: "info",
          text: "Use 'cd <dir>' to travel. Type 'clear' to clear this monitor. Press Arrow Up / Down for history."
        }
      ]);
      setInputValue("");
      setHistoryIndex(-1);
      // Auto-focus input
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [isOpen, initialPath, type, paneId, connectionId, connectionName]);

  // Scroll to bottom
  useEffect(() => {
    historyEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history]);

  if (!isOpen) return null;

  const handleClear = () => {
    setHistory([
      { type: "info", text: `Screen cleared. Current directory: ${currentPath}` }
    ]);
  };

  const executeCommand = async (cmd: string) => {
    const trimmed = cmd.trim();
    if (!trimmed) return;

    // Local commands: clear and exit
    if (trimmed.toLowerCase() === "clear") {
      handleClear();
      setInputValue("");
      return;
    }
    if (trimmed.toLowerCase() === "exit") {
      onClose();
      return;
    }

    // Add input command to screen history
    setHistory(prev => [...prev, { type: "input", text: trimmed }]);
    setCommandHistory(prev => {
      const idx = prev.indexOf(trimmed);
      if (idx !== -1) {
        // move to end
        const filtered = prev.filter(c => c !== trimmed);
        return [...filtered, trimmed];
      }
      return [...prev, trimmed];
    });
    setHistoryIndex(-1);
    setInputValue("");
    setExecuting(true);

    try {
      // Check if command is a 'cd' directive
      const isCd = trimmed.startsWith("cd");
      
      let payloadCmd = trimmed;
      if (isCd) {
        // Intercept cd to resolve and update terminal prompt CWD
        // Run: cd "${currentCwd}" && <cd directive> && pwd
        payloadCmd = `${trimmed} && pwd`;
      }

      const res = await fetch("/api/terminal/exec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          connectionId,
          cmd: payloadCmd,
          cwd: currentPath
        })
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || "Execution failed");
      }

      const data = await res.json();
      
      if (data.stdout && data.stdout.trim()) {
        if (isCd && data.code === 0) {
          // CD succeeded, the stdout is the new absolute directory!
          const newPath = data.stdout.trim();
          setCurrentPath(newPath);
          setHistory(prev => [...prev, { type: "info", text: `Changed directory to: ${newPath}` }]);
        } else {
          setHistory(prev => [...prev, { type: "stdout", text: data.stdout.trim() }]);
        }
      }

      if (data.stderr && data.stderr.trim()) {
        const isSgErr = isCd && data.code !== 0;
        setHistory(prev => [
          ...prev, 
          { type: isSgErr ? "error" : "stderr", text: data.stderr.trim() }
        ]);
      }

      // If stdout/stderr both empty and it completed successfully
      if (!data.stdout?.trim() && !data.stderr?.trim()) {
        setHistory(prev => [...prev, { type: "info", text: `Process completed with exit code: ${data.code}` }]);
      }
    } catch (err: any) {
      setHistory(prev => [...prev, { type: "error", text: `Error: ${err.message}` }]);
    } finally {
      setExecuting(false);
      // Re-focus input
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      executeCommand(inputValue);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (commandHistory.length === 0) return;
      const nextIdx = historyIndex === -1 ? commandHistory.length - 1 : historyIndex - 1;
      if (nextIdx >= 0) {
        setHistoryIndex(nextIdx);
        setInputValue(commandHistory[nextIdx]);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (commandHistory.length === 0) return;
      const nextIdx = historyIndex + 1;
      if (nextIdx < commandHistory.length) {
        setHistoryIndex(nextIdx);
        setInputValue(commandHistory[nextIdx]);
      } else {
        setHistoryIndex(-1);
        setInputValue("");
      }
    }
  };

  const handleSyncClick = () => {
    onSyncCommanderPath?.(paneId, currentPath);
    setHistory(prev => [...prev, { 
      type: "info", 
      text: `Sync action: Commander ${paneId.toUpperCase()} panel set to ${currentPath}` 
    }]);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[110] p-4">
      <div className="bg-[#0C0D0E] border border-[#2C2E33] w-full max-w-4xl h-[80vh] rounded-lg flex flex-col shadow-[0_20px_60px_rgba(0,0,0,0.8)] overflow-hidden">
        {/* Modal Header */}
        <div className="bg-[#14161A] px-4 py-3 border-b border-[#2C2E33] flex items-center justify-between select-none">
          <div className="flex items-center gap-2.5">
            <div className="flex gap-1.5 mr-1">
              <span className="w-3 h-3 rounded-full bg-[#FF5F56]" />
              <span className="w-3 h-3 rounded-full bg-[#FFBD2E]" />
              <span className="w-3 h-3 rounded-full bg-[#27C93F]" />
            </div>
            <Terminal className="w-4 h-4 text-[#339AF0]" />
            <span className="text-xs font-semibold text-gray-200 uppercase tracking-wide">
              SSH Console: {type === "remote" ? connectionName || "SSH Host" : "Local PC"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSyncClick}
              title="Synchronize file manager directory with terminal folder location"
              className="flex items-center gap-1.5 px-2 py-1 text-[11px] text-[#339AF0] hover:text-[#52a9f2] bg-[#339AF0]/10 hover:bg-[#339AF0]/20 rounded border border-[#339AF0]/20 transition-all cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Sync Commander</span>
            </button>
            <button
              onClick={handleClear}
              title="Clear screen buffer"
              className="flex items-center gap-1.5 px-2 py-1 text-[11px] text-[#A61A1A] hover:text-[#c92a2a] bg-[#A61A1A]/10 hover:bg-[#A61A1A]/20 rounded border border-[#A61A1A]/20 transition-all cursor-pointer"
            >
              <Trash2 className="w-3 h-3" />
              <span>Clear Monitor</span>
            </button>
            <button
              onClick={onClose}
              className="text-[#5C5F66] hover:text-white transition-colors p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Console Buffer */}
        <div 
          onClick={() => inputRef.current?.focus()}
          className="flex-1 overflow-y-auto p-4 font-mono text-[13px] leading-relaxed text-[#20C20E] bg-[#0A0B0C] space-y-2 cursor-text"
        >
          {history.map((item, idx) => {
            switch (item.type) {
              case "input":
                return (
                  <div key={idx} className="flex gap-2 text-white items-start">
                    <span className="text-amber-500 font-bold shrink-0">{">"}</span>
                    <span className="break-all">{item.text}</span>
                  </div>
                );
              case "stdout":
                return (
                  <pre key={idx} className="whitespace-pre-wrap break-all text-gray-300 font-mono">
                    {item.text}
                  </pre>
                );
              case "stderr":
                return (
                  <pre key={idx} className="whitespace-pre-wrap break-all text-amber-500 font-mono font-semibold">
                    {item.text}
                  </pre>
                );
              case "error":
                return (
                  <div key={idx} className="text-[#FF8787] font-semibold flex items-start gap-1">
                    <span className="font-bold shrink-0">[Error]</span>
                    <span className="break-all">{item.text}</span>
                  </div>
                );
              case "info":
                return (
                  <div key={idx} className="text-[#339AF0] select-none text-xs border-b border-[#2C2E33]/30 pb-1 mt-3 first:mt-0 font-medium font-sans">
                    {item.text}
                  </div>
                );
              default:
                return null;
            }
          })}
          {executing && (
            <div className="flex items-center gap-2 text-[#5C5F66] animate-pulse text-xs">
              <RefreshCw className="w-3 h-3 animate-spin" />
              <span>Executing process background job...</span>
            </div>
          )}
          <div ref={historyEndRef} />
        </div>

        {/* Input prompt area */}
        <div className="bg-[#0A0B0C] border-t border-[#1F2023] px-4 py-3 flex items-center gap-2">
          <div className="text-[#339AF0] max-w-[40%] shrink-0 flex items-center gap-1 cursor-default select-none font-mono text-xs">
            <span className="text-[#20C20E] font-medium truncate shrink" title={currentPath}>
              {currentPath}
            </span>
            <span className="text-white brightness-75">$</span>
          </div>
          <div className="relative flex-1 flex items-center">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={executing}
              className="w-full bg-transparent border-none outline-none text-white font-mono text-xs pr-8 placeholder-[#2C2E33] focus:ring-0"
              placeholder={executing ? "Processing..." : "Enter native shell command..."}
              autoFocus
            />
            {!executing && inputValue && (
              <span className="absolute right-0 text-[10px] text-[#5C5F66] flex items-center gap-1 animate-fadeIn select-none font-sans">
                <span>Enter</span>
                <CornerDownLeft className="w-3 h-3" />
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
