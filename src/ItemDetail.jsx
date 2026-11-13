import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { api, mediaUrl } from "./api.js";
import { relativeDay, hasTime, fmtDuration } from "./time.js";
import { domain } from "./ItemCard.jsx";

// A card's panel, after DialKit's floating control panel: compact rows (label left,
// value right), sliders that fill the row, and folders that fold away. Edits save as you go.

const toLocalInput = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

const KIND = { note: "Note", text: "Note", link: "Link", music: "Song", image: "Image", code: "Code", file: "File" };

// Saves a text field a moment after you stop typing.
function useDebouncedSave(value, saved, save, ms = 400) {
  useEffect(() => {
    if (value === saved) return;
    const t = setTimeout(() => save(value), ms);
    return () => clearTimeout(t);
  }, [value]);
}

// A textarea that grows with its text, so nothing is ever cut off.
function GrowText({ value, onChange, className, placeholder, ariaLabel }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = el.scrollHeight + "px";
  }, [value]);
  return <textarea ref={ref} rows={1} className={className} value={value} placeholder={placeholder} aria-label={ariaLabel} onChange={(e) => onChange(e.target.value)} />;
}

function Folder({ id, title, defaultOpen = true, children }) {
  const key = `stash-folder-${id}`;
  const [open, setOpen] = useState(() => {
    try {
      const v = localStorage.getItem(key);
      return v === null ? defaultOpen : v === "1";
    } catch {
      return defaultOpen;
    }
  });
  const toggle = () => {
    setOpen(!open);
    try {
      localStorage.setItem(key, open ? "0" : "1");
    } catch {}
  };
  return (
    <section className={`dk-folder ${open ? "open" : ""}`}>
      <button className="dk-folderhead" onClick={toggle} aria-expanded={open}>
        <span>{title}</span>
        <span className="dk-chev" aria-hidden="true">⌄</span>
      </button>
      {open && <div className="dk-rows">{children}</div>}
    </section>
  );
}

const Row = ({ label, children, className = "" }) => (
  <div className={`dk-row ${className}`}>
    <span className="dk-label">{label}</span>
    <span className="dk-value">{children}</span>
  </div>
);

function Toggle({ label, on, onChange }) {
  return (
    <button className="dk-row dk-toggle" role="switch" aria-checked={!!on} onClick={() => onChange(!on)}>
      <span className="dk-label">{label}</span>
      <span className={`dk-switch ${on ? "on" : ""}`} aria-hidden="true">
        <i />
      </span>
    </button>
  );
}

// A row that is its own slider: drag across it (or use arrow keys) to set the value.
function Slider({ label, value, min, max, step, format, onChange }) {
  const [v, setV] = useState(value);
  const ref = useRef(null);
  const dragging = useRef(false);
  useEffect(() => setV(value), [value]);
  const fromX = (clientX) => {
    const r = ref.current.getBoundingClientRect();
    const t = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    return Math.round((min + t * (max - min)) / step) * step;
  };
  const pct = ((v - min) / (max - min)) * 100;
  return (
    <div
      ref={ref}
      className="dk-row dk-slider"
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={v}
      aria-valuetext={format(v)}
      onPointerDown={(e) => {
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        setV(fromX(e.clientX));
      }}
      onPointerMove={(e) => dragging.current && setV(fromX(e.clientX))}
      onPointerUp={() => {
        dragging.current = false;
        onChange(v);
      }}
      onKeyDown={(e) => {
        const d = e.key === "ArrowRight" || e.key === "ArrowUp" ? step : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -step : 0;
        if (!d) return;
        e.preventDefault();
        const n = Math.min(max, Math.max(min, v + d));
        setV(n);
        onChange(n);
      }}
    >
      <span className="dk-fill" style={{ width: `${pct}%` }} />
      <span className="dk-label">{label}</span>
      <span className="dk-value">{format(v)}</span>
    </div>
  );
}

// Quick "when" choices, so setting a date never means fiddling with a picker.
function whenOptions(now = new Date()) {
  const day = (n) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + n);
  const toSat = (6 - now.getDay() + 7) % 7 || 7;
  const toMon = (8 - now.getDay()) % 7 || 7;
  return [
    ["Today", day(0)],
    ["Tomorrow", day(1)],
    ["Weekend", day(toSat)],
    ["Next week", day(toMon)],
  ];
}

