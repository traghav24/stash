import { useEffect, useState, useCallback } from "react";
import { api } from "./api.js";

export function useStash() {
  const [items, setItems] = useState([]);
  const [settings, setSettings] = useState({ dayStart: 10, dayEnd: 19, estimateRatio: {} });
  const refresh = useCallback(async () => {
    setItems(await api.list());
    setSettings(await api.getSettings());
  }, []);
  useEffect(() => {
    refresh();
    const a = api.onItemsChanged(refresh);
    const b = api.onSettingsChanged(refresh);
    return () => {
      a && a();
      b && b();
    };
  }, [refresh]);
  return { items, settings, refresh };
}

// Re-render every 30s so "time left" and timers stay honest.
export function useNow(ms = 30000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

// ---- attachments: images, PDFs and other files from paste, drop or the file picker ----

const readAs = (file, how) =>
  new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = reject;
    how === "dataUrl" ? fr.readAsDataURL(file) : fr.readAsArrayBuffer(file);
  });

const MAX_BYTES = 200 * 1024 * 1024;

// Turns File objects into attachments the card can preview and the app can save.
export async function filesToAttachments(fileList) {
  const out = [];
  for (const f of [...(fileList || [])]) {
    if (f.size > MAX_BYTES) continue;
    const isImage = f.type.startsWith("image/");
    const path = api.filePath(f) || null; // real path for files from Finder; empty for pasted screenshots
    const att = { id: Math.random().toString(36).slice(2), kind: isImage ? "image" : "file", name: f.name || (isImage ? "image" : "file"), mime: f.type, size: f.size, path };
    if (isImage) att.preview = await readAs(f, "dataUrl");
    if (!path) {
      if (isImage) att.dataUrl = att.preview;
      else att.bytes = new Uint8Array(await readAs(f, "buffer"));
    }
    out.push(att);
  }
  return out;
}

// Pulls attachments out of a paste or drop. Text is left alone.
export async function attachmentsFromDataTransfer(dt) {
  const files = [...(dt.files || [])];
  if (!files.length && dt.items) {
    for (const it of dt.items) if (it.kind === "file") {
      const f = it.getAsFile();
      if (f) files.push(f);
    }
  }
  if (files.length) return filesToAttachments(files);
  // an image dragged from a web page arrives as HTML, not a file
  const html = dt.getData && dt.getData("text/html");
  const img = html && html.match(/<img[^>]+src="([^"]+)"/i);
  if (img && /^https?:/.test(img[1])) return [{ id: Math.random().toString(36).slice(2), kind: "image", name: "image", preview: img[1], imageUrl: img[1] }];
  return [];
}

export function saveAttachment(att, note = "") {
  if (att.kind === "image") return api.capture({ type: "image", filePath: att.path, dataUrl: att.dataUrl, imageUrl: att.imageUrl, note, file: att.dataUrl });
  return api.capture({ type: "file", filePath: att.path, bytes: att.bytes, fileName: att.name, mime: att.mime, note, title: att.name });
}

// Shared drop/paste handling for surfaces that save immediately (the main window, the closed dog).
export async function captureFromDataTransfer(dt, note = "") {
  // read everything synchronously: the browser empties paste/drop data once the event ends
  const uri = dt.getData("text/uri-list");
  const text = dt.getData("text/plain");
  const atts = await attachmentsFromDataTransfer(dt);
  if (atts.length) {
    for (const a of atts) await saveAttachment(a, note);
    return true;
  }
  const content = (uri && uri.split("\n").find((l) => l && !l.startsWith("#"))) || text;
  if (content && content.trim()) return api.capture({ content, note });
  return false;
}
