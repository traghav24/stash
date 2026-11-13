// Sorts each saved item after the fact, so saving never asks you anything.
// With Claude available: category, tags, task detection, due date, estimate, first tiny step.
// Without it: a local fallback using date parsing and simple rules.
const fs = require("fs");
const path = require("path");
const chrono = require("chrono-node");
const store = require("./store.cjs");

let Anthropic = null;
try {
  Anthropic = require("@anthropic-ai/sdk").default || require("@anthropic-ai/sdk");
} catch {}

let aiBroken = false; // stop retrying for this run if credentials are missing

const TASK_WORDS =
  /^(todo|to do|call|email|send|buy|book|pay|finish|fix|write|submit|renew|schedule|reply|text|order|clean|pick up|prepare|plan|start|review|cancel|return|apply|meet|remember|remind|make|design|build|draft|update|get|do|create|ask|check|find|research|sort|organi[sz]e|set up|finalize|share|post|edit|read|learn|practice|go to|visit)\b/i;

function guessDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function fallback(item) {
  const text = [item.content, item.note].filter(Boolean).join(" ");
  const parsed = item.type === "note" || item.type === "text" ? chrono.parse(text, new Date(), { forwardDate: true }) : [];
  const due = parsed[0] ? parsed[0].start.date() : null;
  const isTask = !!due || (item.type === "note" && TASK_WORDS.test(text.trim()));
  const domain = item.source ? guessDomain(item.source) : null;
  const cluster = isTask
    ? "Plans"
    : {
        image: domain && domain.includes("pinterest") ? "Pinterest finds" : "Visual inspo",
        file: /\.pdf$/i.test(item.file || "") ? "PDFs & docs" : "Files",
        code: "Code snippets",
        music: "Music",
        link: domain ? `From ${domain}` : "Links",
        text: "Quotes & highlights",
        note: "Thoughts",
      }[item.type] || "Unsorted";
  const firstLine = text.split("\n")[0].slice(0, 70);
  return {
    title: item.title || firstLine || (item.type === "image" ? "Image" : "Untitled"),
    cluster,
    tags: domain ? [domain] : [],
    isTask,
    due: due ? due.toISOString() : null,
    estimateMin: isTask ? 30 : null,
    firstStep: "",
  };
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "cluster", "tags", "isTask", "due", "estimateMin", "firstStep"],
  properties: {
    title: { type: "string", description: "Short human title, max 8 words." },
    cluster: { type: "string", description: "Topic/theme group. Reuse an existing one when it fits." },
    tags: { type: "array", items: { type: "string" } },
    isTask: { type: "boolean", description: "True if this is something the person intends to do." },
    due: { type: ["string", "null"], description: "ISO 8601 local datetime if a time/date is implied, else null." },
    estimateMin: { type: ["integer", "null"], description: "Realistic minutes the task takes, else null." },
    firstStep: { type: "string", description: "For tasks over 30 min: a tiny 2-minute first step. Else empty." },
  },
};

// Only true when there's an actual way to sign in: a key in Settings, an env var, or
// an `ant auth login` profile. (Creating the client never fails on its own, so it
// can't be used as the test; that made the app think Claude was connected when it wasn't.)
const os = require("os");
function hasCredentials() {
  if (store.getSettings().apiKey || process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) return true;
  try {
    return fs.readdirSync(path.join(os.homedir(), ".config", "anthropic")).length > 0;
  } catch {
    return false;
  }
}

function client() {
  if (!Anthropic || aiBroken || !hasCredentials()) return null;
  const key = store.getSettings().apiKey || process.env.ANTHROPIC_API_KEY;
  try {
    return key ? new Anthropic({ apiKey: key }) : new Anthropic(); // falls back to an `ant auth login` profile
  } catch {
    aiBroken = true;
    return null;
  }
}

