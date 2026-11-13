const { app, BrowserWindow, ipcMain, globalShortcut, clipboard, screen, shell, protocol, net, desktopCapturer, systemPreferences } = require("electron");
const { execFile } = require("child_process");
const { pathToFileURL } = require("url");
const path = require("path");
const fs = require("fs");
const http = require("http");
const store = require("./store.cjs");
const { enrich, dogComment, aiAvailable } = require("./enrich.cjs");

const DEV = !!process.env.STASH_DEV;
const PORT = 47123; // the Dia extension posts captures here
const PET = { small: { w: 140, h: 150 } }; // the window then resizes itself to fit what is showing

// Saved images are served to the windows as stash-media://m/<file>
protocol.registerSchemesAsPrivileged([{ scheme: "stash-media", privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

let mainWin = null;
let petWin = null;

function load(win, page) {
  if (DEV) win.loadURL(`http://localhost:5173/${page}`);
  else win.loadFile(path.join(__dirname, "..", "dist", page));
}

function broadcast(channel, payload) {
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send(channel, payload);
}

// Surface errors from the windows in the terminal, so bugs aren't silent.
function pipeErrors(win, name) {
  win.webContents.on("console-message", (e) => {
    if (e.level === "error") console.error(`[${name}] ${e.message}`);
  });
  win.webContents.on("render-process-gone", (_e, d) => console.error(`[${name}] renderer gone: ${d.reason}`));
  win.webContents.on("did-fail-load", (_e, code, desc) => console.error(`[${name}] failed to load: ${desc} (${code})`));
}

function createMain() {
  mainWin = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 720,
    minHeight: 520,
    titleBarStyle: "hiddenInset",
    backgroundColor: "#f4efe6",
    webPreferences: { preload: path.join(__dirname, "preload.cjs") },
  });
  pipeErrors(mainWin, "main");
  load(mainWin, "index.html");
  mainWin.on("closed", () => (mainWin = null));
}

function createPet() {
  const { workArea } = screen.getPrimaryDisplay();
  petWin = new BrowserWindow({
    width: PET.small.w,
    height: PET.small.h,
    x: workArea.x + workArea.width - PET.small.w - 24,
    y: workArea.y + workArea.height - PET.small.h - 8, // starts on the bottom edge, where it walks
    frame: false,
    transparent: true,
    resizable: false,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    fullscreenable: false,
    webPreferences: { preload: path.join(__dirname, "preload.cjs") },
  });
  petWin.setAlwaysOnTop(true, "floating");
  petWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  pipeErrors(petWin, "pet");
  load(petWin, "pet.html");
}

// ---- capture ---------------------------------------------------------------

async function downloadImage(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`image download ${res.status}`);
  const type = res.headers.get("content-type") || "";
  const ext = (type.split("/")[1] || "png").split(";")[0].replace("jpeg", "jpg").replace("svg+xml", "svg");
  return store.saveMedia(Buffer.from(await res.arrayBuffer()), ext);
}

const MUSIC = /(open\.spotify\.com|music\.apple\.com|soundcloud\.com|youtube\.com\/watch|youtu\.be|music\.youtube\.com|bandcamp\.com)/i;
const URL_ONLY = /^https?:\/\/\S+$/i;
const IMG_URL = /\.(png|jpe?g|gif|webp|avif)(\?|$)/i;
const CODEISH = /[{};]\s*$|^\s*(const|let|function|def|import|class|<\w+|SELECT|#include)/m;

// Turns whatever arrived (drop, paste, extension) into a stored item.
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|heic|bmp|tiff?|svg)$/i;
const extOf = (name, fallback = "bin") => {
  const m = /\.([a-z0-9]{1,8})$/i.exec(name || "");
  return m ? m[1].toLowerCase() : fallback;
};
const extFromMime = (mime, fallback) =>
  ({ "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp", "image/svg+xml": "svg", "application/pdf": "pdf" })[mime] || fallback;

