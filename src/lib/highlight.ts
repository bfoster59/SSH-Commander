import hljs from "highlight.js";

const EXT_TO_LANG: Record<string, string> = {
  js: "javascript", mjs: "javascript", cjs: "javascript", jsx: "javascript",
  ts: "typescript", tsx: "typescript",
  json: "json", css: "css", scss: "scss", less: "less",
  html: "xml", htm: "xml", xml: "xml", svg: "xml", vue: "xml",
  md: "markdown", markdown: "markdown",
  py: "python", rb: "ruby", php: "php", go: "go", rs: "rust",
  java: "java", kt: "kotlin", c: "c", h: "c", cpp: "cpp", cc: "cpp", hpp: "cpp",
  cs: "csharp", swift: "swift", sql: "sql",
  sh: "bash", bash: "bash", zsh: "bash", ps1: "powershell",
  yml: "yaml", yaml: "yaml", toml: "ini", ini: "ini", conf: "ini",
  dockerfile: "dockerfile", makefile: "makefile",
};

export function langFromName(name: string): string | undefined {
  const lower = name.toLowerCase();
  if (lower === "dockerfile") return "dockerfile";
  if (lower === "makefile") return "makefile";
  const ext = lower.slice(lower.lastIndexOf(".") + 1);
  return EXT_TO_LANG[ext];
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Returns highlighted HTML for the given code, picking a language by file name. */
export function highlightCode(code: string, name: string): string {
  try {
    const lang = langFromName(name);
    if (lang && hljs.getLanguage(lang)) {
      return hljs.highlight(code, { language: lang }).value;
    }
    // Fall back to auto-detection only for reasonably sized files.
    if (code.length < 200_000) return hljs.highlightAuto(code).value;
    return escapeHtml(code);
  } catch {
    return escapeHtml(code);
  }
}
