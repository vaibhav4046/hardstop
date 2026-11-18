// The HARDSTOP mark, as supplied by the owner and redrawn as vectors: a gold
// ring split in two, two smaller arcs inside it, and a blade laid across the
// middle where the ring is cut. It is drawn from circles, masks and polygons,
// so it is sharp at any size. The same drawing is in brand/hardstop-mark.svg
// (repository root) and, on a dark tile, in app/icon.svg; keep the three in step.
//
// Geometry, in a space centred on the ring: each ring half is a 270 circle
// less a 229 circle set off down and to the right, so it is thick on one side
// and thin on the other, cut flat where the blade crosses and to a point at
// the thin end. Each inner arc is the lens between two circles, which gives
// it two sharp tips; it leans a few degrees. The lower halves are the upper
// ones turned half a turn.
//
// Decorative: whoever places it gives it its name. `id` keeps the gradient,
// masks and clips of two marks on one page apart.

type Props = { id: string; className?: string }

export function Logo({ id, className = '' }: Props) {
  const fill = `url(#${id}-gold)`
  const ring = <circle r="270" fill={fill} mask={`url(#${id}-ring)`} clipPath={`url(#${id}-half)`} />
  const arc = <circle cx="13" cy="10.66" r="137.7" fill={fill} mask={`url(#${id}-arc)`} />
  return (
    <svg className={`logo ${className}`} viewBox="-395 -285 785 570" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}-gold`} gradientUnits="userSpaceOnUse" x1="-300" y1="-280" x2="300" y2="280">
          <stop offset="0" stopColor="#8a5f1c" />
          <stop offset="0.28" stopColor="#d9a441" />
          <stop offset="0.48" stopColor="#ffe08f" />
          <stop offset="0.7" stopColor="#c99231" />
          <stop offset="1" stopColor="#6f4914" />
        </linearGradient>
        <mask id={`${id}-ring`} maskUnits="userSpaceOnUse" x="-400" y="-400" width="800" height="800">
          <circle r="270" fill="#fff" />
          <circle cx="39.6" cy="10.6" r="229" fill="#000" />
        </mask>
        <mask id={`${id}-arc`} maskUnits="userSpaceOnUse" x="-400" y="-400" width="800" height="800">
          <circle cx="13" cy="10.66" r="137.7" fill="#fff" />
          <circle cx="13" cy="44.2" r="153.2" fill="#000" />
        </mask>
        {/* Above the blade, and short of the thin end on the right. */}
        <clipPath id={`${id}-half`}>
          <polygon points="-400,-15 -400,-400 400,-400 400,-100 0,-15" />
        </clipPath>
      </defs>
      <g className="logo-ring">
        {ring}
        <g transform="rotate(180)">{ring}</g>
      </g>
      <g transform="rotate(-4 10 0)">{arc}</g>
      <g transform="rotate(176 10 0)">{arc}</g>
      <polygon points="-385,6 6,-19 376,6 6,17" fill={fill} />
    </svg>
  )
}
