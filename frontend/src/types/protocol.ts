// Types of the backend <-> frontend contract. Source of truth: docs/web_protocol.md (protocol v1).
// Keys are snake_case exactly as the Python server sends them.

export const PROTOCOL_VERSION = 1

export type SignId =
  | 'idle'
  | 'ram'
  | 'snake'
  | 'tiger'
  | 'dog'
  | 'monkey'
  | 'boar'
  | 'horse'
  | 'clone_seal'
  | 'rasengan_palm'

export type JutsuId = 'fire_style' | 'chidori' | 'shadow_clone' | 'rasengan'
export type EffectId = 'fire' | 'chidori' | 'shadow_clone' | 'rasengan'
export type SignSource = 'yolox' | 'landmarks' | 'landmarks-backup' | 'none'

/** GET /api/info, and `info` in the WebSocket hello. */
export interface ServerInfo {
  name: string
  version: string
  protocol: number
  yolox: boolean
  landmark_model: boolean
  recognizable: SignId[]
  jutsu_available: Record<JutsuId, boolean>
  sessions: { active: number; max: number }
  frame: { max_width: number; max_height: number; jpeg_quality: number; max_in_flight: number }
  mirror: boolean
  /** seconds allowed from one confirmed sign to the next (config.SEQUENCE_MAX_GAP); older servers omit it */
  sequence_max_gap?: number
}

export type Mode = { mode: 'free'; jutsu: null } | { mode: 'practice'; jutsu: JutsuId }

/**
 * Activation timeline of a fired jutsu (newer servers): the character's activation voice, the chakra
 * charge, the jutsu name, then the release (the main effect and its impact).
 */
export type EffectPhase = 'voice' | 'charge' | 'name' | 'release'

export interface EffectState {
  name: EffectId
  jutsu: JutsuId | null
  age: number
  stopping: boolean
  /** Shadow Clone only: clones visible in the returned frame. */
  clones: number | null
  /** Shadow Clone only: too little room for all 10 clones without overlap (all are still drawn). */
  crowded: boolean | null
  /** where the activation is in its timeline (newer servers; absent = the main effect from the start) */
  phase?: EffectPhase
  /** seconds left in a build-up phase (voice / charge / name); null in release */
  phase_left?: number | null
}

export interface FusedSign {
  name: SignId
  source: SignSource
  score: number
}

/** JSON header of every processed frame (server -> client binary message). */
export interface FrameState {
  type: 'frame'
  seq: number
  client_t: number | null
  width: number
  height: number
  fps: number
  timings: Partial<Record<'decode' | 'hands' | 'model' | 'yolox' | 'seg' | 'fx' | 'encode' | 'total', number>>
  hands: number
  sign: FusedSign
  candidate: SignId | null
  hold: number
  latched: SignId | null
  history: SignId[]
  progress: Partial<Record<JutsuId, number>>
  time_left: number | null
  /** free mode: seconds left for EVERY jutsu in progress, each on its own clock (practice: {});
   * absent on older servers. The countdown of the jutsu on screen comes from here. */
  time_left_per_jutsu?: Partial<Record<JutsuId, number>>
  /** false while the AI is still getting ready (warm-up): no sign counts yet, so no step and no
   * time limit can start. Older servers do not send it (= ready). */
  ready: boolean
  cooldown: number
  mode: Mode
  effect: EffectState | null
  events: ShinobiEvent[]
}

// ------------------------------------------------------------------ events (FrameState.events)
export interface SignEvent {
  type: 'sign'
  sign: SignId
}
export interface StepEvent {
  type: 'step'
  jutsu: JutsuId
  step: number
  total: number
  sign: SignId
}
/** The sequence in progress was reset. 'timeout': longer than sequence_max_gap since the last
 * confirmed step (Live only, never in practice). Older servers also sent 'wrong_sign' here (with a
 * reset); the current one sends a WrongSignEvent instead and keeps the progress. */
export interface SequenceFailedEvent {
  type: 'sequence_failed'
  reason: 'wrong_sign' | 'timeout'
  jutsu: JutsuId
  step: number
  expected: SignId | null
  got: SignId | null
}
/** A confirmed sign that is not the next one of the jutsu in progress (Live: the leading jutsu;
 * practice: the practised one, also at step 0). Nothing is reset: the user retries the same step. */
export interface WrongSignEvent {
  type: 'wrong_sign'
  jutsu: JutsuId
  /** steps done (kept) */
  step: number
  expected: SignId
  got: SignId
}
/** planned length (s) of the build-up phases of an activation; the release starts after them */
export interface JutsuStages {
  voice: number
  charge: number
  name: number
}
export interface JutsuEvent {
  type: 'jutsu'
  jutsu: JutsuId
  effect: EffectId
  /** newer servers: the activation runs its timeline (voice, charge, name, then release), announced
   * by `effect_phase` events. Absent: the main effect starts at once (older servers). */
  stages?: JutsuStages
}
/** a phase of the activation timeline started (sent once per phase; `voice` starts with `jutsu`) */
export interface EffectPhaseEvent {
  type: 'effect_phase'
  effect: EffectId
  jutsu: JutsuId
  phase: Exclude<EffectPhase, 'voice'>
}
export interface EffectStoppingEvent {
  type: 'effect_stopping'
  effect: EffectId
}
export interface EffectEndEvent {
  type: 'effect_end'
  effect: EffectId
}
export interface ClonesEvent {
  type: 'clones'
  count: number
}
export type ShinobiEvent =
  | SignEvent
  | StepEvent
  | SequenceFailedEvent
  | WrongSignEvent
  | JutsuEvent
  | EffectPhaseEvent
  | EffectStoppingEvent
  | EffectEndEvent
  | ClonesEvent

// ------------------------------------------------------------------ client -> server (text JSON)
export type ClientMessage =
  | { type: 'mode'; mode: 'free' }
  | { type: 'mode'; mode: 'practice'; jutsu: JutsuId }
  | { type: 'reset' }
  | { type: 'options'; landmarks: boolean }
  | { type: 'ping'; t: number }

/** JSON header of a camera frame (client -> server binary message). */
export interface ClientFrameHeader {
  t: number
}

// ------------------------------------------------------------------ server -> client (text JSON)
export interface HelloMessage {
  type: 'hello'
  protocol: number
  session: string
  info: ServerInfo
  mode: Mode
}
export type ModeMessage = { type: 'mode' } & Mode
export interface PongMessage {
  type: 'pong'
  t: number
}
export interface SkippedMessage {
  type: 'skipped'
  client_t: number
}
export interface ErrorMessage {
  type: 'error'
  code: 'busy' | 'bad_frame' | 'bad_message' | 'internal'
  message: string
  fatal: boolean
}
export type ServerTextMessage = HelloMessage | ModeMessage | PongMessage | SkippedMessage | ErrorMessage
