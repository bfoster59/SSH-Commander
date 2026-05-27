export interface ConnectionProfile {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string;
  passphrase?: string;
}

export interface FileEntry {
  name: string;
  size: number;
  isDirectory: boolean;
  isSymlink: boolean;
  lastModified: number; // timestamp ms
  permissions?: string;
  owner?: string;
}

export interface PaneState {
  id: 'left' | 'right';
  type: 'local' | 'remote' | 'gdrive';
  currentPath: string;
  connectionId?: string; // Active connection id if type is remote
  connectionName?: string;
  selectedIndex: number;
  scrollOffset: number;
}

export interface SSHSessionInfo {
  connectionId: string;
  name: string;
  host: string;
  username: string;
  currentPath: string;
}

export interface OperationProgress {
  active: boolean;
  title: string;
  percentage: number;
  currentItem: string;
  bytesTransferred: number;
  totalBytes: number;
}
