import type { CSSProperties } from 'react'
import styles from './Skeleton.module.css'

export interface SkeletonProps {
  width?: number | string
  height?: number | string
  /** border radius */
  radius?: number | string
  /** circle of `width` x `width` */
  circle?: boolean
  className?: string
  style?: CSSProperties
}

/** Shimmering placeholder shown while data loads (decorative: hidden from screen readers). */
export function Skeleton({ width = '100%', height = 16, radius = 8, circle = false, className, style }: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      className={[styles.skeleton, className ?? ''].filter(Boolean).join(' ')}
      style={{
        width,
        height: circle ? width : height,
        borderRadius: circle ? '50%' : radius,
        ...style,
      }}
    />
  )
}
