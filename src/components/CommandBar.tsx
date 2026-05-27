import { OperationProgress } from "../types";
import { Play, Square, Loader2, Info } from "lucide-react";

interface CommandBarProps {
  onF3View: () => void;
  onF4Edit: () => void;
  onF5Copy: () => void;
  onF6Move: () => void;
  onF7NewFolder: () => void;
  onF8Delete: () => void;
  onF10Disconnect: () => void;
  jobProgress: OperationProgress | null;
  onCancelTransfer: () => void;
  selectionSummaryDone?: string;
  activePaneId: 'left' | 'right';
}

export default function CommandBar({
  onF3View,
  onF4Edit,
  onF5Copy,
  onF6Move,
  onF7NewFolder,
  onF8Delete,
  onF10Disconnect,
  jobProgress,
  onCancelTransfer,
  selectionSummaryDone,
}: CommandBarProps) {
  return (
    <div className="bg-[#0F1115] border-t border-[#2C2E33] p-3 shrink-0 space-y-3" id="command-bar-root">
      
      {/* 1. Selection & Transfer Operations Dashboard */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
        {/* Info panel */}
        <div className="flex items-center gap-2 text-xs text-[#C1C2C5] font-sans w-full md:w-auto min-h-[1.5rem]">
          <Info className="w-3.5 h-3.5 text-[#339AF0] shrink-0" />
          <span className="truncate italic text-[#5C5F66]">
            {selectionSummaryDone || "Navigate: Arrows/Click | Tab: Switch Pane | Enter: Open | Backspace: Go Up"}
          </span>
        </div>

        {/* Dynamic Job Progression Widget */}
        {jobProgress && (
          <div className="w-full md:w-[450px] bg-[#1A1B1E] border border-[#2C2E33] rounded p-2 flex flex-col gap-1.5 shrink-0 transition-all shadow-md">
            <div className="flex items-center justify-between text-[11px] font-mono">
              <span className="text-[#C1C2C5] font-semibold truncate max-w-[280px]">
                {jobProgress.title}
              </span>
              <span className="text-[#339AF0] font-bold">{jobProgress.percentage}%</span>
            </div>

            {/* Graphic level gauge */}
            <div className="w-full h-2.5 bg-[#14161A] rounded overflow-hidden border border-[#2C2E33]">
              <div 
                className={`h-full bg-[#339AF0] rounded transition-all duration-350`}
                style={{ width: `${jobProgress.percentage}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[10px] font-mono text-[#5C5F66]">
              <span className="truncate max-w-[300px] text-[#C1C2C5]" title={jobProgress.currentItem}>
                {jobProgress.active ? (
                  <span className="flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin text-[#339AF0]" />
                    {jobProgress.currentItem}
                  </span>
                ) : (
                  jobProgress.currentItem
                )}
              </span>
              {jobProgress.active ? (
                <button
                  onClick={onCancelTransfer}
                  className="px-2 py-0.5 rounded bg-[#FF4D4D]/25 hover:bg-[#FF4D4D]/35 border border-[#FF4D4D]/45 text-[#FF4D4D] font-sans font-bold flex items-center gap-1 shrink-0 cursor-pointer"
                >
                  <Square className="w-2.5 h-2.5 fill-[#FF4D4D]" />
                  Cancel
                </button>
              ) : (
                <span className="text-[10px] text-[#40C057] font-sans tracking-wide">
                  COMPLETED
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 2. Standard Windows/TC Footer F-Key Row Buttons */}
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-1.5 pt-1.5 border-t border-[#2C2E33]">
        <button
          onClick={onF3View}
          className="group px-2.5 py-1.5 bg-[#1A1B1E] hover:bg-[#339AF0] border border-[#2C2E33] text-[#C1C2C5] hover:text-white rounded cursor-pointer transition-all flex items-center gap-1 text-[11px] justify-center font-mono uppercase"
          title="F3 View file text content"
        >
          <span className="font-bold text-[#5C5F66] group-hover:text-white mr-1">F3</span>
          <span className="font-medium">View</span>
        </button>

        <button
          onClick={onF4Edit}
          className="group px-2.5 py-1.5 bg-[#1A1B1E] hover:bg-[#339AF0] border border-[#2C2E33] text-[#C1C2C5] hover:text-white rounded cursor-pointer transition-all flex items-center gap-1 text-[11px] justify-center font-mono uppercase"
          title="F4 Edit file text content"
        >
          <span className="font-bold text-[#5C5F66] group-hover:text-white mr-1">F4</span>
          <span className="font-medium">Edit</span>
        </button>

        <button
          onClick={onF5Copy}
          className="group px-2.5 py-1.5 bg-[#1A1B1E] hover:bg-[#339AF0] border border-[#2C2E33] text-[#C1C2C5] hover:text-white rounded cursor-pointer transition-all flex items-center gap-1 text-[11px] justify-center font-mono uppercase"
          title="F5 Copy items recursively to opposite pane"
        >
          <span className="font-bold text-[#5C5F66] group-hover:text-white mr-1">F5</span>
          <span className="font-medium">Copy</span>
        </button>

        <button
          onClick={onF6Move}
          className="group px-2.5 py-1.5 bg-[#1A1B1E] hover:bg-[#339AF0] border border-[#2C2E33] text-[#C1C2C5] hover:text-white rounded cursor-pointer transition-all flex items-center gap-1 text-[11px] justify-center font-mono uppercase"
          title="F6 Move or rename selected item"
        >
          <span className="font-bold text-[#5C5F66] group-hover:text-white mr-1">F6</span>
          <span className="font-medium">Move</span>
        </button>

        <button
          onClick={onF7NewFolder}
          className="group px-2.5 py-1.5 bg-[#1A1B1E] hover:bg-[#339AF0] border border-[#2C2E33] text-[#C1C2C5] hover:text-white rounded cursor-pointer transition-all flex items-center gap-1 text-[11px] justify-center font-mono uppercase"
          title="F7 Create new folder at target directory"
        >
          <span className="font-bold text-[#5C5F66] group-hover:text-white mr-1">F7</span>
          <span className="font-medium">Mkdir</span>
        </button>

        <button
          onClick={onF8Delete}
          className="group px-2.5 py-1.5 bg-[#1A1B1E] hover:bg-[#FF4D4D] border border-[#2C2E33] text-[#C1C2C5] hover:text-white rounded cursor-pointer transition-all flex items-center gap-1 text-[11px] justify-center font-mono uppercase"
          title="F8 Delete selected item recursively"
        >
          <span className="font-bold text-[#5C5F66] group-hover:text-white mr-1">F8</span>
          <span className="font-medium">Delete</span>
        </button>

        <button
          onClick={onF10Disconnect}
          className="group px-2.5 py-1.5 bg-[#1A1B1E] hover:bg-[#5C5F66] border border-[#2C2E33] text-[#C1C2C5] hover:text-white rounded cursor-pointer transition-all flex items-center gap-1 text-[11px] justify-center col-span-3 sm:col-span-1 font-mono uppercase"
          title="Disconnect active remote connection or reset view"
        >
          <span className="font-bold text-[#5C5F66] group-hover:text-white mr-1">F10</span>
          <span className="font-medium">Exit</span>
        </button>
      </div>
    </div>
  );
}
