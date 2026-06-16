import express from "express";
import path from "path";
import fs from "fs";
import os from "os";
import { createServer as createViteServer } from "vite";
import { Client, SFTPWrapper } from "ssh2";
import { WebSocketServer, WebSocket } from "ws";
import * as pty from "node-pty";
import type { IncomingMessage } from "http";
import AdmZip from "adm-zip";
import * as tar from "tar";
import { shq, archiveBaseName, mimeForPath, MAX_TEXT_READ_BYTES, isFatalTransferError, fullySucceededSources, transferSummary } from "./server-utils.js";

const app = express();
const PORT = 3000;
// Bind to loopback by default so the local-filesystem + shell API is not
// reachable from the network. Set HOST=0.0.0.0 to deliberately expose it
// (only behind your own auth / on a trusted network).
const HOST = process.env.HOST || "127.0.0.1";

app.use(express.json({ limit: "50mb" }));

// When bound to loopback, reject requests whose Host header isn't localhost.
// This blocks DNS-rebinding (a malicious site resolving its domain to 127.0.0.1
// and driving the local API from your browser). Skipped when the operator has
// deliberately set HOST to something else (then their own network/auth applies).
const enforceLoopbackHost = HOST === "127.0.0.1" || HOST === "localhost" || HOST === "::1";
app.use((req, res, next) => {
  if (!enforceLoopbackHost) return next();
  const raw = (req.headers.host || "").toLowerCase();
  const ok =
    raw === "" ||
    /^localhost(:\d+)?$/.test(raw) ||
    /^127\.0\.0\.1(:\d+)?$/.test(raw) ||
    /^\[::1\](:\d+)?$/.test(raw) ||
    /^::1(:\d+)?$/.test(raw);
  if (ok) return next();
  res.status(403).json({ error: "Forbidden: unexpected Host header (possible DNS-rebinding attempt)." });
});

// Types
import { FileEntry, ConnectionProfile, OperationProgress } from "./src/types.js";

interface ActiveSSH {
  client: Client;
  sftp: SFTPWrapper;
  profile: ConnectionProfile;
}

// Memory Pools
const sshPool = new Map<string, ActiveSSH>();
const activeTransferJobs = new Map<string, OperationProgress & { cancelRequested?: boolean }>();

// SSH sessions are kept alive for as long as they stay actually connected. We do
// NOT cull sessions by wall-clock idle time — an idle-time reaper would force-
// close a live connection the user still has open (the cause of the "drops after
// a few minutes / 15 min" disconnect bug). Liveness and cleanup are handled by
// ssh2 keepalive (keepaliveCountMax closes a genuinely-dead peer -> client
// "close" -> pool delete), the client "close" handler, and the explicit
// /api/ssh/disconnect endpoint. (A truly abandoned-but-still-connected session
// lingers until the peer drops; acceptable for a single-user local tool.)

// Helper to check and retrieve active SSH session
function getSSHSession(connectionId: string): ActiveSSH {
  const session = sshPool.get(connectionId);
  if (!session) {
    throw new Error("SSH Connection has expired or does not exist. Please reconnect.");
  }
  return session;
}

// API Routes

// ---- 0. CONNECTION PROFILES (persisted, no secrets) ----

const PROFILES_DIR = path.join(os.homedir(), ".ssh-commander");
const PROFILES_FILE = path.join(PROFILES_DIR, "profiles.json");

