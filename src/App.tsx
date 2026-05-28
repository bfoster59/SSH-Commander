/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { FileEntry, ConnectionProfile, OperationProgress } from "./types";
import FileTable from "./components/FileTable";
import CommandBar from "./components/CommandBar";
import ConnectionDialog from "./components/ConnectionDialog";
import FileViewer from "./components/FileViewer";
import FileEditor from "./components/FileEditor";
import TerminalModal from "./components/TerminalModal";
import { usePaneSide, PaneTab } from "./hooks/useFilePane";
import {
  Search,
  Loader2,
  AlertTriangle,
  Radio,
  Clock,
  Sun,
  Moon
} from "lucide-react";

export default function App() {
  // Session timer ticker
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Light / dark theme
  const [theme, setTheme] = useState<'dark' | 'light'>(
    () => (localStorage.getItem('ssh-cmd-theme') === 'light' ? 'light' : 'dark')
  );
  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light');
    localStorage.setItem('ssh-cmd-theme', theme);
  }, [theme]);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedSeconds(prev => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatSessionTime = (totalSecs: number) => {
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = totalSecs % 60;
    const pad = (v: number) => String(v).padStart(2, '0');
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  };

  const leftPane = usePaneSide();
  const rightPane = usePaneSide();

  // Flat aliases derived from each side's ACTIVE tab — keeps the rest of the
  // file (which predates tabs) working unchanged.
  const {
    type: leftType, setType: setLeftType,
    path: leftPath,
    connectionId: leftConnectionId, setConnectionId: setLeftConnectionId,
    connectionName: leftConnectionName, setConnectionName: setLeftConnectionName,
    selectedIndex: leftSelectedIndex, setSelectedIndex: setLeftSelectedIndex,
    selectedIndices: leftSelectedIndices, setSelectedIndices: setLeftSelectedIndices,
    sortedFiles: sortedLeftFiles
  } = leftPane;
  const {
    type: rightType, setType: setRightType,
    path: rightPath,
    connectionId: rightConnectionId, setConnectionId: setRightConnectionId,
    connectionName: rightConnectionName, setConnectionName: setRightConnectionName,
    selectedIndex: rightSelectedIndex, setSelectedIndex: setRightSelectedIndex,
    selectedIndices: rightSelectedIndices, setSelectedIndices: setRightSelectedIndices,
    sortedFiles: sortedRightFiles
  } = rightPane;

  // Active Focus Selection Track
  const [activePane, setActivePane] = useState<'left' | 'right'>('left');



  // Connection Dialog Management
  const [isConnectionOpen, setIsConnectionOpen] = useState(false);

  // File viewing controls state
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerFileName, setViewerFileName] = useState("");
  const [viewerFilePath, setViewerFilePath] = useState("");
  const [viewerContent, setViewerContent] = useState("");
  const [viewerIsRemote, setViewerIsRemote] = useState(false);
  const [viewerCategory, setViewerCategory] = useState<'text' | 'image' | 'pdf' | 'video' | 'audio'>('text');
  const [viewerRawUrl, setViewerRawUrl] = useState("");

  // Text File editing state
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorFileName, setEditorFileName] = useState("");
  const [editorFilePath, setEditorFilePath] = useState("");
  const [editorContent, setEditorContent] = useState("");
  const [editorIsRemote, setEditorIsRemote] = useState(false);

  // Progress monitoring transfer controller
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [jobProgress, setJobProgress] = useState<OperationProgress | null>(null);

  // Dynamic storage drive volumes arrays for local panes
  const [localDrives, setLocalDrives] = useState<string[]>([]);

  // Search Tool Management Mode
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");

  // Track file context highlight after navigating back from Search Matches
  const [pendingSelection, setPendingSelection] = useState<{ pane: 'left' | 'right'; name: string } | null>(null);

  // Terminal state parameters
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [terminalInitialPath, setTerminalInitialPath] = useState("");
  const [terminalInitialCommand, setTerminalInitialCommand] = useState("");
  const [terminalPaneId, setTerminalPaneId] = useState<'left' | 'right'>('left');

  // CMD: bar inputs (one per pane)
  const [leftCmdInput, setLeftCmdInput] = useState("");
  const [rightCmdInput, setRightCmdInput] = useState("");

  const handleOpenTerminal = (pane: 'left' | 'right', path: string) => {
    setTerminalPaneId(pane);
    setTerminalInitialPath(path);
    setTerminalInitialCommand("");
    setTerminalOpen(true);
  };

  const handleRunCmd = (pane: 'left' | 'right') => {
    const cmd = (pane === 'left' ? leftCmdInput : rightCmdInput).trim();
    if (!cmd) return;
    const path = pane === 'left' ? leftPath : rightPath;
    setTerminalPaneId(pane);
    setTerminalInitialPath(path);
    setTerminalInitialCommand(cmd);
    setTerminalOpen(true);
    if (pane === 'left') setLeftCmdInput(""); else setRightCmdInput("");
  };

  // Load a side's active tab the first time it becomes active (initial mount
  // and any freshly-opened tab). Already-loaded tabs are left untouched so
  // switching tabs preserves their listing/selection/connection.
  useEffect(() => {
    if (!leftPane.loaded) {
      leftPane.setLoaded(true);
      handleNavigate('left', leftPane.path, { type: leftPane.type, connectionId: leftPane.connectionId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leftPane.activeId]);

  useEffect(() => {
    if (!rightPane.loaded) {
      rightPane.setLoaded(true);
      handleNavigate('right', rightPane.path, { type: rightPane.type, connectionId: rightPane.connectionId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rightPane.activeId]);

  // Enumerate local storage volumes for the drive bar
  useEffect(() => {
    fetch('/api/local/drives')
      .then(res => res.json())
      .then(data => setLocalDrives(data.drives || []))
      .catch(() => setLocalDrives([]));
  }, []);

  // Monitor background transfer progression state ticks
  useEffect(() => {
    if (!currentJobId) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/transfer/status/${currentJobId}`);
        if (!res.ok) {
          clearInterval(interval);
          setCurrentJobId(null);
          return;
        }
        const data = (await res.json()) as OperationProgress;
        setJobProgress(data);

        if (!data.active) {
          clearInterval(interval);
          setCurrentJobId(null);
          // Auto Refresh lists
          triggerRefresh('left');
          triggerRefresh('right');
        }
      } catch (err) {
        clearInterval(interval);
        setCurrentJobId(null);
      }
    }, 800);

    return () => clearInterval(interval);
  }, [currentJobId]);

  // Auto-dismiss a finished transfer widget after a few seconds
  useEffect(() => {
    if (jobProgress && !jobProgress.active) {
      const t = setTimeout(() => setJobProgress(null), 5000);
      return () => clearTimeout(t);
    }
  }, [jobProgress]);

  // Navigate Pane Tree Loader Method
  const handleNavigate = async (
    pane: 'left' | 'right',
    targetPath: string,
    override?: { type?: 'local' | 'remote'; connectionId?: string }
  ) => {
    const paneState = pane === 'left' ? leftPane : rightPane;
    // Allow callers to pass freshly-set type/connectionId so we don't read
    // stale values from the previous render's closure.
    const effectiveType = override?.type ?? paneState.type;
    const effectiveConnId = override?.connectionId ?? paneState.connectionId;
    try {
      if (effectiveType === 'local') {
        const res = await fetch('/api/local/list', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: targetPath })
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed directory navigation');
        }
        const data = await res.json();
        paneState.setPath(data.path);
        paneState.setFiles(data.files);
        paneState.setSelectedIndex(0);
        paneState.setSelectedIndices([0]);
      } else {
        if (!effectiveConnId) throw new Error("Remote connection expired. Please connect index.");
        const res = await fetch('/api/ssh/list', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ connectionId: effectiveConnId, path: targetPath })
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed scanning SSH directory list');
        }
        const data = await res.json();
        paneState.setPath(targetPath);
        paneState.setFiles(data.files);
        paneState.setSelectedIndex(0);
        paneState.setSelectedIndices([0]);
      }
    } catch (err: any) {
      alert(`Directory index load state error: ${err.message}`);
    }
  };

  const triggerRefresh = (pane: 'left' | 'right') => {
    const path = pane === 'left' ? leftPane.path : rightPane.path;
    handleNavigate(pane, path);
  };

  const handleTogglePaneType = (pane: 'left' | 'right', newType: 'local' | 'remote') => {
    const paneState = pane === 'left' ? leftPane : rightPane;
    if (newType === 'local') {
      paneState.setType('local');
      paneState.setConnectionId(undefined);
      paneState.setConnectionName(undefined);
      handleNavigate(pane, '.', { type: 'local' });
    } else {
      setIsConnectionOpen(true);
    }
  };

  const handleConnectSSH = async (profile: ConnectionProfile) => {
    setIsConnectionOpen(false);
    const paneState = activePane === 'left' ? leftPane : rightPane;

    try {
      const res = await fetch('/api/ssh/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Establish SSH link failure");
      }

      const data = await res.json();
      paneState.setType('remote');
      paneState.setConnectionId(data.connectionId);
      paneState.setConnectionName(profile.name);
      paneState.setPath(data.homePath);
      await handleNavigate(activePane, data.homePath, {
        type: 'remote',
        connectionId: data.connectionId
      });
    } catch (err: any) {
      alert(`SSH Connection link error: ${err.message}`);
    }
  };

  // Keyboard navigation & global shortcuts hooks
  const triggerGoUp = (pane: 'left' | 'right') => {
    const currentPath = pane === 'left' ? leftPath : rightPath;
    const isWindows = !currentPath.startsWith("/");
    if (isWindows) {
      const parts = currentPath.split("\\").filter(Boolean);
      if (parts.length > 1) {
        parts.pop();
        handleNavigate(pane, parts.join("\\"));
      } else if (parts.length === 1) {
        handleNavigate(pane, parts[0] + "\\");
      }
    } else {
      const parts = currentPath.split("/").filter(Boolean);
      if (parts.length > 1) {
        parts.pop();
        handleNavigate(pane, "/" + parts.join("/"));
      } else {
        handleNavigate(pane, "/");
      }
    }
  };

  const triggerOpenSelected = (pane: 'left' | 'right') => {
    const files = pane === 'left' ? sortedLeftFiles : sortedRightFiles;
    const index = pane === 'left' ? leftSelectedIndex : rightSelectedIndex;

    if (index === 0) {
      triggerGoUp(pane);
      return;
    }

    const selectedFile = files[index - 1];
    if (!selectedFile) return;

    const basePath = pane === 'left' ? leftPath : rightPath;
    const separator = basePath.includes("/") ? "/" : "\\";
    const fullSourcePath = basePath.endsWith(separator) ? basePath + selectedFile.name : basePath + separator + selectedFile.name;

    if (selectedFile.isDirectory) {
      handleNavigate(pane, fullSourcePath);
    } else {
      // Trigger F3 View directly
      handleF3ViewForFile(
        selectedFile.name,
        fullSourcePath,
        pane === 'left' ? leftType === 'remote' : rightType === 'remote',
        pane === 'left' ? leftConnectionId : rightConnectionId
      );
    }
  };

  const classifyFile = (name: string): 'text' | 'image' | 'pdf' | 'video' | 'audio' => {
    const ext = name.slice(name.lastIndexOf('.')).toLowerCase();
    if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.ico', '.avif'].includes(ext)) return 'image';
    if (ext === '.pdf') return 'pdf';
    if (['.mp4', '.webm', '.mov'].includes(ext)) return 'video';
    if (['.mp3', '.wav', '.ogg'].includes(ext)) return 'audio';
    return 'text';
  };

  const handleF3ViewForFile = async (name: string, filePath: string, isRemote: boolean, connId?: string) => {
    const category = classifyFile(name);

    // Binary/media: stream raw bytes via the GET endpoint, no text fetch.
    if (category !== 'text') {
      const params = new URLSearchParams({
        type: isRemote ? 'remote' : 'local',
        path: filePath
      });
      if (isRemote && connId) params.set('connectionId', connId);
      setViewerCategory(category);
      setViewerRawUrl(`/api/raw?${params.toString()}`);
      setViewerContent("");
      setViewerFileName(name);
      setViewerFilePath(filePath);
      setViewerIsRemote(isRemote);
      setViewerOpen(true);
      return;
    }

    try {
      let content = "";
      if (isRemote) {
        const res = await fetch('/api/ssh/read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ connectionId: connId, path: filePath })
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed reading remote text file');
        }
        const data = await res.json();
        content = data.content;
      } else {
        const res = await fetch('/api/local/read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: filePath })
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed reading local text file');
        }
        const data = await res.json();
        content = data.content;
      }

      setViewerCategory('text');
      setViewerRawUrl("");
      setViewerFileName(name);
      setViewerFilePath(filePath);
      setViewerContent(content);
      setViewerIsRemote(isRemote);
      setViewerOpen(true);
    } catch (err: any) {
      alert(`View trigger error: ${err.message}`);
    }
  };

  const handleCrossPaneDrop = (srcPane: 'left' | 'right', dstPane: 'left' | 'right') => {
    if (srcPane === dstPane) return;
    const selectedEntries = getSelectedEntries(srcPane);
    if (selectedEntries.length === 0) return;

    const srcPath = srcPane === 'left' ? leftPath : rightPath;
    const dstPath = dstPane === 'left' ? leftPath : rightPath;
    const separator = srcPath.includes('/') ? '/' : '\\';
    const fullSourcePaths = selectedEntries.map(f =>
      srcPath.endsWith(separator) ? srcPath + f.name : srcPath + separator + f.name
    );

    const label = selectedEntries.length === 1
      ? `Copy "${selectedEntries[0].name}" into "${dstPath}"?`
      : `Copy ${selectedEntries.length} items into "${dstPath}"?`;
    if (!window.confirm(label)) return;

    triggerTransferJob(srcPane, dstPane, fullSourcePaths);
  };

  const handleCompress = async (pane: 'left' | 'right') => {
    const selectedEntries = getSelectedEntries(pane);
    if (selectedEntries.length === 0) {
      alert("Select one or more items to compress.");
      return;
    }
    const basePath = pane === 'left' ? leftPath : rightPath;
    const isRemote = (pane === 'left' ? leftType : rightType) === 'remote';
    const connId = pane === 'left' ? leftConnectionId : rightConnectionId;

    const suggested = selectedEntries.length === 1 ? `${selectedEntries[0].name}.zip` : "archive.zip";
    const archiveName = window.prompt(
      "Archive name (use .zip or .tar.gz):",
      suggested
    );
    if (!archiveName) return;
    const format: 'zip' | 'targz' = /\.(tar\.gz|tgz)$/i.test(archiveName) ? 'targz' : 'zip';
    const finalName = format === 'zip' && !/\.zip$/i.test(archiveName) ? `${archiveName}.zip` : archiveName;
    const names = selectedEntries.map(e => e.name);

    try {
      const url = isRemote ? '/api/ssh/compress' : '/api/local/compress';
      const body = isRemote
        ? { connectionId: connId, basePath, entries: names, archiveName: finalName, format }
        : { basePath, entries: names, archiveName: finalName, format };
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Compression failed');
      }
      triggerRefresh(pane);
    } catch (err: any) {
      alert(`Compress failed: ${err.message}`);
    }
  };

  const handleExtract = async (pane: 'left' | 'right', entry: FileEntry) => {
    const basePath = pane === 'left' ? leftPath : rightPath;
    const isRemote = (pane === 'left' ? leftType : rightType) === 'remote';
    const connId = pane === 'left' ? leftConnectionId : rightConnectionId;
    const separator = basePath.includes('/') ? '/' : '\\';
    const archivePath = basePath.endsWith(separator) ? basePath + entry.name : basePath + separator + entry.name;

    try {
      const url = isRemote ? '/api/ssh/extract' : '/api/local/extract';
      const body = isRemote ? { connectionId: connId, archivePath } : { archivePath };
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Extraction failed');
      }
      triggerRefresh(pane);
    } catch (err: any) {
      alert(`Extract failed: ${err.message}`);
    }
  };

  const handleOpenFileFromTable = (pane: 'left' | 'right', entry: FileEntry) => {
    const basePath = pane === 'left' ? leftPath : rightPath;
    const separator = basePath.includes("/") ? "/" : "\\";
    const fullPath = basePath.endsWith(separator) ? basePath + entry.name : basePath + separator + entry.name;
    handleF3ViewForFile(
      entry.name,
      fullPath,
      pane === 'left' ? leftType === 'remote' : rightType === 'remote',
      pane === 'left' ? leftConnectionId : rightConnectionId
    );
  };

  // Keyboard operations definitions (F3, F4, F5, F6, F7, F8, F10)
  const triggerF3View = () => {
    const pane = activePane;
    const files = pane === 'left' ? sortedLeftFiles : sortedRightFiles;
    const index = pane === 'left' ? leftSelectedIndex : rightSelectedIndex;

    if (index === 0) return;
    const selectedFile = files[index - 1];
    if (!selectedFile || selectedFile.isDirectory) return;

    const basePath = pane === 'left' ? leftPath : rightPath;
    const separator = basePath.includes("/") ? "/" : "\\";
    const fullSourcePath = basePath.endsWith(separator) ? basePath + selectedFile.name : basePath + separator + selectedFile.name;

    handleF3ViewForFile(
      selectedFile.name,
      fullSourcePath,
      pane === 'left' ? leftType === 'remote' : rightType === 'remote',
      pane === 'left' ? leftConnectionId : rightConnectionId
    );
  };

  const triggerF4Edit = async () => {
    const pane = activePane;
    const files = pane === 'left' ? sortedLeftFiles : sortedRightFiles;
    const index = pane === 'left' ? leftSelectedIndex : rightSelectedIndex;

    if (index === 0) return;
    const selectedFile = files[index - 1];
    if (!selectedFile || selectedFile.isDirectory) return;

    const basePath = pane === 'left' ? leftPath : rightPath;
    const separator = basePath.includes("/") ? "/" : "\\";
    const fullSourcePath = basePath.endsWith(separator) ? basePath + selectedFile.name : basePath + separator + selectedFile.name;

    try {
      const isRemote = pane === 'left' ? leftType === 'remote' : rightType === 'remote';
      const connId = pane === 'left' ? leftConnectionId : rightConnectionId;

      let content = "";
      if (isRemote) {
        const res = await fetch('/api/ssh/read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ connectionId: connId, path: fullSourcePath })
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed downloading file for editing');
        }
        const data = await res.json();
        content = data.content;
      } else {
        const res = await fetch('/api/local/read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: fullSourcePath })
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed reading file for editing');
        }
        const data = await res.json();
        content = data.content;
      }

      setEditorFileName(selectedFile.name);
      setEditorFilePath(fullSourcePath);
      setEditorContent(content);
      setEditorIsRemote(isRemote);
      setEditorOpen(true);
    } catch (err: any) {
      alert(`Editor setup error: ${err.message}`);
    }
  };

  const getSelectedEntries = (pane: 'left' | 'right') => {
    const paneFiles = pane === 'left' ? sortedLeftFiles : sortedRightFiles;
    const activeIndices = pane === 'left' ? leftSelectedIndices : rightSelectedIndices;
    const hoverIndex = pane === 'left' ? leftSelectedIndex : rightSelectedIndex;

    const selectedEntries = activeIndices
      .filter(idx => idx > 0)
      .map(idx => paneFiles[idx - 1])
      .filter(Boolean);

    if (selectedEntries.length > 0) {
      return selectedEntries;
    }

    if (hoverIndex > 0 && paneFiles[hoverIndex - 1]) {
      return [paneFiles[hoverIndex - 1]];
    }

    return [];
  };

  const triggerF5Copy = () => {
    const srcPane = activePane;
    const dstPane = activePane === 'left' ? 'right' : 'left';

    const selectedEntries = getSelectedEntries(srcPane);
    if (selectedEntries.length === 0) {
      alert("Please select files/directories to copy instead of the parent root link");
      return;
    }

    const srcPath = srcPane === 'left' ? leftPath : rightPath;
    const dstPath = dstPane === 'left' ? leftPath : rightPath;
    const separator = srcPath.includes("/") ? "/" : "\\";

    const fullSourcePaths = selectedEntries.map(file => {
      return srcPath.endsWith(separator) ? srcPath + file.name : srcPath + separator + file.name;
    });

    const displayMsg = selectedEntries.length === 1 
      ? `COPY ACTION: Copy "${selectedEntries[0].name}" recursively into directory "${dstPath}"?`
      : `COPY ACTION: Copy ${selectedEntries.length} items recursively into directory "${dstPath}"?`;

    const isConfirmed = window.confirm(displayMsg);
    if (!isConfirmed) return;

    triggerTransferJob(srcPane, dstPane, fullSourcePaths);
  };

  const triggerTransferJob = async (
    srcPane: 'left' | 'right',
    dstPane: 'left' | 'right',
    fullSourcePaths: string[] | string
  ) => {
    const srcType = srcPane === 'left' ? leftType : rightType;
    const dstType = dstPane === 'left' ? leftType : rightType;
    const targetFolder = dstPane === 'left' ? leftPath : rightPath;

    const srcConnId = srcPane === 'left' ? leftConnectionId : rightConnectionId;
    const dstConnId = dstPane === 'left' ? leftConnectionId : rightConnectionId;

    const sourcePayload: any = {
      type: srcType,
      connectionId: srcConnId
    };

    if (Array.isArray(fullSourcePaths)) {
      sourcePayload.paths = fullSourcePaths;
      sourcePayload.path = fullSourcePaths[0] || ""; // fallback
    } else {
      sourcePayload.path = fullSourcePaths;
    }

    try {
      const res = await fetch('/api/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: sourcePayload,
          target: {
            type: dstType,
            path: targetFolder,
            connectionId: dstConnId
          }
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to initialize background pipeline transfer details');
      }

      const data = await res.json();
      setCurrentJobId(data.jobId);
      setJobProgress({
        active: true,
        title: "Initiating files background streams...",
        percentage: 0,
        currentItem: "Resolving metadata nodes...",
        bytesTransferred: 0,
        totalBytes: 0
      });
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleCancelTransfer = async () => {
    if (!currentJobId) return;
    try {
      await fetch(`/api/transfer/cancel/${currentJobId}`, { method: 'POST' });
      setCurrentJobId(null);
      setJobProgress(null);
      triggerRefresh('left');
      triggerRefresh('right');
    } catch (e) {
      console.error(e);
    }
  };

  const triggerF6Move = async () => {
    const pane = activePane;
    const selectedEntries = getSelectedEntries(pane);
    if (selectedEntries.length === 0) {
      alert("Please select files/directories to move/rename");
      return;
    }

    const basePath = pane === 'left' ? leftPath : rightPath;
    const separator = basePath.includes("/") ? "/" : "\\";
    const isRemote = pane === 'left' ? leftType === 'remote' : rightType === 'remote';
    const connId = pane === 'left' ? leftConnectionId : rightConnectionId;

    if (selectedEntries.length === 1) {
      const selectedFile = selectedEntries[0];
      const oldFullPath = basePath.endsWith(separator) ? basePath + selectedFile.name : basePath + separator + selectedFile.name;

      const responseName = window.prompt(`Rename / Move selection: Enter new relative name or absolute path for "${selectedFile.name}"`, selectedFile.name);
      if (!responseName) return;

      let targetPath = "";
      if (responseName.includes("/") || responseName.includes("\\")) {
        targetPath = responseName;
      } else {
        targetPath = basePath.endsWith(separator) ? basePath + responseName : basePath + separator + responseName;
      }

      try {
        if (isRemote) {
          const res = await fetch('/api/ssh/rename', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ connectionId: connId, oldPath: oldFullPath, newPath: targetPath })
          });
          if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Failed remote SFTP renaming transaction');
          }
        } else {
          const res = await fetch('/api/local/rename', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ oldPath: oldFullPath, newPath: targetPath })
          });
          if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Failed local volume rename system call');
          }
        }

        triggerRefresh(pane);
        triggerRefresh(pane === 'left' ? 'right' : 'left');
      } catch (err: any) {
        alert(`F6 Move error: ${err.message}`);
      }
    } else {
      const dstPane = pane === 'left' ? 'right' : 'left';
      const dstPath = dstPane === 'left' ? leftPath : rightPath;
      const dstSeparator = dstPath.includes("/") ? "/" : "\\";

      const isConfirmed = window.confirm(`MOVE ACTION: Move ${selectedEntries.length} items to "${dstPath}"?`);
      if (!isConfirmed) return;

      try {
        for (const file of selectedEntries) {
          const oldFullPath = basePath.endsWith(separator) ? basePath + file.name : basePath + separator + file.name;
          const targetPath = dstPath.endsWith(dstSeparator) ? dstPath + file.name : dstPath + dstSeparator + file.name;

          if (isRemote) {
            const res = await fetch('/api/ssh/rename', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ connectionId: connId, oldPath: oldFullPath, newPath: targetPath })
            });
            if (!res.ok) {
              const err = await res.json();
              throw new Error(err.error || `Failed to move remote item "${file.name}"`);
            }
          } else {
            const res = await fetch('/api/local/rename', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ oldPath: oldFullPath, newPath: targetPath })
            });
            if (!res.ok) {
              const err = await res.json();
              throw new Error(err.error || `Failed to move local item "${file.name}"`);
            }
          }
        }

        triggerRefresh('left');
        triggerRefresh('right');
      } catch (err: any) {
        alert(`Bulk F6 Move error: ${err.message}`);
        triggerRefresh('left');
        triggerRefresh('right');
      }
    }
  };

  const triggerF7NewFolder = async () => {
    const pane = activePane;
    const basePath = pane === 'left' ? leftPath : rightPath;
    const type = pane === 'left' ? leftType : rightType;

    const name = window.prompt("Mkdir: Enter new foldermap name to create inside the current directory:");
    if (!name) return;

    const separator = basePath.includes("/") ? "/" : "\\";
    const resolved = basePath.endsWith(separator) ? basePath + name : basePath + separator + name;

    try {
      const isRemote = pane === 'left' ? leftType === 'remote' : rightType === 'remote';
      const connId = pane === 'left' ? leftConnectionId : rightConnectionId;

      if (isRemote) {
        const res = await fetch('/api/ssh/mkdir', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ connectionId: connId, path: resolved })
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed creating remote directory');
        }
      } else {
        const res = await fetch('/api/local/mkdir', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: resolved })
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed creating local folder');
        }
      }

      triggerRefresh(pane);
    } catch (err: any) {
      alert(`Mkdir operation failure: ${err.message}`);
    }
  };

  const triggerF8Delete = async () => {
    const pane = activePane;
    const selectedEntries = getSelectedEntries(pane);
    if (selectedEntries.length === 0) {
      alert("Please select files/directories to delete");
      return;
    }

    const isConfirmed = selectedEntries.length === 1
      ? window.confirm(`DELETE RECURSIVE: Are you absolutely confident about irrevocably deleting "${selectedEntries[0].name}"?`)
      : window.confirm(`DELETE RECURSIVE: Are you absolutely confident about irrevocably deleting ${selectedEntries.length} selected items?`);
    if (!isConfirmed) return;

    const basePath = pane === 'left' ? leftPath : rightPath;
    const separator = basePath.includes("/") ? "/" : "\\";
    const isRemote = pane === 'left' ? leftType === 'remote' : rightType === 'remote';
    const connId = pane === 'left' ? leftConnectionId : rightConnectionId;

    try {
      for (const file of selectedEntries) {
        const resolvedPath = basePath.endsWith(separator) ? basePath + file.name : basePath + separator + file.name;

        if (isRemote) {
          const res = await fetch('/api/ssh/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ connectionId: connId, path: resolvedPath })
          });
          if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || `Failed to delete remote item "${file.name}"`);
          }
        } else {
          const res = await fetch('/api/local/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: resolvedPath })
          });
          if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || `Failed to delete local item "${file.name}"`);
          }
        }
      }

      triggerRefresh(pane);
    } catch (err: any) {
      alert(`Removal transaction error: ${err.message}`);
      triggerRefresh(pane);
    }
  };

  const triggerF10Exit = async () => {
    const pane = activePane;
    const isRemote = pane === 'left' ? leftType === 'remote' : rightType === 'remote';

    if (!isRemote) {
      alert("Active Pane is already connected locally. Exit is only valid to disconnect remote connections.");
      return;
    }

    const isConfirmed = window.confirm("Are you sure you want to disconnect SSH on the active navigation panel?");
    if (!isConfirmed) return;

    const connId = pane === 'left' ? leftConnectionId : rightConnectionId;
    try {
      await fetch('/api/ssh/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId: connId })
      });

      if (pane === 'left') {
        setLeftType('local');
        setLeftConnectionId(undefined);
        setLeftConnectionName(undefined);
        handleNavigate('left', '.', { type: 'local' });
      } else {
        setRightType('local');
        setRightConnectionId(undefined);
        setRightConnectionName(undefined);
        handleNavigate('right', '.', { type: 'local' });
      }
    } catch (e: any) {
      console.error(e);
    }
  };

  const handleEditorSave = async (filePath: string, content: string, isRemote: boolean) => {
    try {
      const connId = activePane === 'left' ? leftConnectionId : rightConnectionId;
      if (isRemote) {
        const res = await fetch('/api/ssh/write', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ connectionId: connId, path: filePath, content })
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed uploading remote file edits');
        }
      } else {
        const res = await fetch('/api/local/write', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: filePath, content })
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed saving local file edits');
        }
      }
      triggerRefresh('left');
      triggerRefresh('right');
      return true;
    } catch (err: any) {
      alert(`Failed to save edits: ${err.message}`);
      return false;
    }
  };

  // Backend recursive Search handler
  const triggerSearchQuery = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;

    setSearchLoading(true);
    setSearchError("");
    setSearchResults([]);

    const pane = activePane;
    const path = pane === 'left' ? leftPath : rightPath;
    const type = pane === 'left' ? leftType : rightType;
    const connId = pane === 'left' ? leftConnectionId : rightConnectionId;

    try {
      let results: any[] = [];
      if (type === 'local') {
        const res = await fetch('/api/local/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ basePath: path, query: searchQuery })
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Recursive search failed on local subsystem');
        }
        const data = await res.json();
        results = data.results || [];
      } else {
        const res = await fetch('/api/ssh/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ basePath: path, query: searchQuery, connectionId: connId })
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Recursive search failed on remote SSH endpoint');
        }
        const data = await res.json();
        results = data.results || [];
      }

      setSearchResults(results);
      if (results.length === 0) {
        setSearchError("No matching structures identified under active query criteria.");
      }
    } catch (err: any) {
      setSearchError(err.message);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleSearchMatchSelection = async (match: { name: string; path: string; isDirectory: boolean }) => {
    setSearchOpen(false);
    const pane = activePane;
    const targetPath = match.path;

    if (match.isDirectory) {
      await handleNavigate(pane, targetPath);
    } else {
      // Navigate to file parent folder path
      const separator = targetPath.includes("/") ? "/" : "\\";
      const parts = targetPath.split(separator);
      const fileName = parts.pop() || "";
      const parentDir = parts.join(separator) || (targetPath.startsWith("/") ? "/" : "C:\\");

      setPendingSelection({ pane, name: fileName });
      await handleNavigate(pane, parentDir);
    }
  };

  // Selection summaries calculation
  const getSelectionSummary = () => {
    const pane = activePane;
    const files = pane === 'left' ? sortedLeftFiles : sortedRightFiles;
    const index = pane === 'left' ? leftSelectedIndex : rightSelectedIndex;

    if (index === 0) {
      return `Target pane: ${pane.toUpperCase()} | Focused on relative root parent link [ .. ]`;
    }

    const selectedFile = files[index - 1];
    if (!selectedFile) {
      return `Target pane: ${pane.toUpperCase()} | Dir empty | Alt+F7: Search files recursively`;
    }

    const formatBytes = (b: number) => {
      if (b === 0) return "0 B";
      const k = 1024;
      const sizes = ["B", "KB", "MB", "GB"];
      const i = Math.floor(Math.log(b) / Math.log(k));
      return parseFloat((b / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
    };

    return `Focused: ${selectedFile.name} (${selectedFile.isDirectory ? '<DIR>' : formatBytes(selectedFile.size)}) | Mode: ${selectedFile.permissions || '0644'}`;
  };

  // Keyboard monitors registry
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Ignore global keydowns if user typing inside inputs/textareas
      const activeTag = document.activeElement?.tagName;
      if (activeTag === "INPUT" || activeTag === "TEXTAREA" || document.activeElement?.hasAttribute("contenteditable")) {
        return;
      }

      const pane = activePane;
      const files = pane === 'left' ? sortedLeftFiles : sortedRightFiles;
      const maxIndex = files.length; // index up to files.length is valid because visual index offsets by 1
      const currentIndex = pane === 'left' ? leftSelectedIndex : rightSelectedIndex;

      switch (e.key) {
        case "Tab":
          e.preventDefault();
          setActivePane(prev => prev === 'left' ? 'right' : 'left');
          break;

        case "ArrowUp": {
          e.preventDefault();
          if (maxIndex >= 0) {
            const nextIdx = (currentIndex - 1 + (maxIndex + 1)) % (maxIndex + 1);
            if (pane === 'left') {
              setLeftSelectedIndex(nextIdx);
              if (e.shiftKey) {
                const anchor = leftSelectedIndices.length > 0 ? leftSelectedIndex : nextIdx;
                const start = Math.max(1, Math.min(anchor, nextIdx));
                const end = Math.max(1, Math.max(anchor, nextIdx));
                const range: number[] = [];
                for (let i = start; i <= end; i++) range.push(i);
                setLeftSelectedIndices(range);
              } else {
                setLeftSelectedIndices([nextIdx]);
              }
            } else {
              setRightSelectedIndex(nextIdx);
              if (e.shiftKey) {
                const anchor = rightSelectedIndices.length > 0 ? rightSelectedIndex : nextIdx;
                const start = Math.max(1, Math.min(anchor, nextIdx));
                const end = Math.max(1, Math.max(anchor, nextIdx));
                const range: number[] = [];
                for (let i = start; i <= end; i++) range.push(i);
                setRightSelectedIndices(range);
              } else {
                setRightSelectedIndices([nextIdx]);
              }
            }
          }
          break;
        }

        case "ArrowDown": {
          e.preventDefault();
          if (maxIndex >= 0) {
            const nextIdx = (currentIndex + 1) % (maxIndex + 1);
            if (pane === 'left') {
              setLeftSelectedIndex(nextIdx);
              if (e.shiftKey) {
                const anchor = leftSelectedIndices.length > 0 ? leftSelectedIndex : nextIdx;
                const start = Math.max(1, Math.min(anchor, nextIdx));
                const end = Math.max(1, Math.max(anchor, nextIdx));
                const range: number[] = [];
                for (let i = start; i <= end; i++) range.push(i);
                setLeftSelectedIndices(range);
              } else {
                setLeftSelectedIndices([nextIdx]);
              }
            } else {
              setRightSelectedIndex(nextIdx);
              if (e.shiftKey) {
                const anchor = rightSelectedIndices.length > 0 ? rightSelectedIndex : nextIdx;
                const start = Math.max(1, Math.min(anchor, nextIdx));
                const end = Math.max(1, Math.max(anchor, nextIdx));
                const range: number[] = [];
                for (let i = start; i <= end; i++) range.push(i);
                setRightSelectedIndices(range);
              } else {
                setRightSelectedIndices([nextIdx]);
              }
            }
          }
          break;
        }

        case "Backspace":
          e.preventDefault();
          triggerGoUp(pane);
          break;

        case "Enter":
          e.preventDefault();
          triggerOpenSelected(pane);
          break;

        case "F3":
          e.preventDefault();
          triggerF3View();
          break;

        case "F4":
          e.preventDefault();
          triggerF4Edit();
          break;

        case "F5":
          e.preventDefault();
          triggerF5Copy();
          break;

        case "F6":
          e.preventDefault();
          triggerF6Move();
          break;

        case "F7":
          e.preventDefault();
          triggerF7NewFolder();
          break;

        case "F8":
        case "Delete":
          e.preventDefault();
          triggerF8Delete();
          break;

        case "F10":
          e.preventDefault();
          triggerF10Exit();
          break;

        default:
          if (e.altKey && e.key === "F7") {
            e.preventDefault();
            setSearchOpen(prev => !prev);
          }
          break;
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [
    activePane,
    sortedLeftFiles,
    sortedRightFiles,
    leftSelectedIndex,
    rightSelectedIndex,
    leftSelectedIndices,
    rightSelectedIndices,
    leftPath,
    rightPath,
    leftType,
    rightType,
    leftConnectionId,
    rightConnectionId
  ]);

  const activeHostName = () => {
    const pane = activePane;
    const type = pane === 'left' ? leftType : rightType;
    const name = pane === 'left' ? leftConnectionName : rightConnectionName;
    if (type === 'remote') {
      return name || 'remote-server:22';
    }
    return 'ubuntu@dev-server-01:22';
  };

  const tabLabel = (t: PaneTab) => {
    const trimmed = t.path.replace(/[\\/]+$/, '');
    const base = trimmed.split(/[\\/]/).pop() || t.path;
    const prefix = t.type === 'remote' ? (t.connectionName || 'ssh') : 'local';
    return `${prefix}: ${base || '/'}`;
  };

  const handleCloseTab = (side: 'left' | 'right', tab: PaneTab) => {
    const pane = side === 'left' ? leftPane : rightPane;
    if (tab.type === 'remote' && tab.connectionId) {
      fetch('/api/ssh/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId: tab.connectionId })
      }).catch(() => { /* best-effort */ });
    }
    pane.closeTab(tab.id);
  };

  const renderTabStrip = (side: 'left' | 'right') => {
    const pane = side === 'left' ? leftPane : rightPane;
    return (
      <div
        className="flex items-stretch gap-1 px-1.5 pt-1.5 bg-[var(--color-panel)] border-b border-[var(--color-border)] overflow-x-auto shrink-0"
        onClick={() => setActivePane(side)}
      >
        {pane.tabs.map(t => {
          const isActive = t.id === pane.activeId;
          return (
            <div
              key={t.id}
              onClick={() => { setActivePane(side); pane.selectTab(t.id); }}
              title={t.path}
              className={`group flex items-center gap-1.5 px-2 py-1 rounded-t text-[10px] font-mono cursor-pointer max-w-[180px] shrink-0 border border-b-0 transition-colors ${
                isActive
                  ? 'bg-[var(--color-surface)] text-[var(--color-content)] border-[var(--color-border)]'
                  : 'bg-[var(--color-base)] text-[var(--color-muted)] border-transparent hover:text-[var(--color-content)]'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${t.type === 'remote' ? 'bg-[#40C057]' : 'bg-[#5C5F66]'}`} />
              <span className="truncate">{tabLabel(t)}</span>
              <button
                onClick={(e) => { e.stopPropagation(); handleCloseTab(side, t); }}
                className="ml-0.5 text-[var(--color-muted)] hover:text-[#FF6B6B] shrink-0 opacity-60 group-hover:opacity-100 cursor-pointer"
                title="Close tab"
              >
                ×
              </button>
            </div>
          );
        })}
        <button
          onClick={(e) => { e.stopPropagation(); setActivePane(side); pane.addTab(); }}
          className="px-2 py-1 text-[12px] font-bold text-[var(--color-muted)] hover:text-[#339AF0] shrink-0 cursor-pointer"
          title="New tab"
        >
          +
        </button>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-screen w-full bg-[var(--color-base)] text-[var(--color-content)] font-sans overflow-hidden" id="dashboard-root">
      {/* Top Navigation & Host Selector */}
      <nav className="h-12 border-b border-[var(--color-border)] flex items-center justify-between px-4 bg-[var(--color-panel)] shrink-0 font-sans">
        <div className="flex items-center space-x-4">
          <span className="font-mono font-bold text-[#339AF0] tracking-tight">SSH_COMMANDER</span>
          <div className="h-4 w-px bg-[var(--color-border)]"></div>
          <div className="flex space-x-1">
            <button 
              onClick={() => setIsConnectionOpen(true)}
              className="px-2 py-0.5 bg-[var(--color-border)] text-[#339AF0] font-mono text-[10px] rounded hover:bg-[#339AF0] hover:text-white transition-colors cursor-pointer"
              title="Quick Connect SSH"
            >
              [ CONNECT SSH ]
            </button>
            <button 
              onClick={() => setSearchOpen(true)}
              className="px-2 py-0.5 bg-[#339AF0] text-[var(--color-base)] font-mono font-bold text-[10px] rounded hover:bg-[#339AF0]/90 transition-colors cursor-pointer flex items-center gap-1"
              title="Search System (Alt+F7)"
            >
              <Search className="w-2.5 h-2.5" />
              [ RECURSIVE SEARCH ]
            </button>
          </div>
        </div>
        
        <div className="flex items-center space-x-6 text-[11px] font-mono">
          <div className="flex items-center space-x-2">
            <span className="text-[var(--color-muted)]">ACTIVE HOST:</span>
            <span className="text-[#40C057] font-semibold flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-[#40C057] inline-block animate-ping"></span>
              {activeHostName()}
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-[var(--color-muted)]">SESSION:</span>
            <span className="text-[#FAB005] font-semibold flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-[#FAB005]" />
              {formatSessionTime(elapsedSeconds)}
            </span>
          </div>
          <button
            onClick={() => setTheme(t => (t === 'dark' ? 'light' : 'dark'))}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="p-1.5 rounded border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-content)] hover:border-[#339AF0] hover:text-[#339AF0] transition-colors cursor-pointer"
          >
            {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          </button>
        </div>
      </nav>

      {/* Main Dual Pane Splitter */}
      <main className="flex-1 flex flex-col md:flex-row overflow-hidden p-2 gap-2" id="workspace-main">
        {/* Left Side Table Frame */}
        <section
          className={`flex-1 flex flex-col rounded overflow-hidden relative transition-all duration-150 ${activePane === 'left' ? 'ring-1 ring-[#339AF0]/30 shadow-[0_0_12px_rgba(51,154,240,0.1)]' : ''}`}
          onClick={() => setActivePane('left')}
        >
          {renderTabStrip('left')}
          <FileTable
            id="left"
            type={leftType}
            currentPath={leftPath}
            files={sortedLeftFiles}
            selectedIndex={leftSelectedIndex}
            selectedIndices={leftSelectedIndices}
            connectionId={leftConnectionId}
            connectionName={leftConnectionName}
            localDrives={localDrives}
            sortField={leftPane.sortField}
            sortOrder={leftPane.sortOrder}
            onSort={leftPane.handleSort}
            onSelect={(idx, indices) => { setLeftSelectedIndex(idx); setLeftSelectedIndices(indices); }}
            focused={activePane === 'left'}
            onFocus={() => setActivePane('left')}
            onNavigate={(path) => handleNavigate('left', path)}
            onOpenFile={(entry) => handleOpenFileFromTable('left', entry)}
            onDropFiles={(src) => handleCrossPaneDrop(src, 'left')}
            onCompress={() => handleCompress('left')}
            onExtract={(entry) => handleExtract('left', entry)}
            onRefresh={() => triggerRefresh('left')}
            onToggleType={(newType) => handleTogglePaneType('left', newType as 'local' | 'remote')}
            onOpenTerminal={(path) => handleOpenTerminal('left', path)}
            onF3View={triggerF3View}
            onF4Edit={triggerF4Edit}
            onF5Copy={triggerF5Copy}
            onF6Move={triggerF6Move}
            onF8Delete={triggerF8Delete}
          />
          {/* Per-pane command line */}
          <div className="bg-[var(--color-panel)] border-t border-[var(--color-border)] px-3 py-2 flex items-center gap-2 font-mono text-[11px]">
            <span className="text-[#339AF0] font-bold shrink-0">CMD:</span>
            <span className="text-[var(--color-muted)] truncate max-w-[40%] shrink" title={leftPath}>{leftPath}</span>
            <span className="text-white brightness-75 shrink-0">$</span>
            <input
              type="text"
              value={leftCmdInput}
              onChange={(e) => setLeftCmdInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleRunCmd('left'); } }}
              onFocus={() => setActivePane('left')}
              placeholder="Type a command and press Enter (e.g. claude, ls, git status)"
              className="flex-1 bg-transparent border-none outline-none text-white placeholder-[var(--color-muted)] focus:ring-0"
            />
          </div>
        </section>
        <section
          className={`flex-1 flex flex-col rounded overflow-hidden relative transition-all duration-150 ${activePane === 'right' ? 'ring-1 ring-[#339AF0]/30 shadow-[0_0_12px_rgba(51,154,240,0.1)]' : ''}`}
          onClick={() => setActivePane('right')}
        >
          {renderTabStrip('right')}
          <FileTable
            id="right"
            type={rightType}
            currentPath={rightPath}
            files={sortedRightFiles}
            selectedIndex={rightSelectedIndex}
            selectedIndices={rightSelectedIndices}
            connectionId={rightConnectionId}
            connectionName={rightConnectionName}
            localDrives={localDrives}
            sortField={rightPane.sortField}
            sortOrder={rightPane.sortOrder}
            onSort={rightPane.handleSort}
            onSelect={(idx, indices) => { setRightSelectedIndex(idx); setRightSelectedIndices(indices); }}
            focused={activePane === 'right'}
            onFocus={() => setActivePane('right')}
            onNavigate={(path) => handleNavigate('right', path)}
            onOpenFile={(entry) => handleOpenFileFromTable('right', entry)}
            onDropFiles={(src) => handleCrossPaneDrop(src, 'right')}
            onCompress={() => handleCompress('right')}
            onExtract={(entry) => handleExtract('right', entry)}
            onRefresh={() => triggerRefresh('right')}
            onToggleType={(newType) => handleTogglePaneType('right', newType as 'local' | 'remote')}
            onOpenTerminal={(path) => handleOpenTerminal('right', path)}
            onF3View={triggerF3View}
            onF4Edit={triggerF4Edit}
            onF5Copy={triggerF5Copy}
            onF6Move={triggerF6Move}
            onF8Delete={triggerF8Delete}
          />
          {/* Per-pane command line */}
          <div className="bg-[var(--color-panel)] border-t border-[var(--color-border)] px-3 py-2 flex items-center gap-2 font-mono text-[11px]">
            <span className="text-[#339AF0] font-bold shrink-0">CMD:</span>
            <span className="text-[var(--color-muted)] truncate max-w-[40%] shrink" title={rightPath}>{rightPath}</span>
            <span className="text-white brightness-75 shrink-0">$</span>
            <input
              type="text"
              value={rightCmdInput}
              onChange={(e) => setRightCmdInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleRunCmd('right'); } }}
              onFocus={() => setActivePane('right')}
              placeholder="Type a command and press Enter (e.g. claude, ls, git status)"
              className="flex-1 bg-transparent border-none outline-none text-white placeholder-[var(--color-muted)] focus:ring-0"
            />
          </div>
        </section>
      </main>

      {/* Operation Progress, Selection Summary & Classic Footer */}
      <CommandBar
        onF3View={triggerF3View}
        onF4Edit={triggerF4Edit}
        onF5Copy={triggerF5Copy}
        onF6Move={triggerF6Move}
        onF7NewFolder={triggerF7NewFolder}
        onF8Delete={triggerF8Delete}
        onF10Disconnect={triggerF10Exit}
        jobProgress={jobProgress}
        onCancelTransfer={handleCancelTransfer}
        onDismissProgress={() => setJobProgress(null)}
        selectionSummaryDone={getSelectionSummary()}
        activePaneId={activePane}
      />

      {/* Connections Profile Dialogue popup */}
      <ConnectionDialog
        isOpen={isConnectionOpen}
        onClose={() => setIsConnectionOpen(false)}
        onConnect={handleConnectSSH}
      />

      {/* Custom F3 text reader overlay viewer */}
      <FileViewer
        isOpen={viewerOpen}
        onClose={() => setViewerOpen(false)}
        fileName={viewerFileName}
        filePath={viewerFilePath}
        content={viewerContent}
        isRemote={viewerIsRemote}
        category={viewerCategory}
        rawUrl={viewerRawUrl}
      />

      {/* Custom F4 text composer editor modal */}
      <FileEditor
        isOpen={editorOpen}
        onClose={() => setEditorOpen(false)}
        fileName={editorFileName}
        filePath={editorFilePath}
        initialContent={editorContent}
        isRemote={editorIsRemote}
        onSave={handleEditorSave}
      />

      {/* Interactive native shell/SSH terminal session portal */}
      <TerminalModal
        isOpen={terminalOpen}
        onClose={() => setTerminalOpen(false)}
        paneId={terminalPaneId}
        type={terminalPaneId === 'left' ? leftType : rightType}
        connectionId={terminalPaneId === 'left' ? leftConnectionId : rightConnectionId}
        connectionName={terminalPaneId === 'left' ? leftConnectionName : rightConnectionName}
        initialPath={terminalInitialPath}
        initialCommand={terminalInitialCommand}
      />

      {/* Highly polished, responsive recursive search modal overlay */}
      {searchOpen && (
        <div className="fixed inset-0 bg-[var(--color-base)]/90 backdrop-blur-sm z-50 flex items-center justify-center p-4 shadow-2xl transition-all" id="search-modal-root">
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh] modal-content">
            {/* Search Header */}
            <div className="bg-[var(--color-panel)] px-4 py-3 border-b border-[var(--color-border)] flex justify-between items-center shrink-0">
              <div className="flex items-center space-x-3">
                <span className="font-bold text-[#339AF0] font-mono tracking-tight text-xs">SEARCH_ENGINE.EXE</span>
                <div className="h-4 w-px bg-[var(--color-border)]"></div>
                <span className="text-[10px] text-[var(--color-muted)] truncate max-w-[320px] font-mono" title={activePane === 'left' ? leftPath : rightPath}>
                  START PATH: {activePane === 'left' ? leftPath : rightPath}
                </span>
              </div>
              <button 
                onClick={() => { setSearchOpen(false); setSearchError(""); setSearchResults([]); }}
                className="text-[var(--color-muted)] hover:text-white transition-colors cursor-pointer text-xs font-mono font-bold hover:bg-rose-950 px-1 rounded"
              >
                [X]
              </button>
            </div>

            {/* Traversal Query setup form */}
            <form onSubmit={triggerSearchQuery} className="p-4 border-b border-[var(--color-border)] space-y-3 bg-[var(--color-panel)]/40">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-[var(--color-muted)] font-mono uppercase font-bold tracking-wide">Enter substring or pattern matching parameters</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    placeholder="e.g. index, package, README, src, *.json ..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="flex-1 text-xs py-2 px-3 rounded bg-[var(--color-base)] border border-[var(--color-border)] text-[var(--color-content)] placeholder-[var(--color-muted)] focus:outline-none focus:border-[#339AF0] font-mono"
                    autoFocus
                  />
                  <button
                    type="submit"
                    disabled={searchLoading}
                    className="px-4 py-2 bg-[#339AF0] hover:bg-[#339AF0]/90 transition-all rounded text-black text-xs font-bold font-mono tracking-wide shrink-0 cursor-pointer flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
                  >
                    {searchLoading ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Scanning...
                      </>
                    ) : (
                      <>
                        <Search className="w-3.5 h-3.5 font-bold text-black" />
                        Execute
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>

            {/* Results interactive display panels */}
            <div className="flex-1 overflow-y-auto min-h-[300px] max-h-[400px] p-3 bg-[var(--color-base)]">
              {searchLoading && (
                <div className="flex flex-col items-center justify-center h-full py-16 gap-3">
                  <Loader2 className="w-8 h-8 animate-spin text-[#339AF0]" />
                  <span className="text-xs text-[var(--color-muted)] font-mono animate-pulse">Recursive traversal is indexing active filesystem branch...</span>
                </div>
              )}

              {searchError && !searchLoading && (
                <div className="flex flex-col items-center justify-center h-full py-12 gap-2 text-center px-4">
                  <AlertTriangle className="w-8 h-8 text-[#FAB005]" />
                  <span className="text-xs text-[var(--color-content)] font-semibold">{searchError}</span>
                  <span className="text-[10px] text-[var(--color-muted)] font-mono">Verify query parameters and folder accessibility permissions.</span>
                </div>
              )}

              {!searchLoading && !searchError && searchResults.length > 0 && (
                <div className="font-mono">
                  <div className="text-[10px] text-[var(--color-muted)] px-1 pb-2 border-b border-[var(--color-border)] mb-2 flex justify-between uppercase">
                    <span>Matches: {searchResults.length} items found</span>
                    <span className="text-[#FAB005]">Double click row to mount in active {activePane.toUpperCase()} pane</span>
                  </div>
                  
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-[11px] border-collapse">
                      <thead>
                        <tr className="text-[var(--color-muted)] border-b border-[var(--color-border)] bg-[var(--color-panel)]/50 text-[10px] uppercase">
                          <th className="px-2 py-1.5 font-normal w-1/3">Filename / Directory</th>
                          <th className="px-2 py-1.5 font-normal w-1/2">Path location route</th>
                          <th className="px-2 py-1.5 font-normal text-right w-1/6">Type</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--color-hover)]">
                        {searchResults.map((match, i) => (
                          <tr 
                            key={i}
                            onDoubleClick={() => handleSearchMatchSelection(match)}
                            className="hover:bg-[var(--color-hover)] group cursor-pointer transition-colors"
                          >
                            <td className="px-2 py-1 text-[#339AF0] font-semibold truncate max-w-[200px]" title={match.name}>
                              {match.isDirectory ? `📁 ${match.name}/` : `📄 ${match.name}`}
                            </td>
                            <td className="px-2 py-1 text-slate-400 font-mono text-[10px] truncate max-w-[320px]" title={match.path}>
                              {match.path}
                            </td>
                            <td className="px-2 py-1 text-right text-[var(--color-muted)] uppercase text-[10px]">
                              {match.isDirectory ? 'DIR' : 'FILE'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {!searchLoading && !searchError && searchResults.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full py-20 text-[var(--color-muted)] font-mono text-[11px] gap-2">
                  <Radio className="w-8 h-8 opacity-40 text-[var(--color-muted)] shrink-0" />
                  <span>Interactive file scanner is ready. Type search pattern.</span>
                  <span className="text-[10px] opacity-60">Scanning runs in background thread on target SSH shell or local node.</span>
                </div>
              )}
            </div>

            {/* Search footer row instructions */}
            <div className="bg-[var(--color-panel)] border-t border-[var(--color-border)] px-4 py-2 flex items-center justify-between text-[11px] text-[var(--color-muted)] font-mono shrink-0">
              <span className="text-[var(--color-muted)]">Alt+F7 to toggle search dashboard</span>
              <span className="text-[#339AF0] font-bold">DOUBLE CLICK TARGET TO FOCUS DIRECTORY</span>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