// Keep a copy inside ~/Stash/media, so saves survive the original being moved or deleted.
function adoptFile(p) {
  if (!p) return null;
  if (path.dirname(p) === store.MEDIA) return p;
  return store.saveMedia(fs.readFileSync(p), extOf(p));
}

// Turns whatever arrived (paste, drop, file picker, extension) into a stored item.
async function capture(input) {
  let { type, content = "", note = "", source = null, filePath = null, imageUrl = null, title = "", dataUrl = null, bytes = null, fileName = null, mime = null } = input;
  content = (content || "").trim();
  note = (note || "").trim();

  // raw image or file data (pasted screenshots, files with no path on disk)
  if (dataUrl && !filePath) {
    const m = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl);
    if (m) {
      filePath = store.saveMedia(Buffer.from(m[2], "base64"), extFromMime(m[1], "png"));
      type = type || "image";
    }
  }
  if (bytes && !filePath) {
    filePath = store.saveMedia(Buffer.from(bytes), extOf(fileName, extFromMime(mime, "bin")));
  }
  if (filePath) {
    fileName = fileName || path.basename(filePath); // remember the real name before copying
    try {
      filePath = adoptFile(filePath);
    } catch (e) {
      throw new Error(`couldn't read ${path.basename(filePath)}: ${e.message}`);
    }
    if (!type || type === "file" || type === "image") type = IMAGE_EXT.test(filePath) ? "image" : "file";
    if (type === "file" && !title) title = fileName;
  }

  // "check this out https://…" → a link, with the words as its note
  if (!type && !URL_ONLY.test(content)) {
    const m = content.match(/https?:\/\/\S+/);
    if (m && content.replace(m[0], "").trim().length <= 280) {
      const words = content.replace(m[0], " ").replace(/\s+/g, " ").trim();
      note = [words, note].filter(Boolean).join(" · ");
      content = m[0];
    }
  }

  if (!type) {
    if (imageUrl) type = "image";
    else if (URL_ONLY.test(content)) type = MUSIC.test(content) ? "music" : IMG_URL.test(content) ? "image" : "link";
    else if (CODEISH.test(content) && content.includes("\n")) type = "code";
    else type = "note";
  }
  if (type === "image" && !filePath) {
    const url = imageUrl || content;
    try {
      filePath = await downloadImage(url);
      source = source || url;
      content = "";
    } catch (e) {
      type = "link"; // keep the link rather than lose the save
    }
  }
  if ((type === "link" || type === "music") && !source) source = content;

  const item = store.add({ type, content, note, source, file: filePath, title, mime: mime || undefined });
  broadcast("items:changed");
  enrich(item).then(() => broadcast("items:changed")).catch(() => {});
  return item;
}

// Electron 45's clipboard is async (W3C style): read() gives ClipboardItems, getType() gives Blobs.
async function clipboardImage() {
  try {
    for (const item of await clipboard.read()) {
      const mime = item.types.find((t) => t.startsWith("image/"));
      if (mime) return { mime, buffer: Buffer.from(await (await item.getType(mime)).arrayBuffer()) };
    }
  } catch (e) {
    console.warn("[stash] clipboard read failed:", e.message);
  }
  return null;
}

// A file copied in Finder (⌘C on a PDF, say). Checked before images, because Finder
// also puts the file's icon on the clipboard as a picture.
async function clipboardFile() {
  try {
    for (const item of await clipboard.read()) {
      const t = item.types.find((x) => /public\.file-url|text\/uri-list/.test(x));
      if (!t) continue;
      const blob = await item.getType(t);
      const raw = (typeof blob === "string" ? blob : await blob.text()).split(/\r?\n/).find((l) => l.startsWith("file://"));
      if (!raw) continue;
      const p = require("url").fileURLToPath(raw.trim());
      if (fs.existsSync(p) && fs.statSync(p).isFile()) return { path: p, name: path.basename(p) };
    }
  } catch (e) {
    console.warn("[stash] clipboard file read failed:", e.message);
  }
  return null;
}

