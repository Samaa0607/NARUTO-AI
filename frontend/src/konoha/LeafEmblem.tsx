// The Hidden Leaf (Konohagakure) symbol, used as the NARUTO logo and the favicon
// (public/favicon.svg uses the same paths). Redrawn for this project as clean vector strokes in a
// 100x100 box: a bold spiral whose outer stroke rises into the pointed leaf tip at the upper right,
// with the triangular stem at the lower left.
export const LEAF_SPIRAL =
  'M60.5,53.93 C61.2,54.0 63.7,53.6 64.8,54.3 C65.9,55.0 67.0,56.7 67.1,58.1 C67.1,59.5 66.3,61.6 65.1,62.7 C63.9,63.9 61.8,64.8 59.8,65.0 C57.9,65.1 55.3,64.6 53.3,63.8 C51.2,62.9 49.0,61.5 47.6,59.9 C46.2,58.2 45.1,56.0 44.9,53.9 C44.6,51.8 45.1,49.2 46.0,47.4 C47.0,45.5 48.8,43.8 50.6,42.6 C52.5,41.4 54.8,40.6 57.2,40.1 C59.6,39.7 62.5,39.5 65.1,39.9 C67.7,40.2 70.7,40.9 73.0,42.1 C75.3,43.4 77.5,45.3 78.9,47.4 C80.3,49.4 81.2,51.7 81.5,54.2 C81.9,56.7 81.7,59.6 81.0,62.1 C80.3,64.6 79.1,67.0 77.6,69.2 C76.0,71.3 74.0,73.4 71.7,75.0 C69.4,76.5 66.6,77.6 63.8,78.5 C60.9,79.4 57.9,80.0 54.6,80.5 C51.3,81.0 45.8,81.4 44.1,81.5'
export const LEAF_OUTER =
  'M44.08,81.53 C42.8,81.0 38.3,79.8 36.2,78.2 C34.0,76.7 32.5,74.8 31.2,72.3 C29.9,69.8 29.0,66.3 28.6,63.1 C28.1,60.0 28.0,56.5 28.4,53.3 C28.9,50.0 29.9,46.6 31.2,43.7 C32.5,40.8 34.3,38.1 36.5,35.8 C38.6,33.5 41.3,31.4 44.3,29.9 C47.4,28.3 51.1,27.1 54.6,26.5 C58.1,25.9 61.9,26.1 65.1,26.3 C68.3,26.6 71.3,27.5 73.6,28.2 C76.0,28.9 78.3,30.1 79.3,30.5'
export const LEAF_STEM = 'M46.05,82.71 L5.45,84.81 L28.6,49.5'
export const LEAF_TIP = 'M72.0,25.1 L95.6,13.7 L80.6,35.6 L74.0,31.4 Z'

export interface LeafEmblemProps {
  size?: number
  className?: string
  /** stroke weight in the 100-unit box (thicker reads better at favicon sizes) */
  weight?: number
  /** accessible name; without it the emblem is decorative */
  title?: string
}

export function LeafEmblem({ size = 56, className, weight = 7, title }: LeafEmblemProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <g fill="none" stroke="currentColor" strokeWidth={weight} strokeLinecap="round" strokeLinejoin="round">
        <path d={LEAF_SPIRAL} />
        <path d={LEAF_OUTER} />
        <path d={LEAF_STEM} strokeWidth={weight * 0.72} strokeLinecap="butt" strokeLinejoin="miter" strokeMiterlimit={8} />
      </g>
      <path d={LEAF_TIP} fill="currentColor" />
    </svg>
  )
}
