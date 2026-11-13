import { useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { useStash, captureFromDataTransfer } from "./useStash.js";
import Canvas from "./Canvas.jsx";
import Plans from "./Plans.jsx";
import ItemDetail from "./ItemDetail.jsx";
import Settings from "./Settings.jsx";

const VIEW_KEY = "stash-view";

export default function App() {
  const { items, settings } = useStash();
  const [view, setView] = useState(() => {
    try {
      return localStorage.getItem(VIEW_KEY) || "canvas";
    } catch {
      return "canvas";
    }
  });
  const [openId, setOpenId] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, view);
    } catch {}
  }, [view]);

  // The dog can send you somewhere: a card it mentioned, or the Plans view.
  useEffect(
    () =>
      api.onNavigate((nav) => {
        if (nav?.view) setView(nav.view);
        if (nav?.open) setOpenId(nav.open);
      }),
    []
  );

  // Paste anywhere (outside a text field) drops it straight in.
  useEffect(() => {
    const onPaste = async (e) => {
      if (e.target.closest("input, textarea")) return;
      e.preventDefault();
      // screenshots, copied images, PDFs and files arrive as files; text and links as text
      if (!(await captureFromDataTransfer(e.clipboardData))) await api.captureClipboardImage("");
    };
    const onKey = (e) => {
      if (e.target.closest("input, textarea")) return;
      if (e.key === "/" || (e.key === "n" && !e.metaKey)) {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === "Tab") {
        e.preventDefault();
        setView((v) => (v === "canvas" ? "plans" : "canvas"));
      }
    };
    window.addEventListener("paste", onPaste);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("paste", onPaste);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!draft.trim()) return;
    await api.capture({ content: draft });
    setDraft("");
  };

  const open = items.find((i) => i.id === openId);

  return (
    <div
      className={`app ${dragging ? "is-dragging" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => e.relatedTarget == null && setDragging(false)}
      onDrop={async (e) => {
        e.preventDefault();
        setDragging(false);
        await captureFromDataTransfer(e.dataTransfer);
      }}
    >
      <header className="topbar">
        <div className="brand">stash</div>
        <div className="toggle" role="tablist" aria-label="View">
          <button role="tab" aria-selected={view === "canvas"} className={view === "canvas" ? "on" : ""} onClick={() => setView("canvas")}>
            Canvas
          </button>
          <button role="tab" aria-selected={view === "plans"} className={view === "plans" ? "on" : ""} onClick={() => setView("plans")}>
            Plans
          </button>
        </div>
        <form className="dump" onSubmit={submit}>
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Dump anything… “call mum thursday 6pm”, a link, a thought"
            aria-label="Dump anything"
          />
        </form>
        <button className="ghost" onClick={() => setShowSettings(true)} aria-label="Settings">
          ⚙︎
        </button>
      </header>

      <main className="stage">
        {view === "canvas" ? <Canvas items={items} onOpen={setOpenId} /> : <Plans items={items} settings={settings} onOpen={setOpenId} />}
      </main>

      {dragging && <div className="dropveil">drop it, I'll sort it</div>}
      {open && <ItemDetail item={open} items={items} onClose={() => setOpenId(null)} />}
      {showSettings && <Settings settings={settings} onClose={() => setShowSettings(false)} />}
    </div>
  );
}
