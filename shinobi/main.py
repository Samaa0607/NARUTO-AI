"""SHINOBI AI main loop.  Run:  python -m shinobi.main

The per-frame pipeline (models, fusion, controller, effects) is shinobi/engine.py, shared with the
web server. This file is the desktop app around it: camera, window, keyboard and HUD.
"""

import time

import cv2

from shinobi import config
from shinobi.camera import Camera
from shinobi.engine import Engine
from shinobi.hud import draw_hud

WINDOW = "SHINOBI AI"


def main():
    camera = Camera()
    engine = Engine(draw_landmarks=True)      # loads the landmark model (if trained) and starts YOLOX
    if engine.classifier:
        message = None
    elif engine.seal_worker:
        message = "No landmark model yet: only the 7 official seals (YOLOX) + keys 1-4"
    else:
        message = "No trained model yet: keyboard mode (press 1-4)"

    cv2.namedWindow(WINDOW, cv2.WINDOW_NORMAL)
    cv2.resizeWindow(WINDOW, config.CAMERA_WIDTH, config.CAMERA_HEIGHT)
    show_hud, fullscreen = True, False
    last_id = -1

    try:
        while True:
            # 0) keyboard: checked on EVERY pass, also while waiting for a new frame,
            #    otherwise key presses that arrive in between are lost.
            key = cv2.waitKey(1) & 0xFF
            if key in (ord("q"), 27):
                break
            if key in config.EFFECT_KEYS:
                engine.start_effect(config.EFFECT_KEYS[key], time.perf_counter())
            elif key == ord("0"):
                engine.stop_effect(time.perf_counter())
            elif key == ord("l"):
                engine.draw_landmarks = not engine.draw_landmarks
            elif key == ord("h"):
                show_hud = not show_hud
            elif key == ord("f"):
                fullscreen = not fullscreen
                cv2.setWindowProperty(WINDOW, cv2.WND_PROP_FULLSCREEN,
                                      cv2.WINDOW_FULLSCREEN if fullscreen else cv2.WINDOW_NORMAL)
            if last_id >= 0 and cv2.getWindowProperty(WINDOW, cv2.WND_PROP_VISIBLE) < 1:
                break                                     # window closed with the X button

            frame_id, frame = camera.read()
            if frame is None or frame_id == last_id:     # no new frame yet
                continue
            last_id = frame_id

            # 1-3) perception -> recognition -> controller -> effects (+ landmarks), see engine.py
            now = time.perf_counter()
            r = engine.process(frame, now)
            output = r.frame

            # 4) HUD
            if show_hud:
                stab = r.stabilizer
                crowded = None
                if r.effect is not None and getattr(r.effect, "crowded", False):   # Shadow Clone only
                    crowded = (f"Shadow Clone: not enough room for {config.CLONE_COUNT} clones "
                               f"without overlap - step back")
                draw_hud(output, r.fps, r.timings,
                         labels=stab.labels if stab else None,
                         probs=stab.smoothed if stab else None,
                         candidate=stab.candidate if stab else None,
                         latched=stab.latched if stab else None,
                         hold=stab.hold_progress(now) if stab else 0.0,
                         history=r.state.history if r.state else (),
                         effect=None if r.effect is None else r.effect.name if r.effect_phase == "release"
                         else f"{r.effect.name} ({r.effect_phase})",     # the build-up stage, if any
                         cooldown=r.cooldown,
                         message="   ".join(m for m in (message, r.status, crowded) if m))
            cv2.imshow(WINDOW, output)
    finally:
        engine.close()
        camera.release()
        cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
