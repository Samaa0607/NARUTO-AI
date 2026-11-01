"""SHINOBI AI — real-time hand-sign recognition with anime-style visual effects."""

import os

# Must be set before OpenCV opens a camera: without it the Windows Media Foundation
# backend takes ~15 s to open the webcam. (Measured on this laptop: 14.4 s -> 0.6 s.)
os.environ.setdefault("OPENCV_VIDEOIO_MSMF_ENABLE_HW_TRANSFORMS", "0")
