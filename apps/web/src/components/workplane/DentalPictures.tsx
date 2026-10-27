"use client";

/*
 * Fork (build 66): little pictures for Dental Studio's choices, so what each one makes can be seen
 * before it is made - the base from above, each articulator joint in section, and the articulator
 * from the side, drawn from the settings as they change.
 */

import type { DentalBaseStyle } from "@/lib/dentalModel";

/** The teeth round the arch, from above (viewBox 0 0 64 48). */
const TEETH: Array<[number, number]> = [
  [15, 36], [14.6, 29], [16, 22.5], [19.4, 17], [24.2, 12.8], [29.4, 10.8], [34.6, 10.8], [39.8, 12.8], [44.6, 17], [48, 22.5], [49.4, 29], [49, 36],
];

const BASES: Record<DentalBaseStyle, { outline: string; inner?: string }> = {
  // A smooth band round the teeth: a horseshoe.
  clean: { outline: "M8 42 C8 13 19 4 32 4 C45 4 56 13 56 42 L45 42 C45 22 40 17 32 17 C24 17 19 22 19 42 Z" },
  // The scan's own edge, as it was taken.
  follow: { outline: "M7 42 Q6 34 9 28 Q7 21 12 16 Q14 8 21 7 Q26 2 32 4 Q38 2 43 7 Q50 8 52 16 Q57 21 55 28 Q58 34 57 42 L46 41 Q47 30 42 23 Q37 17 32 18 Q27 17 22 23 Q17 30 18 41 Z" },
  // The horseshoe, with the palate or the tongue space closed by a plate.
  plate: { outline: "M8 42 C8 13 19 4 32 4 C45 4 56 13 56 42 Z", inner: "M19 42 C19 22 24 17 32 17 C40 17 45 22 45 42 Z" },
  // Trimmed the ABO way: back square to the midline, heels, angled sides, the front pointed.
  ortho: { outline: "M12 44 L52 44 L57 36 L54 18 L44 7 L32 2 L20 7 L10 18 L7 36 Z" },
  // A block over the magnetic plate's pockets.
  articulator: { outline: "M5 4 H59 V44 H5 Z" },
};

export function BaseStylePicture({ style }: { style: DentalBaseStyle }) {
  const base = BASES[style] ?? BASES.clean;
  return (
    <svg className={`dental-picture base-${style}`} viewBox="0 0 64 48" aria-hidden="true">
      <path className="base" d={base.outline} />
      {base.inner ? <path className="plate" d={base.inner} /> : null}
      {style === "articulator" ? (
        <g className="pockets">
          <rect x="11" y="31" width="9" height="9" />
          <rect x="44" y="31" width="9" height="9" />
          <rect x="27.5" y="22" width="9" height="9" />
        </g>
      ) : null}
      {TEETH.map(([x, y], i) => <circle key={i} className="tooth" cx={x} cy={y} r={2.7} />)}
    </svg>
  );
}


/**
 * The articulator from the side, from its settings (viewBox 0 0 200 92): the upper above the lower,
 * the joint behind the molars on the right, the incisal pin on its table in front on the left, the
 * protrusion path at its angle, the pin raised by `pinRaise`, the table flat or sloped as a guide.
 */
/**
 * Build 75: the articulator from the side as a dentist reads it - front (incisors) on the left, the
 * molars and the joint on the right. The teeth are drawn from the buccal side in a Class I relation:
 * the upper canine between the lower canine and first premolar, the upper first molar's mesiobuccal
 * cusp on the lower first molar's buccal groove, the upper incisors over the lower with overjet and
 * overbite, all along a curve of Spee. With the incisal pin raised, the upper turns up about the joint
 * - the front opens most, the molars least - as the printed models stand.
 */