async function readClipboard() {
  const file = await clipboardFile();
  if (file) return { kind: "file", ...file };
  const img = await clipboardImage();
  if (img) return { kind: "image", dataUrl: `data:${img.mime};base64,${img.buffer.toString("base64")}` };
  let text = "";
  try {
    text = await clipboard.readText();
  } catch {}
  return { kind: "text", text };
}

// ---- local server for the Dia / Chromium extension ---------------------------

function startServer() {
  const server = http.createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "content-type");
    if (req.method === "OPTIONS") return res.end();
    if (req.method === "GET" && req.url === "/ping") return res.end("stash");
    if (req.method !== "POST" || req.url !== "/capture") {
      res.statusCode = 404;
      return res.end();
    }
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      try {
        const p = JSON.parse(body || "{}");
        const item = await capture({
          type: p.kind === "image" ? "image" : p.kind === "selection" ? undefined : undefined,
          content: p.selection || p.linkUrl || p.pageUrl || "",
          imageUrl: p.srcUrl || null,
          source: p.pageUrl || null,
          title: p.kind === "page" ? p.pageTitle || "" : "",
          note: p.note || "",
        });
        if (petWin) petWin.webContents.send("pet:fed");
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ ok: true, id: item.id }));
      } catch (e) {
        res.statusCode = 500;
        res.end(JSON.stringify({ ok: false, error: String(e.message || e) }));
      }
    });
  });
  server.on("error", (e) => console.warn("[stash] capture server:", e.message));
  server.listen(PORT, "127.0.0.1");
}

// ---- IPC -------------------------------------------------------------------

