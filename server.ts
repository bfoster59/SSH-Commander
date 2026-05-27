import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { Client, SFTPWrapper } from "ssh2";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "50mb" }));

// Types
import { FileEntry, ConnectionProfile, OperationProgress } from "./src/types.js";

interface ActiveSSH {
  client: Client;
  sftp: SFTPWrapper;
  profile: ConnectionProfile;
  lastActive: number;
}

// Memory Pools
const sshPool = new Map<string, ActiveSSH>();
const activeTransferJobs = new Map<string, OperationProgress & { cancelRequested?: boolean }>();

// Heartbeat cleanup for inactive SSH sessions (e.g. idle > 15 mins)
setInterval(() => {
  const idleThreshold = 15 * 60 * 1000;
  const now = Date.now();
  for (const [id, connection] of sshPool.entries()) {
    if (now - connection.lastActive > idleThreshold) {
      console.log(`Closing idle SSH connection: ${connection.profile.name} (${id})`);
      try {
        connection.client.end();
      } catch (e) {
        // Safe ignore
      }
      sshPool.delete(id);
    }
  }
}, 60 * 1000);

// Helper to check and retrieve active SSH session
function getSSHSession(connectionId: string): ActiveSSH {
  const session = sshPool.get(connectionId);
  if (!session) {
    throw new Error("SSH Connection has expired or does not exist. Please reconnect.");
  }
  session.lastActive = Date.now();
  return session;
}

// API Routes

