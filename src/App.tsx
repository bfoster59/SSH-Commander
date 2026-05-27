/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { FileEntry, ConnectionProfile, OperationProgress } from "./types";
import FileTable from "./components/FileTable";
import CommandBar from "./components/CommandBar";
import ConnectionDialog from "./components/ConnectionDialog";
import FileViewer from "./components/FileViewer";
import FileEditor from "./components/FileEditor";
import TerminalModal from "./components/TerminalModal";
import { 
  Network, 
  Search, 
  Terminal, 
  Loader2, 
  AlertTriangle,
  Radio,
  Clock
} from "lucide-react";

import { User } from "firebase/auth";
import { initAuth, googleSignIn, logout } from "./lib/firebaseAuth";
import { 
  parseGDrivePath, 
  buildGDrivePath, 
  listGDriveFiles, 
  createGDriveFolder, 
  createGDriveFileMetadata, 
  uploadGDriveFileContent, 
  downloadGDriveFileAsText, 
  downloadGDriveFileAsBlob, 
  deleteGDriveItem, 
  renameGDriveItem,
  getGDriveFolderMetadata
} from "./lib/driveApi";

export default function App() {
  // Session timer ticker
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

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

  // Google Drive Credentials and Session States
  const [gdriveToken, setGdriveToken] = useState<string | null>(null);
  const [gdriveUser, setGdriveUser] = useState<User | null>(null);

  useEffect(() => {
    const unsub = initAuth(
      (user, token) => {
        setGdriveUser(user);
        setGdriveToken(token);
      },
      () => {
        setGdriveUser(null);
        setGdriveToken(null);
      }
    );
    return () => unsub();
  }, []);

  const handleGDriveSignIn = async () => {
    try {
      const result = await googleSignIn();
      if (result) {
        setGdriveUser(result.user);
        setGdriveToken(result.accessToken);
        if (leftType === 'gdrive') handleNavigate('left', 'gdrive://root');
        if (rightType === 'gdrive') handleNavigate('right', 'gdrive://root');
      }
    } catch (err: any) {
      alert(`Google Drive sign-in failed: ${err.message}`);
    }
  };

  const handleGDriveSignOut = async () => {
    try {
      await logout();
      setGdriveUser(null);
      setGdriveToken(null);
      if (leftType === 'gdrive') handleTogglePaneType('left', 'local');
      if (rightType === 'gdrive') handleTogglePaneType('right', 'local');
    } catch (err: any) {
      alert(`Google sign-out failed: ${err.message}`);
    }
  };

  // Left Pane State
  const [leftType, setLeftType] = useState<'local' | 'remote' | 'gdrive'>('local');
  const [leftPath, setLeftPath] = useState<string>(".");
  const [leftFiles, setLeftFiles] = useState<FileEntry[]>([]);
  const [leftSelectedIndex, setLeftSelectedIndex] = useState<number>(0);
  const [leftSelectedIndices, setLeftSelectedIndices] = useState<number[]>([0]);
  const [leftConnectionId, setLeftConnectionId] = useState<string | undefined>(undefined);
  const [leftConnectionName, setLeftConnectionName] = useState<string | undefined>(undefined);

  // Right Pane State
  const [rightType, setRightType] = useState<'local' | 'remote' | 'gdrive'>('local');
  const [rightPath, setRightPath] = useState<string>(".");
  const [rightFiles, setRightFiles] = useState<FileEntry[]>([]);
  const [rightSelectedIndex, setRightSelectedIndex] = useState<number>(0);
  const [rightSelectedIndices, setRightSelectedIndices] = useState<number[]>([0]);
  const [rightConnectionId, setRightConnectionId] = useState<string | undefined>(undefined);
  const [rightConnectionName, setRightConnectionName] = useState<string | undefined>(undefined);

  // Active Focus Selection Track
  const [activePane, setActivePane] = useState<'left' | 'right'>('left');

  // Sorting Pane States
  const [leftSortField, setLeftSortField] = useState<'name' | 'size' | 'modified' | null>(null);
  const [leftSortOrder, setLeftSortOrder] = useState<'asc' | 'desc'>('asc');

  const [rightSortField, setRightSortField] = useState<'name' | 'size' | 'modified' | null>(null);
  const [rightSortOrder, setRightSortOrder] = useState<'asc' | 'desc'>('asc');

  // Reusable file sorting helper keeping directories first
  const sortFiles = useCallback((filesList: FileEntry[], field: 'name' | 'size' | 'modified' | null, order: 'asc' | 'desc') => {
    return [...filesList].sort((a, b) => {
      // Directories are always group-aligned to the top, even when sorting sorted files
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;

      if (!field) {
        // Default sort (case-insensitive name ascending)
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      }

      let comp = 0;
      if (field === 'name') {
        comp = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      } else if (field === 'size') {
        comp = a.size - b.size;
      } else if (field === 'modified') {
        const timeA = a.lastModified || 0;
        const timeB = b.lastModified || 0;
        comp = timeA - timeB;
      }

      return order === 'asc' ? comp : -comp;
    });
  }, []);

  const sortedLeftFiles = useMemo(() => {
    return sortFiles(leftFiles, leftSortField, leftSortOrder);
  }, [leftFiles, leftSortField, leftSortOrder, sortFiles]);

  const sortedRightFiles = useMemo(() => {
    return sortFiles(rightFiles, rightSortField, rightSortOrder);
  }, [rightFiles, rightSortField, rightSortOrder, sortFiles]);

  const handleSort = useCallback((pane: 'left' | 'right', field: 'name' | 'size' | 'modified') => {
    if (pane === 'left') {
      if (leftSortField === field) {
        setLeftSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
      } else {
        setLeftSortField(field);
        setLeftSortOrder('asc');
      }
    } else {
      if (rightSortField === field) {
        setRightSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
      } else {
        setRightSortField(field);
        setRightSortOrder('asc');
      }
    }
  }, [leftSortField, rightSortField]);

  // Connection Dialog Management
  const [isConnectionOpen, setIsConnectionOpen] = useState(false);

  // Text File viewing controls state
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerFileName, setViewerFileName] = useState("");
  const [viewerFilePath, setViewerFilePath] = useState("");
  const [viewerContent, setViewerContent] = useState("");
  const [viewerIsRemote, setViewerIsRemote] = useState(false);

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
  const [terminalPaneId, setTerminalPaneId] = useState<'left' | 'right'>('left');

  const handleOpenTerminal = (pane: 'left' | 'right', path: string) => {
    setTerminalPaneId(pane);
    setTerminalInitialPath(path);
    setTerminalOpen(true);
  };

  const handleSyncCommanderPath = async (pane: 'left' | 'right', path: string) => {
    await handleNavigate(pane, path);
  };

  // Load initial environment folder context
  useEffect(() => {
    const initWorkspace = async () => {
      try {
        const res = await fetch("/api/local/list", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: "." })
        });
        if (res.ok) {
          const data = await res.json();
          setLeftPath(data.path);
          setLeftFiles(data.files);
          setRightPath(data.path);
          setRightFiles(data.files);
        }
      } catch (err) {
        console.error("Failed to initialize workspace", err);
      }
    };
    initWorkspace();
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

  // Navigate Pane Tree Loader Method
  const handleNavigate = async (pane: 'left' | 'right', targetPath: string) => {
    const type = pane === 'left' ? leftType : rightType;
    const connId = pane === 'left' ? leftConnectionId : rightConnectionId;

    try {
      if (type === 'gdrive') {
        let actualPath = targetPath;
        let activeToken = gdriveToken;
        if (!activeToken) {
          if (pane === 'left') {
            setLeftPath(targetPath);
            setLeftFiles([]);
            setLeftSelectedIndex(0);
            setLeftSelectedIndices([0]);
          } else {
            setRightPath(targetPath);
            setRightFiles([]);
            setRightSelectedIndex(0);
            setRightSelectedIndices([0]);
          }
          return;
        }

        if (targetPath.endsWith("/..")) {
          const pathWithoutSlashDotDot = targetPath.slice(0, -3);
          const { folderId: currentFolderId, humanPath: currentHumanPath } = parseGDrivePath(pathWithoutSlashDotDot);
          
          if (currentFolderId === 'root' || !currentFolderId) {
             return;
          }

          const meta = await getGDriveFolderMetadata(activeToken, currentFolderId);
          const parentId = meta.parentId || 'root';

          const humanParts = currentHumanPath.split('/').filter(Boolean);
          if (humanParts.length > 0) {
            humanParts.pop();
          }
          const parentHumanPath = humanParts.join('/');
          actualPath = buildGDrivePath(parentHumanPath || 'My Drive', parentId);
        }

        const { folderId } = parseGDrivePath(actualPath);
        const files = await listGDriveFiles(activeToken, folderId);

        if (pane === 'left') {
          setLeftPath(actualPath);
          setLeftFiles(files);
          setLeftSelectedIndex(0);
          setLeftSelectedIndices([0]);
        } else {
          setRightPath(actualPath);
          setRightFiles(files);
          setRightSelectedIndex(0);
          setRightSelectedIndices([0]);
        }
        return;
      }

      if (type === 'local') {
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
        if (pane === 'left') {
          setLeftPath(data.path);
          setLeftFiles(data.files);
          setLeftSelectedIndex(0);
          setLeftSelectedIndices([0]);
        } else {
          setRightPath(data.path);
          setRightFiles(data.files);
          setRightSelectedIndex(0);
          setRightSelectedIndices([0]);
        }

        // Apply any pending highlighter selections (e.g., from double-clicking searches)
        if (pendingSelection && pendingSelection.pane === pane) {
          const matchIdx = data.files.findIndex((f: any) => f.name === pendingSelection.name);
          if (matchIdx !== -1) {
            // Align by adding 1 offset representation for Root ".." file row at top
            if (pane === 'left') {
              setLeftSelectedIndex(matchIdx + 1);
              setLeftSelectedIndices([matchIdx + 1]);
            } else {
              setRightSelectedIndex(matchIdx + 1);
              setRightSelectedIndices([matchIdx + 1]);
            }
          }
          setPendingSelection(null);
        }
      } else {
        if (!connId) throw new Error("Remote connection expired. Please connect index.");
        const res = await fetch('/api/ssh/list', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ connectionId: connId, path: targetPath })
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed scanning SSH directory list');
        }
        const data = await res.json();
        if (pane === 'left') {
          setLeftPath(targetPath);
          setLeftFiles(data.files);
          setLeftSelectedIndex(0);
          setLeftSelectedIndices([0]);
        } else {
          setRightPath(targetPath);
          setRightFiles(data.files);
          setRightSelectedIndex(0);
          setRightSelectedIndices([0]);
        }

        // Apply pending selection offsets
        if (pendingSelection && pendingSelection.pane === pane) {
          const matchIdx = data.files.findIndex((f: any) => f.name === pendingSelection.name);
          if (matchIdx !== -1) {
            if (pane === 'left') {
              setLeftSelectedIndex(matchIdx + 1);
              setLeftSelectedIndices([matchIdx + 1]);
            } else {
              setRightSelectedIndex(matchIdx + 1);
              setRightSelectedIndices([matchIdx + 1]);
            }
          }
          setPendingSelection(null);
        }
      }
    } catch (err: any) {
      alert(`Directory index load state error: ${err.message}`);
    }
  };

  const triggerRefresh = (pane: 'left' | 'right') => {
    const path = pane === 'left' ? leftPath : rightPath;
    handleNavigate(pane, path);
  };

  const handleTogglePaneType = (pane: 'left' | 'right', newType: 'local' | 'remote' | 'gdrive') => {
    if (pane === 'left') {
      if (newType === 'local') {
        setLeftType('local');
        setLeftConnectionId(undefined);
        setLeftConnectionName(undefined);
        handleNavigate('left', '.');
      } else if (newType === 'gdrive') {
        setLeftType('gdrive');
        setLeftConnectionId(undefined);
        setLeftConnectionName(undefined);
        setLeftPath('gdrive://root');
        handleNavigate('left', 'gdrive://root');
      } else {
        setIsConnectionOpen(true);
      }
    } else {
      if (newType === 'local') {
        setRightType('local');
        setRightConnectionId(undefined);
        setRightConnectionName(undefined);
        handleNavigate('right', '.');
      } else if (newType === 'gdrive') {
        setRightType('gdrive');
        setRightConnectionId(undefined);
        setRightConnectionName(undefined);
        setRightPath('gdrive://root');
        handleNavigate('right', 'gdrive://root');
      } else {
        setIsConnectionOpen(true);
      }
    }
  };

  const handleConnectSSH = async (profile: ConnectionProfile) => {
    setIsConnectionOpen(false);
    const pane = activePane;

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
      if (pane === 'left') {
        setLeftType('remote');
        setLeftConnectionId(data.connectionId);
        setLeftConnectionName(profile.name);
        setLeftPath(data.homePath);
        handleNavigate('left', data.homePath);
      } else {
        setRightType('remote');
        setRightConnectionId(data.connectionId);
        setRightConnectionName(profile.name);
        setRightPath(data.homePath);
        handleNavigate('right', data.homePath);
      }
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

  const handleF3ViewForFile = async (name: string, filePath: string, isRemote: boolean, connId?: string) => {
    try {
      let content = "";
      if (filePath.startsWith("gdrive://")) {
        const { folderId } = parseGDrivePath(filePath);
        if (!gdriveToken) throw new Error("Google Drive is not connected. Please log in first.");
        content = await downloadGDriveFileAsText(gdriveToken, folderId);
      } else if (isRemote) {
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

      setViewerFileName(name);
      setViewerFilePath(filePath);
      setViewerContent(content);
      setViewerIsRemote(isRemote);
      setViewerOpen(true);
    } catch (err: any) {
      alert(`Text view trigger error: ${err.message}`);
    }
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
      if (fullSourcePath.startsWith("gdrive://")) {
        const { folderId } = parseGDrivePath(fullSourcePath);
        if (!gdriveToken) throw new Error("Google Drive is not connected. Please log in first.");
        content = await downloadGDriveFileAsText(gdriveToken, folderId);
      } else if (isRemote) {
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

  const runClientGDriveTransfer = async (
    srcPane: 'left' | 'right',
    dstPane: 'left' | 'right',
    selectedEntries: any[],
    srcPath: string,
    dstPath: string
  ) => {
    const srcType = srcPane === 'left' ? leftType : rightType;
    const dstType = dstPane === 'left' ? leftType : rightType;
    const srcConnId = srcPane === 'left' ? leftConnectionId : rightConnectionId;
    const dstConnId = dstPane === 'left' ? leftConnectionId : rightConnectionId;

    setJobProgress({
      active: true,
      title: "Google Drive Co-processor running...",
      percentage: 0,
      currentItem: "Opening stream handles...",
      bytesTransferred: 0,
      totalBytes: selectedEntries.length
    });

    try {
      const activeToken = gdriveToken;
      if (!activeToken) throw new Error("Google Drive auth is not active. Please connect Drive.");

      const { folderId: dstFolderId } = dstType === 'gdrive' ? parseGDrivePath(dstPath) : { folderId: '' };

      for (let i = 0; i < selectedEntries.length; i++) {
        const file = selectedEntries[i];
        const pct = Math.round((i / selectedEntries.length) * 100);

        setJobProgress(prev => prev ? {
          ...prev,
          percentage: pct,
          currentItem: `Transferring "${file.name}" (${i + 1}/${selectedEntries.length})...`
        } : null);

        if (srcType === 'gdrive') {
          const driveId = (file as any).driveId;
          if (!driveId) continue;

          if (file.isDirectory) {
            alert(`Transfer directory recursively from Drive is limited in preview. Skipping folder: ${file.name}`);
            continue;
          }

          const blob = await downloadGDriveFileAsBlob(activeToken, driveId);
          const content = await blob.text();

          if (dstType === 'local') {
            const separator = dstPath.includes('/') ? '/' : '\\';
            const dstFilePath = dstPath.endsWith(separator) ? dstPath + file.name : dstPath + separator + file.name;
            await fetch('/api/local/write', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ path: dstFilePath, content })
            });
          } else if (dstType === 'remote') {
            const separator = '/';
            const dstFilePath = dstPath.endsWith(separator) ? dstPath + file.name : dstPath + separator + file.name;
            await fetch('/api/ssh/write', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ connectionId: dstConnId, path: dstFilePath, content })
            });
          } else if (dstType === 'gdrive') {
            await fetch(`https://www.googleapis.com/drive/v3/files/${driveId}/copy`, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${activeToken}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                name: "Copy of " + file.name,
                parents: [dstFolderId]
              })
            });
          }
        } else {
          if (file.isDirectory) {
            await createGDriveFolder(activeToken, dstFolderId, file.name);
            continue;
          }

          const separator = srcPath.includes('/') ? '/' : '\\';
          const srcFilePath = srcPath.endsWith(separator) ? srcPath + file.name : srcPath + separator + file.name;

          let content = "";
          if (srcType === 'local') {
            const res = await fetch('/api/local/read', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ path: srcFilePath })
            });
            if (res.ok) {
              const json = await res.json();
              content = json.content;
            }
          } else if (srcType === 'remote') {
            const res = await fetch('/api/ssh/read', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ connectionId: srcConnId, path: srcFilePath })
            });
            if (res.ok) {
              const json = await res.json();
              content = json.content;
            }
          }

          const fileId = await createGDriveFileMetadata(activeToken, dstFolderId, file.name);
          await uploadGDriveFileContent(activeToken, fileId, content);
        }
      }

      setJobProgress({
        active: false,
        title: "Client Transfer Completed",
        percentage: 100,
        currentItem: "Files copied successfully.",
        bytesTransferred: selectedEntries.length,
        totalBytes: selectedEntries.length
      });

      setTimeout(() => setJobProgress(null), 2000);
      triggerRefresh('left');
      triggerRefresh('right');
    } catch (err: any) {
      alert(`GDrive co-processor transfer failed: ${err.message}`);
      setJobProgress(null);
    }
  };

  const triggerTransferJob = async (
    srcPane: 'left' | 'right',
    dstPane: 'left' | 'right',
    fullSourcePaths: string[] | string
  ) => {
    const srcType = srcPane === 'left' ? leftType : rightType;
    const dstType = dstPane === 'left' ? leftType : rightType;
    const targetFolder = dstPane === 'left' ? leftPath : rightPath;

    if (srcType === 'gdrive' || dstType === 'gdrive') {
      const selectedEntries = getSelectedEntries(srcPane);
      const srcPath = srcPane === 'left' ? leftPath : rightPath;
      await runClientGDriveTransfer(srcPane, dstPane, selectedEntries, srcPath, targetFolder);
      return;
    }

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

    const type = pane === 'left' ? leftType : rightType;
    if (type === 'gdrive') {
      const selectedFile = selectedEntries[0] as any;
      if (!selectedFile?.driveId) return;
      const responseName = window.prompt(`Rename Google Drive item: Enter new name for "${selectedFile.name}"`, selectedFile.name);
      if (!responseName) return;
      try {
        if (!gdriveToken) throw new Error("Google Drive auth is not active. Please log in first.");
        await renameGDriveItem(gdriveToken, selectedFile.driveId, responseName);
        triggerRefresh(pane);
      } catch (err: any) {
        alert(`Rename exception: ${err.message}`);
      }
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

    if (type === 'gdrive') {
      try {
        if (!gdriveToken) throw new Error("Google Drive auth is not active. Please log in first.");
        const { folderId } = parseGDrivePath(basePath);
        await createGDriveFolder(gdriveToken, folderId, name);
        triggerRefresh(pane);
      } catch (err: any) {
        alert(`Folder creation error: ${err.message}`);
      }
      return;
    }

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

    const type = pane === 'left' ? leftType : rightType;
    if (type === 'gdrive') {
      try {
        if (!gdriveToken) throw new Error("Google Drive auth is not active. Please log in first.");
        for (const file of selectedEntries) {
          const selectedFile = file as any;
          if (selectedFile.driveId) {
            await deleteGDriveItem(gdriveToken, selectedFile.driveId);
          }
        }
        triggerRefresh(pane);
      } catch (err: any) {
        alert(`Deletion error: ${err.message}`);
        triggerRefresh(pane);
      }
      return;
    }

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
        handleNavigate('left', '.');
      } else {
        setRightType('local');
        setRightConnectionId(undefined);
        setRightConnectionName(undefined);
        handleNavigate('right', '.');
      }
    } catch (e: any) {
      console.error(e);
    }
  };

  const handleEditorSave = async (filePath: string, content: string, isRemote: boolean) => {
    try {
      const connId = activePane === 'left' ? leftConnectionId : rightConnectionId;
      if (filePath.startsWith("gdrive://")) {
        const { folderId } = parseGDrivePath(filePath);
        if (!gdriveToken) throw new Error("Google Drive connection expired. Please log in again.");
        await uploadGDriveFileContent(gdriveToken, folderId, content);
      } else if (isRemote) {
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

  return (
    <div className="flex flex-col h-screen w-full bg-[#0F1115] text-[#C1C2C5] font-sans overflow-hidden" id="dashboard-root">
      {/* Top Navigation & Host Selector */}
      <nav className="h-12 border-b border-[#2C2E33] flex items-center justify-between px-4 bg-[#14161A] shrink-0 font-sans">
        <div className="flex items-center space-x-4">
          <span className="font-mono font-bold text-[#339AF0] tracking-tight">COMMANDER_PRO.EXE</span>
          <div className="h-4 w-px bg-[#2C2E33]"></div>
          <div className="flex space-x-1">
            <button 
              onClick={() => setIsConnectionOpen(true)}
              className="px-2 py-0.5 bg-[#2C2E33] text-[#339AF0] font-mono text-[10px] rounded hover:bg-[#339AF0] hover:text-white transition-colors cursor-pointer"
              title="Quick Connect SSH"
            >
              [ CONNECT SSH ]
            </button>
            <button 
              onClick={() => setSearchOpen(true)}
              className="px-2 py-0.5 bg-[#339AF0] text-[#0F1115] font-mono font-bold text-[10px] rounded hover:bg-[#339AF0]/90 transition-colors cursor-pointer flex items-center gap-1"
              title="Search System (Alt+F7)"
            >
              <Search className="w-2.5 h-2.5" />
              [ RECURSIVE SEARCH ]
            </button>
          </div>
        </div>
        
        <div className="flex items-center space-x-6 text-[11px] font-mono">
          <div className="flex items-center space-x-2">
            <span className="text-[#5C5F66]">ACTIVE HOST:</span>
            <span className="text-[#40C057] font-semibold flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-[#40C057] inline-block animate-ping"></span>
              {activeHostName()}
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-[#5C5F66]">SESSION:</span>
            <span className="text-[#FAB005] font-semibold flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-[#FAB005]" />
              {formatSessionTime(elapsedSeconds)}
            </span>
          </div>
        </div>
      </nav>

      {/* Main Dual Pane Splitter */}
      <main className="flex-1 flex flex-col md:flex-row overflow-hidden p-2 gap-2" id="workspace-main">
        {/* Left Side Table Frame */}
        <section 
          className={`flex-1 flex flex-col rounded overflow-hidden relative transition-all duration-150 ${
            activePane === 'left' ? 'ring-1 ring-[#339AF0]/30 shadow-[0_0_12px_rgba(51,154,240,0.1)]' : ''
          }`}
          onClick={() => setActivePane('left')}
        >
          <FileTable
            id="left"
            type={leftType}
            currentPath={leftPath}
            files={sortedLeftFiles}
            selectedIndex={leftSelectedIndex}
            selectedIndices={leftSelectedIndices}
            focused={activePane === 'left'}
            onFocus={() => setActivePane('left')}
            onSelect={(idx, indices) => {
              setLeftSelectedIndex(idx);
              setLeftSelectedIndices(indices);
            }}
            onNavigate={(path) => handleNavigate('left', path)}
            onRefresh={() => triggerRefresh('left')}
            onToggleType={(newType) => handleTogglePaneType('left', newType)}
            connectionId={leftConnectionId}
            connectionName={leftConnectionName}
            localDrives={localDrives}
            isGDriveSignedIn={Boolean(gdriveToken)}
            gdriveUserEmail={gdriveUser?.email || ""}
            onGDriveSignIn={handleGDriveSignIn}
            onGDriveSignOut={handleGDriveSignOut}
            sortField={leftSortField}
            sortOrder={leftSortOrder}
            onSort={(field) => handleSort('left', field)}
            onF3View={triggerF3View}
            onF4Edit={triggerF4Edit}
            onF5Copy={triggerF5Copy}
            onF6Move={triggerF6Move}
            onF8Delete={triggerF8Delete}
            onOpenTerminal={(path) => handleOpenTerminal('left', path)}
          />
        </section>

        {/* Right Side Table Frame */}
        <section 
          className={`flex-1 flex flex-col rounded overflow-hidden relative transition-all duration-150 ${
            activePane === 'right' ? 'ring-1 ring-[#339AF0]/30 shadow-[0_0_12px_rgba(51,154,240,0.1)]' : ''
          }`}
          onClick={() => setActivePane('right')}
        >
          <FileTable
            id="right"
            type={rightType}
            currentPath={rightPath}
            files={sortedRightFiles}
            selectedIndex={rightSelectedIndex}
            selectedIndices={rightSelectedIndices}
            focused={activePane === 'right'}
            onFocus={() => setActivePane('right')}
            onSelect={(idx, indices) => {
              setRightSelectedIndex(idx);
              setRightSelectedIndices(indices);
            }}
            onNavigate={(path) => handleNavigate('right', path)}
            onRefresh={() => triggerRefresh('right')}
            onToggleType={(newType) => handleTogglePaneType('right', newType)}
            connectionId={rightConnectionId}
            connectionName={rightConnectionName}
            localDrives={localDrives}
            isGDriveSignedIn={Boolean(gdriveToken)}
            gdriveUserEmail={gdriveUser?.email || ""}
            onGDriveSignIn={handleGDriveSignIn}
            onGDriveSignOut={handleGDriveSignOut}
            sortField={rightSortField}
            sortOrder={rightSortOrder}
            onSort={(field) => handleSort('right', field)}
            onF3View={triggerF3View}
            onF4Edit={triggerF4Edit}
            onF5Copy={triggerF5Copy}
            onF6Move={triggerF6Move}
            onF8Delete={triggerF8Delete}
            onOpenTerminal={(path) => handleOpenTerminal('right', path)}
          />
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
        onSyncCommanderPath={handleSyncCommanderPath}
      />

      {/* Highly polished, responsive recursive search modal overlay */}
      {searchOpen && (
        <div className="fixed inset-0 bg-[#0F1115]/90 backdrop-blur-sm z-50 flex items-center justify-center p-4 shadow-2xl transition-all" id="search-modal-root">
          <div className="bg-[#1A1B1E] border border-[#2C2E33] rounded w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh] modal-content">
            {/* Search Header */}
            <div className="bg-[#14161A] px-4 py-3 border-b border-[#2C2E33] flex justify-between items-center shrink-0">
              <div className="flex items-center space-x-3">
                <span className="font-bold text-[#339AF0] font-mono tracking-tight text-xs">SEARCH_ENGINE.EXE</span>
                <div className="h-4 w-px bg-[#2C2E33]"></div>
                <span className="text-[10px] text-[#5C5F66] truncate max-w-[320px] font-mono" title={activePane === 'left' ? leftPath : rightPath}>
                  START PATH: {activePane === 'left' ? leftPath : rightPath}
                </span>
              </div>
              <button 
                onClick={() => { setSearchOpen(false); setSearchError(""); setSearchResults([]); }}
                className="text-[#5C5F66] hover:text-white transition-colors cursor-pointer text-xs font-mono font-bold hover:bg-rose-950 px-1 rounded"
              >
                [X]
              </button>
            </div>

            {/* Traversal Query setup form */}
            <form onSubmit={triggerSearchQuery} className="p-4 border-b border-[#2C2E33] space-y-3 bg-[#14161A]/40">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-[#5C5F66] font-mono uppercase font-bold tracking-wide">Enter substring or pattern matching parameters</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    placeholder="e.g. index, package, README, src, *.json ..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="flex-1 text-xs py-2 px-3 rounded bg-[#0F1115] border border-[#2C2E33] text-[#C1C2C5] placeholder-[#5C5F66] focus:outline-none focus:border-[#339AF0] font-mono"
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
            <div className="flex-1 overflow-y-auto min-h-[300px] max-h-[400px] p-3 bg-[#0F1115]">
              {searchLoading && (
                <div className="flex flex-col items-center justify-center h-full py-16 gap-3">
                  <Loader2 className="w-8 h-8 animate-spin text-[#339AF0]" />
                  <span className="text-xs text-[#5C5F66] font-mono animate-pulse">Recursive traversal is indexing active filesystem branch...</span>
                </div>
              )}

              {searchError && !searchLoading && (
                <div className="flex flex-col items-center justify-center h-full py-12 gap-2 text-center px-4">
                  <AlertTriangle className="w-8 h-8 text-[#FAB005]" />
                  <span className="text-xs text-[#C1C2C5] font-semibold">{searchError}</span>
                  <span className="text-[10px] text-[#5C5F66] font-mono">Verify query parameters and folder accessibility permissions.</span>
                </div>
              )}

              {!searchLoading && !searchError && searchResults.length > 0 && (
                <div className="font-mono">
                  <div className="text-[10px] text-[#5C5F66] px-1 pb-2 border-b border-[#2C2E33] mb-2 flex justify-between uppercase">
                    <span>Matches: {searchResults.length} items found</span>
                    <span className="text-[#FAB005]">Double click row to mount in active {activePane.toUpperCase()} pane</span>
                  </div>
                  
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-[11px] border-collapse">
                      <thead>
                        <tr className="text-[#5C5F66] border-b border-[#2C2E33] bg-[#14161A]/50 text-[10px] uppercase">
                          <th className="px-2 py-1.5 font-normal w-1/3">Filename / Directory</th>
                          <th className="px-2 py-1.5 font-normal w-1/2">Path location route</th>
                          <th className="px-2 py-1.5 font-normal text-right w-1/6">Type</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#25262B]">
                        {searchResults.map((match, i) => (
                          <tr 
                            key={i}
                            onDoubleClick={() => handleSearchMatchSelection(match)}
                            className="hover:bg-[#25262B] group cursor-pointer transition-colors"
                          >
                            <td className="px-2 py-1 text-[#339AF0] font-semibold truncate max-w-[200px]" title={match.name}>
                              {match.isDirectory ? `📁 ${match.name}/` : `📄 ${match.name}`}
                            </td>
                            <td className="px-2 py-1 text-slate-400 font-mono text-[10px] truncate max-w-[320px]" title={match.path}>
                              {match.path}
                            </td>
                            <td className="px-2 py-1 text-right text-[#5C5F66] uppercase text-[10px]">
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
                <div className="flex flex-col items-center justify-center h-full py-20 text-[#5C5F66] font-mono text-[11px] gap-2">
                  <Radio className="w-8 h-8 opacity-40 text-[#5C5F66] shrink-0" />
                  <span>Interactive file scanner is ready. Type search pattern.</span>
                  <span className="text-[10px] opacity-60">Scanning runs in background thread on target SSH shell or local node.</span>
                </div>
              )}
            </div>

            {/* Search footer row instructions */}
            <div className="bg-[#14161A] border-t border-[#2C2E33] px-4 py-2 flex items-center justify-between text-[11px] text-[#5C5F66] font-mono shrink-0">
              <span className="text-[#5C5F66]">Alt+F7 to toggle search dashboard</span>
              <span className="text-[#339AF0] font-bold">DOUBLE CLICK TARGET TO FOCUS DIRECTORY</span>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
