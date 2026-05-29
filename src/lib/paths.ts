// Path helpers shared across the UI. Paths can be POSIX ("/home/x") or Windows
// ("C:\\Users\\x") depending on whether a pane is remote or local, so every
// helper detects the separator from the path itself rather than assuming one.

export type Separator = '/' | '\\';

/** Pick the separator a path uses. Defaults to "\\" only for clearly-Windows paths. */
export function separatorFor(p: string): Separator {
  return p.includes('/') ? '/' : '\\';
}

/** Join a directory and a child name without doubling the separator. */
export function joinPath(base: string, name: string): string {
  const sep = separatorFor(base);
  return base.endsWith(sep) ? base + name : base + sep + name;
}

/** Last path segment (file or folder name), ignoring any trailing separator. */
export function baseName(p: string): string {
  const trimmed = p.replace(/[\\/]+$/, '');
  const parts = trimmed.split(/[\\/]/);
  return parts[parts.length - 1] || p;
}

/**
 * Parent directory of a path. Mirrors the original "go up" behavior for both
 * POSIX and Windows roots (e.g. "/a" -> "/", "C:\\a" -> "C:\\").
 */
export function parentPath(p: string): string {
  if (p.startsWith('/')) {
    const parts = p.split('/').filter(Boolean);
    if (parts.length <= 1) return '/';
    parts.pop();
    return '/' + parts.join('/');
  }
  const parts = p.split('\\').filter(Boolean);
  if (parts.length > 1) {
    parts.pop();
    return parts.join('\\');
  }
  if (parts.length === 1) return parts[0] + '\\';
  return p;
}
