import React, { useState, useEffect, useRef } from "react";
import { FileEntry } from "../types";
import { 
  Folder, 
  File, 
  ArrowUp, 
  Terminal, 
  Layers, 
  HardDrive, 
  RefreshCw, 
  BookMarked,
  Network
} from "lucide-react";

interface FileTableProps {
  id: 'left' | 'right';
  type: 'local' | 'remote';
  currentPath: string;
  files: FileEntry[];
  selectedIndex: number;
  focused: boolean;
  onFocus: () => void;
  onSelect: (index: number) => void;
  onNavigate: (newPath: string) => void;
  onRefresh: () => void;
  onToggleType: (newType: 'local' | 'remote') => void;
  connectionId?: string;
  connectionName?: string;
  localDrives: string[];
}

export default function FileTable({
  id,
  type,
  currentPath,
  files,
  selectedIndex,
  focused,
  onFocus,
  onSelect,
  onNavigate,
  onRefresh,
  onToggleType,
  connectionName,
  localDrives,
}: FileTableProps) {
  const [isEditingPath, setIsEditingPath] = useState(false);
  const [draftPath, setDraftPath] = useState(currentPath);
  const tableRef = useRef<HTMLDivElement>(null);
  const rowsRef = useRef<(HTMLTableRowElement | null)[]>([]);

  useEffect(() => {
    setDraftPath(currentPath);
  }, [currentPath]);

  // Scroll active item into view
  useEffect(() => {
    if (focused && rowsRef.current[selectedIndex]) {
      rowsRef.current[selectedIndex]?.scrollIntoView({
        behavior: "auto",
        block: "nearest",
      });
    }
  }, [selectedIndex, focused]);

  const handleRowClick = (index: number) => {
    onFocus();
    onSelect(index);
  };

  const formatSize = (bytes: number, isDirectory: boolean) => {
    if (isDirectory) return "<DIR>";
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const formatDate = (timestampMs: number) => {
    const d = new Date(timestampMs);
    const pad = (num: number) => String(num).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const handleDoubleClick = (entry: FileEntry, index: number) => {
    onFocus();
    onSelect(index);
    if (entry.name === "..") {
      goUp();
    } else if (entry.isDirectory) {
      const separator = currentPath.includes("/") ? "/" : "\\";
      // Prevent dangling duplicate slashes
      const basePath = currentPath.endsWith(separator) ? currentPath : currentPath + separator;
      onNavigate(basePath + entry.name);
    }
  };

  const goUp = () => {
    const isWindows = !currentPath.startsWith("/");
    if (isWindows) {
      const parts = currentPath.split("\\").filter(Boolean);
      if (parts.length > 1) {
        parts.pop();
        onNavigate(parts.join("\\"));
      } else if (parts.length === 1) {
        // Root list
        onNavigate(parts[0] + "\\");
      }
    } else {
      const parts = currentPath.split("/").filter(Boolean);
      if (parts.length > 1) {
        parts.pop();
        onNavigate("/" + parts.join("/"));
      } else {
        onNavigate("/");
      }
    }
  };

  const handlePathSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsEditingPath(false);
    onNavigate(draftPath);
  };

  // Prepend parent link in visual array list
  const visualFiles: FileEntry[] = [
    { name: "..", size: 0, isDirectory: true, isSymlink: false, lastModified: Date.now() },
    ...files
  ];

  return (
    <div 
      className={`flex-1 flex flex-col border rounded bg-[#1A1B1E] overflow-hidden min-w-0 font-mono transition-all duration-200 ${
        focused 
          ? "border-[#339AF0] shadow-[0_0_15px_rgba(51,154,240,0.15)] ring-1 ring-[#339AF0]/20" 
          : "border-[#2C2E33]"
      }`}
      onClick={onFocus}
      id={`pane-${id}`}
    >
      
      {/* 1. Header ribbon: State toggle and selection */}
      <div className="bg-[#14161A] px-3.5 py-2.5 border-b border-[#2C2E33] flex flex-wrap gap-2 justify-between items-center shrink-0">
        <div className="flex items-center gap-2">
          {/* Component switcher */}
          <select
            value={type}
            onChange={(e) => onToggleType(e.target.value as 'local' | 'remote')}
            className="text-xs p-1.5 rounded font-sans font-bold border border-[#2C2E33] bg-[#1A1B1E] text-[#C1C2C5] focus:outline-none focus:border-[#339AF0]"
          >
            <option value="local">📁 Local Filesystem</option>
            <option value="remote">🌐 SSH / SFTP server</option>
          </select>

          {/* Connected identifier banner */}
          {type === "remote" && (
            <span className="flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded bg-[#339AF0]/10 text-[#339AF0] border border-[#339AF0]/30 font-sans font-medium">
              <Network className="w-3.5 h-3.5" />
              {connectionName || "Connected"}
            </span>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRefresh();
            }}
            className="p-1.5 hover:bg-[#2C2E33] rounded bg-[#1C1F22] text-[#C1C2C5] hover:text-white border border-[#2C2E33] transition-colors cursor-pointer"
            title="Refresh list"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 2. Visual Breadcrumb Highlight */}
      <div className={`p-2 shrink-0 flex items-center gap-1.5 justify-start text-[11px] border-b ${
        focused 
          ? "bg-[#339AF0] border-[#339AF0] text-white" 
          : "bg-[#2C2E33] border-[#2C2E33] text-[#C1C2C5]"
      }`}>
        <span className="font-sans font-bold select-none text-[9px] uppercase px-1.5 py-0.5 rounded bg-[#14161A] border border-[#2C2E33] opacity-80 shrink-0 text-slate-400">
          Path
        </span>

        {isEditingPath ? (
          <form onSubmit={handlePathSubmit} className="flex-1 flex gap-1 items-center">
            <input
              type="text"
              value={draftPath}
              onChange={e => setDraftPath(e.target.value)}
              className="flex-1 bg-[#14161A] text-xs px-2 py-0.5 rounded border border-[#2C2E33] focus:outline-none focus:border-[#339AF0] font-mono text-white"
              autoFocus
              onBlur={() => setTimeout(() => setIsEditingPath(false), 200)}
            />
          </form>
        ) : (
          <div 
            onClick={() => setIsEditingPath(true)}
            className="flex-1 truncate cursor-pointer hover:underline text-[11px] font-mono select-all select-none"
            title="Click to edit raw file path"
          >
            {currentPath}
          </div>
        )}

        <button
          onClick={goUp}
          className="p-1 bg-[#14161A] text-[#C1C2C5] hover:text-white rounded border border-[#2C2E33] shrink-0 select-none hover:bg-[#1A1B1E] transition-colors cursor-pointer"
          title="Go Up (Backspace)"
        >
          <ArrowUp className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 3. Storage drives & Preset shortcuts bookmarks */}
      <div className="bg-[#14161A] px-2 py-1 border-b border-[#2C2E33] flex gap-2 overflow-x-auto shrink-0 select-none scrollbar-none">
        <span className="text-[10px] text-[#5C5F66] flex items-center gap-0.5 uppercase tracking-wide font-sans shrink-0 border-r border-[#2C2E33] pr-2">
          <BookMarked className="w-3 h-3 text-[#339AF0]" />
          Presets
        </span>
        {type === "local" ? (
          <>
            {/* Show dynamic Windows client drive selectors if available, fallback to Workspace presets */}
            {localDrives.length > 0 ? (
              localDrives.map(drive => {
                const isActive = currentPath.startsWith(drive);
                return (
                  <button
                    key={drive}
                    onClick={() => onNavigate(drive)}
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold flex items-center gap-0.5 transition-colors cursor-pointer ${
                      isActive
                        ? "bg-[#339AF0] text-white border border-[#339AF0]"
                        : "bg-[#1A1B1E] border border-[#2C2E33] text-[#C1C2C5] hover:text-white hover:bg-[#2C2E33]"
                    }`}
                  >
                    <HardDrive className="w-2.5 h-2.5" />
                    {drive}
                  </button>
                );
              })
            ) : (
              <>
                <button
                  onClick={() => onNavigate("/")}
                  className="px-2 py-0.5 rounded bg-[#1A1B1E] border border-[#2C2E33] hover:bg-[#2C2E33] text-[10px] text-[#C1C2C5] hover:text-white shrink-0 cursor-pointer"
                >
                  Container Root (/)
                </button>
                <button
                  onClick={() => onNavigate(process.cwd())}
                  className="px-2 py-0.5 rounded bg-[#1A1B1E] border border-[#2C2E33] hover:bg-[#2C2E33] text-[10px] text-[#C1C2C5] hover:text-white shrink-0 cursor-pointer"
                >
                  Workspace
                </button>
              </>
            )}
          </>
        ) : (
          <span className="text-[10px] text-[#5C5F66] italic shrink-0 font-sans">
            Browsing mapped remote directory tree
          </span>
        )}
      </div>

      {/* 4. Active interactive directories Grid table */}
      <div 
        ref={tableRef}
        className="flex-1 overflow-y-auto select-none bg-[#1A1B1E]"
      >
        <table className="w-full text-left text-[11px] font-mono border-collapse table-fixed">
          {/* Table Header */}
          <thead className="bg-[#14161A] text-[#5C5F66] uppercase text-[10px] tracking-wide sticky top-0 border-b border-[#2C2E33] z-10 select-none">
            <tr>
              <th className="py-2.5 px-3 w-1/2 min-w-[200px] font-normal">NAME</th>
              <th className="py-2.5 px-3 w-1/6 text-right min-w-[80px] font-normal">SIZE</th>
              <th className="py-2.5 px-3 w-1/6 text-center min-w-[80px] font-normal">PERMS</th>
              <th className="py-2.5 px-3 w-1/6 text-right min-w-[120px] font-normal">MODIFIED</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-[#25262B]">
            {visualFiles.length === 1 && files.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-12 text-center text-[#5C5F66] italic">
                  Empty Directory
                </td>
              </tr>
            ) : (
              visualFiles.map((entry, index) => {
                const isSelected = selectedIndex === index;
                // Offset index count back by 1 if ignoring root `..`
                return (
                  <tr
                    key={`${entry.name}-${index}`}
                    ref={el => { rowsRef.current[index] = el; }}
                    onClick={() => handleRowClick(index)}
                    onDoubleClick={() => handleDoubleClick(entry, index)}
                    className={`cursor-pointer text-xs font-mono transition-colors min-h-[2rem] select-none ${
                      isSelected && focused
                        ? "bg-[#339AF0]/25 text-white font-semibold outline-1 outline-[#339AF0]/40" 
                        : isSelected
                        ? "bg-[#25262B] text-white" 
                        : "text-[#C1C2C5] hover:bg-[#25262B]"
                    }`}
                  >
                    {/* File/dir name column */}
                    <td className="py-2 px-3 truncate font-mono">
                      <span className="flex items-center gap-2">
                        {entry.name === ".." ? (
                          <span className="text-[#339AF0] font-bold pr-1">[ .. ]</span>
                        ) : entry.isDirectory ? (
                          <Folder className="w-3.5 h-3.5 text-[#339AF0] shrink-0" />
                        ) : (
                          <File className="w-3.5 h-3.5 text-[#5C5F66] shrink-0" />
                        )}
                        <span className="truncate">{entry.name}</span>
                      </span>
                    </td>

                    {/* File Size column */}
                    <td className="py-2 px-3 text-right text-slate-450 pr-4 font-mono">
                      {entry.name === ".." ? "" : formatSize(entry.size, entry.isDirectory)}
                    </td>

                    {/* Unix Permissions column */}
                    <td className="py-2 px-3 text-center text-slate-500 text-[10px] font-mono">
                      {entry.name === ".." ? "" : entry.permissions || "---"}
                    </td>

                    {/* Mod date column */}
                    <td className="py-2 px-3 text-right text-slate-450 pr-4 text-[10px] font-mono">
                      {entry.name === ".." ? "" : formatDate(entry.lastModified)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Panel status row statistics */}
      <div className="bg-[#14161A] px-3 py-1.5 border-t border-[#2C2E33] text-[10px] text-[#5C5F66] flex justify-between tracking-wide select-none">
        <span>Files: {files.filter(f => !f.isDirectory).length} | Dirs: {files.filter(f => f.isDirectory).length}</span>
        {selectedIndex >= 0 && selectedIndex < visualFiles.length && (
          <span className="text-[#339AF0] font-semibold truncate max-w-[200px]">
            Selected: {visualFiles[selectedIndex].name}
          </span>
        )}
      </div>
    </div>
  );
}
