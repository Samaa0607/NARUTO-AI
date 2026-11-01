// Live: the camera is the main focus (konoha/live/LiveView), free mode with all four jutsu. Every
// sign, step and activation comes from the backend's FrameState / events; with the backend offline
// nothing is recognised.
import { LiveView } from '../konoha/live/LiveView'

export function LiveDemoPage() {
  return <LiveView heading="Live: form the hand signs of any jutsu" documentTitle="Live" />
}
