// The approved Shadow Clone icon, animated: Naruto in the middle making the seal, his two shadow clones
// growing out from behind him in a puff of smoke, holding for a moment, then vanishing in smoke again,
// with orange chakra around him. The approved art is cut into layers (the scene with the clones painted
// out, each clone, Naruto + the clouds in front of them) and only transform / opacity move, so it stays
// light. JutsuIcon puts it inside the shared glowing ring.
import { useLayoutEffect, useRef } from 'react'
import bg from '../../assets/konoha/shadow-clone/bg.webp'
import cloneLeft from '../../assets/konoha/shadow-clone/clone-left.webp'
import cloneRight from '../../assets/konoha/shadow-clone/clone-right.webp'
import front from '../../assets/konoha/shadow-clone/front.webp'
import styles from './ShadowCloneIcon.module.css'

export interface ShadowCloneIconProps {
  /** animate (always respects the animation preference) */
  animated?: boolean
  className?: string
}

export function ShadowCloneIcon({ animated = true, className }: ShadowCloneIconProps) {
  const ref = useRef<HTMLSpanElement>(null)

  // every copy on the page shows the same moment of the loop, whenever it was mounted
  useLayoutEffect(() => {
    const el = ref.current
    if (!animated || !el || typeof el.getAnimations !== 'function') return
    for (const animation of el.getAnimations({ subtree: true })) animation.startTime = 0
  }, [animated])

  return (
    <span
      ref={ref}
      className={[styles.scene, animated ? styles.animated : '', className ?? ''].filter(Boolean).join(' ')}
      aria-hidden="true"
    >
      <img className={styles.layer} src={bg} alt="" draggable={false} />
      <span className={styles.aura} />
      <img className={[styles.layer, styles.left].join(' ')} src={cloneLeft} alt="" draggable={false} />
      <img className={[styles.layer, styles.right].join(' ')} src={cloneRight} alt="" draggable={false} />
      <img className={styles.layer} src={front} alt="" draggable={false} />
      <span className={[styles.puff, styles.puffLeft].join(' ')}>
        <i />
        <i />
        <i />
        <i />
        <i />
      </span>
      <span className={[styles.puff, styles.puffRight].join(' ')}>
        <i />
        <i />
        <i />
        <i />
        <i />
      </span>
      <span className={styles.sparks}>
        <i />
        <i />
        <i />
        <i />
      </span>
    </span>
  )
}
