// GET /api/jutsu and GET /api/credits (docs/web_protocol.md section 2).
import type { EffectId, JutsuId, SignId } from './protocol'

export interface SignInfo {
  id: SignId
  name: string
  jp: string
  hands: 1 | 2
  official: boolean
  cues: string[]
  /** Line-art drawing of the sign (bold dark lines, transparent background), e.g.
   * /references/_sources/signs_bold/tiger.png (the thin originals are in _sources/signs/) */
  art: string
  recognizer: 'yolox' | 'landmarks'
  /** Can the running server recognise this sign right now? */
  recognizable: boolean
}

export interface JutsuStep {
  step: number
  sign: SignId
  /** Reference card for this step (labelled card with the drawing and how-to text). */
  card: string
}

export interface JutsuInfo {
  id: JutsuId
  title: string
  name: string
  kanji: string
  /** true = official consecutive seals; false = custom SHINOBI AI sequence (must be labelled as custom). */
  official: boolean
  tag: string
  provenance: string
  description: string
  effect: EffectId
  steps: JutsuStep[]
  sequence_image: string
  /** Every sign of the sequence can be recognised by the running server. */
  available: boolean
  missing_signs: SignId[]
}

export interface Catalog {
  signs: Partial<Record<SignId, SignInfo>>
  jutsu: JutsuInfo[]
}

export interface CreditItem {
  text: string
  url: string | null
  license: string | null
  license_url: string | null
}

export interface CreditSection {
  title: string
  items: CreditItem[]
}

export interface Credits {
  sections: CreditSection[]
}
