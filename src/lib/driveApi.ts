import { FileEntry } from '../types';

export interface GDriveFileEntry extends FileEntry {
  driveId: string;
  mimeType: string;
}

// Map Google Drive path into human-readable path and precise folderId
export function parseGDrivePath(path: string): { humanPath: string; folderId: string } {
  // Expected formats: 
  // gdrive://root
  // gdrive://root/FolderA/FolderB?id=12345
  if (!path.startsWith('gdrive://')) {
    return { humanPath: 'My Drive', folderId: 'root' };
  }

  const clean = path.slice(9); // remove gdrive://
  const questionMarkIdx = clean.indexOf('?');
  
  if (questionMarkIdx === -1) {
    return { humanPath: clean || 'My Drive', folderId: 'root' };
  }

  const urlParams = new URLSearchParams(clean.slice(questionMarkIdx));
  const folderId = urlParams.get('id') || 'root';
  const humanPath = clean.slice(0, questionMarkIdx) || 'My Drive';

  return { humanPath, folderId };
}

// Build standard gdrive:// path string
export function buildGDrivePath(humanPath: string, folderId: string): string {
  const cleanHuman = humanPath.replace(/^\//, '').replace(/\?.*$/, '');
  return `gdrive://${cleanHuman}?id=${folderId}`;
}

// Fetch Google Drive folder metadata (to retrieve parents for folder movement / go-up navigation)
export async function getGDriveFolderMetadata(accessToken: string, folderId: string): Promise<{ name: string; parentId: string }> {
  if (folderId === 'root') {
    return { name: 'My Drive', parentId: '' };
  }

  try {
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${folderId}?fields=name,parents`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) {
      throw new Error(`Failed to load Google Drive folder info: ${res.statusText}`);
    }
    const data = await res.json();
    return {
      name: data.name || '',
      parentId: data.parents && data.parents.length > 0 ? data.parents[0] : 'root'
    };
  } catch (err) {
    console.error('getGDriveFolderMetadata error', err);
    return { name: 'Folder', parentId: 'root' };
  }
}

// List files and directories in a Google Drive folder
export async function listGDriveFiles(accessToken: string, folderId: string): Promise<GDriveFileEntry[]> {
  const query = `'${folderId}' in parents and trashed = false`;
  const fields = 'files(id, name, mimeType, size, modifiedTime)';
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=${encodeURIComponent(fields)}&pageSize=1000`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error?.message || `Failed to fetch Google Drive files: ${res.statusText}`);
  }

  const data = await res.json();
  const files: any[] = data.files || [];

  return files.map(file => {
    const isFolder = file.mimeType === 'application/vnd.google-apps.folder';
    return {
      name: file.name || 'Untitled',
      size: isFolder ? 0 : parseInt(file.size || '0', 10),
      isDirectory: isFolder,
      isSymlink: false,
      lastModified: file.modifiedTime ? Date.parse(file.modifiedTime) : Date.now(),
      driveId: file.id,
      mimeType: file.mimeType || ''
    };
  }).sort((a, b) => {
    if (a.isDirectory && !b.isDirectory) return -1;
    if (!a.isDirectory && b.isDirectory) return 1;
    return a.name.localeCompare(b.name);
  });
}

// Create a folder in Google Drive
export async function createGDriveFolder(accessToken: string, parentFolderId: string, name: string): Promise<string> {
  const body = {
    name,
    mimeType: 'application/vnd.google-apps.folder',
    parents: [parentFolderId]
  };

  const res = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error?.message || 'Failed to create Google Drive directory');
  }

  const data = await res.json();
  return data.id;
}

// Create file metadata in Google Drive (pre-created or empty)
export async function createGDriveFileMetadata(accessToken: string, parentFolderId: string, name: string, mimeType = 'text/plain'): Promise<string> {
  const body = {
    name,
    mimeType,
    parents: [parentFolderId]
  };

  const res = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error?.message || 'Failed to create file entity on Google Drive');
  }

  const data = await res.json();
  return data.id;
}

// Update/upload raw content of a Google Drive file
export async function uploadGDriveFileContent(accessToken: string, fileId: string, content: string | Blob): Promise<void> {
  const res = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/octet-stream'
    },
    body: content
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error?.message || 'Failed to upload content to Google Drive');
  }
}

// Download content of a Google Drive file as text
export async function downloadGDriveFileAsText(accessToken: string, fileId: string): Promise<string> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!res.ok) {
    throw new Error(`Failed to download file from Google Drive: ${res.statusText}`);
  }

  return res.text();
}

// Download content of a Google Drive file as blob (ideal for transferring binaries)
export async function downloadGDriveFileAsBlob(accessToken: string, fileId: string): Promise<Blob> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!res.ok) {
    throw new Error(`Failed to download file binary from Google Drive: ${res.statusText}`);
  }

  return res.blob();
}

// Delete file or folder from Google Drive
export async function deleteGDriveItem(accessToken: string, fileId: string): Promise<void> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error?.message || 'Failed to delete item from Google Drive');
  }
}

// Rename Google Drive item
export async function renameGDriveItem(accessToken: string, fileId: string, newName: string): Promise<void> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ name: newName })
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error?.message || 'Failed to rename Google Drive item');
  }
}
