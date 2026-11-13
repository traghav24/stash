import { mediaUrl } from "./api.js";
import { relativeDay } from "./time.js";

export const domain = (u) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

// A hand-drawn card. Tapping and dragging are handled by the canvas around it.
export default function ItemCard({ item }) {
  const body = (() => {
    switch (item.type) {
      case "image":
        return <img src={mediaUrl(item.file)} alt={item.title || "saved image"} loading="lazy" draggable={false} />;
      case "code":
        return <pre className="code">{item.content}</pre>;
      case "music":
        return (
          <div className="linkcard music">
            <span className="glyph" aria-hidden="true">♪</span>
            <div>
              <div className="lt">{item.title || "A song"}</div>
              <div className="ld">{domain(item.source)}</div>
            </div>
          </div>
        );
      case "file": {
        const ext = (item.file || item.title || "").split(".").pop().slice(0, 4).toUpperCase() || "FILE";
        return (
          <div className="linkcard filecard">
            <span className={`glyph ext ${ext === "PDF" ? "pdf" : ""}`} aria-hidden="true">{ext}</span>
            <div>
              <div className="lt">{item.title || "A file"}</div>
              <div className="ld">{ext === "PDF" ? "PDF" : "file"}</div>
            </div>
          </div>
        );
      }
      case "link":
        return (
          <div className="linkcard">
            <span className="glyph" aria-hidden="true">↗</span>
            <div>
              <div className="lt">{item.title || item.source}</div>
              <div className="ld">{domain(item.source)}</div>
            </div>
          </div>
        );
      default:
        return <p className="notetext">{item.content || item.title}</p>;
    }
  })();

  return (
    <div className={`card type-${item.type} ${item.isTask ? "is-task" : ""} ${item.done ? "is-done" : ""}`}>
      {body}
      {item.note && <p className="cardnote">{item.note}</p>}
      {item.isTask && <span className="chip">{item.done ? "done ✓" : item.due ? relativeDay(item.due) : "someday"}</span>}
      {!item.enriched && <span className="sorting">sorting…</span>}
    </div>
  );
}
