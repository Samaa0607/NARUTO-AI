// Small helpers shared by the Jutsu and Practice pages.
import { useState } from 'react'
import type { JutsuInfo } from '../../types/catalog'

/**
 * Show the selected jutsu in the address bar (/library/<id>, /practice/<id>) without a router
 * navigation: the shell would scroll to the top and move focus to <main> on every carousel step.
 */
export function replaceUrl(path: string): void {
  if (typeof window === 'undefined' || window.location.pathname === path) return
  window.history.replaceState(window.history.state, '', path)
}

/**
 * The jutsu selected in a carousel: starts at the URL's jutsu (or `fallback`), follows real
 * navigations to another /…/<id>, and changes with `select`.
 */
export function useSelectedJutsu(param: string | undefined) {
  const [selected, setSelected] = useState<string | null>(param ?? null)
  const [seenParam, setSeenParam] = useState(param)
  if (seenParam !== param) {
    setSeenParam(param)
    if (param) setSelected(param)
  }
  return [selected, setSelected] as const
}

/** Index of the selected jutsu, else of `fallback`, else 0. */
export function selectedIndex(list: readonly JutsuInfo[], selected: string | null, fallback?: string): number {
  const i = selected ? list.findIndex((j) => j.id === selected) : -1
  if (i >= 0) return i
  const f = fallback ? list.findIndex((j) => j.id === fallback) : -1
  return f >= 0 ? f : 0
}