ipcMain.handle("items:list", () => store.list());
ipcMain.handle("items:capture", (_e, input) => capture(input));
ipcMain.handle("items:captureClipboardImage", async (_e, note) => {
  const img = await clipboardImage();
  if (!img) return null;
  const ext = (img.mime.split("/")[1] || "png").replace("jpeg", "jpg").replace("svg+xml", "svg");
  const filePath = store.saveMedia(img.buffer, ext);
  return capture({ type: "image", filePath, note });
});
ipcMain.handle("items:update", (_e, id, patch) => {
  const it = store.update(id, patch);
  broadcast("items:changed");
  return it;
});
ipcMain.handle("items:archive", (_e, id) => {
  store.archive(id);
  broadcast("items:changed");
});
ipcMain.handle("items:reenrich", async (_e, id) => {
  const it = store.get(id);
  if (it) await enrich(it);
  broadcast("items:changed");
});
ipcMain.handle("settings:get", () => ({ ...store.getSettings(), apiKey: undefined, hasKey: !!store.getSettings().apiKey, ai: aiAvailable(), root: store.ROOT }));
ipcMain.handle("settings:set", (_e, patch) => {
  store.setSettings(patch);
  broadcast("settings:changed");
});
ipcMain.handle("clipboard:read", () => readClipboard());
ipcMain.handle("app:openMain", (_e, nav) => {
  const fresh = !mainWin;
  if (fresh) createMain();
  else mainWin.show();
  mainWin.focus();
  if (nav) {
    const send = () => mainWin && mainWin.webContents.send("ui:navigate", nav);
    fresh ? mainWin.webContents.once("did-finish-load", () => setTimeout(send, 200)) : send();
  }
});
ipcMain.handle("app:openExternal", (_e, url) => /^https?:\/\//.test(url) && shell.openExternal(url));
ipcMain.handle("app:reveal", (_e, p) => shell.showItemInFolder(p));
// Only opens files Stash itself saved, never arbitrary paths.
ipcMain.handle("app:openFile", (_e, p) => path.dirname(path.resolve(p)) === store.MEDIA && shell.openPath(p));

// The pet moves itself (a CSS drag region would swallow drops).
// ---- the dog wanders along whatever height you left it at --------------------
let walkTimer = null;
let petIsOpen = false;

function stopWalk() {
  if (!walkTimer) return;
  clearInterval(walkTimer);
  walkTimer = null;
  if (petWin && !petWin.isDestroyed()) petWin.webContents.send("pet:walk", { walking: false });
}

const BOTTOM_GAP = 8; // how far above the Dock / screen edge the dog walks
const WALK_SPEED = 1.1; // px per frame (~70px a second): an easy trot
const bottomYFor = (b, area) => area.y + area.height - b.height - BOTTOM_GAP;
let lastCarried = 0; // when you last dragged the dog somewhere
const STAY_PUT_MS = 2 * 60 * 1000; // a spot you chose is respected for this long

// Strolls happen only along the bottom of the screen. If you've dragged the dog
// somewhere else, it stays there a while, then hops back down before walking.
function wander() {
  if (!petWin || walkTimer || petIsOpen) return;
  const b = petWin.getBounds();
  const area = screen.getDisplayMatching(b).workArea;
  const atBottom = Math.abs(b.y - bottomYFor(b, area)) <= 40;
  if (!atBottom && Date.now() - lastCarried < STAY_PUT_MS) return;
  const min = area.x + 8;
  const max = area.x + area.width - b.width - 8;
  if (max - min < 60) return;
  // a short stroll: somewhere 120-480px away, inside the screen
  const dist = 120 + Math.random() * 360;
  let dir = Math.random() < 0.5 ? -1 : 1;
  if (b.x + dir * dist > max || b.x + dir * dist < min) dir = -dir;
  const target = Math.max(min, Math.min(max, b.x + dir * dist));
  petWin.webContents.send("pet:walk", { walking: true, dir });
  if (process.env.STASH_DEBUG) console.log(`[stash] dog strolls ${dir > 0 ? "right" : "left"} from x=${b.x} to x=${Math.round(target)}${atBottom ? "" : " (hopping down first)"}`);
  const started = Date.now();
  let fall = 2;
  let fx = null; // exact x, kept as a decimal between frames
  walkTimer = setInterval(() => {
    if (!petWin || petWin.isDestroyed()) return stopWalk();
    const nb = petWin.getBounds();
    const floor = bottomYFor(nb, screen.getDisplayMatching(nb).workArea);
    // first drop to the bottom edge, speeding up like a little hop down
    if (nb.y < floor - 1) {
      fall = Math.min(fall * 1.18, 28);
      return petWin.setPosition(nb.x, Math.round(Math.min(floor, nb.y + fall)));
    }
    if (fx === null) fx = nb.x;
    const dx = target - fx;
    if (Math.abs(dx) < 1 || Date.now() - started > 25000) return stopWalk();
    fx += Math.sign(dx) * Math.min(WALK_SPEED, Math.abs(dx)); // sub-pixel steps, so slow still looks smooth
    petWin.setPosition(Math.round(fx), floor);
  }, 16);
}

// Hover is decided here from the real cursor position. Mouse enter/leave events are
// unreliable on a window that resizes itself (macOS reports a false "leave" on every resize).
let petHover = false;
const DOG_ZONE = { w: 156, h: 124 }; // the dog's stage sits in the window's bottom-right corner
setInterval(() => {
  if (!petWin || petWin.isDestroyed()) return;
  const p = screen.getCursorScreenPoint();
  const b = petWin.getBounds();
  const inside = p.x >= b.x + b.width - DOG_ZONE.w && p.x <= b.x + b.width && p.y >= b.y + b.height - DOG_ZONE.h && p.y <= b.y + b.height;
  if (inside !== petHover) {
    petHover = inside;
    petWin.webContents.send("pet:hover", inside);
    if (process.env.STASH_DEBUG) console.log(`[stash] ${process.uptime().toFixed(1)}s hover ${inside}`);
  }
}, 120);

// ---- the dog peeks at your screen ------------------------------------------
// Which app is in front. macOS's lsappinfo needs no extra permission.
function frontApp() {
  return new Promise((resolve) => {
    execFile("lsappinfo", ["front"], (e1, asn) => {
      if (e1 || !asn.trim()) return resolve(null);
      execFile("lsappinfo", ["info", "-only", "name", asn.trim()], (e2, out) => {
        const m = !e2 && /"([^"]+)"/.exec(out || "");
        resolve(m ? m[1] : null);
      });
    });
  });
}

