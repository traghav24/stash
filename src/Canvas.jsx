import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api.js";
import ItemCard from "./ItemCard.jsx";
import Dog from "./Dog.jsx";
import { daysBetween } from "./time.js";

const CARD_W = 220;
const DRAG_START = 4; // px of movement before a press becomes a drag
const AREA_W = 1150; // the scatter spreads across this width, and grows downward as you dump more
const PAD = 22; // breathing room the scatter tries to keep between cards

const hash = (s) => {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
};
// A tiny seeded random generator: the same card always gets the same "random" spot.
const seeded = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// A loose, hand-tossed tilt per card (same card, same tilt every time).
const tiltFor = (id) => (seeded(hash(id + "tilt"))() - 0.5) * 5; // -2.5deg to 2.5deg

// Rough card height for spacing (exact heights would make cards shuffle as they load).
const roughH = (it) => (it.type === "image" ? 230 : it.type === "code" ? 190 : it.note ? 150 : 110);

// The canvas is a dump: every card sits wherever it landed. Cards you've moved keep
// their spot (item.pos); the rest are tossed onto a free patch, oldest first.
export default function Canvas({ items, onOpen }) {
  const [view, setView] = useState({ x: 40, y: 30, z: 1 });
  const [drag, setDrag] = useState(null); // { id, x, y }
  const [front, setFront] = useState([]); // most recently touched cards sit on top
  const [local, setLocal] = useState({}); // drops shown instantly, before the save comes back
  const pan = useRef(null);
  const press = useRef(null);
  const tapped = useRef(null);
  const ref = useRef(null);
  const viewRef = useRef(view);
  viewRef.current = view;

  // Forget optimistic drops once the saved item matches them.
  useEffect(() => {
    setLocal((l) => {
      const ids = Object.keys(l).filter((id) => {
        const it = items.find((i) => i.id === id);
        return it && !(it.pos && it.pos.x === l[id].pos.x && it.pos.y === l[id].pos.y);
      });
      return ids.length === Object.keys(l).length ? l : Object.fromEntries(ids.map((id) => [id, l[id]]));
    });
  }, [items]);
  const cards = useMemo(() => items.map((i) => (local[i.id] ? { ...i, ...local[i.id] } : i)), [items, local]);

  // Toss unplaced cards onto free spots, oldest first, so a new dump never moves the old ones.
  const scatter = useMemo(() => {
    const spots = {};
    const taken = cards.filter((i) => i.pos).map((i) => ({ x: i.pos.x, y: i.pos.y, w: CARD_W, h: roughH(i) }));
    const free = cards.filter((i) => !i.pos).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    const overlap = (a, b) => {
      const w = Math.min(a.x + a.w + PAD, b.x + b.w + PAD) - Math.max(a.x, b.x);
      const h = Math.min(a.y + a.h + PAD, b.y + b.h + PAD) - Math.max(a.y, b.y);
      return w > 0 && h > 0 ? w * h : 0;
    };
    free.forEach((it, n) => {
      const rnd = seeded(hash(it.id));
      const h = roughH(it);
      // the area grows with the number of cards, so the board never gets crammed
      const areaH = Math.max(520, Math.sqrt(taken.length + n + 1) * 230);
      let best = null;
      for (let tries = 0; tries < 60; tries++) {
        const c = { x: Math.round(rnd() * (AREA_W - CARD_W)), y: Math.round(rnd() * (areaH - h)), w: CARD_W, h };
        const hit = taken.reduce((s, t) => s + overlap(c, t), 0);
        if (!best || hit < best.hit) best = { ...c, hit };
        if (hit === 0) break;
      }
      taken.push(best);
      spots[it.id] = { x: best.x, y: best.y };
    });
    return spots;
  }, [cards]);

  const posOf = (it) => (drag && drag.id === it.id ? drag : it.pos || scatter[it.id] || { x: 0, y: 0 });

  const hasItems = items.length > 0;
  useEffect(() => {
    const el = ref.current;
    if (!el) return; // the empty state has no canvas to scroll
    const onWheel = (e) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        // pinch / cmd-scroll zooms toward the cursor
        const rect = el.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        setView((v) => {
          const z = Math.min(2.5, Math.max(0.25, v.z * Math.exp(-e.deltaY * 0.01)));
          return { z, x: cx - ((cx - v.x) * z) / v.z, y: cy - ((cy - v.y) * z) / v.z };
        });
      } else setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [hasItems]);

  // ---- dragging cards ------------------------------------------------------
  const onCardDown = (e, it) => {
    if (e.button !== 0) return;
    e.stopPropagation(); // don't pan the board
    press.current = { id: it.id, sx: e.clientX, sy: e.clientY, start: posOf(it), dragging: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onCardMove = (e) => {
    const p = press.current;
    if (!p) return;
    const dx = e.clientX - p.sx;
    const dy = e.clientY - p.sy;
    if (!p.dragging && Math.hypot(dx, dy) < DRAG_START) return;
    if (!p.dragging) {
      p.dragging = true;
      setFront((f) => [...f.filter((x) => x !== p.id), p.id]);
    }
    const z = viewRef.current.z;
    setDrag({ id: p.id, x: p.start.x + dx / z, y: p.start.y + dy / z });
  };
  const onCardUp = async (e, it) => {
    const p = press.current;
    press.current = null;
    if (!p) return;
    if (!p.dragging) {
      tapped.current = it.id; // a tap: the click that follows opens it (see onCardClick)
      return;
    }
    const d = drag;
    setDrag(null);
    if (!d) return;
    const patch = { pos: { x: Math.round(d.x), y: Math.round(d.y) } };
    setLocal((l) => ({ ...l, [it.id]: patch })); // show it where you dropped it, right away
    await api.update(it.id, patch);
  };

  // Open on the click, not on finger-up: opening earlier puts the sheet under the
  // pointer and the same click would close it again. After a drag, the click is ignored.
  const onCardClick = (e, it) => {
    e.preventDefault();
    e.stopPropagation();
    if (tapped.current !== it.id) return;
    tapped.current = null;
    onOpen(it.id);
  };

  if (!items.length) {
    return (
      <div className="empty">
        <Dog pose="thinking" size={190} />
        <h2>Nothing here yet</h2>
        <p>Drop an image, paste a link, or type a thought in the bar above. It lands somewhere on the board, and you can move it anywhere.</p>
        <p className="hint">Anywhere on your Mac: press ⌥ Tab, or drag things onto the dog.</p>
      </div>
    );
  }

  const order = (id) => {
    const i = front.indexOf(id);
    return i === -1 ? 1 : 10 + i;
  };

  return (
    <div
      className="canvas"
      ref={ref}
      onPointerDown={(e) => {
        if (e.target.closest("button, .cardslot")) return;
        pan.current = { x: e.clientX, y: e.clientY };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!pan.current) return;
        const dx = e.clientX - pan.current.x;
        const dy = e.clientY - pan.current.y;
        pan.current = { x: e.clientX, y: e.clientY };
        setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
      }}
      onPointerUp={() => (pan.current = null)}
    >
      <div className="world" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})` }}>
        {cards.map((it) => {
          const p = posOf(it);
          const isDragging = drag?.id === it.id;
          const age = daysBetween(new Date(it.lastTouched || it.createdAt), new Date());
          const fade = age > 14 ? Math.max(0.6, 1 - (age - 14) / 60) : 1; // things you haven't touched drift back
          return (
            <div
              key={it.id}
              data-id={it.id}
              className={`cardslot ${isDragging ? "dragging" : ""}`}
              style={{ transform: `translate(${p.x}px, ${p.y}px)`, zIndex: isDragging ? 999 : order(it.id), opacity: fade }}
              onPointerDown={(e) => onCardDown(e, it)}
              onPointerMove={onCardMove}
              onPointerUp={(e) => onCardUp(e, it)}
              onPointerCancel={() => {
                press.current = null;
                setDrag(null);
              }}
              onClickCapture={(e) => onCardClick(e, it)}
              role="button"
              tabIndex={0}
              aria-label={`Open ${it.title || it.content || "card"}`}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onOpen(it.id))}
            >
              <div className="tilt" style={{ "--tilt": `${tiltFor(it.id)}deg` }}>
                <ItemCard item={it} />
              </div>
            </div>
          );
        })}
      </div>
      <div className="zoomctl">
        <button onClick={() => setView((v) => ({ ...v, z: Math.min(2.5, v.z * 1.2) }))} aria-label="Zoom in">+</button>
        <button onClick={() => setView({ x: 40, y: 30, z: 1 })} aria-label="Reset view">◎</button>
        <button onClick={() => setView((v) => ({ ...v, z: Math.max(0.25, v.z / 1.2) }))} aria-label="Zoom out">−</button>
      </div>
    </div>
  );
}
