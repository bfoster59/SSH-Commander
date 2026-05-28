import { useEffect, useRef, useState } from "react";
import { X, Terminal as TerminalIcon, RotateCcw } from "lucide-react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";

interface TerminalModalProps {
  isOpen: boolean;
  onClose: () => void;
  paneId: "left" | "right";
  type: "local" | "remote";
  connectionId?: string;
  connectionName?: string;
  initialPath: string;
  initialCommand?: string;
}

type ShellChoice = "" | "powershell" | "pwsh" | "cmd" | "bash";

const LOCAL_SHELLS: { value: ShellChoice; label: string }[] = [
  { value: "", label: "Default" },
  { value: "powershell", label: "PowerShell" },
  { value: "pwsh", label: "pwsh (PS 7+)" },
  { value: "cmd", label: "cmd.exe" },
  { value: "bash", label: "bash / WSL" },
];

export default function TerminalModal({
  isOpen,
  onClose,
  paneId,
  type,
  connectionId,
  connectionName,
  initialPath,
  initialCommand,
}: TerminalModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [shell, setShell] = useState<ShellChoice>("");
  const [status, setStatus] = useState<"connecting" | "open" | "closed">("connecting");

  useEffect(() => {
    if (!isOpen || !containerRef.current) return;
    let disposed = false;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'Consolas, "Cascadia Mono", "Courier New", monospace',
      theme: {
        background: "#0A0B0C",
        foreground: "#D4D4D4",
        cursor: "#20C20E",
      },
      scrollback: 5000,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();
    termRef.current = term;

    // Build the websocket URL for this session
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const params = new URLSearchParams({ type, cwd: initialPath });
    if (type === "remote" && connectionId) params.set("connectionId", connectionId);
    if (type === "local" && shell) params.set("shell", shell);
    if (initialCommand) params.set("cmd", initialCommand);

    const ws = new WebSocket(`${proto}://${location.host}/api/pty?${params.toString()}`);
    wsRef.current = ws;
    setStatus("connecting");

    ws.onopen = () => {
      if (disposed) return;
      setStatus("open");
      const { cols, rows } = term;
      ws.send(JSON.stringify({ kind: "resize", cols, rows }));
      term.focus();
    };
    ws.onmessage = (e) => { if (!disposed) term.write(typeof e.data === "string" ? e.data : ""); };
    ws.onclose = () => { if (!disposed) { setStatus("closed"); term.write("\r\n\x1b[90m[session closed]\x1b[0m\r\n"); } };

    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ kind: "input", data }));
    });

    const sendResize = () => {
      try {
        fit.fit();
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ kind: "resize", cols: term.cols, rows: term.rows }));
        }
      } catch { /* container not measurable yet */ }
    };
    const ro = new ResizeObserver(sendResize);
    ro.observe(containerRef.current);

    return () => {
      disposed = true;
      ro.disconnect();
      try { ws.close(); } catch { /* noop */ }
      term.dispose();
      termRef.current = null;
      wsRef.current = null;
    };
    // Reconnect when the modal opens, the target changes, or the shell changes.
  }, [isOpen, type, connectionId, initialPath, initialCommand, shell]);

  if (!isOpen) return null;

  const title = type === "remote" ? connectionName || "SSH Host" : "Local PC";

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[110] p-4">
      <div className="bg-[#0A0B0C] border border-[#2C2E33] w-full max-w-4xl h-[80vh] rounded-lg flex flex-col shadow-[0_20px_60px_rgba(0,0,0,0.8)] overflow-hidden">
        {/* Header */}
        <div className="bg-[#14161A] px-4 py-2.5 border-b border-[#2C2E33] flex items-center justify-between select-none">
          <div className="flex items-center gap-2.5">
            <div className="flex gap-1.5 mr-1">
              <span className="w-3 h-3 rounded-full bg-[#FF5F56]" />
              <span className="w-3 h-3 rounded-full bg-[#FFBD2E]" />
              <span className="w-3 h-3 rounded-full bg-[#27C93F]" />
            </div>
            <TerminalIcon className="w-4 h-4 text-[#339AF0]" />
            <span className="text-xs font-semibold text-gray-200 uppercase tracking-wide">
              {paneId.toUpperCase()} · {title}
            </span>
            <span
              className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${
                status === "open" ? "bg-[#40C057]/15 text-[#40C057]"
                : status === "connecting" ? "bg-[#FAB005]/15 text-[#FAB005]"
                : "bg-[#FF6B6B]/15 text-[#FF6B6B]"
              }`}
            >
              {status}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {type === "local" && (
              <select
                value={shell}
                onChange={(e) => setShell(e.target.value as ShellChoice)}
                title="Choose shell"
                className="text-[11px] py-1 px-1.5 rounded bg-[#1A1B1E] text-[#C1C2C5] border border-[#2C2E33] focus:outline-none focus:border-[#339AF0] cursor-pointer"
              >
                {LOCAL_SHELLS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            )}
            <button
              onClick={() => termRef.current?.clear()}
              title="Clear screen"
              className="flex items-center gap-1.5 px-2 py-1 text-[11px] text-[#339AF0] hover:text-[#52a9f2] bg-[#339AF0]/10 hover:bg-[#339AF0]/20 rounded border border-[#339AF0]/20 transition-all cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Clear</span>
            </button>
            <button onClick={onClose} className="text-[#5C5F66] hover:text-white transition-colors p-1">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* xterm mount point */}
        <div className="flex-1 bg-[#0A0B0C] p-2 overflow-hidden">
          <div ref={containerRef} className="w-full h-full" />
        </div>
      </div>
    </div>
  );
}