function readProfiles(): any[] {
  try {
    if (!fs.existsSync(PROFILES_FILE)) return [];
    const raw = fs.readFileSync(PROFILES_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

app.get("/api/profiles", (_req, res) => {
  res.json({ profiles: readProfiles() });
});

app.put("/api/profiles", (req, res) => {
  try {
    const profiles = Array.isArray(req.body.profiles) ? req.body.profiles : [];
    // Strip any secrets defensively before writing to disk.
    const sanitized = profiles.map((p: any) => ({
      id: p.id,
      name: p.name,
      host: p.host,
      port: p.port,
      username: p.username,
      authType: p.authType === "key" ? "key" : "password",
      privateKeyPath: p.privateKeyPath || "",
    }));
    if (!fs.existsSync(PROFILES_DIR)) fs.mkdirSync(PROFILES_DIR, { recursive: true });
    fs.writeFileSync(PROFILES_FILE, JSON.stringify(sanitized, null, 2), "utf-8");
    res.json({ profiles: sanitized });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---- 1. LOCAL ACTIONS ----

app.get("/api/local/drives", (_req, res) => {
  if (process.platform !== "win32") {
    return res.json({ drives: ["/"] });
  }
  const drives: string[] = [];
  for (let c = 65; c <= 90; c++) {
    const letter = `${String.fromCharCode(c)}:\\`;
    try {
      if (fs.existsSync(letter)) drives.push(letter);
    } catch { /* skip unreadable */ }
  }
  res.json({ drives });
});

app.post("/api/local/list", async (req, res) => {
  try {
    const targetPath = (req.body.path as string) || process.cwd();
    const resolvedPath = path.resolve(targetPath);
    
    // Safety check - restrict to valid path strings
    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).json({ error: `Path "${resolvedPath}" does not exist` });
    }

    const dirEntries = await fs.promises.readdir(resolvedPath, { withFileTypes: true });
    const files: FileEntry[] = [];

    for (const entry of dirEntries) {
      try {
        const fullEntryPath = path.join(resolvedPath, entry.name);
        // Stats can throw if dangling symlink or no access
        const stats = await fs.promises.stat(fullEntryPath);
        files.push({
          name: entry.name,
          size: stats.size,
          isDirectory: entry.isDirectory(),
          isSymlink: entry.isSymbolicLink(),
          lastModified: stats.mtimeMs,
          permissions: (stats.mode & 0o777).toString(8),
        });
      } catch (statErr) {
        // Dangle link/broken stats fallback
        files.push({
          name: entry.name,
          size: 0,
          isDirectory: entry.isDirectory(),
          isSymlink: entry.isSymbolicLink(),
          lastModified: Date.now(),
        });
      }
    }

    // Sort folders first, then alphabetically
    files.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });

    res.json({ path: resolvedPath, files });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/local/read", async (req, res) => {
  try {
    const { path: filePath } = req.body;
    const resolved = path.resolve(filePath);

    // Open the file once and derive type, size, and content from the SAME
    // handle. Doing every check on the open fd (rather than re-statting the
    // path) closes the TOCTOU window where the file could be swapped between
    // a check and the read.
    let handle: fs.promises.FileHandle;
    try {
      handle = await fs.promises.open(resolved, "r");
    } catch (openErr: any) {
      // Opening a directory fails with EISDIR on some platforms (e.g. Windows).
      if (openErr?.code === "EISDIR") {
        return res.status(400).json({ error: "Target is a directory, cannot read as file" });
      }
      throw openErr;
    }
    try {
      const stat = await handle.stat();
      if (stat.isDirectory()) {
        return res.status(400).json({ error: "Target is a directory, cannot read as file" });
      }
      if (stat.size > MAX_TEXT_READ_BYTES) {
        return res.status(413).json({
          error: `File is too large to open as text (${Math.round(stat.size / 1048576)} MB; limit ${MAX_TEXT_READ_BYTES / 1048576} MB).`,
        });
      }
      const content = await handle.readFile("utf-8");
      res.json({ content });
    } finally {
      await handle.close();
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/local/write", async (req, res) => {
  try {
    const { path: filePath, content } = req.body;
    const resolved = path.resolve(filePath);
    
    await fs.promises.mkdir(path.dirname(resolved), { recursive: true });
    await fs.promises.writeFile(resolved, content, "utf-8");
    
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/local/mkdir", async (req, res) => {
  try {
    const { path: targetPath } = req.body;
    const resolved = path.resolve(targetPath);
    await fs.promises.mkdir(resolved, { recursive: true });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/local/delete", async (req, res) => {
  try {
    const { path: targetPath } = req.body;
    const resolved = path.resolve(targetPath);
    
    const stat = await fs.promises.stat(resolved);
    if (stat.isDirectory()) {
      await fs.promises.rm(resolved, { recursive: true, force: true });
    } else {
      await fs.promises.unlink(resolved);
    }
    
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/local/rename", async (req, res) => {
  try {
    const { oldPath, newPath } = req.body;
    const resolvedOld = path.resolve(oldPath);
    const resolvedNew = path.resolve(newPath);
    await fs.promises.rename(resolvedOld, resolvedNew);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/local/search", async (req, res) => {
  try {
    const { basePath, query } = req.body;
    if (!query) {
      return res.json({ results: [] });
    }
    const resolvedPath = path.resolve(basePath || process.cwd());
    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).json({ error: `Path "${resolvedPath}" does not exist` });
    }

    const matches: any[] = [];
    const normalizedQuery = query.toLowerCase();

    // High performance BFS or DFS recursive traversal with directory level cap of 5 to avoid out of memory
    async function scan(currentDir: string, depth: number) {
      if (depth > 6) return;
      try {
        const entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
        for (const entry of entries) {
          const entryPath = path.join(currentDir, entry.name);
          const isMatch = entry.name.toLowerCase().includes(normalizedQuery);
          
          let stat;
          try {
            stat = await fs.promises.stat(entryPath);
          } catch {
            // Bad symlink
          }

          if (isMatch) {
            matches.push({
              name: entry.name,
              path: entryPath,
              size: stat ? stat.size : 0,
              isDirectory: entry.isDirectory(),
              isSymlink: entry.isSymbolicLink(),
              lastModified: stat ? stat.mtimeMs : Date.now(),
              permissions: stat ? (stat.mode & 0o777).toString(8) : "000",
            });
          }

          if (entry.isDirectory() && !entry.isSymbolicLink()) {
            await scan(entryPath, depth + 1);
          }
        }
      } catch (err) {
        // Skip restricted directories
      }
    }

    await scan(resolvedPath, 0);
    res.json({ results: matches });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


// ---- ARCHIVE: compress / extract (.zip and .tar.gz) ----

app.post("/api/local/compress", async (req, res) => {
  try {
    const { basePath, entries, archiveName, format } = req.body as
      { basePath: string; entries: string[]; archiveName: string; format: "zip" | "targz" };
    const base = path.resolve(basePath);
    const list = (entries || []).filter(Boolean);
    if (list.length === 0) return res.status(400).json({ error: "No items selected to compress" });
    const outPath = path.join(base, archiveName);

    if (format === "targz") {
      await tar.create({ gzip: true, file: outPath, cwd: base }, list);
    } else {
      const zip = new AdmZip();
      for (const name of list) {
        const full = path.join(base, name);
        const st = await fs.promises.stat(full);
        if (st.isDirectory()) zip.addLocalFolder(full, name);
        else zip.addLocalFile(full);
      }
      zip.writeZip(outPath);
    }
    res.json({ success: true, archive: outPath });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/local/extract", async (req, res) => {
  try {
    const { archivePath } = req.body as { archivePath: string };
    const archive = path.resolve(archivePath);
    const dir = path.dirname(archive);
    const dest = path.join(dir, archiveBaseName(path.basename(archive)));
    await fs.promises.mkdir(dest, { recursive: true });

    if (/\.(tar\.gz|tgz)$/i.test(archive)) {
      await tar.extract({ file: archive, cwd: dest });
    } else if (/\.zip$/i.test(archive)) {
      new AdmZip(archive).extractAllTo(dest, true);
    } else {
      return res.status(400).json({ error: "Unsupported archive type (use .zip or .tar.gz)" });
    }
    res.json({ success: true, dest });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

function runRemote(connectionId: string, cmd: string, res: express.Response) {
  let session;
  try {
    session = getSSHSession(connectionId);
  } catch (e: any) {
    return res.status(401).json({ error: e.message });
  }
  session.client.exec(cmd, (err, stream) => {
    if (err) return res.status(500).json({ error: err.message });
    let stderr = "";
    stream.on("data", () => {});
    stream.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
    stream.on("close", (code: number) => {
      if (code === 0) res.json({ success: true });
      else res.status(500).json({ error: stderr.trim() || `Process exited with code ${code}` });
    });
  });
}

app.post("/api/ssh/compress", (req, res) => {
  const { connectionId, basePath, entries, archiveName, format } = req.body as
    { connectionId: string; basePath: string; entries: string[]; archiveName: string; format: "zip" | "targz" };
  const list = (entries || []).filter(Boolean);
  if (list.length === 0) return res.status(400).json({ error: "No items selected to compress" });
  const items = list.map(shq).join(" ");
  const cmd = format === "targz"
    ? `cd ${shq(basePath)} && tar -czf ${shq(archiveName)} ${items}`
    : `cd ${shq(basePath)} && zip -r ${shq(archiveName)} ${items}`;
  runRemote(connectionId, cmd, res);
});

app.post("/api/ssh/extract", (req, res) => {
  const { connectionId, archivePath } = req.body as { connectionId: string; archivePath: string };
  const slash = archivePath.lastIndexOf("/");
  const dir = slash >= 0 ? archivePath.slice(0, slash) || "/" : ".";
  const baseName = slash >= 0 ? archivePath.slice(slash + 1) : archivePath;
  const dest = `${dir.replace(/\/$/, "")}/${archiveBaseName(baseName)}`;
  const isTar = /\.(tar\.gz|tgz)$/i.test(baseName);
  const cmd = isTar
    ? `mkdir -p ${shq(dest)} && tar -xzf ${shq(archivePath)} -C ${shq(dest)}`
    : `mkdir -p ${shq(dest)} && unzip -o ${shq(archivePath)} -d ${shq(dest)}`;
  runRemote(connectionId, cmd, res);
});


// ---- 2. SSH / SFTP PROXIES ----

app.post("/api/ssh/connect", (req, res) => {
  const profile = req.body.profile as ConnectionProfile;
  if (!profile || !profile.host || !profile.username) {
    return res.status(400).json({ error: "Missing SSH connection profile detail" });
  }

  const connId = `ssh_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const client = new Client();

  client.on("ready", () => {
    client.sftp((err, sftp) => {
      if (err) {
        client.end();
        return res.status(500).json({ error: `SFTP subsystem initiation failed: ${err.message}` });
      }

      // Store in SSH session pool
      sshPool.set(connId, {
        client,
        sftp,
        profile,
      });

      // Resolve the session's starting directory (the user's home on most
      // servers). SFTP is not a shell, so "~" is often taken literally —
      // realpath(".") is the canonical way to get the absolute home path.
      sftp.realpath(".", (realPathErr, homePath) => {
        if (realPathErr || !homePath) {
          res.json({ connectionId: connId, homePath: "/" }); // Should be rare
        } else {
          res.json({ connectionId: connId, homePath });
        }
      });
    });
  });

  client.on("error", (err) => {
    console.error(`SSH client error for connection ${connId}:`, err);
    sshPool.delete(connId);
    if (!res.headersSent) {
      res.status(500).json({ error: `SSH Connection failed: ${err.message}` });
    }
  });

  client.on("close", () => {
    console.log(`SSH Connection ${connId} closed`);
    sshPool.delete(connId);
  });

  const connectionOpts: any = {
    host: profile.host,
    port: profile.port || 22,
    username: profile.username,
  };

  if (profile.authType === "key" || profile.privateKeyPath || profile.privateKey) {
    let keyMaterial = profile.privateKey;
    if (profile.privateKeyPath) {
      try {
        const resolvedKeyPath = profile.privateKeyPath.startsWith("~")
          ? path.join(os.homedir(), profile.privateKeyPath.slice(1))
          : profile.privateKeyPath;
        keyMaterial = fs.readFileSync(resolvedKeyPath, "utf-8");
      } catch (keyErr: any) {
        return res.status(400).json({ error: `Could not read private key file: ${keyErr.message}` });
      }
    }
    if (!keyMaterial) {
      return res.status(400).json({ error: "Key authentication selected but no key file path was provided." });
    }
    connectionOpts.privateKey = keyMaterial;
    if (profile.passphrase) connectionOpts.passphrase = profile.passphrase;
  } else if (profile.password) {
    connectionOpts.password = profile.password;
  } else {
    return res.status(400).json({ error: "Either a password or private SSH key is required." });
  }

  // Set timeout of 15 seconds
  connectionOpts.readyTimeout = 15000;

  // Keep the SSH channel alive across idle periods. Without this, a NAT/firewall
  // or server idle timeout silently drops the socket after a few minutes and the
  // session resets to local-drive selection. ssh2 sends a keepalive every 15s and
  // only treats the peer as dead after 4 unanswered ones (~60s).
  connectionOpts.keepaliveInterval = 15000;
  connectionOpts.keepaliveCountMax = 4;

  try {
    client.connect(connectionOpts);
  } catch (connectErr: any) {
    res.status(500).json({ error: `SSH initiation failed on client.connect(): ${connectErr.message}` });
  }
});

app.post("/api/ssh/list", (req, res) => {
  try {
    const { connectionId, path: remotePath } = req.body;
    const { sftp } = getSSHSession(connectionId);

    const resolvedPath = remotePath || ".";

    sftp.readdir(resolvedPath, (err, list) => {
      if (err) {
        return res.status(500).json({ error: `SFTP scan failed: ${err.message}` });
      }

      const files: FileEntry[] = list.map((item) => {
        const isDir = (item.attrs.mode & 0o170000) === 0o040000; // directory bitmask
        const isSym = (item.attrs.mode & 0o170000) === 0o120000; // symlink bitmask
        return {
          name: item.filename,
          size: item.attrs.size,
          isDirectory: isDir,
          isSymlink: isSym,
          lastModified: (item.attrs.mtime || Date.now() / 1000) * 1000,
          permissions: (item.attrs.mode & 0o777).toString(8),
        };
      });

      // Filter and sort "." and ".." if present, though sftp lists them
      const sortedFiles = files
        .filter(f => f.name !== "." && f.name !== "..")
        .sort((a, b) => {
          if (a.isDirectory && !b.isDirectory) return -1;
          if (!a.isDirectory && b.isDirectory) return 1;
          return a.name.localeCompare(b.name);
        });

      res.json({ files: sortedFiles });
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/ssh/read", (req, res) => {
  try {
    const { connectionId, path: filePath } = req.body;
    const { sftp } = getSSHSession(connectionId);

    // Probe size first so we don't pull a huge/binary file into the heap.
    sftp.stat(filePath, (statErr, stats) => {
      if (statErr) {
        return res.status(500).json({ error: `SFTP read failed: ${statErr.message}` });
      }
      if (stats.size > MAX_TEXT_READ_BYTES) {
        return res.status(413).json({
          error: `File is too large to open as text (${Math.round(stats.size / 1048576)} MB; limit ${MAX_TEXT_READ_BYTES / 1048576} MB).`,
        });
      }
      sftp.readFile(filePath, "utf-8", (err, data) => {
        if (err) {
          return res.status(500).json({ error: `SFTP read failed: ${err.message}` });
        }
        res.json({ content: data });
      });
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Raw byte streaming for binary previews (images, PDFs, etc.).
// GET so it can be used directly as an <img>/<iframe> src.
app.get("/api/raw", (req, res) => {
  try {
    const type = String(req.query.type || "local");
    const filePath = String(req.query.path || "");
    if (!filePath) return res.status(400).json({ error: "Missing path" });
    res.setHeader("Content-Type", mimeForPath(filePath));

    if (type === "remote") {
      const connectionId = String(req.query.connectionId || "");
      const { sftp } = getSSHSession(connectionId);
      const stream = sftp.createReadStream(filePath);
      stream.on("error", (err: any) => {
        if (!res.headersSent) res.status(500).json({ error: err.message });
        else res.end();
      });
      stream.pipe(res);
    } else {
      const resolved = path.resolve(filePath);
      const stream = fs.createReadStream(resolved);
      stream.on("error", (err: any) => {
        if (!res.headersSent) res.status(500).json({ error: err.message });
        else res.end();
      });
      stream.pipe(res);
    }
  } catch (err: any) {
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

app.post("/api/ssh/write", (req, res) => {
  try {
    const { connectionId, path: filePath, content } = req.body;
    const { sftp } = getSSHSession(connectionId);

    sftp.writeFile(filePath, content, "utf-8", (err) => {
      if (err) {
        return res.status(500).json({ error: `SFTP write failed: ${err.message}` });
      }
      res.json({ success: true });
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/ssh/mkdir", (req, res) => {
  try {
    const { connectionId, path: remotePath } = req.body;
    const { sftp } = getSSHSession(connectionId);

    sftp.mkdir(remotePath, (err) => {
      if (err) {
        return res.status(500).json({ error: `SFTP mkdir failed: ${err.message}` });
      }
      res.json({ success: true });
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/ssh/delete", (req, res) => {
  try {
    const { connectionId, path: remotePath } = req.body;
    const { client, sftp } = getSSHSession(connectionId);

    // To prevent tedious recursive files removal via multiple SFTP queries,
    // we fallback to executing rm -rf directly on ssh channel which is extremely solid and instantaneous.
    // If the server blocks shell commands or user prefers SFTP, we can try SFTP as safe backup.
    client.exec(`rm -rf ${shq(remotePath)}`, (err, stream) => {
      if (err) {
        // Fallback to basic sftp deletion of a singular file
        sftp.unlink(remotePath, (unlinkErr) => {
          if (unlinkErr) {
            sftp.rmdir(remotePath, (rmdirErr) => {
              if (rmdirErr) {
                return res.status(500).json({ error: `Failed to delete remote item: ${rmdirErr.message}` });
              }
              res.json({ success: true });
            });
          } else {
            res.json({ success: true });
          }
        });
      } else {
        stream.on("close", (code: number) => {
          if (code !== 0) {
            // Unlink as reliable fallback
            sftp.unlink(remotePath, (unlinkErr) => {
              if (unlinkErr) {
                return res.status(500).json({ error: "Failed to delete remote selection" });
              }
              res.json({ success: true });
            });
          } else {
            res.json({ success: true });
          }
        });
        stream.stderr.resume();
        stream.resume();
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/ssh/rename", (req, res) => {
  try {
    const { connectionId, oldPath, newPath } = req.body;
    const { sftp } = getSSHSession(connectionId);

    sftp.rename(oldPath, newPath, (err) => {
      if (err) {
        return res.status(500).json({ error: `SFTP move/rename failed: ${err.message}` });
      }
      res.json({ success: true });
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/ssh/disconnect", (req, res) => {
  try {
    const { connectionId } = req.body;
    const active = sshPool.get(connectionId);
    if (active) {
      active.client.end();
      sshPool.delete(connectionId);
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/ssh/search", (req, res) => {
  try {
    const { connectionId, basePath, query } = req.body;
    if (!query) {
      return res.json({ results: [] });
    }
    const { client, sftp } = getSSHSession(connectionId);
    
    const targetPath = basePath || ".";

    // We try 'find' command if supported by target platform, else we fallback to scanning with SFTP.
    // Both args go through shq; the glob is built as a literal arg so `find -name` does the matching.
    client.exec(`find ${shq(targetPath)} -name ${shq("*" + query + "*")} -printf "%p\\t%s\\t%y\\t%T@\\t%m\\n" 2>/dev/null`, (err, stream) => {
      if (err) {
        runSFTPSearch(sftp, targetPath, query, res);
      } else {
        let stdout = "";
        let stderr = "";
        stream.on("data", (data: any) => {
          stdout += data.toString();
        });
        stream.stderr.on("data", (data: any) => {
          stderr += data.toString();
        });
        stream.on("close", (code: number) => {
          if (code !== 0 || !stdout.trim()) {
            runSFTPSearch(sftp, targetPath, query, res);
          } else {
            const lines = stdout.split("\n").filter(Boolean);
            const results = lines.map(line => {
              const parts = line.split("\t");
              if (parts.length < 5) return null;
              const filepath = parts[0];
              const name = path.basename(filepath);
              const size = parseInt(parts[1], 10) || 0;
              const typeChar = parts[2]; // 'd' (directory), 'f' (file), 'l' (symlink)
              const lastModSec = parseFloat(parts[3]) || (Date.now() / 1000);
              const permsOctal = parts[4] ? parseInt(parts[4], 10).toString(8) : "644";
              
              return {
                name,
                path: filepath,
                size,
                isDirectory: typeChar === "d",
                isSymlink: typeChar === "l",
                lastModified: lastModSec * 1000,
                permissions: permsOctal,
              };
            }).filter(Boolean);
            
            res.json({ results });
          }
        });
        stream.stderr.resume();
        stream.resume();
      }
    });

  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

function runSFTPSearch(sftp: any, basePath: string, query: string, res: any) {
  const matches: any[] = [];
  const normalizedQuery = query.toLowerCase();
  let finished = false;

  async function scan(currentPath: string, depth: number) {
    if (finished || depth > 5) return;
    try {
      const items: any[] = await new Promise((resolve, reject) => {
        sftp.readdir(currentPath, (err: any, list: any) => {
          if (err) reject(err);
          else resolve(list || []);
        });
      });

      for (const item of items) {
        if (item.filename === "." || item.filename === "..") continue;
        const fullPath = path.join(currentPath, item.filename).replace(/\\/g, "/");
        const isDir = (item.attrs.mode & 0o170000) === 0o040000;
        const isSym = (item.attrs.mode & 0o170000) === 0o120000;

        if (item.filename.toLowerCase().includes(normalizedQuery)) {
          matches.push({
            name: item.filename,
            path: fullPath,
            size: item.attrs.size,
            isDirectory: isDir,
            isSymlink: isSym,
            lastModified: (item.attrs.mtime || Date.now() / 1000) * 1000,
            permissions: (item.attrs.mode & 0o777).toString(8),
          });
        }

        if (isDir && !isSym) {
          await scan(fullPath, depth + 1);
        }
      }
    } catch (err) {
      // Ignore directory read errors due to subfolder permissions
    }
  }

  scan(basePath, 0)
    .then(() => {
      finished = true;
      res.json({ results: matches });
    })
    .catch((err) => {
      finished = true;
      res.status(500).json({ error: err.message });
    });
}


// ---- 3. ADVANCED PERSISTENT TRANSFER CONTROLLER (Background Processing) ----

interface TransferEndpoint {
  type: "local" | "remote";
  path: string;
  paths?: string[];
  connectionId?: string;
}

app.post("/api/transfer", async (req, res) => {
  const source = req.body.source as TransferEndpoint;
  const target = req.body.target as TransferEndpoint;
  const move = req.body.move === true;

  if (!source || !target) {
    return res.status(400).json({ error: "Missing source or target description" });
  }

  const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  // Set initial empty job progress
  activeTransferJobs.set(jobId, {
    active: true,
    title: `${move ? "Moving" : "Copying"} from ${source.type} to ${target.type}...`,
    percentage: 0,
    currentItem: "Evaluating paths...",
    bytesTransferred: 0,
    totalBytes: 0,
  });

  // Start background async transfer execution instantly without blocking HTTP response
  executeBackgroundTransfer(jobId, source, target, move).catch((err) => {
    console.error(`Transfer background job ${jobId} failed completely:`, err);
    activeTransferJobs.set(jobId, {
      active: false,
      title: "Job Failed",
      percentage: 100,
      currentItem: `Critical Error: ${err.message}`,
      bytesTransferred: 0,
      totalBytes: 0,
    });
  });

  res.json({ jobId });
});

app.get("/api/transfer/status/:jobId", (req, res) => {
  const job = activeTransferJobs.get(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: "No such transfer job active" });
  }
  res.json(job);
});

app.post("/api/transfer/cancel/:jobId", (req, res) => {
  const job = activeTransferJobs.get(req.params.jobId);
  if (job) {
    job.cancelRequested = true;
    job.currentItem = "Cancellation requested...";
  }
  res.json({ success: true });
});


// Best-effort recursive mkdir over SFTP. mkdir errors (e.g. "already exists")
// are intentionally ignored so existing parent dirs don't abort a transfer.
function sftpMkdirP(sftp: SFTPWrapper, dirPath: string): Promise<void> {
  const parts = dirPath.split("/").filter(Boolean);
  let current = dirPath.startsWith("/") ? "/" : "";
  return (async () => {
    for (const item of parts) {
      current = path.join(current, item).replace(/\\/g, "/");
      await new Promise<void>((resolve) => sftp.mkdir(current, () => resolve()));
    }
  })();
}

// Recursive background implementation parameters
async function executeBackgroundTransfer(jobId: string, source: TransferEndpoint, target: TransferEndpoint, move: boolean = false) {
  const progress = activeTransferJobs.get(jobId);
  if (!progress) return;

  const updateProgress = (currentItem: string, percentage: number, bytes: number = 0) => {
    const freshRef = activeTransferJobs.get(jobId);
    if (!freshRef) return;
    freshRef.currentItem = currentItem;
    freshRef.percentage = percentage;
    if (bytes > 0) freshRef.bytesTransferred = bytes;
  };

  const checkCancellation = () => {
    const freshRef = activeTransferJobs.get(jobId);
    if (freshRef?.cancelRequested) {
      throw new Error("OPERATION_CANCELLED");
    }
  };

  try {
    // Stage 1: Stat source nodes
    const entriesToCopy: { relPath: string; absoluteSource: string; size: number; isSymlink?: boolean }[] = [];

    // Fetch information recursively first to gather full count + sizes
    updateProgress("Calculating contents...", 1);

    const activePaths = source.paths && source.paths.length > 0 ? source.paths : [source.path];

    // For a move, the original source items are deleted only after the copy of
    // all entries has fully succeeded (so a failed/cancelled copy never loses data).
    const deleteSourcePaths = async (pathsToDelete: string[]) => {
      for (const original of pathsToDelete) {
        if (source.type === "local") {
          await fs.promises.rm(path.resolve(original), { recursive: true, force: true });
        } else {
          const { client } = getSSHSession(source.connectionId!);
          await new Promise<void>((resolve, reject) => {
            client.exec(`rm -rf ${shq(original)}`, (err, stream) => {
              if (err) return reject(err);
              stream.on("close", (code: number) =>
                code === 0 ? resolve() : reject(new Error(`Remote rm exited with code ${code}`)));
              stream.stderr.resume();
              stream.resume();
            });
          });
        }
      }
    };

    for (const srcPath of activePaths) {
      checkCancellation();
      const resolvedSrcPath = srcPath;

      if (source.type === "local") {
        const resolvedPath = path.resolve(resolvedSrcPath);
        const srcStat = await fs.promises.stat(resolvedPath);
        const srcIsDirectory = srcStat.isDirectory();

        if (srcIsDirectory) {
          const scanDirRecursive = async (currDir: string) => {
            checkCancellation();
            const items = await fs.promises.readdir(currDir, { withFileTypes: true });
            for (const item of items) {
              const absolutePath = path.join(currDir, item.name);
              const relPath = path.relative(path.dirname(resolvedPath), absolutePath);
              if (item.isDirectory()) {
                await scanDirRecursive(absolutePath);
              } else {
                // Guard the stat so a broken symlink (or unreadable file) doesn't
                // abort the whole scan — push it anyway and let the copy loop record
                // it as a per-file failure.
                const isSym = item.isSymbolicLink();
                let size = 0;
                try { size = (await fs.promises.stat(absolutePath)).size; } catch { /* broken/unreadable */ }
                entriesToCopy.push({
                  relPath,
                  absoluteSource: absolutePath,
                  size,
                  isSymlink: isSym,
                });
              }
            }
          };
          await scanDirRecursive(resolvedPath);
        } else {
          entriesToCopy.push({
            relPath: path.basename(resolvedPath),
            absoluteSource: resolvedPath,
            size: srcStat.size,
          });
        }
      } else {
        // Remote source
        const { sftp } = getSSHSession(source.connectionId!);
        
        const remoteStatPromise = () => new Promise<any>((resolve, reject) => {
          sftp.stat(resolvedSrcPath, (err, stats) => {
            if (err) reject(err);
            else resolve(stats);
          });
        });

        const srcStats = await remoteStatPromise();
        const srcIsDirectory = (srcStats.mode & 0o170000) === 0o040000;

        if (srcIsDirectory) {
          const scanRemoteRecursive = async (currPath: string) => {
            checkCancellation();
            const items = await new Promise<any[]>((resolve, reject) => {
              sftp.readdir(currPath, (err, list) => {
                if (err) reject(err);
                else resolve(list || []);
              });
            });

            for (const item of items) {
              if (item.filename === "." || item.filename === "..") continue;
              const absolutePath = path.join(currPath, item.filename).replace(/\\/g, "/");
              const relPath = path.relative(path.dirname(resolvedSrcPath), absolutePath).replace(/\\/g, "/");
              const itemIsDir = (item.attrs.mode & 0o170000) === 0o040000;
              const itemIsSym = (item.attrs.mode & 0o170000) === 0o120000;

              if (itemIsDir) {
                await scanRemoteRecursive(absolutePath);
              } else {
                entriesToCopy.push({
                  relPath,
                  absoluteSource: absolutePath,
                  size: item.attrs.size,
                  isSymlink: itemIsSym,
                });
              }
            }
          };
          await scanRemoteRecursive(resolvedSrcPath);
        } else {
          entriesToCopy.push({
            relPath: path.basename(resolvedSrcPath),
            absoluteSource: resolvedSrcPath,
            size: srcStats.size,
          });
        }
      }
    }

    if (entriesToCopy.length === 0) {
      // Create empty folders directly
      for (const p of activePaths) {
        if (source.type === "local") {
          const resolvedP = path.resolve(p);
          const srcStat = await fs.promises.stat(resolvedP);
          if (srcStat.isDirectory()) {
            const targetDir = path.join(target.path, path.basename(resolvedP));
            await fs.promises.mkdir(path.resolve(targetDir), { recursive: true });
          }
        } else {
          const { sftp } = getSSHSession(source.connectionId!);
          const stats = await new Promise<any>((resolve, reject) => {
            sftp.stat(p, (err, s) => {
              if (err) reject(err);
              else resolve(s);
            });
          });
          const srcIsDirectory = (stats.mode & 0o170000) === 0o040000;
          if (srcIsDirectory) {
            const targetDir = path.join(target.path, path.basename(p));
            if (target.type === "local") {
              await fs.promises.mkdir(path.resolve(targetDir), { recursive: true });
            } else {
              const { sftp: targetSftp } = getSSHSession(target.connectionId!);
              await new Promise<void>((resolve, reject) => {
                targetSftp.mkdir(targetDir.replace(/\\/g, "/"), (err) => {
                  resolve();
                });
              });
            }
          }
        }
      }
      
      if (move) await deleteSourcePaths(activePaths);
      activeTransferJobs.set(jobId, {
        active: false,
        title: "Successfully Completed",
        percentage: 100,
        currentItem: "Task finished. Left/right panes successfully refreshed.",
        bytesTransferred: 0,
        totalBytes: 0,
      });
      return;
    }

    // Set totals
    const totalBytes = entriesToCopy.reduce((sum, item) => sum + item.size, 0);
    progress.totalBytes = totalBytes;
    let bytesAccumulated = 0;

    // Per-file failures are collected so one bad file (unreadable, or a name
    // illegal on the target OS) can't abort the whole batch. See the catch below.
    const failures: { relPath: string; reason: string }[] = [];

    // Stage 2: Begin Copier loops
    for (let index = 0; index < entriesToCopy.length; index++) {
      checkCancellation();
      const entry = entriesToCopy[index];
      const targetAbsPath = path.join(target.path, entry.relPath).replace(/\\/g, "/");
      const percentageDone = Math.round((bytesAccumulated / (totalBytes || 1)) * 100);

      updateProgress(`Copying ${entry.relPath} (${index + 1}/${entriesToCopy.length})`, percentageDone, bytesAccumulated);

      try {
      // Branch out to the 4 copying permutations
      if (source.type === "local" && target.type === "local") {
        // LOCAL TO LOCAL
        const dstDir = path.dirname(targetAbsPath);
        await fs.promises.mkdir(dstDir, { recursive: true });
        
        // Use streams to allow progress increments
        await new Promise<void>((resolve, reject) => {
          const rStream = fs.createReadStream(entry.absoluteSource);
          const wStream = fs.createWriteStream(targetAbsPath);
          
          rStream.on("data", (chunk) => {
            bytesAccumulated += chunk.length;
            updateProgress(`Copying ${entry.relPath}`, Math.round((bytesAccumulated / totalBytes) * 100), bytesAccumulated);
          });
          rStream.on("error", reject);
          wStream.on("error", reject);
          wStream.on("finish", () => resolve());
          rStream.pipe(wStream);
        });

      } else if (source.type === "local" && target.type === "remote") {
        // LOCAL TO REMOTE (UPLOAD)
        const { sftp } = getSSHSession(target.connectionId!);
        const dstDir = path.dirname(targetAbsPath);

        await sftpMkdirP(sftp, dstDir);

        await new Promise<void>((resolve, reject) => {
          const localReadStream = fs.createReadStream(entry.absoluteSource);
          const remoteWriteStream = sftp.createWriteStream(targetAbsPath);

          localReadStream.on("data", (chunk) => {
            bytesAccumulated += chunk.length;
            updateProgress(`Uploading ${entry.relPath}`, Math.round((bytesAccumulated / totalBytes) * 100), bytesAccumulated);
          });

          localReadStream.on("error", reject);
          remoteWriteStream.on("error", reject);
          // ssh2 SFTP write streams reliably emit "close" on completion;
          // "finish" is kept as a fallback. resolve() is idempotent.
          remoteWriteStream.on("close", () => resolve());
          remoteWriteStream.on("finish", () => resolve());
          localReadStream.pipe(remoteWriteStream);
        });

      } else if (source.type === "remote" && target.type === "local") {
        // REMOTE TO LOCAL (DOWNLOAD)
        const { sftp } = getSSHSession(source.connectionId!);
        const dstDir = path.dirname(targetAbsPath);
        await fs.promises.mkdir(dstDir, { recursive: true });

        await new Promise<void>((resolve, reject) => {
          const remoteReadStream = sftp.createReadStream(entry.absoluteSource);
          const localWriteStream = fs.createWriteStream(targetAbsPath);

          remoteReadStream.on("data", (chunk: Buffer) => {
            bytesAccumulated += chunk.length;
            updateProgress(`Downloading ${entry.relPath}`, Math.round((bytesAccumulated / totalBytes) * 100), bytesAccumulated);
          });

          remoteReadStream.on("error", reject);
          localWriteStream.on("error", reject);
          localWriteStream.on("finish", () => resolve());
          remoteReadStream.pipe(localWriteStream);
        });

      } else if (source.type === "remote" && target.type === "remote") {
        // REMOTE TO REMOTE
        // If they come from same source.connectionId to same target.connectionId, we can use ssh cp or direct streams
        if (source.connectionId === target.connectionId) {
          const { client } = getSSHSession(source.connectionId!);
          
          await new Promise<void>((resolve, reject) => {
            // Replaces path to destination recursively
            const remoteFolderParent = path.dirname(targetAbsPath);
            client.exec(`mkdir -p ${shq(remoteFolderParent)} && cp -r ${shq(entry.absoluteSource)} ${shq(targetAbsPath)}`, (err, stream) => {
              if (err) reject(err);
              else {
                stream.on("close", (code: number) => {
                  if (code === 0) {
                    bytesAccumulated += entry.size;
                    resolve();
                  } else {
                    reject(new Error(`Remote side returned non-zero code (${code}) during copying.`));
                  }
                });
                stream.stderr.resume();
                stream.resume();
              }
            });
          });
        } else {
          // Different SSH servers, requires pipe transfer through server memory
          const { sftp: sftpSrc } = getSSHSession(source.connectionId!);
          const { sftp: sftpDst } = getSSHSession(target.connectionId!);

          const dstDir = path.dirname(targetAbsPath);

          // Build directories
          await sftpMkdirP(sftpDst, dstDir);

          await new Promise<void>((resolve, reject) => {
            const srcStream = sftpSrc.createReadStream(entry.absoluteSource);
            const dstStream = sftpDst.createWriteStream(targetAbsPath);

            srcStream.on("data", (chunk: Buffer) => {
              bytesAccumulated += chunk.length;
              updateProgress(`Piping remote -> remote: ${entry.relPath}`, Math.round((bytesAccumulated / totalBytes) * 100), bytesAccumulated);
            });

            srcStream.on("error", reject);
            dstStream.on("error", reject);
            // ssh2 SFTP write streams reliably emit "close"; "finish" fallback.
            dstStream.on("close", () => resolve());
            dstStream.on("finish", () => resolve());
            srcStream.pipe(dstStream);
          });
        }
      }
      } catch (entryErr: any) {
        const rawReason = entryErr?.message || String(entryErr);
        // Whole-job aborts (NOT per-file failures): a user cancel, or the SSH
        // session dropping/expiring mid-batch — rethrow so the job fails honestly
        // instead of recording every remaining file as a bogus per-file failure.
        if (isFatalTransferError(rawReason)) throw entryErr;
        // One file failed (a broken symlink, an unreadable file, or a name legal
        // on the source OS but illegal on the destination). Record it and keep
        // going so a single bad file can't abort the whole folder transfer.
        const reason = entry.isSymlink ? `broken symlink (${rawReason})` : rawReason;
        failures.push({ relPath: entry.relPath, reason });
      }
    }

    if (move) {
      // Delete only the source paths whose every file copied; any source with a
      // failed file under it is kept, so a move can never lose a file that didn't
      // make it across (see fullySucceededSources).
      const sourcesToDelete = fullySucceededSources(activePaths, failures);
      if (sourcesToDelete.length > 0) {
        updateProgress("Removing source items (move)...", 100, totalBytes);
        await deleteSourcePaths(sourcesToDelete);
      }
      if (sourcesToDelete.length < activePaths.length) {
        updateProgress(`Kept ${activePaths.length - sourcesToDelete.length} source(s) with failed files.`, 100, totalBytes);
      }
    }

    // Mark job done — surface any per-file failures instead of hiding them.
    const summary = transferSummary({ total: entriesToCopy.length, failures, move });
    activeTransferJobs.set(jobId, {
      active: false,
      title: summary.title,
      percentage: 100,
      currentItem: summary.currentItem,
      bytesTransferred: failures.length === 0 ? totalBytes : bytesAccumulated,
      totalBytes,
    });

  } catch (err: any) {
    console.error(`Error during copying worker in ${jobId}:`, err);
    activeTransferJobs.set(jobId, {
      active: false,
      title: err.message === "OPERATION_CANCELLED" ? "Job Cancelled" : "Error Occurred",
      percentage: 100,
      currentItem: err.message === "OPERATION_CANCELLED" ? "Operation cancelled of client-side choice." : `Failed: ${err.message}`,
      bytesTransferred: 0,
      totalBytes: 0,
    });
  }
}

app.post("/api/terminal/exec", async (req, res) => {
  try {
    const { type, connectionId, cmd, cwd } = req.body;
    
    if (!cmd) {
      return res.json({ stdout: "", stderr: "", code: 0 });
    }

    if (type === "remote") {
      let session;
      try {
        session = getSSHSession(connectionId);
      } catch (sessErr: any) {
        return res.status(401).json({ error: sessErr.message });
      }

      const { client } = session;
      // cwd is escaped; cmd is the user's literal terminal input and is meant
      // to be interpreted by the remote shell, so it stays raw by design.
      const fullCmd = `cd ${shq(cwd || ".")} && ${cmd}`;

      client.exec(fullCmd, (err, stream) => {
        if (err) {
          return res.status(500).json({ error: `SSH execution error: ${err.message}` });
        }
        let stdout = "";
        let stderr = "";
        stream.on("data", (data: any) => {
          stdout += data.toString();
        });
        stream.stderr.on("data", (data: any) => {
          stderr += data.toString();
        });
        stream.on("close", (code: number) => {
          res.json({ stdout, stderr, code: code ?? 0 });
        });
      });
    } else {
      const { exec: localExec } = await import("child_process");
      const localCwd = cwd ? path.resolve(cwd) : process.cwd();

      localExec(cmd, { cwd: localCwd }, (err, stdout, stderr) => {
        const code = err ? (err.code ?? 1) : 0;
        res.json({
          stdout: stdout.toString(),
          stderr: stderr ? stderr.toString() : (err ? err.message : ""),
          code
        });
      });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


// ---- INTERACTIVE PTY OVER WEBSOCKET ----

function resolveLocalShell(shell: string): { file: string; args: string[] } {
  if (process.platform === "win32") {
    switch (shell) {
      case "cmd": return { file: "cmd.exe", args: [] };
      case "pwsh": return { file: "pwsh.exe", args: ["-NoLogo"] };
      case "bash": return { file: "bash.exe", args: [] };
      case "powershell":
      default: return { file: "powershell.exe", args: ["-NoLogo"] };
    }
  }
  // POSIX
  switch (shell) {
    case "bash": return { file: "/bin/bash", args: [] };
    case "sh": return { file: "/bin/sh", args: [] };
    default: return { file: process.env.SHELL || "/bin/bash", args: [] };
  }
}

// Reject cross-site WebSocket upgrades. A browser always sends Origin, so we
// only allow same-machine origins; absent Origin (non-browser clients) is fine.
function isAllowedOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const host = new URL(origin).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

function attachPtyWebSocket(server: import("http").Server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req: IncomingMessage, socket, head) => {
    const url = new URL(req.url || "", "http://localhost");
    // Only handle our PTY path; let everything else (e.g. Vite HMR) pass.
    if (url.pathname !== "/api/pty") return;
    if (!isAllowedOrigin(req)) {
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url || "", "http://localhost");
    const type = url.searchParams.get("type") || "local";
    const cwd = url.searchParams.get("cwd") || process.cwd();
    const shell = url.searchParams.get("shell") || "";
    const initialCommand = url.searchParams.get("cmd") || "";

    if (type === "remote") {
      const connectionId = url.searchParams.get("connectionId") || "";
      let session;
      try {
        session = getSSHSession(connectionId);
      } catch (e: any) {
        ws.send(`\r\n[connection error] ${e.message}\r\n`);
        ws.close();
        return;
      }
      session.client.shell({ term: "xterm-color", cols: 80, rows: 24 }, (err, stream) => {
        if (err) {
          ws.send(`\r\n[shell error] ${err.message}\r\n`);
          ws.close();
          return;
        }
        // Move to the pane's directory, then optionally run a command.
        if (cwd) stream.write(`cd ${shq(cwd)}\n`);
        if (initialCommand) stream.write(`${initialCommand}\n`);

        stream.on("data", (d: Buffer) => ws.readyState === ws.OPEN && ws.send(d.toString("utf-8")));
        stream.stderr.on("data", (d: Buffer) => ws.readyState === ws.OPEN && ws.send(d.toString("utf-8")));
        stream.on("close", () => ws.close());

        ws.on("message", (raw) => {
          try {
            const msg = JSON.parse(raw.toString());
            if (msg.kind === "input") stream.write(msg.data);
            else if (msg.kind === "resize") stream.setWindow(msg.rows, msg.cols, 0, 0);
          } catch { /* ignore malformed frames */ }
        });
        ws.on("close", () => { try { stream.end(); } catch { /* noop */ } });
      });
      return;
    }

    // Local PTY
    const { file, args } = resolveLocalShell(shell);
    let term: pty.IPty;
    try {
      term = pty.spawn(file, args, {
        name: "xterm-color",
        cols: 80,
        rows: 24,
        cwd: path.resolve(cwd),
        env: process.env as Record<string, string>,
      });
    } catch (e: any) {
      ws.send(`\r\n[spawn error] ${e.message}\r\n`);
      ws.close();
      return;
    }

    if (initialCommand) {
      const nl = process.platform === "win32" ? "\r" : "\n";
      setTimeout(() => term.write(`${initialCommand}${nl}`), 300);
    }

    term.onData((d) => ws.readyState === ws.OPEN && ws.send(d));
    term.onExit(() => ws.close());

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.kind === "input") term.write(msg.data);
        else if (msg.kind === "resize") term.resize(msg.cols, msg.rows);
      } catch { /* ignore malformed frames */ }
    });
    ws.on("close", () => { try { term.kill(); } catch { /* noop */ } });
  });
}

// ---- VITE SETUP & STATIC MIDDLEWARE ----

async function start() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    // SPA fallback: serve the prebuilt index.html for any unmatched GET/HEAD.
    // The dist bundle is immutable in production, so read index.html once at
    // startup and serve it from memory. This avoids a per-request filesystem
    // read in the catch-all (faster, and no user-influenced path access), and
    // sidesteps Express 5 / path-to-regexp v8 rejecting the bare "*" route.
    const indexHtml = fs.readFileSync(path.join(distPath, "index.html"));
    app.use((req, res, next) => {
      if (req.method !== "GET" && req.method !== "HEAD") return next();
      res.type("html").send(indexHtml);
    });
  }

  const server = app.listen(PORT, HOST, () => {
    console.log(`Express server running on http://${HOST}:${PORT}`);
  });
  attachPtyWebSocket(server);
}

start().catch((err) => {
  console.error("Express dev server starting failed:", err);
});
