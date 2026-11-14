import { createRoot } from "react-dom/client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { api } from "./api.js";
import Dog from "./Dog.jsx";
import { useStash, useNow, captureFromDataTransfer, attachmentsFromDataTransfer, filesToAttachments, saveAttachment } from "./useStash.js";
import { adjustedEstimate, fmtDuration, hasTime, isOpenTask, minutesLeftToday, dogPhase } from "./time.js";
import { pickQuip, bedtimeLine, appLine, touchLine, dragLine, fedLine, leaveLine, hoverLine } from "./quips.js";
import "./pet.css";

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// Little things an awake dog does when nobody's looking.
const FIDGETS = ["hop", "tilt", "look", "wiggle", "stretch", "sniff"];
const IDLE_FACES = ["peek-tongue", "peek-smile", "peek-happy", "peek-tongue-wide", "sit-confused", "thinking", "glowing"];

// What's being dragged in, from what the drag tells us before the drop.
function dragKind(dt) {
  const items = [...(dt?.items || [])];
  const files = items.filter((i) => i.kind === "file");
  if (files.length > 1) return "many";
  if (files.length === 1) {
    const t = files[0].type || "";
    if (t.startsWith("image/")) return "image";
    if (t === "application/pdf") return "pdf";
    return "file";
  }
  const types = [...(dt?.types || [])];
  if (types.includes("text/html") && items.some((i) => (i.type || "").startsWith("image/"))) return "image";
  if (types.includes("text/uri-list")) return "link";
  return "text";
}


