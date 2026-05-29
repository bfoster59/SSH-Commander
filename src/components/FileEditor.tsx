import React, { useState, useEffect } from "react";
import { X, Save, FileEdit } from "lucide-react";
import Editor from "react-simple-code-editor";
import { highlightCode } from "../lib/highlight";

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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4" id="editor-root">
      <div className="bg-[var(--color-panel)] border border-[var(--color-border)] w-full max-w-5xl rounded-lg shadow-2xl flex flex-col overflow-hidden max-h-[85vh]">

        {/* Header bar */}
        <div className="bg-[var(--color-base)] border-b border-[var(--color-border)] p-3 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[10px] px-2 py-0.5 rounded bg-amber-950 border border-amber-700 text-amber-200">
              {isRemote ? "F4: REMOTE" : "F4: LOCAL"}
            </span>
            <h3 className="font-mono text-xs font-semibold text-[var(--color-content)] truncate flex items-center gap-1.5" title={filePath}>
              <FileEdit className="w-3.5 h-3.5 text-amber-500" />
              {fileName} {isDirty && <span className="text-amber-400 font-sans text-[10px] font-bold">(Modified)</span>}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-[var(--color-hover)] rounded text-[var(--color-muted)] hover:text-[var(--color-content)] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="bg-[var(--color-surface)] p-2.5 border-b border-[var(--color-border)] flex items-center justify-between shrink-0">
          <div className="flex gap-2">
            <button
              onClick={triggerSave}
              disabled={isSaving}
              className={`px-3.5 py-1 text-xs font-semibold rounded flex items-center gap-1.5 transition-all outline-none ${
                isDirty
                  ? "bg-sky-600 hover:bg-sky-555 text-white cursor-pointer"
                  : "bg-[var(--color-hover)] text-[var(--color-muted)] cursor-not-allowed"
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
            <span className="text-[var(--color-muted)] bg-[var(--color-base)] px-2 py-0.5 border border-[var(--color-border)] rounded">
              Ctrl+S / Save button
            </span>
          </div>
        </div>

        {/* Highlighted editor.
            Fixed dark canvas in both themes: react-simple-code-editor renders the
            atom-one-dark highlight.js palette, which is tuned for a dark background. */}
        <div className="flex-1 overflow-auto bg-slate-950 p-4">
          <Editor
            value={content}
            onValueChange={(code) => { setContent(code); setIsDirty(true); }}
            highlight={(code) => highlightCode(code, fileName)}
            padding={0}
            spellCheck={false}
            className="hljs !bg-transparent min-h-full"
            textareaClassName="focus:outline-none"
            style={{
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New", monospace',
              fontSize: 12,
              lineHeight: "1.5rem",
            }}
          />
        </div>

        {/* Path Label */}
        <div className="bg-[var(--color-base)] border-t border-[var(--color-border)] p-2 text-[10px] text-[var(--color-muted)] flex justify-between font-mono shrink-0">
          <span>Path: {filePath}</span>
          <span>Press Esc or Save to apply modifications</span>
        </div>
      </div>
    </div>
  );
}
