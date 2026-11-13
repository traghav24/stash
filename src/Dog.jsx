// One dog, many moods. Art is Tanisha's Figma set (Experiments file, Section 2, node 233:11068).
const files = import.meta.glob("./assets/dog/figma/*.svg", { query: "?raw", import: "default", eager: true });

// Every pose is drawn at the same scale in Figma; only the frames differ (sparkles, zz,
// thought bubbles). So each pose keeps its Figma size, scaled by one shared factor, and
// sits on the floor of a fixed stage. No pose ever looks bigger than another.
const POSES = {};
for (const [path, svg] of Object.entries(files)) {
  const name = path.split("/").pop().replace(".svg", "");
  const vb = /viewBox="([^"]*)"/.exec(svg)[1].split(/\s+/).map(Number);
  POSES[name] = {
    w: vb[2],
    h: vb[3],
    svg: svg.replace(/<svg[^>]*?(viewBox="[^"]*")[^>]*>/, '<svg $1 width="100%" height="100%" fill="none" xmlns="http://www.w3.org/2000/svg">'),
  };
}
// The stage fits the widest and tallest pose, so swapping poses never resizes anything.
const STAGE_W = Math.max(...Object.values(POSES).map((p) => p.w));
const STAGE_H = Math.max(...Object.values(POSES).map((p) => p.h));

const LABELS = {
  "peek-alert": "the dog, alert",
  "peek-happy": "the dog, happy",
  "peek-starry": "the dog, excited",
  "peek-love": "the dog, in love",
  "peek-surprised": "the dog, surprised",
  "peek-cool": "the dog in sunglasses",
  "peek-sleepy": "the dog, sleepy",
  lying: "the dog, lying down",
  "half-asleep": "the dog, half asleep",
  sleepy: "the dog, asleep",
  thinking: "the dog, thinking",
  "sit-confused": "the dog, confused",
  holding: "the dog, holding its ball",
  glowing: "the dog, glowing",
  running: "the dog, running",
};

export const POSE_NAMES = Object.keys(POSES);

// `size` is the stage width in px; every pose uses the same px-per-Figma-unit.
export default function Dog({ pose = "lying", size = 120, className = "" }) {
  const name = POSES[pose] ? pose : "lying";
  const p = POSES[name];
  const k = size / STAGE_W;
  return (
    <div className={`dogstage ${className}`} style={{ width: size, height: Math.round(STAGE_H * k) }}>
      <div
        className={`dog dog-${name}`}
        role="img"
        aria-label={LABELS[name] || "the dog"}
        style={{ width: Math.round(p.w * k), height: Math.round(p.h * k) }}
        dangerouslySetInnerHTML={{ __html: p.svg }}
      />
    </div>
  );
}
