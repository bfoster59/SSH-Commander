import { useState, useMemo, useCallback } from 'react';
import { FileEntry } from '../types';

export type PaneType = 'local' | 'remote';
export type SortField = 'name' | 'size' | 'modified' | null;
export type SortOrder = 'asc' | 'desc';

export interface PaneTab {
  id: string;
  type: PaneType;
  path: string;
  files: FileEntry[];
  selectedIndex: number;
  selectedIndices: number[];
  connectionId?: string;
  connectionName?: string;
  sortField: SortField;
  sortOrder: SortOrder;
  loaded: boolean;
}

let tabSeq = 0;
function makeTab(): PaneTab {
  tabSeq += 1;
  return {
    id: `tab_${Date.now()}_${tabSeq}`,
    type: 'local',
    path: '.',
    files: [],
    selectedIndex: 0,
    selectedIndices: [0],
    connectionId: undefined,
    connectionName: undefined,
    sortField: null,
    sortOrder: 'asc',
    loaded: false,
  };
}

function sortFiles(list: FileEntry[], field: SortField, order: SortOrder): FileEntry[] {
  return [...list].sort((a, b) => {
    if (a.isDirectory && !b.isDirectory) return -1;
    if (!a.isDirectory && b.isDirectory) return 1;
    if (!field) return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    let comp = 0;
    if (field === 'name') comp = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    else if (field === 'size') comp = a.size - b.size;
    else if (field === 'modified') comp = (a.lastModified || 0) - (b.lastModified || 0);
    return order === 'asc' ? comp : -comp;
  });
}

/**
 * One side of the dual-pane UI. Holds a stack of tabs (each an independent
 * filesystem/SSH session) and exposes the *active* tab's state under the same
 * field names the original single-pane hook used, so call sites stay unchanged.
 */
export function usePaneSide() {
  const [tabs, setTabs] = useState<PaneTab[]>(() => [makeTab()]);
  const [activeId, setActiveId] = useState<string>(() => tabs[0].id);

  const active = tabs.find(t => t.id === activeId) ?? tabs[0];

  const patchActive = useCallback((p: Partial<PaneTab>) => {
    setTabs(ts => ts.map(t => (t.id === activeId ? { ...t, ...p } : t)));
  }, [activeId]);

  const sortedFiles = useMemo(
    () => sortFiles(active.files, active.sortField, active.sortOrder),
    [active.files, active.sortField, active.sortOrder]
  );

  const handleSort = useCallback((field: SortField) => {
    patchActive(
      active.sortField === field
        ? { sortOrder: active.sortOrder === 'asc' ? 'desc' : 'asc' }
        : { sortField: field, sortOrder: 'asc' }
    );
  }, [active.sortField, active.sortOrder, patchActive]);

  const getSelectedEntries = useCallback(() => {
    const selected = active.selectedIndices.filter(i => i > 0).map(i => sortedFiles[i - 1]).filter(Boolean);
    if (selected.length > 0) return selected;
    if (active.selectedIndex > 0 && sortedFiles[active.selectedIndex - 1]) return [sortedFiles[active.selectedIndex - 1]];
    return [];
  }, [sortedFiles, active.selectedIndex, active.selectedIndices]);

  const addTab = useCallback(() => {
    const t = makeTab();
    setTabs(ts => [...ts, t]);
    setActiveId(t.id);
  }, []);

  const selectTab = useCallback((id: string) => setActiveId(id), []);

  const closeTab = useCallback((id: string) => {
    setTabs(prev => {
      if (prev.length <= 1) {
        const t = makeTab();
        queueMicrotask(() => setActiveId(t.id));
        return [t];
      }
      const idx = prev.findIndex(t => t.id === id);
      const remaining = prev.filter(t => t.id !== id);
      queueMicrotask(() =>
        setActiveId(curr => (curr === id ? remaining[Math.min(idx, remaining.length - 1)].id : curr))
      );
      return remaining;
    });
  }, []);

  return {
    // Tab management
    tabs,
    activeId,
    activeTab: active,
    addTab,
    selectTab,
    closeTab,

    // Active-tab state (same shape the rest of the app expects)
    type: active.type,
    setType: (v: PaneType) => patchActive({ type: v }),
    path: active.path,
    setPath: (v: string) => patchActive({ path: v }),
    files: active.files,
    setFiles: (v: FileEntry[]) => patchActive({ files: v }),
    selectedIndex: active.selectedIndex,
    setSelectedIndex: (v: number) => patchActive({ selectedIndex: v }),
    selectedIndices: active.selectedIndices,
    setSelectedIndices: (v: number[]) => patchActive({ selectedIndices: v }),
    connectionId: active.connectionId,
    setConnectionId: (v?: string) => patchActive({ connectionId: v }),
    connectionName: active.connectionName,
    setConnectionName: (v?: string) => patchActive({ connectionName: v }),
    sortField: active.sortField,
    sortOrder: active.sortOrder,
    sortedFiles,
    handleSort,
    getSelectedEntries,
    loaded: active.loaded,
    setLoaded: (v: boolean) => patchActive({ loaded: v }),
  };
}
