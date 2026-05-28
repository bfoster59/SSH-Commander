import { useState, useMemo, useCallback } from 'react';
import { FileEntry } from '../types';

export type PaneType = 'local' | 'remote';
export type SortField = 'name' | 'size' | 'modified' | null;
export type SortOrder = 'asc' | 'desc';

export function useFilePane() {
  const [type, setType] = useState<PaneType>('local');
  const [path, setPath] = useState<string>(".");
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [selectedIndices, setSelectedIndices] = useState<number[]>([0]);
  const [connectionId, setConnectionId] = useState<string | undefined>(undefined);
  const [connectionName, setConnectionName] = useState<string | undefined>(undefined);
  const [sortField, setSortField] = useState<SortField>(null);
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

  const sortFiles = useCallback((filesList: FileEntry[], field: SortField, order: SortOrder) => {
    return [...filesList].sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;

      if (!field) {
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

  const sortedFiles = useMemo(() => {
    return sortFiles(files, sortField, sortOrder);
  }, [files, sortField, sortOrder, sortFiles]);

  const handleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  }, [sortField]);

  const getSelectedEntries = useCallback(() => {
    const selected = selectedIndices
      .filter(idx => idx > 0)
      .map(idx => sortedFiles[idx - 1])
      .filter(Boolean);

    if (selected.length > 0) {
      return selected;
    }

    if (selectedIndex > 0 && sortedFiles[selectedIndex - 1]) {
      return [sortedFiles[selectedIndex - 1]];
    }

    return [];
  }, [sortedFiles, selectedIndex, selectedIndices]);

  return {
    type,
    setType,
    path,
    setPath,
    files,
    setFiles,
    selectedIndex,
    setSelectedIndex,
    selectedIndices,
    setSelectedIndices,
    connectionId,
    setConnectionId,
    connectionName,
    setConnectionName,
    sortField,
    sortOrder,
    sortedFiles,
    handleSort,
    getSelectedEntries
  };
}