// ---- 1. LOCAL ACTIONS ----

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
    
    // Check if is file
    const stat = await fs.promises.stat(resolved);
    if (!stat.isFile()) {
      return res.status(400).json({ error: "Target is a directory, cannot read as file" });
    }

    // Support UTF-8 textual reading
    const content = await fs.promises.readFile(resolved, "utf-8");
    res.json({ content });
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
        lastActive: Date.now(),
      });

      // Fetch remote home directory path
      sftp.readdir("~", (err, list) => {
        if (err) {
          // Fallback to root if home is not accessible
          res.json({ connectionId: connId, homePath: "/" });
        } else {
          // Successfully probed home, now get its absolute path
          sftp.realpath("~", (realPathErr, homePath) => {
            if (realPathErr) {
              res.json({ connectionId: connId, homePath: "/" }); // Should be rare
            } else {
              res.json({ connectionId: connId, homePath });
            }
          });
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

  if (profile.privateKey) {
    connectionOpts.privateKey = profile.privateKey;
    if (profile.passphrase) {
      connectionOpts.passphrase = profile.passphrase;
    }
  } else if (profile.password) {
    connectionOpts.password = profile.password;
  } else {
    return res.status(400).json({ error: "Either a password or private SSH key is required." });
  }

  // Set timeout of 15 seconds
  connectionOpts.readyTimeout = 15000;

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

    sftp.readFile(filePath, "utf-8", (err, data) => {
      if (err) {
        return res.status(500).json({ error: `SFTP read failed: ${err.message}` });
      }
      res.json({ content: data });
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
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
    client.exec(`rm -rf "${remotePath.replace(/"/g, '\\"')}"`, (err, stream) => {
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
        stream.on("close", (code) => {
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
    
    // Convert paths securely
    const targetPath = basePath || ".";
    const escapedPath = targetPath.replace(/"/g, '\\"');
    const escapedQuery = query.replace(/"/g, '\\"');
    
    // We try 'find' command if supported by target platform, else we fallback to scanning with SFTP
    client.exec(`find "${escapedPath}" -name "*${escapedQuery}*" -printf "%p\\t%s\\t%y\\t%T@\\t%m\\n" 2>/dev/null`, (err, stream) => {
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
        stream.on("close", (code) => {
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

  if (!source || !target) {
    return res.status(400).json({ error: "Missing source or target description" });
  }

  const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  
  // Set initial empty job progress
  activeTransferJobs.set(jobId, {
    active: true,
    title: `Copying from ${source.type} to ${target.type}...`,
    percentage: 0,
    currentItem: "Evaluating paths...",
    bytesTransferred: 0,
    totalBytes: 0,
  });

  // Start background async transfer execution instantly without blocking HTTP response
  executeBackgroundTransfer(jobId, source, target).catch((err) => {
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


// Recursive background implementation parameters
async function executeBackgroundTransfer(jobId: string, source: TransferEndpoint, target: TransferEndpoint) {
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
    let entriesToCopy: { relPath: string; absoluteSource: string; size: number }[] = [];

    // Fetch information recursively first to gather full count + sizes
    updateProgress("Calculating contents...", 1);

    const activePaths = source.paths && source.paths.length > 0 ? source.paths : [source.path];

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
                const fileStat = await fs.promises.stat(absolutePath);
                entriesToCopy.push({
                  relPath,
                  absoluteSource: absolutePath,
                  size: fileStat.size,
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

              if (itemIsDir) {
                await scanRemoteRecursive(absolutePath);
              } else {
                entriesToCopy.push({
                  relPath,
                  absoluteSource: absolutePath,
                  size: item.attrs.size,
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

    // Stage 2: Begin Copier loops
    for (let index = 0; index < entriesToCopy.length; index++) {
      checkCancellation();
      const entry = entriesToCopy[index];
      const targetAbsPath = path.join(target.path, entry.relPath).replace(/\\/g, "/");
      const percentageDone = Math.round((bytesAccumulated / (totalBytes || 1)) * 100);

      updateProgress(`Copying ${entry.relPath} (${index + 1}/${entriesToCopy.length})`, percentageDone, bytesAccumulated);

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

        // Helper to recursively make dirs in SFTP
        const remoteMkdirRecursive = async (p: string) => {
          const parts = p.split("/").filter(Boolean);
          let current = "";
          if (p.startsWith("/")) current = "/";
          for (const item of parts) {
            current = path.join(current, item).replace(/\\/g, "/");
            await new Promise<void>((resolve) => {
              sftp.mkdir(current, () => resolve()); // Safe ignore existing dir error
            });
          }
        };

        await remoteMkdirRecursive(dstDir);

        await new Promise<void>((resolve, reject) => {
          const localReadStream = fs.createReadStream(entry.absoluteSource);
          const remoteWriteStream = sftp.createWriteStream(targetAbsPath);

          localReadStream.on("data", (chunk) => {
            bytesAccumulated += chunk.length;
            updateProgress(`Uploading ${entry.relPath}`, Math.round((bytesAccumulated / totalBytes) * 100), bytesAccumulated);
          });

          localReadStream.on("error", reject);
          remoteWriteStream.on("error", reject);
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

          remoteReadStream.on("data", (chunk) => {
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
            client.exec(`mkdir -p "${remoteFolderParent}" && cp -r "${entry.absoluteSource}" "${targetAbsPath}"`, (err, stream) => {
              if (err) reject(err);
              else {
                stream.on("close", (code) => {
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
          const remoteDstMkdir = async (p: string) => {
            const parts = p.split("/").filter(Boolean);
            let current = "";
            if (p.startsWith("/")) current = "/";
            for (const item of parts) {
              current = path.join(current, item).replace(/\\/g, "/");
              await new Promise<void>((resolve) => {
                sftpDst.mkdir(current, () => resolve());
              });
            }
          };
          await remoteDstMkdir(dstDir);

          await new Promise<void>((resolve, reject) => {
            const srcStream = sftpSrc.createReadStream(entry.absoluteSource);
            const dstStream = sftpDst.createWriteStream(targetAbsPath);

            srcStream.on("data", (chunk) => {
              bytesAccumulated += chunk.length;
              updateProgress(`Piping remote -> remote: ${entry.relPath}`, Math.round((bytesAccumulated / totalBytes) * 100), bytesAccumulated);
            });

            srcStream.on("error", reject);
            dstStream.on("error", reject);
            dstStream.on("finish", () => resolve());
            srcStream.pipe(dstStream);
          });
        }
      }
    }

    // Mark job done!
    activeTransferJobs.set(jobId, {
      active: false,
      title: "Successfully Completed",
      percentage: 100,
      currentItem: `All items copied successfully! (${entriesToCopy.length} elements)`,
      bytesTransferred: totalBytes,
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
      const escapedCwd = cwd ? cwd.replace(/"/g, '\\"') : ".";
      const fullCmd = `cd "${escapedCwd}" && ${cmd}`;

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
        stream.on("close", (code) => {
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
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Express server running on http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error("Express dev server starting failed:", err);
});