async function withClaude(item) {
  const c = client();
  if (!c) return null;
  const clusters = [...new Set(store.list().map((i) => i.cluster))].filter((x) => x !== "Unsorted");
  const now = new Date();
  const content = [];
  if (item.type === "image" && item.file) {
    const ext = path.extname(item.file).slice(1).toLowerCase();
    const media = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp" }[ext];
    const size = fs.statSync(item.file).size;
    if (media && size < 4.5 * 1024 * 1024) {
      content.push({ type: "image", source: { type: "base64", media_type: media, data: fs.readFileSync(item.file).toString("base64") } });
    }
  }
  if (item.type === "file" && item.file && /\.pdf$/i.test(item.file)) {
    const size = fs.statSync(item.file).size;
    if (size < 20 * 1024 * 1024) {
      content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: fs.readFileSync(item.file).toString("base64") } });
    }
  }
  content.push({
    type: "text",
    text: [
      `Now: ${now.toString()}`,
      `Existing clusters: ${clusters.join(", ") || "(none yet)"}`,
      `Item type: ${item.type}`,
      item.title ? `File/title: ${item.title}` : "",
      item.source ? `Source: ${item.source}` : "",
      item.content && item.type !== "image" ? `Content:\n${item.content.slice(0, 4000)}` : "",
      item.note ? `Their note: ${item.note}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  });

  const res = await c.beta.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 2000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
    system:
      "You organize a person's digital commonplace book: things they saved from their screen plus quick notes and to-dos. " +
      "Group items into broad, friendly topic clusters (2-3 words, e.g. 'Kitchen ideas', 'Type & lettering', 'Work admin'). " +
      "Prefer reusing an existing cluster over inventing a near-duplicate. Tasks go in a topic cluster too, not a generic 'Tasks' one. " +
      "Resolve relative dates ('thursday', 'next week') against Now. Be generous but realistic with estimates: people with ADHD underestimate.",
    messages: [{ role: "user", content }],
  });
  if (res.stop_reason === "refusal") return null;
  const text = res.content.find((b) => b.type === "text");
  return text ? JSON.parse(text.text) : null;
}

// Real titles for links and songs (oEmbed for music services, <title> for everything else).
async function fetchTitle(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 5000);
  try {
    const oembed = /spotify\.com/.test(url)
      ? `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`
      : /youtube\.com|youtu\.be/.test(url)
        ? `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`
        : /soundcloud\.com/.test(url)
          ? `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(url)}`
          : null;
    if (oembed) {
      const j = await (await fetch(oembed, { signal: ctrl.signal })).json();
      return [j.title, j.author_name].filter(Boolean).join(" · ");
    }
    const res = await fetch(url, { signal: ctrl.signal, headers: { "user-agent": "Mozilla/5.0 Stash" } });
    const html = (await res.text()).slice(0, 200000);
    const m = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i) || html.match(/<title[^>]*>([^<]+)<\/title>/i);
    return m ? m[1].trim().replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"') : "";
  } catch {
    return "";
  } finally {
    clearTimeout(t);
  }
}

async function enrich(item) {
  if ((item.type === "link" || item.type === "music") && !item.title && item.source && /^https?:/.test(item.source)) {
    const title = await fetchTitle(item.source);
    if (title) item = store.update(item.id, { title });
  }
  let result = null;
  try {
    result = await withClaude(item);
  } catch (err) {
    const status = err && err.status;
    if (status === 401 || status === 403 || /api key|credential|auth/i.test(String(err && err.message))) aiBroken = true;
    console.warn("[stash] Claude enrich failed, using local rules:", err && err.message);
  }
  const data = result || fallback(item);
  return store.update(item.id, { ...data, title: item.title || data.title, enriched: true, enrichedBy: result ? "claude" : "local" });
}

// One playful line from the dog about a glance at your screen. The screenshot is only
// held in memory for this call and never written to disk.
async function dogComment(jpegBase64, app) {
  const c = client();
  if (!c) return null;
  try {
    const res = await c.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 300,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      system:
        "You are a small, sweet cartoon dog who lives at the bottom of the user's screen. The user has ADHD and enjoys playful, " +
        "kind little remarks that give their brain a spark of novelty. Look at the screenshot and say ONE short line (max 12 words, " +
        "lowercase, no hashtags, at most one emoji) about what they seem to be doing. Be warm, curious or gently encouraging; never " +
        "scold. Speak only in generalities: never quote or mention names, messages, numbers, emails, addresses or anything personal " +
        "you can read. If the screen looks private (passwords, banking, health, intimate chats) or you can't tell, reply exactly: SKIP",
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: jpegBase64 } },
            { type: "text", text: `Front app: ${app || "unknown"}. One line, please.` },
          ],
        },
      ],
    });
    if (res.stop_reason === "refusal") return null;
    const t = res.content.find((b) => b.type === "text");
    const line = t && t.text.trim().replace(/^["']|["']$/g, "");
    return !line || /^SKIP\b/i.test(line) ? null : line.slice(0, 120);
  } catch (err) {
    console.warn("[stash] dog comment failed:", err && err.message);
    return null;
  }
}

module.exports = { enrich, dogComment, aiAvailable: () => !!client() };
