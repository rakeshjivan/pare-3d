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

/** Each articulator joint cut through the middle, the upper's part above, the lower's below (viewBox 0 0 48 40). */
export function JointPicture({ joint }: { joint: "ball" | "dropin" | "axle" }) {
  if (joint === "axle") {
    return (
      <svg className="dental-picture joint" viewBox="0 0 48 40" aria-hidden="true">
        {/* The clip from the upper, round the axle, open below. */}
        <path className="upper" d="M14 2 H34 V24 H28 A6 6 0 1 0 20 24 H14 Z" />
        <rect className="lower" x="8" y="22" width="5" height="16" />
        <rect className="lower" x="35" y="22" width="5" height="16" />
        <circle className="lower" cx="24" cy="20" r="4" />
        <rect className="lower" x="6" y="34" width="36" height="5" />
      </svg>
    );
  }
  return (
    <svg className="dental-picture joint" viewBox="0 0 48 40" aria-hidden="true">
      {joint === "ball" ? (
        <>
          {/* The cup, and the two tongues that reach under the ball. */}
          <path className="upper" d="M10 2 H38 V18 H33 A9 9 0 0 0 15 18 H10 Z" />
          <path className="upper tongue" d="M9 6 H12.5 V21 Q14 22 15 21.5 L15.5 23.5 Q12 25 9 23 Z" />
          <path className="upper tongue" d="M39 6 H35.5 V21 Q34 22 33 21.5 L32.5 23.5 Q36 25 39 23 Z" />
        </>
      ) : (
        <>
          {/* The seat, with the channel the ball comes in by, slanting down and back. */}
          <path className="upper" d="M8 2 H40 V22 L36 22 L40 34 L30 34 L28 26 A9 9 0 0 1 15 24 L8 24 Z" />
        </>
      )}
      <circle className="lower" cx="24" cy="18" r="8" />
      <rect className="lower" x="21.5" y="24" width="5" height="10" />
      <rect className="lower" x="10" y="33" width="28" height="6" />
    </svg>
  );
}

/**
 * The articulator from the side, from its settings (viewBox 0 0 200 92): the upper above the lower,
 * the joint behind the molars on the right, the incisal pin on its table in front on the left, the
 * protrusion path at its angle, the pin raised by `pinRaise`, the table flat or sloped as a guide.
 */
export function ArticulatorPicture({ joint, condyle, stop, pinRaise, table }: { joint: "ball" | "dropin" | "axle"; condyle: number; stop: boolean; pinRaise: number; table: "flat" | "guide" }) {
  const plane = 46;
  const jx = 176, jy = plane;
  const pinX = 20;
  // Build 71: the upper turned up about the joint by the pin's raise, as the printed models stand -
  // the pin longer by the raise, its tip on the table - not lifted straight up.
  const gap = Math.min(10, pinRaise) * 1.6;
  const turn = stop && gap > 0 ? (Math.atan2(gap, jx - pinX) * 180) / Math.PI : 0;
  const crowns = (down: boolean) => Array.from({ length: 11 }, (_, i) => {
    const x = 45 + i * 10.8;
    return <rect key={`${down}-${i}`} className="tooth" x={x} y={down ? plane - 8 : plane} width="9.4" height="8" rx="3.2" />;
  });
  const angle = (condyle * Math.PI) / 180;
  const path = { x: jx - Math.cos(angle) * 24, y: jy + Math.sin(angle) * 24 };
  return (
    <svg className="dental-picture articulator" viewBox="0 0 200 92" aria-hidden="true">
      {/* The lower model, its half of the joint and the incisal table: these stay put. */}
      <rect className="lower" x="40" y="66" width="124" height="20" rx="2" />
      <path className="lower-gum" d={`M40 ${plane + 6} H164 V66 H40 Z`} />
      {crowns(false)}
      <rect className="lower" x="160" y="76" width="30" height="10" />
      <rect className="lower" x={jx - 2.5} y={jy} width="5" height="30" />
      {joint === "axle" ? <circle className="lower" cx={jx} cy={jy} r="3.5" /> : <circle className="lower" cx={jx} cy={jy} r="6.5" />}
      {stop ? (
        <>
          <rect className="lower" x={pinX - 4} y="82" width="26" height="4" />
          {table === "guide"
            ? <path className="lower" d={`M${pinX - 4} 84 V${plane} L${pinX + 4} ${plane - 5} V84 Z`} />
            : <rect className="lower" x={pinX - 4} y={plane} width="8" height={84 - plane} />}
        </>
      ) : null}
      {/* The upper model, turned about the joint. */}
      <g transform={turn ? `rotate(${-turn} ${jx} ${jy})` : undefined}>
        <rect className="upper" x="40" y="8" width="124" height="20" rx="2" />
        <path className="upper-gum" d={`M40 28 H164 V${plane - 6} H40 Z`} />
        {crowns(true)}
        <rect className="upper" x="160" y="8" width="30" height="10" />
        {joint === "axle"
          ? <path className="upper" d={`M${jx - 9} 14 H${jx + 9} V${jy + 5} H${jx + 4} A4.5 4.5 0 1 0 ${jx - 4} ${jy + 5} H${jx - 9} Z`} />
          : <path className="upper" d={`M${jx - 10} 14 H${jx + 10} V${jy} H${jx + 7} A7 7 0 0 0 ${jx - 7} ${jy} H${jx - 10} Z`} />}
        {stop ? (
          <>
            <rect className="upper" x={pinX - 4} y="8" width="26" height="4" />
            <rect className="upper" x={pinX - 1.5} y="10" width="3" height={plane - 10 + gap} />
          </>
        ) : null}
      </g>
      {condyle > 0 ? (
        <g className="path">
          <line x1={jx} y1={jy} x2={path.x} y2={path.y} />
          <path d={`M${path.x} ${path.y} l${Math.cos(angle) * 5 + Math.sin(angle) * 3} ${-Math.sin(angle) * 5 + Math.cos(angle) * 3} M${path.x} ${path.y} l${Math.cos(angle) * 5 - Math.sin(angle) * 3} ${-Math.sin(angle) * 5 - Math.cos(angle) * 3}`} />
          <text x={jx - 30} y={jy + 20}>{`${condyle}°`}</text>
        </g>
      ) : null}
      {stop && pinRaise > 0 ? <text className="raise" x={pinX + 7} y={plane - 2}>{`+${pinRaise}`}</text> : null}
    </svg>
  );
}
