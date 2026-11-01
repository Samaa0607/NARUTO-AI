// The orange dry-brush swash behind the NARUTO wordmark: heavy at the left, breaking into
// bristle streaks at the right, edges roughened by a small displacement filter.
import { useId } from 'react'

export function BrushSwash({ className }: { className?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const fill = `swash-fill-${id}`
  const rough = `swash-rough-${id}`
  return (
    <svg className={className} viewBox="0 0 320 64" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={fill} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#c8380c" />
          <stop offset="0.18" stopColor="#ea5717" />
          <stop offset="0.62" stopColor="#f47128" />
          <stop offset="1" stopColor="#ff9a52" />
        </linearGradient>
        <filter id={rough} x="-5%" y="-30%" width="110%" height="160%">
          <feTurbulence type="fractalNoise" baseFrequency="0.018 0.32" numOctaves="2" seed="7" />
          <feDisplacementMap in="SourceGraphic" scale="6" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
      <g filter={`url(#${rough})`} fill={`url(#${fill})`}>
        {/* main stroke */}
        <path d="M10,31 C14,22 34,18 64,17 C124,14 204,15 262,19 C286,21 302,24 316,29 C298,31 282,32 266,34 C290,37 302,40 308,44 C252,47 190,50 122,52 C80,53 42,55 16,52 C7,46 5,38 10,31 Z" />
        {/* trailing bristle streaks */}
        <path d="M196,22 C238,20 280,22 318,25 L317,28 C280,26 238,25 196,26 Z" opacity="0.85" />
        <path d="M150,49 C204,48 256,46 304,49 L302,52 C254,50 204,52 150,53 Z" opacity="0.8" />
        <path d="M232,37 C260,36 290,37 314,39 L312,41 C290,40 262,40 232,41 Z" opacity="0.7" />
      </g>
      {/* dark flick where the brush first touched the paper */}
      <path d="M4,41 C12,36 24,33 36,34 C30,37 22,40 12,45 Z" fill="#7a1f06" opacity="0.85" />
      {/* dry-brush gaps */}
      <path d="M36,27 C110,23 190,22 258,24 M44,44 C110,43 170,42 236,41" fill="none" stroke="#ffd2a8" strokeWidth="1.3" strokeLinecap="round" opacity="0.55" />
    </svg>
  )
}
