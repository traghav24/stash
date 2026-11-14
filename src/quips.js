// Things the dog says on its own. Novelty is the point: lots of lines, picked by what's
// going on (time, plans, saves, the app you're in), never the same line twice in a row.
import { adjustedEstimate, daysBetween, fmtDuration, hasTime, isOpenTask, minutesLeftToday, dogPhase, pickNext, relativeDay, relativeTime, todayTasks } from "./time.js";

const pick = (list) => list[Math.floor(Math.random() * list.length)];
const short = (s, n = 28) => {
  const t = (s || "").replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t;
};

// ---- time of day ----------------------------------------------------------
// Matches the dog's own day (see dogPhase in time.js).
function timeLines(now) {
  const { phase } = dogPhase(now);
  return {
    waking: ["*big stretch* good morning", "still waking up… give me a sec", "early start? i'll get my tiny coffee", "rise and dump"],
    morning: ["morning brain is the best brain. use it!", "i'm SO awake right now 🐾", "one thing at a time. i'll hold the rest", "big focus energy today", "have you had water? i had water"],
    lunch: ["lunch o'clock? i'm thinking about lunch", "full tummy. nap is coming…", "halfway through the day already!"],
    evening: ["i'm awake again! what did i miss?", "evening zoomies 🐕", "nap done. let's go", "second wind! pick the easiest win", "tiny walk? i'll come", "anything to dump before tonight?"],
    drowsy: ["*yawn* it's getting late…", "my eyes are getting heavy", "it's getting late. start winding down?", "sleepy dog hours. wrap up soon?", "i'm getting cozy. you should too"],
    night: ["zzz… you should be asleep too"],
    nap: ["zzz… afternoon nap"],
  }[phase];
}

// ---- bedtime ----------------------------------------------------------------
// From 1am to 5am the dog tells you to sleep: once as soon as it hits 1am, then
// again every ~30 minutes while you're still up. Returns null when it's not time.
const BEDTIME = [
  "i'm off to sleep now. you sleep too, ok? 🌙",
  "zzz… why are you still up? go to bed",
  "*one eye opens* sleep. now. please",
  "your plans will still be here tomorrow. sleep 🌙",
  "zzz… the dog is asleep. the human should be too",
  "mm… it's so late… close the laptop…",
];
export function bedtimeLine(now = new Date(), lastAt = 0) {
  const h = now.getHours();
  if (h < 1 || h >= 5) return null;
  const tonight1am = new Date(now).setHours(1, 0, 0, 0);
  const due = lastAt < tonight1am || now - lastAt >= 30 * 60000;
  return due ? { text: now - tonight1am < 30 * 60000 ? BEDTIME[0] : pick(BEDTIME.slice(1)), pose: now - tonight1am < 30 * 60000 ? "half-asleep" : "peek-sleepy" } : null;
}

// ---- just for fun -----------------------------------------------------------
const FUN = [
  "i found a crumb on your screen",
  "stretch with me 🐕",
  "is it snack time. asking for me",
  "i'm guarding your files. very serious",
  "you're doing better than you think",
  "boop",
  "i learned a new trick: sitting",
  "your brain is a nice place. busy, but nice",
  "remember to blink",
  "shoulders down, jaw unclenched",
  "if you lose focus, that's fine. come back to me",
  "my tail says hello",
  "wanna dump a thought? click me",
  "i like it here",
];

// ---- plans and reminders -------------------------------------------------------
function planLines(items, settings, now) {
  const out = [];
  const today = todayTasks(items, now);
  const left = minutesLeftToday(settings, now);
  const open = items.filter(isOpenTask);
  const doneToday = items.filter((i) => i.done && i.doneAt && daysBetween(new Date(i.doneAt), now) === 0);

  // the next thing with a time on it
  const timed = open
    .filter((i) => i.due && hasTime(i.due) && new Date(i.due) > now)
    .sort((a, b) => new Date(a.due) - new Date(b.due))[0];
  if (timed) {
    const rel = relativeTime(timed.due, now) || relativeDay(timed.due, now);
    out.push({ text: pick([`psst: "${short(timed.title)}" ${rel}`, `heads up, "${short(timed.title)}" is ${rel}`, `don't forget "${short(timed.title)}", ${rel}`]), action: { open: timed.id }, weight: 3 });
  }

  // today, gently
  if (today.length) {
    const next = pickNext(items, settings, now);
    if (next)
      out.push({
        text: pick([
          `${today.length} thing${today.length > 1 ? "s" : ""} today. start with "${short(next.title, 22)}"?`,
          `what if we just did "${short(next.title, 24)}"? ~${fmtDuration(adjustedEstimate(next, settings))}`,
          `tiny win available: "${short(next.title, 24)}"`,
        ]),
        action: { open: next.id },
        weight: 3,
      });
  } else if (open.length === 0) {
    out.push({ text: pick(["no plans today. suspicious 🕵️", "free day? dump some ideas in me", "nothing due. we could nap"]), weight: 1 });
  }

  // things that slipped, no guilt
  const slipped = open.filter((i) => i.due && daysBetween(now, new Date(i.due)) < 0); // due before today
  if (slipped.length) {
    const s = pick(slipped);
    out.push({ text: pick([`"${short(s.title, 24)}" is still hanging around. 10 min?`, `no rush, but "${short(s.title, 24)}" misses you`, `want to move "${short(s.title, 22)}" to tomorrow?`]), action: { open: s.id }, weight: 2 });
  }

  // the clock you can't feel
  if (left > 0 && left < 9 * 60 && (today.length || open.length)) {
    out.push({ text: pick([`~${fmtDuration(left)} of work time left ⏳`, `you've got about ${fmtDuration(left)} left today`, `${fmtDuration(left)} left. plenty for one thing`]), action: { view: "plans" }, weight: 2 });
  }

  // small celebrations
  if (doneToday.length) {
    out.push({ text: pick([`you finished ${doneToday.length} thing${doneToday.length > 1 ? "s" : ""} today ✨`, `"${short(doneToday[0].title, 22)}" done. proud of you`, "look at you, getting stuff done"]), weight: 2 });
  }

  // coming up soon
  const soon = open.filter((i) => i.due && daysBetween(now, new Date(i.due)) >= 1 && daysBetween(now, new Date(i.due)) <= 3);
  if (soon.length) {
    const s = pick(soon);
    out.push({ text: `"${short(s.title, 24)}" is ${relativeDay(s.due, now)}`, action: { open: s.id }, weight: 1 });
  }
  return out;
}

