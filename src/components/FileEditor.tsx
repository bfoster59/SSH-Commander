import React, { useState, useEffect } from "react";
import { X, Save, FileEdit } from "lucide-react";

interface FileEditorProps {
  isOpen: boolean;
  onClose: () => void;
  fileName: string;
  filePath: string;
  initialContent: string;
  isRemote: boolean;
  onSave: (path: string, content: string, isRemote: boolean) => Promise<boolean>;
}

export default function FileEditor({ isOpen, onClose, fileName, filePath, initialContent, isRemote, onSave }: FileEditorProps) {
  const [content, setContent] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");

  useEffect(() => {
    setContent(initialContent);
    setIsDirty(false);
    setSaveStatus("idle");
  }, [filePath, initialContent]);

  // Command + S / Ctrl + S capture
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        triggerSave();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [content, filePath]);

  const triggerSave = async () => {
    setIsSaving(true);
    setSaveStatus("idle");
    try {
      const success = await onSave(filePath, content, isRemote);
      if (success) {
        setIsDirty(false);
        setSaveStatus("success");
        setTimeout(() => setSaveStatus("idle"), 2500);
      } else {
        setSaveStatus("error");
      }
    } catch (e) {
      console.error("Failed to save changes", e);
      setSaveStatus("error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    setIsDirty(true);
  };

  if (!isOpen) return null;

  const lines = content.split("\n");

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs z-50 flex items-center justify-center p-4" id="editor-root">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-5xl rounded-lg shadow-2xl flex flex-col overflow-hidden max-h-[85vh]">
        
        {/* Header bar */}
        <div className="bg-slate-950 border-b border-slate-800 p-3 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[10px] px-2 py-0.5 rounded bg-amber-950 border border-amber-700 text-amber-200">
              {isRemote ? "F4: REMOTE" : "F4: LOCAL"}
            </span>
            <h3 className="font-mono text-xs font-semibold text-slate-200 truncate flex items-center gap-1.5" title={filePath}>
              <FileEdit className="w-3.5 h-3.5 text-amber-500" />
              {fileName} {isDirty && <span className="text-amber-400 font-sans text-[10px] font-bold">(Modified)</span>}
            </h3>
          </div>
          <button 
            onClick={onClose}
            className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="bg-slate-850 p-2.5 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex gap-2">
            <button
              onClick={triggerSave}
              disabled={isSaving}
              className={`px-3.5 py-1 text-xs font-semibold rounded flex items-center gap-1.5 transition-all outline-none ${
                isDirty 
                  ? "bg-sky-600 hover:bg-sky-555 text-white cursor-pointer" 
                  : "bg-slate-800 text-slate-400 cursor-not-allowed"
              }`}
            >
              <Save className="w-3.5 h-3.5" />
              {isSaving ? "Saving..." : "Save File"}
            </button>
          </div>

          <div className="flex items-center gap-3 text-xs font-mono">
            {saveStatus === "success" && (
              <span className="text-emerald-400 font-semibold bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800/50">
                ✓ Saved Successfully
              </span>
            )}
            {saveStatus === "error" && (
              <span className="text-rose-400 font-semibold bg-rose-950/80 px-2 py-0.5 rounded border border-rose-800/50">
                ✕ Save Failed
              </span>
            )}
            <span className="text-slate-500 bg-slate-950 px-2 py-0.5 border border-slate-800 rounded">
              Ctrl+S / Save button
            </span>
          </div>
        </div>

        {/* Text Area */}
        <div className="flex-1 flex overflow-hidden bg-slate-950 font-mono text-[12px] leading-relaxed p-4">
          <div className="relative flex-1 flex">
            {/* Mock Line numbers */}
            <div className="text-right text-slate-650 select-none pr-4 border-r border-slate-850 mr-4 shrink-0 font-medium">
              {Array.from({ length: Math.max(lines.length, 1) }).map((_, i) => (
                <div key={i}>{i + 1}</div>
              ))}
            </div>

            {/* Standard Text Area */}
            <textarea
              value={content}
              onChange={handleChange}
              spellCheck={false}
              className="flex-1 bg-transparent text-slate-350 focus:outline-none resize-none font-mono block overflow-y-auto min-h-full leading-relaxed border-0 p-0 focus:ring-0 whitespace-pre"
            />
          </div>
        </div>

        {/* Path Label */}
        <div className="bg-slate-950 border-t border-slate-850 p-2 text-[10px] text-slate-500 flex justify-between font-mono shrink-0">
          <span>Path: {filePath}</span>
          <span>Press Esc or Save to apply modifications</span>
        </div>
      </div>
    </div>
  );
}