export default function ItemDetail({ item, onClose }) {
  const isNote = item.type === "note" || item.type === "text";
  const [body, setBody] = useState(isNote ? item.content || "" : item.title || "");
  const [note, setNote] = useState(item.note || "");
  const [showPicker, setShowPicker] = useState(false);
  const set = (patch) => api.update(item.id, patch);

  // The big text at the top: a note's own words, or a link/file/image's title.
  useDebouncedSave(body, isNote ? item.content || "" : item.title || "", (v) => {
    if (!isNote) return set({ title: v });
    const titleFollows = !item.title || item.title === item.content; // keep an auto title in step
    set(titleFollows ? { content: v, title: v.split("\n")[0].slice(0, 80) } : { content: v });
  });
  useDebouncedSave(note, item.note || "", (v) => set({ note: v }));

  useEffect(() => {
    const k = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  const setWhen = (date) => {
    // keep the time of day if one was set, otherwise it's an all-day plan
    if (item.due && hasTime(item.due)) {
      const o = new Date(item.due);
      date.setHours(o.getHours(), o.getMinutes(), 0, 0);
    }
    set({ due: date.toISOString() });
  };
  const activeWhen = item.due ? whenOptions().find(([, d]) => d.toDateString() === new Date(item.due).toDateString())?.[0] : null;
  const saved = new Date(item.createdAt);

  return (
    <div className="dkwrap" onClick={onClose}>
      <aside className="dk" onClick={(e) => e.stopPropagation()} aria-label="Card">
        <header className="dk-head">
          <span className="dk-kind">
            {item.isTask ? "Plan" : KIND[item.type] || "Note"}
            <span className="dk-sub"> · saved {relativeDay(saved).replace("still on your plate", saved.toLocaleDateString(undefined, { day: "numeric", month: "short" }))}</span>
          </span>
          <button className="dk-icon" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        {/* the card itself, editable */}
        <div className="dk-hero">
          {item.type === "image" && <img className="dk-img" src={mediaUrl(item.file)} alt="" />}
          {item.type === "code" ? (
            <pre className="dk-code">{item.content}</pre>
          ) : null}
          {item.type === "file" && (
            <div className="dk-file">
              <span className={`dk-ext ${/\.pdf$/i.test(item.file || "") ? "pdf" : ""}`}>{(item.file || "").split(".").pop().slice(0, 4).toUpperCase() || "FILE"}</span>
            </div>
          )}
          <GrowText
            className="dk-body"
            value={body}
            onChange={setBody}
            ariaLabel={isNote ? "Note text" : "Title"}
            placeholder={isNote ? "write something…" : "add a title…"}
          />
          {item.source && (
            <button className="dk-link" onClick={() => api.openExternal(item.source)}>
              ↗ {domain(item.source) || item.source}
            </button>
          )}
          {item.type === "file" && item.file && (
            <div className="dk-actions">
              <button className="dk-chip" onClick={() => api.openFile(item.file)}>
                Open
              </button>
              <button className="dk-chip" onClick={() => api.reveal(item.file)}>
                Show in Finder
              </button>
            </div>
          )}
        </div>

        <Folder id="note" title="Your note">
          <div className="dk-row dk-area">
            <GrowText className="dk-note" value={note} onChange={setNote} ariaLabel="Your note" placeholder="why you saved it, what it reminds you of…" />
          </div>
        </Folder>

        <Folder id="plan" title="Plan">
          <Toggle label="It's a plan" on={item.isTask} onChange={(on) => set({ isTask: on, estimateMin: item.estimateMin || 30 })} />
          {item.isTask && (
            <>
              <Row label="When" className="dk-when">
                <span className="dk-seg">
                  {whenOptions().map(([label, d]) => (
                    <button key={label} className={activeWhen === label ? "on" : ""} onClick={() => setWhen(d)}>
                      {label}
                    </button>
                  ))}
                  <button className={item.due && !activeWhen ? "on" : ""} onClick={() => setShowPicker(!showPicker)} aria-expanded={showPicker}>
                    {item.due && !activeWhen ? relativeDay(item.due) : "Pick…"}
                  </button>
                </span>
              </Row>
              {(showPicker || (item.due && hasTime(item.due))) && (
                <Row label="Exact time">
                  <input
                    className="dk-input"
                    type="datetime-local"
                    value={toLocalInput(item.due)}
                    onChange={(e) => set({ due: e.target.value ? new Date(e.target.value).toISOString() : null })}
                  />
                </Row>
              )}
              <Slider label="Takes" value={item.estimateMin || 30} min={5} max={240} step={5} format={(v) => `~${fmtDuration(v)}`} onChange={(v) => set({ estimateMin: v })} />
              <Toggle label="Done" on={item.done} onChange={(on) => set({ done: on, doneAt: on ? new Date().toISOString() : null, startedAt: null })} />
              {item.firstStep && (
                <Row label="First step">
                  <span className="dk-step">{item.firstStep}</span>
                </Row>
              )}
            </>
          )}
        </Folder>

        <Folder id="details" title="Details" defaultOpen={false}>
          <Row label="Topic">
            <input className="dk-input" defaultValue={item.cluster} onBlur={(e) => e.target.value && e.target.value !== item.cluster && set({ cluster: e.target.value })} aria-label="Topic" />
          </Row>
          <Row label="Saved">{saved.toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</Row>
          <Row label="Sorted by">
            {item.enrichedBy === "claude" ? "Claude" : "local rules"}
            <button className="dk-chip" onClick={() => api.reenrich(item.id)}>
              Re-sort
            </button>
          </Row>
        </Folder>

        <footer className="dk-foot">
          <button
            className="dk-archive"
            onClick={() => {
              api.archive(item.id);
              onClose();
            }}
          >
            Archive
          </button>
          <span className="dk-hint">edits save as you go · esc to close</span>
        </footer>
      </aside>
    </div>
  );
}
