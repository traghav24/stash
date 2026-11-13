import { useMemo, useState } from "react";
import { api } from "./api.js";
import Dog from "./Dog.jsx";
import { useNow } from "./useStash.js";
import {
  adjustedEstimate,
  dayProgress,
  daysBetween,
  fmtDuration,
  hasTime,
  isOpenTask,
  learnFrom,
  minutesLeftToday,
  petPose,
  pickNext,
  relativeDay,
  relativeTime,
  todayTasks,
} from "./time.js";

const RANGES = [
  { key: "2d", label: "2 days", days: 2 },
  { key: "week", label: "Week", days: 7 },
  { key: "month", label: "Month", days: 30 },
];
const RANGE_KEY = "stash-range";
const TODAY_LIMIT = 3;

const elapsedMin = (t, now) => (t.elapsedMin || 0) + (t.startedAt ? (now - new Date(t.startedAt)) / 60000 : 0);

// Block height is the task's real length, so a 2h task looks four times a 30 min one.
const blockH = (mins) => Math.max(44, Math.min(220, 20 + mins * 1.1));

export default function Plans({ items, settings, onOpen }) {
  const now = useNow(15000);
  const [range, setRange] = useState(() => {
    try {
      return localStorage.getItem(RANGE_KEY) || "2d";
    } catch {
      return "2d";
    }
  });
  const [showAll, setShowAll] = useState(false);
  const [suggestion, setSuggestion] = useState(null);
  const [celebrate, setCelebrate] = useState(null);

  const setR = (r) => {
    setRange(r);
    try {
      localStorage.setItem(RANGE_KEY, r);
    } catch {}
  };

  const left = minutesLeftToday(settings, now);
  const progress = dayProgress(settings, now);
  const today = todayTasks(items, now);
  const running = items.find((i) => isOpenTask(i) && i.startedAt);
  const planned = today.reduce((s, t) => s + Math.max(0, adjustedEstimate(t, settings) - elapsedMin(t, now)), 0);
  const visible = showAll ? today : today.slice(0, TODAY_LIMIT);
  const doneToday = items.filter((i) => i.done && i.doneAt && daysBetween(new Date(i.doneAt), now) === 0);
  const stale = items.filter((i) => isOpenTask(i) && i.due && daysBetween(new Date(i.due), now) > 7 && !i.startedAt);
  const someday = items.filter((i) => isOpenTask(i) && !i.due);

  const start = async (t) => {
    if (running && running.id !== t.id) await pause(running);
    await api.update(t.id, { startedAt: new Date().toISOString() });
    setSuggestion(null);
  };
  const pause = (t) => api.update(t.id, { startedAt: null, elapsedMin: elapsedMin(t, new Date()) });
  const done = async (t) => {
    const actual = elapsedMin(t, new Date());
    if (actual > 1) await api.setSettings({ estimateRatio: learnFrom(t, actual, settings) });
    await api.update(t.id, { done: true, doneAt: new Date().toISOString(), startedAt: null, elapsedMin: actual, actualMin: Math.round(actual) || null });
    setCelebrate(t.id);
    setTimeout(() => setCelebrate(null), 2200);
  };
  const tomorrow = (t) => {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    if (t.due && hasTime(t.due)) {
      const o = new Date(t.due);
      d.setHours(o.getHours(), o.getMinutes(), 0, 0);
    } else d.setHours(0, 0, 0, 0);
    return api.update(t.id, { due: d.toISOString(), startedAt: null });
  };

  const fit = (() => {
    if (!today.length) return null;
    if (left <= 0) return { tone: "calm", text: "Your working day is over. Anything left can wait for tomorrow." };
    if (planned <= left * 0.85) return { tone: "good", text: `This fits: ~${fmtDuration(planned)} planned, ~${fmtDuration(left)} left.` };
    return { tone: "tight", text: `This is ~${fmtDuration(planned)} of work and you have ~${fmtDuration(left)}. Pick what moves to tomorrow.` };
  })();

  return (
    <div className="plans">
      {/* Day-left bar: time you can see shrinking */}
      <section className="daybar" aria-label="Time left today">
        <div className="daybar-top">
          <Dog
            pose={celebrate ? "peek-love" : running ? "holding" : today.length === 0 && doneToday.length > 0 ? "peek-cool" : petPose(settings, now)}
            size={84}
          />
          <div>
            <div className="bigleft">
              {now.getHours() < settings.dayStart
                ? `your day starts at ${fmtHour(settings.dayStart)} · ${fmtDuration(left)} ahead`
                : left > 0
                  ? `about ${fmtDuration(left)} of your day left`
                  : "day's done"}
            </div>
            <div className="muted small">
              your day: {fmtHour(settings.dayStart)} – {fmtHour(settings.dayEnd)}
            </div>
          </div>
          <button className="whatnow" onClick={() => setSuggestion(pickNext(items, settings, now) || "none")}>
            What now?
          </button>
        </div>
        <div className="track">
          <div className="used" style={{ width: `${progress * 100}%` }} />
          {/* planned work drawn on the remaining track, so overflow is visible */}
          <div className="planned" style={{ left: `${progress * 100}%`, width: `${Math.min(1 - progress, planned / (((settings.dayEnd - settings.dayStart) * 60) || 1)) * 100}%` }} />
          {planned > left && left > 0 && <div className="overflow">+{fmtDuration(planned - left)}</div>}
        </div>
        {fit && <p className={`fit ${fit.tone}`}>{fit.text}</p>}
      </section>

      {running && (
        <section className="running" aria-live="polite">
          <div>
            <div className="muted small">working on</div>
            <div className="rtitle">{running.title}</div>
          </div>
          <div className="rtime">
            {fmtDuration(elapsedMin(running, now)) || "0 min"} in
            <span className="muted small"> of ~{fmtDuration(adjustedEstimate(running, settings))}</span>
          </div>
          <button onClick={() => pause(running)} className="ghost">Pause</button>
          <button onClick={() => done(running)} className="primary">Done</button>
        </section>
      )}

      {suggestion && (
        <section className="suggestion">
          {suggestion === "none" ? (
            <p>Nothing planned. Rest is allowed. Or dump a to-do in the bar above.</p>
          ) : (
            <>
              <div className="muted small">try this one</div>
              <div className="stitle">{suggestion.title}</div>
              <div className="muted">~{fmtDuration(adjustedEstimate(suggestion, settings))}{suggestion.due ? ` · ${relativeDay(suggestion.due)}` : ""}</div>
              {suggestion.firstStep && <p className="firststep">Just start with: {suggestion.firstStep}</p>}
              <div className="row">
                <button className="primary" onClick={() => start(suggestion)}>Start</button>
                <button className="ghost" onClick={() => setSuggestion(pickNext(items.filter((i) => i.id !== suggestion.id), settings, now) || "none")}>Another</button>
                <button className="ghost" onClick={() => setSuggestion(null)}>Not now</button>
              </div>
            </>
          )}
        </section>
      )}

      <div className="planscols">
        <section className="today">
          <h2>Today</h2>
          {!today.length && <p className="muted">Nothing due today. Dump something like “email Sam tomorrow 3pm” and it lands here.</p>}
          {visible.map((t) => {
            const est = adjustedEstimate(t, settings);
            const slipped = t.due && daysBetween(now, new Date(t.due)) < 0;
            const soon = t.due && hasTime(t.due) && relativeTime(t.due, now);
            return (
              <article key={t.id} className={`task ${t.startedAt ? "live" : ""} ${celebrate === t.id ? "yay" : ""}`} style={{ minHeight: blockH(est) }}>
                <button className="tmain" onClick={() => onOpen(t.id)}>
                  <span className="ttitle">{t.title}</span>
                  <span className="tmeta">
                    ~{fmtDuration(est)}
                    {est !== (t.estimateMin ?? 30) && <span title="adjusted from how long things usually take you"> (you usually take longer)</span>}
                    {soon ? ` · ${soon}` : ""}
                    {slipped ? " · still on your plate" : ""}
                  </span>
                  {t.firstStep && <span className="tstep">first: {t.firstStep}</span>}
                </button>
                <div className="tact">
                  {!t.startedAt && <button className="primary sm" onClick={() => start(t)}>Start</button>}
                  <button className="ghost sm" onClick={() => done(t)}>Done</button>
                  <button className="ghost sm" onClick={() => tomorrow(t)}>Tomorrow</button>
                </div>
              </article>
            );
          })}
          {today.length > TODAY_LIMIT && (
            <button className="ghost more" onClick={() => setShowAll(!showAll)}>
              {showAll ? "Show less" : `${today.length - TODAY_LIMIT} more (hidden so today stays doable)`}
            </button>
          )}

          {stale.map((t) => (
            <article key={t.id} className="stale">
              <span>Still want “{t.title}”?</span>
              <button className="ghost sm" onClick={() => tomorrow(t)}>Yes, tomorrow</button>
              <button className="ghost sm" onClick={() => api.archive(t.id)}>Let it go</button>
            </article>
          ))}

          {doneToday.length > 0 && (
            <div className="doneshelf">
              <h3>Done today</h3>
              {doneToday.map((t) => (
                <span key={t.id} className="donechip">✓ {t.title}</span>
              ))}
            </div>
          )}
        </section>

        <section className="ahead">
          <div className="aheadhead">
            <h2>Coming up</h2>
            <div className="toggle sm">
              {RANGES.map((r) => (
                <button key={r.key} className={range === r.key ? "on" : ""} onClick={() => setR(r.key)}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          <Timeline items={items} settings={settings} now={now} days={RANGES.find((r) => r.key === range).days} onOpen={onOpen} />
          {someday.length > 0 && (
            <div className="someday">
              <h3>No date yet</h3>
              {someday.slice(0, 8).map((t) => (
                <button key={t.id} className="somechip" onClick={() => onOpen(t.id)}>{t.title}</button>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

const fmtHour = (h) => `${h % 12 || 12}${h < 12 ? "am" : "pm"}`;

// Days drawn as containers of time: a full day looks full.
function Timeline({ items, settings, now, days, onOpen }) {
  const capacity = ((settings.dayEnd ?? 19) - (settings.dayStart ?? 10)) * 60;
  const cols = useMemo(() => {
    const out = [];
    for (let n = 1; n <= days; n++) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + n);
      const tasks = items.filter((i) => isOpenTask(i) && i.due && daysBetween(d, new Date(i.due)) === 0);
      out.push({ d, n, tasks, load: tasks.reduce((s, t) => s + adjustedEstimate(t, settings), 0) });
    }
    return out;
  }, [items, settings, now, days]);

  if (days > 7) {
    // Month: weeks as rows with a load bar per day, so busy stretches jump out.
    const weeks = [];
    for (let i = 0; i < cols.length; i += 7) weeks.push(cols.slice(i, i + 7));
    return (
      <div className="month">
        {weeks.map((w, wi) => (
          <div key={wi} className="week">
            <div className="wlabel">{wi === 0 ? "next 7 days" : `in ${wi} week${wi > 1 ? "s" : ""}`}</div>
            <div className="wdays">
              {w.map((c) => (
                <div key={c.n} className="mday" title={`${c.d.toDateString()}: ${c.tasks.length} things, ~${fmtDuration(c.load)}`}>
                  <div className="mfill" style={{ height: `${Math.min(100, (c.load / capacity) * 100)}%` }} />
                  <span className="mnum">{c.d.getDate()}</span>
                </div>
              ))}
            </div>
            <div className="wtasks">
              {w.flatMap((c) => c.tasks).slice(0, 4).map((t) => (
                <button key={t.id} className="somechip" onClick={() => onOpen(t.id)}>{t.title}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  const scale = 220 / capacity; // px per minute in a day column
  return (
    <div className="days" style={{ "--cols": cols.length }}>
      {cols.map((c) => (
        <div key={c.n} className="day">
          <div className="dlabel">{relativeDay(c.d, now)}</div>
          <div className="dbox" style={{ height: 220 }}>
            {c.tasks.map((t) => (
              <button key={t.id} className="dblock" style={{ height: Math.max(22, adjustedEstimate(t, settings) * scale) }} onClick={() => onOpen(t.id)}>
                {t.title}
              </button>
            ))}
            {c.load > capacity && <div className="dover">more than a day's worth</div>}
          </div>
          <div className="dload muted small">{c.tasks.length ? `~${fmtDuration(c.load)}` : "free"}</div>
        </div>
      ))}
    </div>
  );
}
