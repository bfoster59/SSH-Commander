import React, { useState, useEffect, useRef } from "react";
import { FileEntry } from "../types";
import { 
  Folder, 
  File, 
  ArrowUp, 
  ArrowDown,
  Terminal, 
  Layers, 
  HardDrive, 
  RefreshCw, 
  BookMarked,
  Network,
  Cloud,
  Eye,
  Edit,
  Copy,
  ArrowRightLeft,
  Trash2
} from "lucide-react";

interface FileTableProps {
  id: 'left' | 'right';
  type: 'local' | 'remote' | 'gdrive';
  currentPath: string;
  files: FileEntry[];
  selectedIndex: number;
  selectedIndices: number[];
  focused: boolean;
  onFocus: () => void;
  onSelect: (index: number, selectedIndices: number[]) => void;
  onNavigate: (newPath: string) => void;
  onRefresh: () => void;
  onToggleType: (newType: 'local' | 'remote' | 'gdrive') => void;
  connectionId?: string;
  connectionName?: string;
  localDrives: string[];
  isGDriveSignedIn?: boolean;
  gdriveUserEmail?: string;
  onGDriveSignIn?: () => void;
  onGDriveSignOut?: () => void;
  sortField?: 'name' | 'size' | 'modified' | null;
  sortOrder?: 'asc' | 'desc';
  onSort?: (field: 'name' | 'size' | 'modified') => void;
  onF3View?: () => void;
  onF4Edit?: () => void;
  onF5Copy?: () => void;
  onF6Move?: () => void;
  onF8Delete?: () => void;
  onOpenTerminal?: (path: string) => void;
}

