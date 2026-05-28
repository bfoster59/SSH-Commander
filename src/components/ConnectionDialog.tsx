import React, { useState, useEffect } from "react";
import { ConnectionProfile, StoredProfile } from "../types";
import { X, Shield, Plus, Trash2, Key, KeyRound, Server } from "lucide-react";

interface ConnectionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConnect: (profile: ConnectionProfile) => void;
}

export default function ConnectionDialog({ isOpen, onClose, onConnect }: ConnectionDialogProps) {
  const [profiles, setProfiles] = useState<StoredProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string>("");

  // Form fields
  const [name, setName] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState(22);
  const [username, setUsername] = useState("");
  const [authType, setAuthType] = useState<"password" | "key">("password");
  const [privateKeyPath, setPrivateKeyPath] = useState("");
  // Transient secrets — typed at connect time, never saved.
  const [password, setPassword] = useState("");
  const [passphrase, setPassphrase] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    (async () => {
      try {
        const res = await fetch("/api/profiles");
        const data = await res.json();
        const list: StoredProfile[] = data.profiles || [];
        setProfiles(list);
        if (list.length > 0) {
          setSelectedProfileId(list[0].id);
          loadProfileToForm(list[0]);
        }
      } catch (e) {
        console.error("Failed to load connection profiles", e);
      }
    })();
  }, [isOpen]);

  const persist = async (list: StoredProfile[]) => {
    setProfiles(list);
    try {
      await fetch("/api/profiles", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profiles: list }),
      });
    } catch (e) {
      console.error("Failed to save connection profiles", e);
    }
  };

  const loadProfileToForm = (p: StoredProfile) => {
    setName(p.name);
    setHost(p.host);
    setPort(p.port || 22);
    setUsername(p.username);
    setAuthType(p.authType === "key" ? "key" : "password");
    setPrivateKeyPath(p.privateKeyPath || "");
    // Secrets are never persisted — clear them so they must be re-entered.
    setPassword("");
    setPassphrase("");
  };

  const handleProfileSelect = (id: string) => {
    setSelectedProfileId(id);
    const found = profiles.find(p => p.id === id);
    if (found) loadProfileToForm(found);
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !host || !username) return;

    const stored: StoredProfile = {
      id: selectedProfileId && !selectedProfileId.startsWith("temp_") ? selectedProfileId : `prof_${Date.now()}`,
      name,
      host,
      port: Number(port) || 22,
      username,
      authType,
      privateKeyPath: authType === "key" ? privateKeyPath : "",
    };

    const updated = profiles.find(p => p.id === stored.id)
      ? profiles.map(p => (p.id === stored.id ? stored : p))
      : [...profiles, stored];

    persist(updated);
    setSelectedProfileId(stored.id);
  };

  const handleDeleteProfile = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    e.preventDefault();
    const filtered = profiles.filter(p => p.id !== id);
    persist(filtered);
    if (selectedProfileId === id) {
      if (filtered.length > 0) {
        setSelectedProfileId(filtered[0].id);
        loadProfileToForm(filtered[0]);
      } else {
        setSelectedProfileId("");
        setName(""); setHost(""); setPort(22); setUsername("");
        setAuthType("password"); setPrivateKeyPath(""); setPassword(""); setPassphrase("");
      }
    }
  };

  const handleNewProfileClick = () => {
    setSelectedProfileId("");
    setName("New Connection");
    setHost(""); setPort(22); setUsername("");
    setAuthType("password"); setPrivateKeyPath(""); setPassword(""); setPassphrase("");
  };

  const handleFormConnect = (e: React.FormEvent) => {
    e.preventDefault();
    if (!host || !username) return;

    const profileToConnect: ConnectionProfile = {
      id: selectedProfileId || `temp_${Date.now()}`,
      name: name || `${username}@${host}`,
      host,
      port: Number(port) || 22,
      username,
      authType,
      privateKeyPath: authType === "key" ? privateKeyPath : undefined,
      password: authType === "password" ? password : undefined,
      passphrase: authType === "key" ? passphrase : undefined,
    };

    onConnect(profileToConnect);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-[#0F1115]/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#1A1B1E] border border-[#2C2E33] w-full max-w-4xl rounded shadow-2xl flex flex-col md:flex-row overflow-hidden overflow-y-auto max-h-[90vh]">

        {/* Left pane: Profiles List */}
        <div className="w-full md:w-1/3 bg-[#14161A] border-r border-[#2C2E33] p-4 shrink-0 flex flex-col">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-[#2C2E33]">
            <h3 className="font-semibold text-[#C1C2C5] flex items-center gap-2 text-sm uppercase">
              <Server className="w-4 h-4 text-[#339AF0]" />
              Profiles
            </h3>
            <button
              onClick={handleNewProfileClick}
              className="p-1 rounded bg-[#2C2E33] hover:bg-[#339AF0] text-[#339AF0] hover:text-white transition-colors cursor-pointer"
              title="Add New Connection"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex-1 space-y-1.5 overflow-y-auto max-h-[300px] md:max-h-none">
            {profiles.length === 0 ? (
              <p className="text-xs text-[#5C5F66] italic p-4 text-center">No connections saved.</p>
            ) : (
              profiles.map(p => (
                <div
                  key={p.id}
                  onClick={() => handleProfileSelect(p.id)}
                  className={`flex items-center justify-between p-2.5 rounded cursor-pointer transition-all border ${
                    selectedProfileId === p.id
                      ? "bg-[#25262B] border-[#339AF0] text-white"
                      : "bg-[#1A1B1E]/50 hover:bg-[#2C2E33]/40 border-transparent text-[#C1C2C5]"
                  }`}
                >
                  <div className="flex flex-col min-w-0 pr-2 font-mono">
                    <span className="text-xs font-semibold truncate text-[#C1C2C5]">{p.name}</span>
                    <span className="text-[10px] text-[#5C5F66] truncate">{p.username}@{p.host}</span>
                  </div>
                  <button
                    onClick={(e) => handleDeleteProfile(e, p.id)}
                    className="p-1 hover:bg-[#FF4D4D]/20 rounded text-[#5C5F66] hover:text-[#FF4D4D] transition-colors shrink-0 cursor-pointer"
                    title="Delete connection"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right pane: Form configuration */}
        <div className="flex-1 p-5 lg:p-6 flex flex-col justify-between min-w-0 bg-[#1A1B1E]">
          <div className="flex items-center justify-between pb-3 mb-4 border-b border-[#2C2E33]">
            <h3 className="font-semibold text-white text-md flex items-center gap-2">
              <Shield className="w-4 text-[#339AF0] h-4" />
              SSH / SFTP Server Configuration
            </h3>
            <button
              onClick={onClose}
              className="p-1 hover:bg-[#2C2E33] rounded text-[#C1C2C5] hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleFormConnect} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="col-span-1">
                <label className="block text-[11px] uppercase tracking-wide text-[#5C5F66] font-medium mb-1">
                  Profile Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Target Production"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full text-xs p-2.5 rounded bg-[#14161A] border border-[#2C2E33] text-white focus:outline-none focus:border-[#339AF0] placeholder-slate-650 font-sans"
                />
              </div>

              <div className="col-span-1">
                <label className="block text-[11px] uppercase tracking-wide text-[#5C5F66] font-medium mb-1">
                  Host address / IP
                </label>
                <input
                  type="text"
                  required
                  placeholder="ssh.example.com or 10.0.0.12"
                  value={host}
                  onChange={e => setHost(e.target.value)}
                  className="w-full text-xs p-2.5 rounded bg-[#14161A] border border-[#2C2E33] text-white focus:outline-none focus:border-[#339AF0] placeholder-slate-655 font-mono"
                />
              </div>

              <div className="col-span-1">
                <label className="block text-[11px] uppercase tracking-wide text-[#5C5F66] font-medium mb-1">
                  Port
                </label>
                <input
                  type="number"
                  required
                  placeholder="22"
                  value={port}
                  onChange={e => setPort(Number(e.target.value))}
                  className="w-full text-xs p-2.5 rounded bg-[#14161A] border border-[#2C2E33] text-white focus:outline-none focus:border-[#339AF0] font-sans"
                />
              </div>

              <div className="col-span-1">
                <label className="block text-[11px] uppercase tracking-wide text-[#5C5F66] font-medium mb-1">
                  Username
                </label>
                <input
                  type="text"
                  required
                  placeholder="root / ubuntu / admin"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  className="w-full text-xs p-2.5 rounded bg-[#14161A] border border-[#2C2E33] text-white focus:outline-none focus:border-[#339AF0] placeholder-slate-660 font-sans"
                />
              </div>
            </div>

            <div className="border-t border-[#2C2E33] pt-4 mt-2">
              <label className="block text-[11px] uppercase tracking-wide text-[#5C5F66] font-medium mb-2.5">
                Authentication Style
              </label>

              <div className="flex gap-4 mb-4">
                <label className="inline-flex items-center text-xs text-[#C1C2C5] font-medium cursor-pointer">
                  <input
                    type="radio"
                    name="authStyle"
                    checked={authType === "password"}
                    onChange={() => setAuthType("password")}
                    className="mr-2 text-[#339AF0] focus:ring-[#339AF0] border-[#2C2E33] bg-[#14161A] h-3.5 w-3.5"
                  />
                  Password
                </label>
                <label className="inline-flex items-center text-xs text-[#C1C2C5] font-medium cursor-pointer">
                  <input
                    type="radio"
                    name="authStyle"
                    checked={authType === "key"}
                    onChange={() => setAuthType("key")}
                    className="mr-2 text-[#339AF0] focus:ring-[#339AF0] border-[#2C2E33] bg-[#14161A] h-3.5 w-3.5"
                  />
                  Private Key File
                </label>
              </div>

              {authType === "password" ? (
                <div>
                  <label className="block text-[11px] uppercase tracking-wide text-[#5C5F66] font-medium mb-1">
                    Password <span className="text-[#5C5F66] normal-case">(not saved — entered each connect)</span>
                  </label>
                  <input
                    type="password"
                    placeholder="SSH password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full text-xs p-2.5 rounded bg-[#14161A] border border-[#2C2E33] text-white focus:outline-none focus:border-[#339AF0] placeholder-[#5C5F66]"
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="block text-[11px] uppercase tracking-wide text-[#5C5F66] font-medium mb-1">
                      Private Key File Path
                    </label>
                    <input
                      type="text"
                      placeholder="~/.ssh/id_ed25519"
                      value={privateKeyPath}
                      onChange={e => setPrivateKeyPath(e.target.value)}
                      className="w-full text-xs p-2.5 rounded bg-[#14161A] border border-[#2C2E33] text-white focus:outline-none focus:border-[#339AF0] placeholder-[#5C5F66] font-mono"
                    />
                    <p className="text-[10px] text-[#5C5F66] mt-1">Path on the machine running SSH Commander. ~ expands to your home directory.</p>
                  </div>

                  <div>
                    <label className="block text-[11px] uppercase tracking-wide text-[#5C5F66] font-medium mb-1">
                      Key Passphrase <span className="text-[#5C5F66] normal-case">(optional, not saved)</span>
                    </label>
                    <input
                      type="password"
                      placeholder="Passphrase if the key is encrypted"
                      value={passphrase}
                      onChange={e => setPassphrase(e.target.value)}
                      className="w-full text-xs p-2.5 rounded bg-[#14161A] border border-[#2C2E33] text-white focus:outline-none focus:border-[#339AF0] placeholder-[#5C5F66]"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-5 border-t border-[#2C2E33] justify-end">
              <button
                type="button"
                onClick={handleSaveProfile}
                disabled={!name || !host || !username}
                className="px-4 py-2 text-xs font-semibold rounded bg-[#2C2E33] hover:bg-[#373A40] text-[#C1C2C5] hover:text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 cursor-pointer border border-[#2C2E33]"
                id="btn-save-profile"
              >
                <KeyRound className="w-3.5 h-3.5 text-[#FAB005]" />
                Save Profile
              </button>

              <button
                type="submit"
                className="px-5 py-2 text-xs font-semibold rounded bg-[#339AF0] hover:bg-[#339AF0]/90 text-white transition-all hover:shadow-[0_0_15px_rgba(51,154,240,0.3)] shadow-none flex items-center justify-center gap-1.5 cursor-pointer"
                id="btn-connect-ssh"
              >
                <Key className="w-3.5 h-3.5" />
                Establish connection
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