// ---- old saves, brought back ----------------------------------------------------------
function resurface(items, now) {
  const old = items.filter((i) => !i.isTask && daysBetween(new Date(i.createdAt), now) >= 2);
  if (!old.length) return [];
  const it = pick(old);
  const what = it.title || it.content || it.note || "this";
  const ago = daysBetween(new Date(it.createdAt), now);
  return [
    {
      text: pick([`remember this? "${short(what, 26)}"`, `found this in the pile: "${short(what, 24)}"`, `${ago} days ago you saved "${short(what, 22)}"`, `still into "${short(what, 26)}"?`]),
      action: { open: it.id },
      weight: 2,
    },
  ];
}

// ---- the app you're in --------------------------------------------------------------
const APP_LINES = [
  [/figma|sketch|framer|penpot/i, ["ooh, designing? make it pretty", "pixels! i love pixels", "nudge it 1px left. no, right. perfect"]],
  [/slack|teams|discord|messages|whatsapp|telegram/i, ["chatting? don't let it eat your afternoon", "inbox brain! one reply then back?", "talking to humans. i'll wait"]],
  [/mail|outlook|superhuman/i, ["email time? two minutes rule!", "you vs. the inbox. i believe in you"]],
  [/dia|chrome|safari|arc|firefox|brave|edge/i, ["what are we reading?", "tab number… a lot. that's okay", "found anything for the stash?"]],
  [/code|cursor|xcode|terminal|iterm|warp|claude/i, ["building something? i'll fetch snacks", "beep boop. very smart stuff", "ship it? 🚢"]],
  [/spotify|music/i, ["what are we listening to?", "my tail is wagging to this"]],
  [/notion|notes|obsidian|craft|bear/i, ["writing things down! love that", "notes? dump some in me too"]],
  [/zoom|meet|facetime|webex/i, ["meeting? i'll be quiet. mostly"]],
  [/youtube|netflix|tv|prime/i, ["break time? enjoy it", "is it a good one?"]],
];
export function appLine(app) {
  if (!app) return null;
  const hit = APP_LINES.find(([re]) => re.test(app));
  return hit ? pick(hit[1]) : null;
}

// Pick something to say. `recent` holds the last lines said, so nothing repeats too soon.
export function pickQuip({ items, settings, now = new Date(), asleep, recent = [] }) {
  if (asleep) {
    const nap = dogPhase(now).phase === "nap";
    return { text: pick(nap ? ["zzz… afternoon nap", "zzz… wake me at 4:30", "mm… five more minutes", "zzz… dreaming about your plans"] : ["zzz… *snore*", "zzz… you should be asleep too", "mm… it's so late… bed…", "zzz… dreaming about tomorrow"]) };
  }
  const pool = [
    ...planLines(items, settings, now),
    ...resurface(items, now),
    ...timeLines(now).map((text) => ({ text, weight: 1 })),
    ...FUN.map((text) => ({ text, weight: 0.4 })),
  ].filter((q) => !recent.includes(q.text));
  if (!pool.length) return { text: pick(FUN) };
  const total = pool.reduce((s, q) => s + (q.weight || 1), 0);
  let r = Math.random() * total;
  for (const q of pool) if ((r -= q.weight || 1) <= 0) return q;
  return pool[0];
}