type ToothKind = "incisor" | "canine" | "premolar" | "molar";
/** x1..x2: the crown's width at its neck (for an incisor, labial to lingual - it is seen in profile). */
type ToothSpec = { kind: ToothKind; x1: number; x2: number; height: number; tip: number; lean?: number };
const f = (v: number) => v.toFixed(2);
function toothPath({ kind, x1, x2, height: h, lean = 0 }: ToothSpec, tipY: number, up: boolean) {
  // t runs from the neck (0) to the tip (1); the upper's crowns point down, the lower's up.
  const Y = (t: number) => f(up ? tipY - h + t * h : tipY + h - t * h);
  const w = x2 - x1, m = (x1 + x2) / 2;
  if (kind === "incisor") {
    // In profile, as on a lateral view of the bite: the labial surface bulging to the incisal edge,
    // the lingual surface hollow up to the cingulum.
    return `M${f(x1)} ${Y(0)} C${f(x1 - lean * 0.7)} ${Y(0.35)} ${f(x1 - lean * 1.15)} ${Y(0.75)} ${f(x1 - lean)} ${Y(1)} L${f(x1 - lean + 2.2)} ${Y(1)}`
      + ` C${f(x1 + w * 0.12)} ${Y(0.74)} ${f(x1 + w * 0.5)} ${Y(0.5)} ${f(x1 + w * 0.72)} ${Y(0.34)} C${f(x2 - 0.4)} ${Y(0.22)} ${f(x2 + 0.6)} ${Y(0.1)} ${f(x2)} ${Y(0)} Z`;
  }
  const neckIn = Math.min(2.2, w * 0.14);
  const start = `M${f(x1 + neckIn)} ${Y(0)} C${f(x1 - 0.6)} ${Y(0.38)} ${f(x1 - 0.2)} ${Y(0.75)} ${f(x1)} ${Y(0.82)}`;
  const end = `C${f(x2 + 0.2)} ${Y(0.75)} ${f(x2 + 0.6)} ${Y(0.38)} ${f(x2 - neckIn)} ${Y(0)} Z`;
  if (kind === "canine") return `${start} L${f(m)} ${Y(1)} L${f(x2)} ${Y(0.82)} ${end}`;
  if (kind === "premolar") return `${start} Q${f(m)} ${Y(1.08)} ${f(x2)} ${Y(0.82)} ${end}`;
  // A molar from the buccal side: its mesial and distal buccal cusps either side of the buccal groove.
  return `${start} Q${f(x1 + w * 0.25)} ${Y(1.07)} ${f(x1 + w * 0.47)} ${Y(0.88)} L${f(m)} ${Y(0.8)} L${f(x1 + w * 0.53)} ${Y(0.88)} Q${f(x1 + w * 0.76)} ${Y(1.05)} ${f(x2)} ${Y(0.82)} ${end}`;
}
const PLANE = 64;
const FRONT = 42, BACK = 190;
/** The curve of Spee: deepest at the premolars, rising to the incisors and the last molars. */
const spee = (x: number) => 3.2 * Math.sin((Math.PI * (x - FRONT)) / (BACK - FRONT));
// Front to back, seen from the buccal side, in a Class I relation: the upper canine's tip over the
// embrasure between the lower canine and first premolar, each upper premolar's over the embrasure
// behind its lower namesake, and the upper first molar's mesiobuccal cusp on the lower first molar's
// buccal groove, its buccal cusps lapping over the lower ones as seen from the cheek. The incisors in profile: the upper's edge 2.5 mm in front of the lower's (overjet)
// and 2.5 mm below it (overbite). Drawn back to front, so each tooth nearer the viewer covers the last.
const LOWER_TEETH: ToothSpec[] = [
  { kind: "molar", x1: 150, x2: 181, height: 15, tip: -1.6 },
  { kind: "molar", x1: 116, x2: 150, height: 16, tip: -1.6 },
  { kind: "premolar", x1: 97, x2: 116, height: 17, tip: -1.6 },
  { kind: "premolar", x1: 78, x2: 97, height: 18, tip: -1.6 },
  { kind: "incisor", x1: 52, x2: 64, height: 22, tip: -3.2, lean: 1.5 },
  { kind: "canine", x1: 60, x2: 78, height: 21, tip: -1.2 },
];
const UPPER_TEETH: ToothSpec[] = [
  { kind: "molar", x1: 159, x2: 189, height: 16, tip: 2.2 },
  { kind: "molar", x1: 125, x2: 159, height: 17, tip: 2.2 },
  { kind: "premolar", x1: 107, x2: 125, height: 18, tip: 2.2 },
  { kind: "premolar", x1: 89, x2: 107, height: 19, tip: 2.2 },
  { kind: "canine", x1: 67, x2: 89, height: 23, tip: 1.2 },
  { kind: "incisor", x1: 46, x2: 66, height: 24.5, tip: 4.6, lean: 4 },
];
const tipOf = (tooth: ToothSpec) => PLANE + spee((tooth.x1 + tooth.x2) / 2) + tooth.tip;
function gumBand(teeth: ToothSpec[], up: boolean, edge: number) {
  // The gum: from the base to a scalloped line over the necks, a papilla between each pair of teeth.
  const sorted = [...teeth].sort((a, b) => a.x1 - b.x1);
  const neck = (tooth: ToothSpec) => tipOf(tooth) + (up ? -tooth.height : tooth.height);
  const into = up ? 3 : -3;
  const first = sorted[0], last = sorted[sorted.length - 1];
  let d = `M${first.x1 - 4} ${edge} L${first.x1 - 4} ${f(neck(first) + into * 0.4)}`;
  sorted.forEach((tooth) => {
    const n = neck(tooth);
    d += ` Q${f((tooth.x1 + tooth.x2) / 2)} ${f(n - into)} ${f(tooth.x2)} ${f(n + into)}`;
  });
  return `${d} L${last.x2 + 4} ${f(neck(last) + into * 0.4)} L${last.x2 + 4} ${edge} Z`;
}
// The joint behind the last molars and the incisal pin in front, at about 2.6 px to the millimetre.
const JX = 214, JY = PLANE - 5, PIN_X = 16, TABLE_TOP = PLANE + 22, PIN_TOP = PLANE - 50;
/**
 * The turn of the upper about the joint for a pin raised by `raise` mm: the pin is longer by the raise,
 * its tip on the table. Returns the angle (degrees) and how far the front teeth and the last molars part.
 */
