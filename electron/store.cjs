// Everything lives in ~/Stash as plain files: items.json, settings.json, media/.
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

const ROOT = process.env.STASH_DIR || path.join(os.homedir(), "Stash");
const MEDIA = path.join(ROOT, "media");
const ITEMS = path.join(ROOT, "items.json");
const SETTINGS = path.join(ROOT, "settings.json");

fs.mkdirSync(MEDIA, { recursive: true });

const DEFAULT_SETTINGS = {
  dayStart: 10, // working hours, 24h clock
  dayEnd: 19,
  apiKey: "", // optional; ANTHROPIC_API_KEY or an `ant auth login` profile also work
  hotkey: "Alt+Tab",
  petWanders: true, // the dog strolls around when you're not using it
  petTalks: true, // the dog says little things now and then
  petPeeks: true, // the dog glances at your screen (a small screenshot to Claude, never saved)
  estimateRatio: {}, // per-cluster: how long things really take you vs. the guess
};

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file); // atomic, so a crash never leaves half a file
}

let items = readJson(ITEMS, []);
let settings = { ...DEFAULT_SETTINGS, ...readJson(SETTINGS, {}) };

const id = () => crypto.randomBytes(6).toString("hex");

module.exports = {
  ROOT,
  MEDIA,
  list: () => items.filter((i) => !i.archived),
  get: (itemId) => items.find((i) => i.id === itemId),
  add(partial) {
    const now = new Date().toISOString();
    const item = {
      id: id(),
      createdAt: now,
      lastTouched: now,
      type: "note", // image | text | code | link | music | note
      content: "",
      file: null,
      note: "",
      source: null,
      title: "",
      cluster: "Unsorted",
      tags: [],
      isTask: false,
      due: null,
      estimateMin: null,
      firstStep: "",
      done: false,
      enriched: false,
      ...partial,
    };
    items.push(item);
    writeJson(ITEMS, items);
    return item;
  },
  update(itemId, patch) {
    const item = items.find((i) => i.id === itemId);
    if (!item) return null;
    Object.assign(item, patch, { lastTouched: new Date().toISOString() });
    writeJson(ITEMS, items);
    return item;
  },
  // "Remove" archives instead of deleting, so nothing is ever truly lost.
  archive(itemId) {
    return module.exports.update(itemId, { archived: true });
  },
  saveMedia(buffer, ext) {
    const name = `${Date.now()}-${id()}.${ext}`;
    const full = path.join(MEDIA, name);
    fs.writeFileSync(full, buffer);
    return full;
  },
  getSettings: () => settings,
  setSettings(patch) {
    settings = { ...settings, ...patch };
    writeJson(SETTINGS, settings);
    return settings;
  },
};
