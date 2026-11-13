// In the Electron app this is window.stash (see electron/preload.cjs).
// In a plain browser tab (for quick design iteration) it falls back to localStorage.
import * as chrono from "chrono-node";

function browserApi() {
  const KEY = "stash-items";
  const SKEY = "stash-settings";
  const listeners = new Set();
  const read = () => {
    try {
      return JSON.parse(localStorage.getItem(KEY)) || [];
    } catch {
      return [];
    }
  };
  const write = (items) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(items));
    } catch {}
    listeners.forEach((fn) => fn());
  };
  const settings = () => {
    try {
      return { dayStart: 10, dayEnd: 19, estimateRatio: {}, ...JSON.parse(localStorage.getItem(SKEY) || "{}") };
    } catch {
      return { dayStart: 10, dayEnd: 19, estimateRatio: {} };
    }
  };
  const guess = (it) => {
    const text = [it.content, it.note].join(" ");
    const r = it.type === "note" ? chrono.parse(text, new Date(), { forwardDate: true })[0] : null;
    const isTask = !!r || /^(call|email|send|buy|book|pay|finish|fix|write|submit|plan|start|review|make|design|build|draft|update|create|ask|check|research)\b/i.test(text.trim());
    const cluster = isTask ? "Plans" : { image: "Visual inspo", code: "Code snippets", music: "Music", link: "Links", note: "Thoughts" }[it.type] || "Unsorted";
    return { isTask, due: r ? r.start.date().toISOString() : null, cluster, estimateMin: isTask ? 30 : null, title: text.split("\n")[0].slice(0, 60) || "Image", enriched: true, enrichedBy: "local" };
  };
  return {
    isElectron: false,
    list: async () => read().filter((i) => !i.archived),
    capture: async (input) => {
      const items = read();
      const now = new Date().toISOString();
      const c = (input.content || "").trim();
      const type = input.type || (/^https?:\/\/\S+$/.test(c) ? (/spotify|youtu|soundcloud/.test(c) ? "music" : "link") : "note");
      const it = { id: Math.random().toString(36).slice(2), createdAt: now, lastTouched: now, type, content: c, note: input.note || "", source: type === "link" || type === "music" ? c : null, file: input.dataUrl || null, tags: [], done: false, ...input, type };
      Object.assign(it, guess(it));
      items.push(it);
      write(items);
      return it;
    },
    captureClipboardImage: async () => null,
    update: async (id, patch) => {
      const items = read();
      const it = items.find((i) => i.id === id);
      if (it) Object.assign(it, patch, { lastTouched: new Date().toISOString() });
      write(items);
      return it;
    },
    archive: async (id) => {
      const items = read();
      const it = items.find((i) => i.id === id);
      if (it) it.archived = true;
      write(items);
    },
    reenrich: async () => {},
    getSettings: async () => ({ ...settings(), ai: false, root: "browser storage" }),
    setSettings: async (p) => {
      try {
        localStorage.setItem(SKEY, JSON.stringify({ ...settings(), ...p }));
      } catch {}
      listeners.forEach((fn) => fn());
    },
    readClipboard: async () => ({ kind: "text", text: "" }),
    openMain: async () => {},
    petPeek: async () => ({ app: null, text: null }),
    onNavigate: () => () => {},
    openExternal: async (url) => window.open(url, "_blank"),
    reveal: async () => {},
    openFile: async () => {},
    filePath: () => null,
    petMoveBy: () => {},
    petSetOpen: () => {},
    petWander: () => {},
    // in a browser test harness, ask the parent page to resize the frame like Electron would
    petFit: (w, h) => window.parent !== window && window.parent.postMessage({ petFit: [w, h] }, "*"),
    petStopWalk: () => {},
    onWalk: () => () => {},
    onHover: () => () => {},
    onItemsChanged: (fn) => (listeners.add(fn), () => listeners.delete(fn)),
    onSettingsChanged: (fn) => (listeners.add(fn), () => listeners.delete(fn)),
    onQuickCapture: () => () => {},
    onFed: () => () => {},
  };
}

export const api = window.stash || browserApi();

// Saved files are served by the app's own protocol; browser mode stores data URLs.
export const mediaUrl = (file) => {
  if (!file) return null;
  if (file.startsWith("data:")) return file;
  return `stash-media://m/${encodeURIComponent(file.split("/").pop())}`;
};