export function articulatorOpening(raise: number) {
  const gap = Math.max(0, raise) * 2.6;
  if (!gap) return { degrees: 0, front: 0, back: 0 };
  const L = JX - PIN_X, tip = TABLE_TOP + gap - JY, want = TABLE_TOP - JY;
  // Turned clockwise on screen by a about the joint (the front rises), the pin's tip at (-L, tip) from the
  // joint comes to -L sin a + tip cos a below it: solved so that it stands on the table.
  let a = Math.atan2(gap, L);
  for (let k = 0; k < 20; k += 1) {
    const g = -L * Math.sin(a) + tip * Math.cos(a) - want;
    a -= g / (-L * Math.cos(a) - tip * Math.sin(a));
  }
  // How far a point of the upper at (x, y) rises, mm.
  const part = (x: number, y: number) => {
    const dx = x - JX, dy = y - JY;
    return (dy * (1 - Math.cos(a)) - dx * Math.sin(a)) / 2.6;
  };
  return { degrees: (a * 180) / Math.PI, front: part(44, PLANE), back: part(186, PLANE) };
}

export function ArticulatorPicture({ pinRaise }: { pinRaise: number }) {
  const raise = Math.max(0, Math.min(10, pinRaise));
  const gap = raise * 2.6;
  const { degrees } = articulatorOpening(raise);
  const jx = JX, jy = JY, pinX = PIN_X;
  return (
    <svg className="dental-picture articulator" viewBox="0 -20 244 146" aria-hidden="true">
      {/* Build 78: the lower model, its ball condyle and the incisal pin standing in its socket: these stay put. */}
      <g className="lower-model">
        <path className="lower" d={`M42 ${PLANE + 26} H186 Q190 ${PLANE + 26} 190 ${PLANE + 30} V${PLANE + 48} H38 V${PLANE + 30} Q38 ${PLANE + 26} 42 ${PLANE + 26} Z`} />
        <path className="lower-gum" d={gumBand(LOWER_TEETH, false, PLANE + 28)} />
        {LOWER_TEETH.map((tooth, i) => <path key={`l${i}`} className="tooth" d={toothPath(tooth, tipOf(tooth), false)} />)}
        <path className="lower" d={`M188 ${PLANE + 34} H${jx + 9} V${PLANE + 48} H188 Z`} />
        <rect className="lower" x={jx - 2.6} y={jy} width="5.2" height={PLANE + 36 - jy} />
        <circle className="lower" cx={jx} cy={jy} r={6.2} />
        {/* The pin's socket on an arm along the bottom of the lower base, and the pin in it. */}
        <rect className="lower" x={pinX - 8} y={PLANE + 45} width={42} height="3" />
        <rect className="lower" x={pinX - 5} y={TABLE_TOP + 8} width="10" height={PLANE + 46 - TABLE_TOP - 8} />
        <rect className="upper pin" x={pinX - 1.8} y={TABLE_TOP - gap} width="3.6" height={8 + gap} rx="1.8" />
      </g>
      {/* The upper model, turned about the condyles by the pin's raise: its seats rest on the balls, its pad on the pin. */}
      <g className="upper-model" transform={degrees ? `rotate(${f(degrees)} ${jx} ${jy})` : undefined}>
        <path className="upper" d={`M42 ${PLANE - 28} H190 Q194 ${PLANE - 28} 194 ${PLANE - 32} V${PLANE - 52} H38 V${PLANE - 32} Q38 ${PLANE - 28} 42 ${PLANE - 28} Z`} />
        <path className="upper-gum" d={gumBand(UPPER_TEETH, true, PLANE - 30)} />
        {UPPER_TEETH.map((tooth, i) => <path key={`u${i}`} className="tooth" d={toothPath(tooth, tipOf(tooth), true)} />)}
        <path className="upper" d={`M192 ${PLANE - 52} H${jx + 11} V${PLANE - 40} H192 Z`} />
        {/* The seat: a block whose V rests on the ball at two points (the other side has three), with
            the keeper's lip under the ball at the front, clear of it; the channel behind is open. */}
        <path className="upper" d={`M${jx - 11} ${PLANE - 42} H${jx + 11} V${jy - 2} H${jx + 4.4} L${jx} ${jy - 8.8} L${jx - 4.4} ${jy - 2} H${jx - 11} Z`} />
        <path className="upper" d={`M${jx - 11} ${jy - 2.5} H${jx - 5.4} A6.8 6.8 0 0 0 ${jx - 3.6} ${jy + 4.6} H${jx - 11} Z`} />
        {/* The pad the pin's tip rests on. */}
        <rect className="upper" x={pinX - 8} y={PIN_TOP - 2} width={42} height="3" />
        <rect className="upper" x={pinX - 5} y={PIN_TOP} width="10" height={TABLE_TOP - PIN_TOP} />
      </g>
      {raise > 0 ? (
        <g className="opening">
          <path className="turn" d={`M${jx - 13} ${jy - 18} A22 22 0 0 0 ${jx - 21} ${jy - 5}`} />
          <path className="turn" d={`M${jx - 13} ${jy - 18} l-4.4 0.4 M${jx - 13} ${jy - 18} l-0.2 4.4`} />
          <text className="raise" x={pinX - 8} y={PLANE + 58}>{`+${raise} mm`}</text>
        </g>
      ) : null}
    </svg>
  );
}