// ---- when you touch the dog -------------------------------------------------------
const TOUCH = {
  pat: [
    "hehe that tickles", "more pats pls", "you have nice hands", "my favourite human", "wag wag wag", "♥", "again again",
    "best part of my day", "ok one more", "i'm a good dog right", "hi hi hi", "ear scratch? perfect", "purr. wait. that's cats",
    "you found the spot!", "this is my love language", "i'll remember this forever", "*happy dog noises*", "pat accepted ✓",
    "we're friends now", "can you do the other ear", "mmm cozy", "boop me back", "you smell like snacks", "10/10 pat",
  ],
  patSleepy: ["mm… five more minutes", "zzz… oh hi", "*sleepy wag*", "mmh… nice", "still sleeping… keep going", "zzz… pats in my dream"],
  pickup: [
    "wheee!", "where are we going?", "i can see my house from here", "up up up", "flying dog!", "careful, i'm precious",
    "adventure time", "hold me tight", "am i a bird now", "woah", "this is a lot of height",
  ],
  drop: [
    "new spot! i like it", "thanks for the ride", "nailed the landing", "ok i live here now", "nice view", "again?",
    "that was fun", "*shakes off*", "home sweet home", "i'll explore from here",
  ],
};
// One line for a touch, avoiding anything said recently. `recent` is mutated (kept short).
export function touchLine(kind, recent = []) {
  const pool = (TOUCH[kind] || TOUCH.pat).filter((t) => !recent.includes(t));
  const line = pick(pool.length ? pool : TOUCH[kind] || TOUCH.pat);
  recent.unshift(line);
  recent.splice(12);
  return line;
}

// ---- when you drag things onto the dog ------------------------------------------------
const DRAG = {
  image: ["ooh, a picture!", "is that for me?? 🖼️", "pretty! gimme", "art! i love art"],
  pdf: ["a document! i'll read it (i can't read)", "ooh, homework?", "paperwork snack", "a pdf! fancy"],
  file: ["a file! what's inside?", "ooh, mystery file", "is it a bone-shaped file"],
  link: ["a link? gimme gimme", "ooh where does this go", "web snack incoming"],
  text: ["words! i love words", "a thought? i'll keep it safe", "ooh, what's this"],
  many: ["SO MANY THINGS", "a whole feast?!", "all for me??", "my mouth is open"],
};
const FED = {
  one: ["nom nom. saved!", "yum. it's in the stash", "delicious, filed away", "*crunch* got it", "safe with me ✓", "mmm, good one"],
  many: (n) => [`${n} things! a feast`, `nom ×${n}. all saved`, `${n} snacks, all safe`, `wow, ${n}! i'm full`],
  attach: ["added to your note!", "clipped it on ✓", "attached!"],
};
const LEAVE = ["aw, was that not for me?", "…oh. ok.", "i'll be here if you change your mind", "tease!"];

const sample = (list) => list[Math.floor(Math.random() * list.length)];
export const dragLine = (kind) => sample(DRAG[kind] || DRAG.file);
export const fedLine = (n = 1) => sample(n > 1 ? FED.many(n) : FED.one);
// Attached to the open card (not saved yet): same excitement, honest wording.
const ATTACH = {
  image: ["nom, a picture for your note", "pretty! clipped it on", "ooh, art on your note"],
  pdf: ["paperwork snack, attached", "a pdf! clipped on", "document nommed onto your note"],
  file: ["clipped it on ✓", "mystery file, attached", "nom, it's on your note"],
  link: ["link nommed onto your note", "web snack, attached"],
  text: ["added to your note!", "words! tucked in"],
};
export const attachLine = (kind = "file", n = 1) =>
  n > 1 ? sample([`${n} snacks on your note!`, `nom ×${n}, all attached`, `${n} things clipped on ✓`]) : sample(ATTACH[kind] || FED.attach);
export const leaveLine = () => sample(LEAVE);

// ---- when you hover over the dog ------------------------------------------------------
// Something different each time: a hello, a hint, what's next, or the time you have left.
export function hoverLine({ items = [], settings = {}, now = new Date(), asleep = false, recent = [] }) {
  if (asleep) {
    const sleepy = ["zzz… *one eye opens*", "mm? oh hi", "sleepy… but hi", "*yawns* hello", "is it morning yet?"].filter((t) => !recent.includes(t));
    return remember(sample(sleepy.length ? sleepy : ["mm? oh hi"]), recent);
  }
  const start = settings.dayStart ?? 10;
  const left = minutesLeftToday(settings, now);
  const timeLine =
    now.getHours() < start ? `day starts at ${start % 12 || 12}${start < 12 ? "am" : "pm"}` : left > 0 ? `~${fmtDuration(left)} of work time left` : "day's done, rest";
  const next = pickNext(items, settings, now);
  const saved = items.filter((i) => !i.archived).length;
  const pool = [
    "hi!", "oh hey you", "hello hello", "need something?", "you rang?", "*perks up*", "hey bestie", "what's up?",
    "i was just thinking about you", "oh! it's you", "hiii", "*tail wag*",
    "click me to dump a thought", "double-click opens your stash", "drag stuff onto me!",
    timeLine, timeLine,
    ...(next ? [`next up: "${short(next.title, 24)}"`, `maybe "${short(next.title, 24)}"?`] : []),
    ...(saved ? [`${saved} thing${saved > 1 ? "s" : ""} in the stash`] : []),
  ].filter((t) => !recent.includes(t));
  return remember(sample(pool.length ? pool : ["hi!"]), recent);
}
function remember(line, recent) {
  recent.unshift(line);
  recent.splice(8);
  return line;
}