export default function FileTable({
  id,
  type,
  currentPath,
  files,
  selectedIndex,
  selectedIndices = [0],
  focused,
  onFocus,
  onSelect,
  onNavigate,
  onRefresh,
  onToggleType,
  connectionName,
  localDrives,
  isGDriveSignedIn = false,
  gdriveUserEmail = "",
  onGDriveSignIn,
  onGDriveSignOut,
  sortField,
  sortOrder = 'asc',
  onSort,
  onF3View,
  onF4Edit,
  onF5Copy,
  onF6Move,
  onF8Delete,
  onOpenTerminal,
}: FileTableProps) {
  const [isEditingPath, setIsEditingPath] = useState(false);
  const [draftPath, setDraftPath] = useState(currentPath);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    visible: boolean;
    entryIndex: number;
    entry: FileEntry;
  } | null>(null);

  const handleContextMenu = (e: React.MouseEvent, index: number, entry: FileEntry) => {
    e.preventDefault();
    onFocus();

    // Do not show for parent folder ".."
    if (index === 0) return;

    // Auto-select this item if it is not selected
    if (!selectedIndices.includes(index)) {
      onSelect(index, [index]);
    }

    let x = e.clientX;
    let y = e.clientY;
    const menuWidth = 180;
    const menuHeight = 220;

    if (typeof window !== "undefined") {
      if (x + menuWidth > window.innerWidth) {
        x -= menuWidth;
      }
      if (y + menuHeight > window.innerHeight) {
        y -= menuHeight;
      }
    }

    setContextMenu({
      x,
      y,
      visible: true,
      entryIndex: index,
      entry
    });
  };

  const handleMenuAction = (action?: () => void) => {
    setContextMenu(null);
    if (action) {
      setTimeout(() => {
        action();
      }, 0);
    }
  };
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

  const handleRowClick = (index: number, event: React.MouseEvent) => {
    onFocus();

    let newSelectedIndices = [...selectedIndices];

    if (index === 0) {
      newSelectedIndices = [0];
    } else {
      const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const hasCmdOrCtrl = isMac ? event.metaKey : event.ctrlKey;
      const hasShift = event.shiftKey;

      if (hasCmdOrCtrl) {
        if (selectedIndices.includes(index)) {
          newSelectedIndices = selectedIndices.filter(i => i !== index);
        } else {
          newSelectedIndices = [...selectedIndices.filter(i => i !== 0), index];
        }
      } else if (hasShift) {
        const anchor = selectedIndices.length > 0 ? selectedIndex : 1;
        const start = Math.max(1, Math.min(anchor, index));
        const end = Math.max(1, Math.max(anchor, index));
        
        const temp: number[] = [];
        for (let i = start; i <= end; i++) {
          temp.push(i);
        }
        newSelectedIndices = temp;
      } else {
        newSelectedIndices = [index];
      }
    }

    onSelect(index, newSelectedIndices);
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
    onSelect(index, [index]);
    if (entry.name === "..") {
      goUp();
    } else if (entry.isDirectory) {
      if (type === "gdrive") {
        const dFile = entry as any;
        const cleanPath = currentPath.split("?")[0];
        const basePath = cleanPath.endsWith("/") ? cleanPath : cleanPath + "/";
        onNavigate(`${basePath}${entry.name}?id=${dFile.driveId}`);
      } else {
        const separator = currentPath.includes("/") ? "/" : "\\";
        // Prevent dangling duplicate slashes
        const basePath = currentPath.endsWith(separator) ? currentPath : currentPath + separator;
        onNavigate(basePath + entry.name);
      }
    }
  };

  const goUp = () => {
    if (type === "gdrive") {
      onNavigate(currentPath + "/..");
      return;
    }
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
            onChange={(e) => onToggleType(e.target.value as 'local' | 'remote' | 'gdrive')}
            className="text-xs p-1.5 rounded font-sans font-bold border border-[#2C2E33] bg-[#1A1B1E] text-[#C1C2C5] focus:outline-none focus:border-[#339AF0]"
          >
            <option value="local">📁 Local Filesystem</option>
            <option value="remote">🌐 SSH / SFTP server</option>
            <option value="gdrive">🤖 Google Drive</option>
          </select>

          {/* Connected identifier banner */}
          {type === "remote" && (
            <span className="flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded bg-[#339AF0]/10 text-[#339AF0] border border-[#339AF0]/30 font-sans font-medium">
              <Network className="w-3.5 h-3.5" />
              {connectionName || "Connected"}
            </span>
          )}

          {type === "gdrive" && isGDriveSignedIn && (
            <span className="flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded bg-[#34A853]/10 text-[#34A853] border border-[#34A853]/30 font-sans font-medium">
              <Cloud className="w-3.5 h-3.5 text-[#34A853]" />
              {gdriveUserEmail || "Google Drive Active"}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (onGDriveSignOut) onGDriveSignOut();
                }}
                className="ml-1 text-[9px] text-red-400 hover:text-red-300 font-sans font-semibold hover:underline bg-transparent border-0 p-0 cursor-pointer"
                title="Disconnect from Google details"
              >
                (Disconnect)
              </button>
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
        ) : type === "gdrive" ? (
          <button
            onClick={() => onNavigate("gdrive://root")}
            className="px-2 py-0.5 rounded bg-[#1A1B1E] border border-[#2C2E33] hover:bg-[#2C2E33] text-[10px] text-[#C1C2C5] hover:text-white shrink-0 cursor-pointer font-sans font-semibold flex items-center gap-1 transition-colors"
          >
            <Cloud className="w-3 h-3 text-[#34A853]" />
            Go to My Drive
          </button>
        ) : (
          <span className="text-[10px] text-[#5C5F66] italic shrink-0 font-sans">
            Browsing mapped remote directory tree
          </span>
        )}
      </div>

      {/* 4. Active interactive directories Grid table */}
      {type === "gdrive" && !isGDriveSignedIn ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center bg-[#1A1B1E] text-white select-none">
          <div className="max-w-md bg-[#14161A] border border-[#2C2E33] rounded-lg p-6 flex flex-col items-center shadow-lg gap-4">
            <svg viewBox="0 0 24 24" className="w-12 h-12 text-[#34A853]" fill="currentColor">
              <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM19 18H6c-2.21 0-4-1.79-4-4 0-2.05 1.53-3.76 3.56-3.97l1.07-.11.5-.95C8.08 7.14 9.94 6 12 6c2.62 0 4.88 1.86 5.39 4.43l.3 1.5 1.53.11c1.56.1 2.78 1.41 2.78 2.96 0 1.65-1.35 3-3 3z"/>
            </svg>
            <h3 className="text-sm font-bold font-sans">Connect Google Drive</h3>
            <p className="text-xs text-[#5C5F66] font-sans leading-relaxed">
              Unlock direct mapping of your Google Drive folders. View, rename, delete, and transfer files between local, remote SSH servers, and your personal Google Cloud Storage with full visual control.
            </p>
            <button 
              onClick={(e) => {
                e.stopPropagation();
                if (onGDriveSignIn) onGDriveSignIn();
              }} 
              className="flex items-center gap-3 bg-white hover:bg-slate-100 text-slate-800 font-sans font-semibold text-xs py-2 px-4 rounded shadow border border-slate-300 transition-colors cursor-pointer"
            >
              <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-4 h-4">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
              </svg>
              <span>Sign in with Google</span>
            </button>
          </div>
        </div>
      ) : (
        <div 
          ref={tableRef}
          className="flex-1 overflow-y-auto select-none bg-[#1A1B1E]"
        >
          <table className="w-full text-left text-[11px] font-mono border-collapse table-fixed">
            {/* Table Header */}
            <thead className="bg-[#14161A] text-[#5C5F66] uppercase text-[10px] tracking-wide sticky top-0 border-b border-[#2C2E33] z-10 select-none">
              <tr>
                <th 
                  onClick={() => onSort?.('name')}
                  className="py-2.5 px-3 w-1/2 min-w-[200px] font-normal cursor-pointer hover:bg-[#25262B] hover:text-white transition-all select-none group"
                >
                  <span className="flex items-center gap-1.5 justify-start">
                    <span>NAME</span>
                    {sortField === 'name' ? (
                      sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-[#339AF0]" /> : <ArrowDown className="w-3 h-3 text-[#339AF0]" />
                    ) : (
                      <span className="text-[10px] text-[#5C5F66] opacity-0 group-hover:opacity-100 transition-opacity font-sans">⇅</span>
                    )}
                  </span>
                </th>
                <th 
                  onClick={() => onSort?.('size')}
                  className="py-2.5 px-3 w-1/6 min-w-[80px] font-normal cursor-pointer hover:bg-[#25262B] hover:text-[#C1C2C5] transition-all select-none group"
                >
                  <span className="flex items-center gap-1.5 justify-end">
                    <span>SIZE</span>
                    {sortField === 'size' ? (
                      sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-[#339AF0]" /> : <ArrowDown className="w-3 h-3 text-[#339AF0]" />
                    ) : (
                      <span className="text-[10px] text-[#5C5F66] opacity-0 group-hover:opacity-100 transition-opacity font-sans">⇅</span>
                    )}
                  </span>
                </th>
                <th className="py-2.5 px-3 w-1/6 text-center min-w-[80px] font-normal text-[#5C5F66] select-none">
                  PERMS
                </th>
                <th 
                  onClick={() => onSort?.('modified')}
                  className="py-2.5 px-3 w-1/6 min-w-[120px] font-normal cursor-pointer hover:bg-[#25262B] hover:text-[#C1C2C5] transition-all select-none group"
                >
                  <span className="flex items-center gap-1.5 justify-end">
                    <span>MODIFIED</span>
                    {sortField === 'modified' ? (
                      sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-[#339AF0]" /> : <ArrowDown className="w-3 h-3 text-[#339AF0]" />
                    ) : (
                      <span className="text-[10px] text-[#5C5F66] opacity-0 group-hover:opacity-100 transition-opacity font-sans">⇅</span>
                    )}
                  </span>
                </th>
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
                  const isMultiSelected = selectedIndices.includes(index);
  
                  // Construct clean classNames
                  let rowBgClass = "text-[#C1C2C5] hover:bg-[#25262B]";
                  if (isMultiSelected) {
                    rowBgClass = focused 
                      ? "bg-[#339AF0]/25 text-white font-semibold" 
                      : "bg-[#25262B]/80 text-white font-medium";
                  } else if (isSelected) {
                    rowBgClass = "bg-[#2C2E33]/40 text-white";
                  }
  
                  // High-visibility focus cursor
                  const focusClass = (isSelected && focused) 
                    ? "ring-1 ring-[#339AF0]/40 outline-1 outline-[#339AF0]/30" 
                    : "";
  
                  return (
                    <tr
                      key={`${entry.name}-${index}`}
                      ref={el => { rowsRef.current[index] = el; }}
                      onClick={(e) => handleRowClick(index, e)}
                      onDoubleClick={() => handleDoubleClick(entry, index)}
                      onContextMenu={(e) => handleContextMenu(e, index, entry)}
                      className={`cursor-pointer text-xs font-mono transition-colors min-h-[2rem] select-none ${rowBgClass} ${focusClass}`}
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
      )}

      {/* Panel status row statistics */}
      <div className="bg-[#14161A] px-3 py-1.5 border-t border-[#2C2E33] text-[10px] text-[#5C5F66] flex justify-between tracking-wide select-none">
        <span>Files: {files.filter(f => !f.isDirectory).length} | Dirs: {files.filter(f => f.isDirectory).length}</span>
        {(() => {
          const actualSelectedCount = selectedIndices.filter(i => i > 0).length;
          if (actualSelectedCount > 1) {
            return (
              <span className="text-[#339AF0] font-semibold truncate max-w-[200px]">
                Selected: {actualSelectedCount} items
              </span>
            );
          } else if (actualSelectedCount === 1) {
            const selectedIdx = selectedIndices.find(i => i > 0) || 1;
            const selectedName = visualFiles[selectedIdx]?.name || "";
            return (
              <span className="text-[#339AF0] font-semibold truncate max-w-[200px]" title={selectedName}>
                Selected: {selectedName}
              </span>
            );
          } else if (selectedIndex === 0) {
            return (
              <span className="text-[#339AF0] font-semibold truncate max-w-[200px]">
                Selected: [ .. ]
              </span>
            );
          }
          return null;
        })()}
      </div>

      {contextMenu && contextMenu.visible && (
        <>
          {/* Glass layout backdrop for immediate click away safely */}
          <div 
            className="fixed inset-0 z-[99] cursor-default"
            onClick={() => setContextMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              setContextMenu(null);
            }}
          />
          <div
            className="fixed z-[100] bg-[#14161A] border border-[#2C2E33] rounded shadow-[0_10px_30px_rgba(0,0,0,0.6)] py-1.5 min-w-[200px] font-sans text-xs text-[#C1C2C5]"
            style={{
              top: `${contextMenu.y}px`,
              left: `${contextMenu.x}px`,
            }}
          >
            <div className="px-3 py-1 text-[10px] text-[#5C5F66] font-semibold border-b border-[#25262B] mb-1 truncate max-w-[280px]">
              {contextMenu.entry.name.toUpperCase()}
            </div>
            
            <button
              onClick={() => handleMenuAction(onF3View)}
              className="w-full flex items-center justify-between px-3 py-1.5 text-left hover:bg-[#25262B] hover:text-white group transition-colors cursor-pointer border-none bg-transparent outline-none"
            >
              <span className="flex items-center gap-2">
                <Eye className="w-3.5 h-3.5 text-[#5C5F66] group-hover:text-[#339AF0]" />
                <span>View File</span>
              </span>
              <span className="font-mono text-[9px] text-[#5C5F66] bg-[#1A1B1E] px-1 py-0.5 rounded">F3</span>
            </button>

            <button
              onClick={() => handleMenuAction(onF4Edit)}
              className="w-full flex items-center justify-between px-3 py-1.5 text-left hover:bg-[#25262B] hover:text-white group transition-colors cursor-pointer border-none bg-transparent outline-none"
            >
              <span className="flex items-center gap-2">
                <Edit className="w-3.5 h-3.5 text-[#5C5F66] group-hover:text-[#339AF0]" />
                <span>Edit File</span>
              </span>
              <span className="font-mono text-[9px] text-[#5C5F66] bg-[#1A1B1E] px-1 py-0.5 rounded">F4</span>
            </button>

            <button
              onClick={() => handleMenuAction(onF5Copy)}
              className="w-full flex items-center justify-between px-3 py-1.5 text-left hover:bg-[#25262B] hover:text-white group transition-colors cursor-pointer border-none bg-transparent outline-none"
            >
              <span className="flex items-center gap-2">
                <Copy className="w-3.5 h-3.5 text-[#5C5F66] group-hover:text-[#339AF0]" />
                <span>Copy Item</span>
              </span>
              <span className="font-mono text-[9px] text-[#5C5F66] bg-[#1A1B1E] px-1 py-0.5 rounded">F5</span>
            </button>

            <button
              onClick={() => handleMenuAction(onF6Move)}
              className="w-full flex items-center justify-between px-3 py-1.5 text-left hover:bg-[#25262B] hover:text-white group transition-colors cursor-pointer border-none bg-transparent outline-none"
            >
              <span className="flex items-center gap-2">
                <ArrowRightLeft className="w-3.5 h-3.5 text-[#5C5F66] group-hover:text-[#339AF0]" />
                <span>Move / Rename</span>
              </span>
              <span className="font-mono text-[9px] text-[#5C5F66] bg-[#1A1B1E] px-1 py-0.5 rounded">F6</span>
            </button>

            {type !== 'gdrive' && onOpenTerminal && (
              <button
                onClick={() => handleMenuAction(() => {
                  if (contextMenu) {
                    const separator = currentPath.includes("/") ? "/" : "\\";
                    const initialPath = contextMenu.entry.isDirectory
                      ? (currentPath.endsWith(separator) ? currentPath + contextMenu.entry.name : currentPath + separator + contextMenu.entry.name)
                      : currentPath;
                    onOpenTerminal(initialPath);
                  }
                })}
                className="w-full flex items-center justify-between px-3 py-1.5 text-left hover:bg-[#25262B] hover:text-white group transition-colors cursor-pointer border-none bg-transparent outline-none border-t border-[#25262B]/50"
              >
                <span className="flex items-center gap-2">
                  <Terminal className="w-3.5 h-3.5 text-[#5C5F66] group-hover:text-[#339AF0]" />
                  <span>Open Terminal Here</span>
                </span>
                <span className="font-mono text-[9px] text-[#5C5F66] bg-[#1A1B1E] px-1 py-0.5 rounded">Shell</span>
              </button>
            )}

            <div className="h-px bg-[#25262B] my-1" />

            <button
              onClick={() => handleMenuAction(onF8Delete)}
              className="w-full flex items-center justify-between px-3 py-1.5 text-left hover:bg-[#FA5252]/10 hover:text-[#FF8787] text-[#FF8787]/80 group transition-colors cursor-pointer border-none bg-transparent outline-none"
            >
              <span className="flex items-center gap-2">
                <Trash2 className="w-3.5 h-3.5 text-[#FF8787]/60 group-hover:text-[#FF8787]" />
                <span>Delete Item</span>
              </span>
              <span className="font-mono text-[9px] text-[#FF8787]/40 bg-[#FA5252]/5 group-hover:bg-[#FA5252]/15 px-1 py-0.5 rounded">F8</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
