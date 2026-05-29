export type FileCategory = 'text' | 'image' | 'pdf' | 'video' | 'audio';

const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.ico', '.avif'];
const VIDEO_EXTS = ['.mp4', '.webm', '.mov'];
const AUDIO_EXTS = ['.mp3', '.wav', '.ogg'];

/** Decide how the viewer should render a file, based on its extension. */
export function classifyFile(name: string): FileCategory {
  const dot = name.lastIndexOf('.');
  const ext = dot >= 0 ? name.slice(dot).toLowerCase() : '';
  if (IMAGE_EXTS.includes(ext)) return 'image';
  if (ext === '.pdf') return 'pdf';
  if (VIDEO_EXTS.includes(ext)) return 'video';
  if (AUDIO_EXTS.includes(ext)) return 'audio';
  return 'text';
}