// Never look at these, whatever the setting says.
const PRIVATE_APPS = /1password|bitwarden|dashlane|lastpass|keychain|passwords|keepass|bank|wallet|coinbase|robinhood|zerodha|groww|health|signal/i;

async function peek() {
  const name = await frontApp();
  const settings = store.getSettings();
  if (settings.petPeeks === false || (name && PRIVATE_APPS.test(name))) return { app: name, text: null };
  if (!aiAvailable()) return { app: name, text: null, reason: "no-claude" };
  if (process.platform === "darwin" && systemPreferences.getMediaAccessStatus("screen") === "denied") return { app: name, text: null, reason: "no-permission" };
  try {
    const d = screen.getDisplayMatching(petWin ? petWin.getBounds() : screen.getPrimaryDisplay().bounds);
    const scale = Math.min(1, 1280 / d.size.width);
    const sources = await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: { width: Math.round(d.size.width * scale), height: Math.round(d.size.height * scale) } });
    const src = sources.find((s) => String(s.display_id) === String(d.id)) || sources[0];
    if (!src || src.thumbnail.isEmpty()) return { app: name, text: null, reason: "no-permission" };
    const jpeg = src.thumbnail.toJPEG(70).toString("base64"); // in memory only, never saved
    return { app: name, text: await dogComment(jpeg, name) };
  } catch (e) {
    console.warn("[stash] peek failed:", e.message);
    return { app: name, text: null };
  }
}
ipcMain.handle("pet:peek", () => peek());

ipcMain.on("pet:wander", wander);
ipcMain.on("pet:stopWalk", stopWalk);

ipcMain.on("pet:moveBy", (_e, dx, dy) => {
  if (!petWin) return;
  stopWalk();
  lastCarried = Date.now();
  const [x, y] = petWin.getPosition();
  petWin.setPosition(Math.round(x + dx), Math.round(y + dy));
});
ipcMain.on("pet:setOpen", (_e, open) => {
  if (!petWin) return;
  petIsOpen = open;
  if (open) stopWalk();
  if (open) petWin.focus();
});

// The window is exactly as big as what's showing (dog, bubble, card), so it never
// blocks clicks on the apps behind it. It grows up-and-left so the dog stays put.
ipcMain.on("pet:fit", (_e, w, h) => {
  if (!petWin) return;
  w = Math.max(60, Math.min(600, Math.ceil(w)));
  h = Math.max(60, Math.min(600, Math.ceil(h)));
  const b = petWin.getBounds();
  if (b.width === w && b.height === h) return;
  if (process.env.STASH_DEBUG) console.log(`[stash] ${(process.uptime()).toFixed(1)}s dog window ${b.width}x${b.height} -> ${w}x${h}`);
  petWin.setBounds({ x: b.x + b.width - w, y: b.y + b.height - h, width: w, height: h });
});

async function quickCapture() {
  if (!petWin) createPet();
  petWin.show();
  petWin.webContents.send("pet:quickCapture", await readClipboard());
}

app.whenReady().then(() => {
  protocol.handle("stash-media", (req) => {
    const name = path.basename(decodeURIComponent(new URL(req.url).pathname));
    return net.fetch(pathToFileURL(path.join(store.MEDIA, name)).toString());
  });
  createMain();
  createPet();
  startServer();
  const key = store.getSettings().hotkey || "Alt+Tab";
  if (!globalShortcut.register(key, quickCapture)) console.warn(`[stash] could not register hotkey ${key}`);
  app.on("activate", () => !mainWin && createMain());
});

app.on("window-all-closed", (e) => e.preventDefault()); // keep the pet alive
app.on("will-quit", () => globalShortcut.unregisterAll());

