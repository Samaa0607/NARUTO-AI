// The sound-effect files in assets/audio/ (served by the backend at /audio/...). Licences and credits:
// assets/audio/ASSET_LICENSES.md (and SOURCES.md). Loops are marked; everything else is a one-shot.
// (The jutsu sequence music, assets/audio/jutsu_music/, is played by jutsuMusicPlayer.ts.)

export const CUES = {
  'ui.hand_seal': { url: '/audio/ui/hand_seal.wav', loop: false },
  'ui.step_success': { url: '/audio/ui/step_success.wav', loop: false },
  'ui.sequence_failed': { url: '/audio/ui/sequence_failed.wav', loop: false },
  'ui.mode_switch': { url: '/audio/ui/mode_switch.wav', loop: false },

  'rasengan.chakra_charge': { url: '/audio/rasengan/chakra_charge.wav', loop: false },
  'rasengan.spin_loop': { url: '/audio/rasengan/spin_loop.wav', loop: true },
  'rasengan.release_whoosh': { url: '/audio/rasengan/release_whoosh.wav', loop: false },
  'rasengan.impact': { url: '/audio/rasengan/impact.wav', loop: false },
  'rasengan.hand_sign': { url: '/audio/rasengan/hand_sign.wav', loop: false },
  'rasengan.charge_magic': { url: '/audio/rasengan/charge_magic.wav', loop: false },
  'rasengan.wind_impact': { url: '/audio/rasengan/wind_impact.wav', loop: false },
  'rasengan.energy_loop': { url: '/audio/rasengan/energy_loop.wav', loop: true },

  'chidori.lightning_charge': { url: '/audio/chidori/lightning_charge.wav', loop: false },
  'chidori.crackle_loop': { url: '/audio/chidori/crackle_loop.wav', loop: true },
  'chidori.activation_zap': { url: '/audio/chidori/activation_zap.wav', loop: false },
  'chidori.impact': { url: '/audio/chidori/impact.wav', loop: false },
  'chidori.hand_sign': { url: '/audio/chidori/hand_sign.wav', loop: false },
  'chidori.thunder_impact': { url: '/audio/chidori/thunder_impact.wav', loop: false },

  'fire_style.prepare_inhale': { url: '/audio/fire_style/prepare_inhale.wav', loop: false },
  'fire_style.ignition': { url: '/audio/fire_style/ignition.wav', loop: false },
  'fire_style.flame_burst': { url: '/audio/fire_style/flame_burst.wav', loop: false },
  'fire_style.burning_loop': { url: '/audio/fire_style/burning_loop.wav', loop: true },
  'fire_style.hand_sign': { url: '/audio/fire_style/hand_sign.wav', loop: false },
  'fire_style.charge_rise': { url: '/audio/fire_style/charge_rise.wav', loop: false },
  'fire_style.impact': { url: '/audio/fire_style/impact.wav', loop: false },

  'shadow_clone.seal_charge': { url: '/audio/shadow_clone/seal_charge.wav', loop: false },
  'shadow_clone.smoke_poof': { url: '/audio/shadow_clone/smoke_poof.wav', loop: false },
  'shadow_clone.clone_appear': { url: '/audio/shadow_clone/clone_appear.wav', loop: false },
  'shadow_clone.clone_disappear': { url: '/audio/shadow_clone/clone_disappear.wav', loop: false },
  'shadow_clone.hand_sign': { url: '/audio/shadow_clone/hand_sign.wav', loop: false },
  'shadow_clone.charge_chakra': { url: '/audio/shadow_clone/charge_chakra.wav', loop: false },
  'shadow_clone.duplicate': { url: '/audio/shadow_clone/duplicate.wav', loop: false },
} as const satisfies Record<string, { url: string; loop: boolean }>

export type CueId = keyof typeof CUES