function Pet() {
  const { items, settings } = useStash();
  const now = useNow(15000);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [atts, setAtts] = useState([]); // images, PDFs and files waiting to be saved with the note
  const [mood, setMood] = useState(null); // a short reaction pose
  const [hover, setHover] = useState(false);
  const [petting, setPetting] = useState(false); // hovered long enough to count as a pat
  const [over, setOver] = useState(false);
  const [carried, setCarried] = useState(false);
  const [walk, setWalk] = useState(null); // { dir } while strolling
  const [fidget, setFidget] = useState(null);
  const [face, setFace] = useState(null); // a passing idle expression
  const [heldPose, setHeldPose] = useState(null); // the shape kept while you hover
  const [say, setSay] = useState(null); // something the dog is saying: { text, action }
  const [touch, setTouch] = useState(null); // a quick reaction to being patted, picked up or put down
  const touchRecent = useRef([]);
  const lastClick = useRef(0); // for telling a double-click apart
  const dragDepth = useRef(0); // drag enter/leave fire for every child, so count them
  const touchTimer = useRef(null);
  // React to a touch sometimes, not every time, so it stays a little surprising.
  const blurt = (kind, chance) => {
    if (Math.random() > chance) return;
    clearTimeout(touchTimer.current);
    setTouch({ text: touchLine(kind, touchRecent.current) });
    touchTimer.current = setTimeout(() => setTouch(null), 2800);
  };
  const drag = useRef(null);
  const ta = useRef(null);
  const picker = useRef(null);
  const inner = useRef(null);
  const timers = useRef([]);

  // Size the window to exactly what's showing.
  useEffect(() => {
    const el = inner.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      api.petFit(r.width, r.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The text box grows with what you type (CSS caps it, then it scrolls).
  useLayoutEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + 2 + "px";
  }, [text, open, atts.length]);

  const later = (fn, ms) => timers.current.push(setTimeout(fn, ms));
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // A reaction is a little sequence of poses, e.g. glowing, then a satisfied tongue.
  const react = (seq = [["glowing", 1400], ["peek-tongue", 1400]]) => {
    let t = 0;
    seq.forEach(([pose, ms]) => {
      later(() => setMood(pose), t);
      t += ms;
    });
    later(() => setMood(null), t);
    setFidget("hop");
    later(() => setFidget(null), 700);
  };

  // Fed: a chomp, a glow, a little heart, and a line about what it ate.
  const feed = (n = 1, line = null) => {
    react([["peek-tongue", 650], ["glowing", 1200], ["peek-love", 900]]);
    setFidget("chomp");
    later(() => setFidget("hop"), 450);
    later(() => setFidget(null), 1100);
    clearTimeout(touchTimer.current);
    setTouch({ text: line || fedLine(n) });
    touchTimer.current = setTimeout(() => setTouch(null), 3200);
  };
  // Something landed in the open card: the same chomp, with an "attached" line.
  const kindOfAtts = (list) => (list.length > 1 ? "many" : list[0]?.kind === "image" ? "image" : /\.pdf$/i.test(list[0]?.name || "") ? "pdf" : "file");
  // With the card open, stay quiet: one small chomp, no words, while you're writing.
  const ateIntoCard = (list) => {
    if (!list.length) return;
    setFidget("chomp");
    later(() => setFidget(null), 450);
  };
  // Saved from the card: a little hop and one short line, nothing more.
  const savedNod = (n) => {
    setFidget("hop");
    later(() => setFidget(null), 600);
    clearTimeout(touchTimer.current);
    setTouch({ text: fedLine(n) });
    touchTimer.current = setTimeout(() => setTouch(null), 2200);
  };
  useEffect(() => api.onFed(() => feed(1)), []); // saves from the Dia extension count too
  useEffect(() => api.onHover((h) => setHover(!!h)), []);
  useEffect(() => api.onWalk((w) => setWalk(w.walking ? { dir: w.dir } : null)), []);
  useEffect(
    () =>
      api.onQuickCapture((clip) => {
        openCard();
        if (clip?.kind === "image") {
          setAtts([{ id: "clip", kind: "image", name: "clipboard image", preview: clip.dataUrl, dataUrl: clip.dataUrl }]);
          setText("");
        } else if (clip?.kind === "file") {
          setAtts([{ id: "clip", kind: "file", name: clip.name, path: clip.path }]);
          setText("");
        } else {
          setAtts([]);
          setText(clip?.text || "");
        }
      }),
    []
  );

  const openCard = () => {
    api.petStopWalk();
    setOpen(true);
    api.petSetOpen(true);
    setTimeout(() => ta.current?.focus(), 50);
  };
  const close = () => {
    setOpen(false);
    setAtts([]);
    api.petSetOpen(false);
  };

  const addAtts = (more) => more.length && setAtts((a) => [...a, ...more]);
  const save = async () => {
    // with attachments, the text becomes their note; on its own it's a note, link or to-do
    if (atts.length) for (const a of atts) await saveAttachment(a, text.trim());
    else if (text.trim()) await api.capture({ content: text });
    else return close();
    const n = Math.max(1, atts.length);
    setText("");
    close();
    savedNod(n);
  };

  // ---- what the dog is doing right now --------------------------------------
  const running = items.find((i) => isOpenTask(i) && i.startedAt);
  const runningEl = running ? (running.elapsedMin || 0) + (now - new Date(running.startedAt)) / 60000 : 0;
  const nextTimed = items
    .filter((i) => isOpenTask(i) && i.due && hasTime(i.due))
    .map((i) => ({ i, mins: (new Date(i.due) - now) / 60000 }))
    .filter((x) => x.mins > 0 && x.mins <= 60)
    .sort((a, b) => a.mins - b.mins)[0];
  const { pose: timeOfDay, asleep } = dogPhase(now);

  // Priority: carried > walking > something dragged over > reaction > typing > working > heads-up > being petted > hover > passing face > time of day
  const pose = carried
    ? "peek-surprised"
    : walk
      ? "running"
      : say && !open && !over
        ? say.pose || "peek-smile"
      : over
        ? "peek-starry"
        : mood ||
          (open
            ? "thinking"
            : running
              ? runningEl > adjustedEstimate(running, settings)
                ? "peek-surprised"
                : "holding"
              : nextTimed
                ? "peek-alert"
                : hover && heldPose
                  ? heldPose // hovering and pats change the words, never the shape
                  : face || timeOfDay);

  const idle = !open && !hover && !over && !carried && !walk && !mood && !say;

  // Freeze whatever shape the dog has when your cursor arrives, until it leaves.
  useEffect(() => {
    setHeldPose(hover ? face || timeOfDay : null);
  }, [hover]);
  const wanders = settings.petWanders !== false && !reducedMotion();

  // Idle life: fidgets and passing faces every few seconds while awake.
  useEffect(() => {
    if (!idle || reducedMotion()) return;
    const t = setTimeout(
      () => {
        if (!asleep && !running && Math.random() < 0.35) {
          setFace(pick(IDLE_FACES));
          later(() => setFace(null), rand(2200, 4200));
        } else {
          setFidget(asleep ? "dream" : pick(FIDGETS));
          later(() => setFidget(null), 1100);
        }
      },
      rand(asleep ? 9000 : 4500, asleep ? 16000 : 9000)
    );
    return () => clearTimeout(t);
  }, [idle, asleep, running, face, fidget]);

  // Strolls: left alone for a bit, the dog walks along the bottom of the screen.
  // Booleans only in the deps: objects change identity on every render, which used to
  // restart this timer every few seconds so the stroll never happened.
  const isWorking = !!running;
  const headsUp = !!nextTimed;
  useEffect(() => {
    if (!idle || !wanders || isWorking || headsUp) return;
    // awake: every 8-20s; asleep: a sleepy wander every minute or so
    const t = setTimeout(() => api.petWander(), asleep ? rand(45000, 90000) : rand(8000, 20000));
    return () => clearTimeout(t);
  }, [idle, wanders, asleep, isWorking, headsUp, walk]);

  // ---- talking: little remarks, plan nudges, and the odd peek at your screen ----
  const live = useRef({});
  live.current = { items, settings, open, hover, walk, asleep, say, over };
  useEffect(() => {
    let timer;
    let lastPeek = Date.now() - 20 * 60 * 1000 + rand(3, 6) * 60 * 1000; // first peek a few minutes in
    let peekGap = rand(12, 30) * 60 * 1000;
    const recentKey = "stash-recent-quips";
    const recent = () => {
      try {
        return JSON.parse(localStorage.getItem(recentKey)) || [];
      } catch {
        return [];
      }
    };
    const remember = (text) => {
      try {
        localStorage.setItem(recentKey, JSON.stringify([text, ...recent()].slice(0, 25)));
      } catch {}
    };
    const show = (q) => {
      if (!q || !q.text) return;
      remember(q.text);
      setSay(q);
      setTimeout(() => setSay((cur) => (cur === q ? null : cur)), Math.max(6500, q.text.length * 95));
    };
    const tick = async () => {
      const st = live.current;
      const talks = st.settings.petTalks !== false && !reducedMotion();
      if (!talks) return schedule(60000);
      if (st.open || st.hover || st.over || st.walk || st.say) return schedule(rand(15000, 30000)); // busy, try again soon
      // 1am bedtime nudge wins over everything else, asleep or not.
      const bedKey = "stash-bedtime-last";
      let bedLast = 0;
      try { bedLast = Number(localStorage.getItem(bedKey)) || 0; } catch {}
      const bed = bedtimeLine(new Date(), bedLast);
      if (bed) {
        try { localStorage.setItem(bedKey, String(Date.now())); } catch {}
        show(bed);
        return schedule(rand(60000, 120000));
      }
      const peekOn = st.settings.petPeeks !== false && !st.asleep;
      if (peekOn && Date.now() - lastPeek > peekGap) {
        lastPeek = Date.now();
        peekGap = rand(12, 30) * 60 * 1000;
        setMood("sit-confused"); // a curious little look before it says anything
        const res = await api.petPeek();
        setMood(null);
        const line = res?.text || appLine(res?.app);
        if (line) show({ text: line, pose: "peek-happy" });
        else show(pickQuip({ items: st.items, settings: st.settings, asleep: st.asleep, recent: recent() }));
      } else {
        show(pickQuip({ items: st.items, settings: st.settings, asleep: st.asleep, recent: recent() }));
      }
      schedule(st.asleep ? rand(6, 12) * 60000 : rand(70000, 180000));
    };
    const schedule = (ms) => {
      clearTimeout(timer);
      timer = setTimeout(tick, ms);
    };
    schedule(rand(20000, 35000)); // first remark shortly after you start
    return () => clearTimeout(timer);
  }, []);

  // Each hover gets its own line (never one of the last few).
  const [hoverText, setHoverText] = useState(null);
  const hoverRecent = useRef([]);
  useEffect(() => {
    if (hover) setHoverText(hoverLine({ items, settings, asleep, recent: hoverRecent.current }));
  }, [hover]);

  // A pat gets a reaction about two times in three.
  useEffect(() => {
    if (petting) blurt(asleep ? "patSleepy" : "pat", 0.65);
  }, [petting]);

  // Hovering for a moment counts as a pat.
  useEffect(() => {
    if (!hover) return setPetting(false);
    const t = setTimeout(() => setPetting(true), 1600);
    return () => clearTimeout(t);
  }, [hover]);

  // ---- the speech bubble ---------------------------------------------------
  let bubble = null;
  if (running) {
    bubble = `${fmtDuration(runningEl) || "0 min"} in${runningEl > adjustedEstimate(running, settings) ? " · past your guess" : ""}`;
  } else if (nextTimed) bubble = `${nextTimed.i.title.slice(0, 22)} in ${Math.round(nextTimed.mins)} min`;
  else if (touch) bubble = touch.text;
  else if (say) bubble = say.text;
  else if (petting && !asleep) bubble = "♥";
  else if (hover && hoverText) bubble = hoverText;

  const shown = open ? touch?.text : bubble; // with the card open, only reactions show

  // The drawings face left, so flip when walking right.
  const facing = walk ? (walk.dir > 0 ? -1 : 1) : 1;

  return (
    <div
      className={`pet ${open ? "open" : ""} ${over ? "over" : ""}`}
      onDragEnter={(e) => {
        e.preventDefault();
        dragDepth.current += 1;
        if (dragDepth.current > 1) return; // moving between the dog's own parts
        api.petStopWalk();
        setOver(true);
        // it notices what you're bringing and gets excited about it (quietly if you're writing)
        clearTimeout(touchTimer.current);
        if (!open) setTouch({ text: dragLine(dragKind(e.dataTransfer)), drag: true });
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current > 0) return;
        setOver(false);
        // took it away? sometimes it's a little disappointed
        clearTimeout(touchTimer.current);
        if (!open && Math.random() < 0.4) {
          setTouch({ text: leaveLine() });
          touchTimer.current = setTimeout(() => setTouch(null), 2200);
        } else setTouch(null);
      }}
      onDrop={async (e) => {
        e.preventDefault();
        dragDepth.current = 0;
        setOver(false);
        const count = Math.max(1, [...(e.dataTransfer.items || [])].filter((i) => i.kind === "file").length);
        if (open) {
          // card is open: attach it, so it gets saved together with the note
          const t = e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain"); // read before any await
          const more = await attachmentsFromDataTransfer(e.dataTransfer);
          if (more.length) {
            addAtts(more);
            ateIntoCard(more);
          } else if (t) {
            setText((x) => (x ? x + " " : "") + t.trim());
            ateIntoCard([{}]);
          } else setTouch(null);
          return;
        }
        if (await captureFromDataTransfer(e.dataTransfer, "")) feed(count);
        else setTouch(null);
      }}
    >
      <div className="petinner" ref={inner}>
      {open && (
        <div className="petcard">
          {atts.length > 0 && (
            <div className="atts">
              {atts.map((a) => (
                <div key={a.id} className={`att att-${a.kind}`} title={a.name}>
                  {a.kind === "image" ? (
                    <img src={a.preview} alt={a.name} />
                  ) : (
                    <>
                      <span className="fileglyph">{(a.name.split(".").pop() || "file").slice(0, 4).toUpperCase()}</span>
                      <span className="filename">{a.name}</span>
                    </>
                  )}
                  <button className="attx" aria-label={`Remove ${a.name}`} onClick={() => setAtts((x) => x.filter((y) => y.id !== a.id))}>×</button>
                </div>
              ))}
            </div>
          )}
          <textarea
            ref={ta}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={atts.length ? "add a note (optional)…" : "dump anything… paste an image, link or PDF"}
            onPaste={(e) => {
              const hasFiles = [...(e.clipboardData?.items || [])].some((i) => i.kind === "file");
              if (!hasFiles) return; // plain text and links paste normally
              e.preventDefault();
              attachmentsFromDataTransfer(e.clipboardData).then((more) => {
                addAtts(more);
                ateIntoCard(more);
              });
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                save();
              }
              if (e.key === "Escape") close();
              if (e.key === "Backspace" && !text && atts.length) setAtts((x) => x.slice(0, -1));
            }}
          />
          <input
            ref={picker}
            type="file"
            multiple
            hidden
            onChange={async (e) => {
              const more = await filesToAttachments(e.target.files);
              addAtts(more);
              ateIntoCard(more);
              e.target.value = "";
              ta.current?.focus();
            }}
          />
          <div className="petrow">
            <button className="link" onClick={() => picker.current?.click()}>+ add file</button>
            <button className="link" onClick={() => api.openMain()}>open stash</button>
            <span className="hint">↵ save · esc</span>
          </div>
        </div>
      )}
      {shown && !walk &&
        (!open && say && shown === say.text ? (
          <button
            className={`bubble talk ${say.action ? "act" : ""}`}
            key={shown}
            onClick={() => {
              if (say.action) api.openMain(say.action); // e.g. open that card, or the Plans view
              setSay(null);
            }}
          >
            {shown}
            {say.action && <span className="bubble-go" aria-hidden="true"> ↗</span>}
          </button>
        ) : (
          <div className="bubble" key={shown}>
            {shown}
          </div>
        ))}
      <div
        className={`dogwrap ${walk ? "walking" : ""} ${fidget ? `fidget-${fidget}` : ""} ${carried ? "carried" : ""}`}
        style={{ "--facing": facing }}
        // In the app, hover comes from the real cursor position (see onHover). In a browser, use mouse events.
        onMouseEnter={() => !api.isElectron && setHover(true)}
        onMouseLeave={() => !api.isElectron && setHover(false)}
        onPointerDown={(e) => {
          api.petStopWalk();
          drag.current = { x: e.screenX, y: e.screenY, moved: false };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const dx = e.screenX - drag.current.x;
          const dy = e.screenY - drag.current.y;
          if (Math.abs(dx) + Math.abs(dy) > 3 || drag.current.moved) {
            if (!drag.current.moved) {
              setCarried(true);
              blurt("pickup", 0.5);
            }
            drag.current.moved = true;
            api.petMoveBy(dx, dy);
            drag.current.x = e.screenX;
            drag.current.y = e.screenY;
          }
        }}
        onPointerUp={() => {
          const wasDrag = drag.current?.moved;
          drag.current = null;
          if (wasDrag) {
            setCarried(false);
            blurt("drop", 0.45);
            setFidget("land");
            later(() => setFidget(null), 500);
            return;
          }
          // one click: the card, right away. a quick second click: the Stash window.
          const now = Date.now();
          if (now - lastClick.current < 300) {
            lastClick.current = 0;
            close();
            api.openMain();
            return;
          }
          lastClick.current = now;
          if (open) close();
          else openCard();
        }}
      >
        <div className="flip">
          <div className="posepop" key={pose}>
            <Dog pose={pose} size={140} />
          </div>
          {walk && (
            // little dust puffs kicked up behind the running dog
            <span className="dust" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<Pet />);
