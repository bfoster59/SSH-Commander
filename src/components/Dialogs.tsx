import React, { useCallback, useRef, useState } from "react";

// Promise-based replacements for window.alert / confirm / prompt, styled to
// match the app. `useDialogs()` returns async `confirm`/`prompt`, a fire-and-
// forget `toast`, and the `dialogElements` node the host component must render.

type ConfirmState = { open: boolean; message: string; resolve?: (v: boolean) => void };
type PromptState = {
  open: boolean;
  message: string;
  defaultValue: string;
  resolve?: (v: string | null) => void;
};
type Toast = { id: number; message: string; tone: "error" | "info" };

const overlay =
  "fixed inset-0 bg-[var(--color-base)]/90 backdrop-blur-sm z-[60] flex items-center justify-center p-4";
const panel =
  "bg-[var(--color-surface)] border border-[var(--color-border)] rounded w-full max-w-md overflow-hidden flex flex-col";
const header =
  "bg-[var(--color-panel)] px-4 py-2.5 border-b border-[var(--color-border)] font-mono text-xs font-bold text-[#339AF0]";
const btnBase =
  "px-3 py-1.5 rounded text-xs font-mono font-bold cursor-pointer transition-colors";

export function useDialogs() {
  const [confirmState, setConfirmState] = useState<ConfirmState>({ open: false, message: "" });
  const [promptState, setPromptState] = useState<PromptState>({
    open: false,
    message: "",
    defaultValue: "",
  });
  const [promptValue, setPromptValue] = useState("");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);

  const confirm = useCallback(
    (message: string) =>
      new Promise<boolean>((resolve) => setConfirmState({ open: true, message, resolve })),
    [],
  );

  const prompt = useCallback(
    (message: string, defaultValue = "") =>
      new Promise<string | null>((resolve) => {
        setPromptValue(defaultValue);
        setPromptState({ open: true, message, defaultValue, resolve });
      }),
    [],
  );

  const toast = useCallback((message: string, tone: "error" | "info" = "error") => {
    const id = ++seq.current;
    setToasts((ts) => [...ts, { id, message, tone }]);
    setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), 5000);
  }, []);

  const closeConfirm = (result: boolean) => {
    confirmState.resolve?.(result);
    setConfirmState({ open: false, message: "" });
  };

  const closePrompt = (result: string | null) => {
    promptState.resolve?.(result);
    setPromptState({ open: false, message: "", defaultValue: "" });
  };

  const dialogElements = (
    <>
      {confirmState.open && (
        <div className={overlay} onMouseDown={() => closeConfirm(false)}>
          <div className={panel} onMouseDown={(e) => e.stopPropagation()}>
            <div className={header}>CONFIRM</div>
            <div className="px-4 py-4 text-sm text-[var(--color-content)] whitespace-pre-wrap">
              {confirmState.message}
            </div>
            <div className="px-4 py-3 border-t border-[var(--color-border)] flex justify-end gap-2 bg-[var(--color-panel)]/40">
              <button
                className={`${btnBase} bg-[var(--color-border)] text-[var(--color-content)] hover:bg-[var(--color-hover)]`}
                onClick={() => closeConfirm(false)}
              >
                Cancel
              </button>
              <button
                autoFocus
                className={`${btnBase} bg-[#339AF0] text-black hover:bg-[#339AF0]/90`}
                onClick={() => closeConfirm(true)}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {promptState.open && (
        <div className={overlay} onMouseDown={() => closePrompt(null)}>
          <form
            className={panel}
            onMouseDown={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              closePrompt(promptValue);
            }}
          >
            <div className={header}>INPUT</div>
            <div className="px-4 py-4 flex flex-col gap-3">
              <span className="text-sm text-[var(--color-content)] whitespace-pre-wrap">
                {promptState.message}
              </span>
              <input
                autoFocus
                type="text"
                value={promptValue}
                onChange={(e) => setPromptValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") closePrompt(null);
                }}
                className="text-xs py-2 px-3 rounded bg-[var(--color-base)] border border-[var(--color-border)] text-[var(--color-content)] focus:outline-none focus:border-[#339AF0] font-mono"
              />
            </div>
            <div className="px-4 py-3 border-t border-[var(--color-border)] flex justify-end gap-2 bg-[var(--color-panel)]/40">
              <button
                type="button"
                className={`${btnBase} bg-[var(--color-border)] text-[var(--color-content)] hover:bg-[var(--color-hover)]`}
                onClick={() => closePrompt(null)}
              >
                Cancel
              </button>
              <button type="submit" className={`${btnBase} bg-[#339AF0] text-black hover:bg-[#339AF0]/90`}>
                OK
              </button>
            </div>
          </form>
        </div>
      )}

      {toasts.length > 0 && (
        <div className="fixed bottom-4 right-4 z-[70] flex flex-col gap-2 max-w-sm">
          {toasts.map((t) => (
            <div
              key={t.id}
              onClick={() => setToasts((ts) => ts.filter((x) => x.id !== t.id))}
              className={`px-4 py-2.5 rounded shadow-lg text-xs font-mono cursor-pointer border ${
                t.tone === "error"
                  ? "bg-rose-950/90 border-rose-700 text-rose-100"
                  : "bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-content)]"
              }`}
            >
              {t.message}
            </div>
          ))}
        </div>
      )}
    </>
  );

  return { confirm, prompt, toast, dialogElements };
}
