import { api } from "./api.js";

export default function Settings({ settings, onClose }) {
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const fmt = (h) => `${h % 12 || 12}${h < 12 ? "am" : "pm"}`;
  return (
    <div className="sheetwrap" onClick={onClose}>
      <aside className="sheet" onClick={(e) => e.stopPropagation()} aria-label="Settings">
        <button className="ghost close" onClick={onClose} aria-label="Close">✕</button>
        <h2>Settings</h2>
        <p className="muted">Your day, so "time left" means something.</p>
        <div className="row">
          <label className="field inline">
            <span>Day starts</span>
            <select value={settings.dayStart} onChange={(e) => api.setSettings({ dayStart: +e.target.value })}>
              {hours.map((h) => <option key={h} value={h}>{fmt(h)}</option>)}
            </select>
          </label>
          <label className="field inline">
            <span>Day ends</span>
            <select value={settings.dayEnd} onChange={(e) => api.setSettings({ dayEnd: +e.target.value })}>
              {hours.map((h) => <option key={h} value={h}>{fmt(h)}</option>)}
            </select>
          </label>
        </div>
        <h3>The dog</h3>
        <label className="check">
          <input type="checkbox" checked={settings.petWanders !== false} onChange={(e) => api.setSettings({ petWanders: e.target.checked })} />
          Let the dog stroll around when you're not using it
        </label>
        <p className="muted small">It strolls along the bottom of your screen. It stays put while you're working on something or when a task is coming up.</p>
        <label className="check">
          <input type="checkbox" checked={settings.petTalks !== false} onChange={(e) => api.setSettings({ petTalks: e.target.checked })} />
          Let the dog say little things
        </label>
        <p className="muted small">Remarks every few minutes: nudges about your plans, time left, old saves it digs up, and silly stuff. Tap a remark to jump to what it's about.</p>
        <label className="check">
          <input type="checkbox" checked={settings.petPeeks !== false} onChange={(e) => api.setSettings({ petPeeks: e.target.checked })} />
          Let the dog peek at your screen
        </label>
        <p className="muted small">
          Every 12–30 minutes it takes a small screenshot, sends it to Claude for one playful line, and throws it away (it's never saved). It never peeks at password
          managers or banking apps, and only speaks in generalities. Needs Claude connected and macOS Screen Recording permission; without them it comments on which app
          you're in instead.
        </p>
        <h3>Auto-sorting</h3>
        <p className="muted">
          {settings.ai
            ? "Claude is sorting your saves (piles, dates, estimates, first steps)."
            : "Using simple local rules. To let Claude sort things, set ANTHROPIC_API_KEY before launching, or run `ant auth login` once."}
        </p>
        <h3>Your data</h3>
        <p className="muted">Everything is plain files in {settings.root}.</p>
      </aside>
    </div>
  );
}