/**
 * Build 75: the model's height as it stacks up, drawn as a section through a molar standing in its gum
 * on the base - the crown and the gum right beside it (never cut), the band of gum kept below it, and
 * the base - each with a bracket beside it, to scale with the numbers.
 */
export function ModelHeightPicture({ teeth, gum, base }: { teeth: number; gum: number; base: number }) {
  const total = Math.max(1, teeth + gum + base);
  const scale = 110 / total;
  const top = 6;
  const tH = Math.max(14, teeth * scale), gH = gum > 0 ? Math.max(3, gum * scale) : 0, bH = Math.max(3, base * scale);
  const sum = tH + gH + bH, k = 110 / sum;
  const t = tH * k, g = gH * k, b = bH * k;
  const gumTop = top + t * 0.36; // the gum between the teeth (the papillae)
  const dip = t * 0.11; // the margin dips mid-crown
  const crownLow = gumTop + dip + t * 0.12; // the crown runs on under the gum
  const y1 = top + t, y2 = y1 + g, y3 = y2 + b;
  const bracket = (from: number, to: number, cls: string) => (
    <path className={`bracket ${cls}`} d={`M10 ${f(from + 0.8)} H6 V${f(to - 0.8)} H10`} />
  );
  return (
    <svg className="dental-height-figure" viewBox="0 0 80 122" aria-hidden="true">
      <rect className="base" x="20" y={f(y2)} width="56" height={f(b)} rx="1.5" />
      {g > 0 ? <rect className="gum" x="24" y={f(y1 - 0.5)} width="48" height={f(g + 0.5)} /> : null}
      {/* The crown of a molar from the buccal side: two cusps either side of the buccal groove, widest at its contacts. */}
      <path className="teeth" transform="translate(48 0) scale(1.2 1) translate(-48 0)" vectorEffect="non-scaling-stroke" d={`M35 ${f(crownLow)} C31.5 ${f(crownLow - t * 0.12)} 30.5 ${f(top + t * 0.14)} 32.5 ${f(top + 3.2)} Q40 ${f(top - 2.2)} 47 ${f(top + 3.4)} L48 ${f(top + 5.6)} L49 ${f(top + 3.4)} Q56 ${f(top - 2.2)} 63.5 ${f(top + 3.2)} C65.5 ${f(top + t * 0.14)} 64.5 ${f(crownLow - t * 0.12)} 61 ${f(crownLow)} Z`} />
      {/* The gum over the neck: up between the teeth, down mid-crown, then down to the cut. */}
      <path className="gum" d={`M24 ${f(y1)} V${f(gumTop + 4)} Q24 ${f(gumTop)} 29 ${f(gumTop)} Q48 ${f(gumTop + dip * 2)} 67 ${f(gumTop)} Q72 ${f(gumTop)} 72 ${f(gumTop + 4)} V${f(y1)} Z`} />
      {g > 0 ? <line className="cut-line" x1="22" y1={f(y1)} x2="74" y2={f(y1)} /> : null}
      {bracket(top, y1, "teeth")}
      {g > 0 ? bracket(y1, y2, "gum") : null}
      {bracket(y2, y3, "base")}
    </svg>
  );
}
