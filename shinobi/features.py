"""Turn raw hand landmarks into a fixed-length feature vector.

The same function is used by training and by the live app, so the model
always sees features computed exactly the same way.
"""

import numpy as np

FEATURE_VERSION = 1

TIPS = [4, 8, 12, 16, 20]
# (a, b, c) triplets: the angle is measured at joint b
ANGLE_TRIPLETS = [
    (0, 1, 2), (1, 2, 3), (2, 3, 4),          # thumb
    (0, 5, 6), (5, 6, 7), (6, 7, 8),          # index
    (0, 9, 10), (9, 10, 11), (10, 11, 12),    # middle
    (0, 13, 14), (13, 14, 15), (14, 15, 16),  # ring
    (0, 17, 18), (17, 18, 19), (18, 19, 20),  # pinky
]
TIP_PAIRS = [(i, j) for i in range(5) for j in range(i + 1, 5)]   # 10 pairs

PER_HAND_SIZE = 1 + 63 + 15 + 10      # present flag + coords + angles + tip distances
INTER_HAND_SIZE = 1 + 2 + 25          # both flag + wrist offset + 5x5 tip distances
FEATURE_SIZE = 2 * PER_HAND_SIZE + INTER_HAND_SIZE


def hands_to_arrays(hands):
    """List[Hand] -> (image_lm (2,21,3), world_lm (2,21,3), present (2,)) — the raw format we store."""
    image_lm = np.zeros((2, 21, 3), np.float32)
    world_lm = np.zeros((2, 21, 3), np.float32)
    present = np.zeros(2, np.float32)
    for slot, hand in enumerate(hands[:2]):
        image_lm[slot] = hand.landmarks
        world_lm[slot] = hand.world
        present[slot] = 1.0
    return image_lm, world_lm, present


def _hand_features(world):
    rel = world - world[0]                                  # wrist becomes the origin
    scale = np.linalg.norm(rel[9]) + 1e-6                   # wrist -> middle knuckle
    rel = rel / scale                                       # same size for near/far hands

    a = world[[t[0] for t in ANGLE_TRIPLETS]]
    b = world[[t[1] for t in ANGLE_TRIPLETS]]
    c = world[[t[2] for t in ANGLE_TRIPLETS]]
    v1, v2 = a - b, c - b
    cos = (v1 * v2).sum(1) / (np.linalg.norm(v1, axis=1) * np.linalg.norm(v2, axis=1) + 1e-12)
    angles = np.arccos(np.clip(cos, -1.0, 1.0)) / np.pi     # 0..1 (1 = straight finger)

    tips = world[TIPS]
    tip_dist = np.array([np.linalg.norm(tips[i] - tips[j]) for i, j in TIP_PAIRS]) / scale

    return np.concatenate([[1.0], rel.ravel(), angles, tip_dist])


def extract(image_lm, world_lm, present, aspect=16 / 9):
    """Build the feature vector for one frame. aspect = frame width / height."""
    parts = []
    for slot in range(2):
        if present[slot]:
            parts.append(_hand_features(world_lm[slot]))
        else:
            parts.append(np.zeros(PER_HAND_SIZE))

    inter = np.zeros(INTER_HAND_SIZE)
    if present[0] and present[1]:
        # image coords: x and y are both in 0..1, so stretch x to real proportions
        pts = image_lm[:, :, :2] * np.array([aspect, 1.0])
        palm = np.mean([np.linalg.norm(pts[s, 9] - pts[s, 0]) for s in range(2)]) + 1e-6
        offset = (pts[1, 0] - pts[0, 0]) / palm
        cross = np.linalg.norm(pts[0, TIPS][:, None] - pts[1, TIPS][None], axis=2) / palm
        inter = np.concatenate([[1.0], offset, cross.ravel()])
    parts.append(inter)

    return np.concatenate(parts).astype(np.float32)


def mirror(image_lm, world_lm, present):
    """Left/right mirror of a frame (data augmentation): a left-hand sample becomes a right-hand one."""
    image_lm, world_lm = image_lm.copy(), world_lm.copy()
    image_lm[..., 0] = np.where(present[:, None] > 0, 1.0 - image_lm[..., 0], 0.0)
    world_lm[..., 0] = -world_lm[..., 0]
    return order_slots(image_lm, world_lm, present.copy())


def order_slots(image_lm, world_lm, present):
    """Put present hands first, sorted left-to-right by wrist x (same rule as HandTracker)."""
    keys = [(0 if present[s] else 1, image_lm[s, 0, 0]) for s in range(2)]
    order = sorted(range(2), key=lambda s: keys[s])
    return image_lm[order], world_lm[order], present[order]
