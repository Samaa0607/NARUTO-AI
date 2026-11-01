"""Build the hand-sign reference cards in gesture_references/.

Run:  python tools/build_gesture_references.py

For every jutsu folder it writes step_1.png .. step_4.png (one card per sign) and
sequence_reference.png (all four steps in order). The seal drawings come from
gesture_references/_sources/signs/ (Wikimedia Commons, Schlum, CC BY-SA 4.0, see
CREDITS.txt there). The "Rasengan palm" drawing is rendered here from one recorded
MediaPipe hand pose, because it is a custom pose and has no published illustration.
The order of the steps is read from shinobi/config.py (JUTSU), the same table the app uses.
"""

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))                       # run as a plain script from tools/
from shinobi import catalog, config  # noqa: E402

REF = ROOT / "gesture_references"
SIGNS_DIR = REF / "_sources" / "signs"
PALM_POSE = REF / "_sources" / "rasengan_palm_landmarks.json"
FONTS = Path("C:/Windows/Fonts")

INK = (34, 34, 34)
MUTED = (110, 110, 110)
LINE = (215, 215, 215)
GREEN = (46, 125, 50)
PURPLE = (106, 27, 154)
SLATE = (69, 90, 100)

# The texts (sign names, cues, jutsu titles, tags, provenance, credit lines) live in
# shinobi/catalog.py: the web app shows the same texts (/api/jutsu).
COMMONS_CREDIT, PALM_CREDIT, SIGNS = catalog.COMMONS_CREDIT, catalog.PALM_CREDIT, catalog.SIGNS
JUTSU = {key: dict(card, steps=config.JUTSU[key]["sequence"])  # one source of truth for the order
         for key, card in catalog.JUTSU.items()}


def font(name, size):
    return ImageFont.truetype(str(FONTS / name), size)


def bold(size):
    return font("segoeuib.ttf", size)


def regular(size):
    return font("segoeui.ttf", size)


def japanese(size):
    return font("YuGothB.ttc", size)


def wrap(draw, text, fnt, width):
    """Greedy word wrap -> list of lines that fit in `width` pixels."""
    lines, line = [], ""
    for word in text.split(" "):
        test = f"{line} {word}".strip()
        if draw.textlength(test, font=fnt) <= width or not line:
            line = test
        else:
            lines.append(line)
            line = word
    lines.append(line)
    return lines


def badge(draw, x, y, text, color, size=22):
    fnt = bold(size)
    w = draw.textlength(text, font=fnt)
    draw.rounded_rectangle((x, y, x + w + 28, y + size + 16), radius=(size + 16) // 2, fill=color)
    draw.text((x + 14, y + 6), text, font=fnt, fill="white")
    return x + w + 28


def fit(img, box_w, box_h):
    img = img.copy()
    img.thumbnail((box_w, box_h), Image.LANCZOS)
    return img


# ---------- custom pose drawing ----------

def _capsule(draw, p, q, width, fill):
    draw.line([tuple(p), tuple(q)], fill=fill, width=int(width))
    for c in (p, q):
        r = width / 2
        draw.ellipse((c[0] - r, c[1] - r, c[0] + r, c[1] + r), fill=fill)


def draw_palm(size=1000):
    """Silhouette line drawing of the recorded open palm (white fill, dark outline)."""
    pose = json.loads(PALM_POSE.read_text())
    pts = np.array(pose["points_xy"], np.float64) * np.array([pose["aspect"], 1.0])
    palm_len = np.linalg.norm(pts[9] - pts[0])
    forearm = pts[0] + (pts[0] - pts[9]) / palm_len * palm_len * 0.9       # stub of the forearm
    allp = np.vstack([pts, forearm])
    lo, hi = allp.min(0), allp.max(0)
    scale = 2 * 0.80 * size / max(hi - lo)                                 # drawn at 2x, downsampled later
    off = np.array([2 * size, 2 * size]) / 2 - (lo + hi) / 2 * scale
    P = pts * scale + off
    F = forearm * scale + off
    unit = palm_len * scale

    chains = [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]]
    widths = [0.30, 0.24, 0.25, 0.235, 0.20]
    side = (P[17] - P[1]) / np.linalg.norm(P[17] - P[1])                  # thumb side -> little-finger side
    half = 0.36 * unit
    wrist_thumb, wrist_pinky = P[0] - side * half, P[0] + side * half     # shared by palm and forearm: no notches
    palm_poly = [tuple(wrist_thumb)] + [tuple(P[i]) for i in (1, 2, 5, 9, 13, 17)] + [tuple(wrist_pinky)]
    arm_poly = [tuple(wrist_thumb), tuple(wrist_pinky),
                tuple(F + side * half * 0.92), tuple(F - side * half * 0.92)]

    img = Image.new("RGB", (2 * size, 2 * size), "white")
    d = ImageDraw.Draw(img)
    outline = 0.025 * unit
    # dark pass with every shape grown by `outline`, then the same shapes in white on top:
    # only the outer silhouette stays dark, so the hand reads as one clean line drawing
    for fill, extra in ((INK, outline), ("white", 0.0)):
        for poly in (arm_poly, palm_poly):
            d.polygon(poly, fill=fill)
            if extra:
                for a, b in zip(poly, poly[1:] + poly[:1]):
                    _capsule(d, np.array(a), np.array(b), 2 * extra, fill)
        for chain, w in zip(chains, widths):
            seq = [0] + chain if chain[0] == 1 else chain                  # thumb starts at the wrist
            for k, (a, b) in enumerate(zip(seq[:-1], seq[1:])):
                taper = 1.0 - 0.12 * (k + 1) / len(seq)
                _capsule(d, P[a], P[b], w * unit * taper + 2 * extra, fill)
    img = img.resize((size, size), Image.LANCZOS)
    left, top, right, bottom = Image.eval(img.convert("L"), lambda v: 255 - v).getbbox()
    bottom = min(bottom, int((F[1] - 0.3 * unit) / 2))                     # cut the forearm open, like the line art
    return img.crop((left, top, right, bottom))


def sign_art(key):
    if key == "rasengan_palm":
        path = SIGNS_DIR / "rasengan_palm.png"
        draw_palm().save(path)
        return Image.open(path).convert("RGB")
    return Image.open(SIGNS_DIR / f"{key}.png").convert("RGB")


# ---------- cards ----------

def step_card(jutsu_key, j, step, art):
    sign_key = j["steps"][step]
    s = SIGNS[sign_key]
    W, H = 1280, 1000
    img = Image.new("RGB", (W, H), "white")
    d = ImageDraw.Draw(img)
    color = j["color"]

    # header: jutsu + step counter + progress dots
    d.rectangle((0, 0, W, 120), fill=color)
    d.text((40, 14), j["title"], font=bold(46), fill="white")
    d.text((42, 76), j["tag"], font=regular(22), fill="white")
    step_txt = f"STEP {step + 1} / 4"
    d.text((W - 40 - d.textlength(step_txt, font=bold(46)), 14), step_txt, font=bold(46), fill="white")
    for i in range(4):
        cx, cy, r = W - 40 - 14 - (3 - i) * 40, 96, 11
        if i == step:
            d.ellipse((cx - r - 4, cy - r - 4, cx + r + 4, cy + r + 4), outline="white", width=3)
        d.ellipse((cx - r, cy - r, cx + r, cy + r), fill="white" if i <= step else None, outline="white", width=2)

    # sign name + badges
    d.text((40, 140), s["name"], font=bold(64), fill=INK)
    name_w = d.textlength(s["name"], font=bold(64))
    d.text((40 + name_w + 24, 166), s["jp"], font=japanese(34), fill=MUTED)
    x = badge(d, 40, 236, "OFFICIAL SEAL" if s["official"] else "CUSTOM POSE", GREEN if s["official"] else PURPLE)
    badge(d, x + 12, 236, "BOTH HANDS" if s["hands"] == 2 else "ONE HAND", SLATE)

    # illustration
    box = (40, 300, 800, 900)
    d.rounded_rectangle(box, radius=18, outline=LINE, width=3)
    a = fit(art, box[2] - box[0] - 48, box[3] - box[1] - 48)
    img.paste(a, (box[0] + (box[2] - box[0] - a.width) // 2, box[1] + (box[3] - box[1] - a.height) // 2))

    # instructions column
    x0, y, colw = 836, 300, W - 836 - 40
    d.text((x0, y), "HOW TO", font=bold(26), fill=color)
    y += 40
    for cue in s["cues"]:
        lines = wrap(d, cue, regular(24), colw - 26)
        d.ellipse((x0 + 2, y + 12, x0 + 12, y + 22), fill=color)
        for line in lines:
            d.text((x0 + 26, y), line, font=regular(24), fill=INK)
            y += 32
        y += 8
    y += 10
    d.text((x0, y), "WHERE", font=bold(26), fill=color)
    y += 40
    for line in wrap(d, "In front of your chest, centred, whole hands visible", regular(24), colw):
        d.text((x0, y), line, font=regular(24), fill=INK)
        y += 32
    y += 18
    d.text((x0, y), "HOLD", font=bold(26), fill=color)
    y += 40
    d.text((x0, y), "Still for about 1 second", font=regular(24), fill=INK)
    y += 50
    d.text((x0, y), "NEXT", font=bold(26), fill=color)
    y += 40
    nxt = (f"Step {step + 2}: {SIGNS[j['steps'][step + 1]]['name']}" if step < 3
           else f"{j['title']} activates")
    for line in wrap(d, nxt, bold(26), colw):
        d.text((x0, y), line, font=bold(26), fill=INK)
        y += 34

    # footer credit
    d.line((40, H - 70, W - 40, H - 70), fill=LINE, width=2)
    credit = COMMONS_CREDIT if s["official"] else PALM_CREDIT
    yy = H - 60
    for line in wrap(d, credit, regular(17), W - 80):
        d.text((40, yy), line, font=regular(17), fill=MUTED)
        yy += 22
    return img


def sequence_sheet(jutsu_key, j, arts):
    W, H = 2500, 1000
    img = Image.new("RGB", (W, H), "white")
    d = ImageDraw.Draw(img)
    color = j["color"]

    d.rectangle((0, 0, W, 170), fill=color)
    d.text((60, 14), f"{j['title']}  —  4-STEP SEQUENCE", font=bold(58), fill="white")
    yy = 96
    for line in wrap(d, j["status"], regular(26), W - 120):
        d.text((62, yy), line, font=regular(26), fill="white")
        yy += 34

    panel_w, panel_h, gap, top, left = 470, 600, 60, 210, 60
    for i, key in enumerate(j["steps"]):
        s = SIGNS[key]
        x = left + i * (panel_w + gap)
        d.rounded_rectangle((x, top, x + panel_w, top + panel_h), radius=22, outline=LINE, width=3)
        badge(d, x + 20, top + 18, f"STEP {i + 1}", color, size=26)
        a = fit(arts[key], panel_w - 50, 330)
        img.paste(a, (x + (panel_w - a.width) // 2, top + 80 + (330 - a.height) // 2))
        d.text((x + 24, top + 425), s["name"], font=bold(40), fill=INK)
        d.text((x + 24, top + 478), s["jp"], font=japanese(24), fill=MUTED)
        bx = badge(d, x + 24, top + 528, "OFFICIAL" if s["official"] else "CUSTOM", GREEN if s["official"] else PURPLE, 20)
        badge(d, bx + 10, top + 528, "BOTH HANDS" if s["hands"] == 2 else "ONE HAND", SLATE, 20)
        # arrow to the next panel / to the activation box
        ax, ay = x + panel_w + 8, top + panel_h // 2
        d.polygon([(ax, ay - 12), (ax + 24, ay - 12), (ax + 24, ay - 26), (ax + gap - 16, ay),
                   (ax + 24, ay + 26), (ax + 24, ay + 12), (ax, ay + 12)], fill=color)

    fx = left + 4 * (panel_w + gap)
    d.rounded_rectangle((fx, top, W - 60, top + panel_h), radius=22, fill=color)
    fy = top + panel_h // 2 - 70
    for line in wrap(d, j["title"], bold(40), W - 60 - fx - 30):
        d.text((fx + (W - 60 - fx - d.textlength(line, font=bold(40))) / 2, fy), line, font=bold(40), fill="white")
        fy += 50
    d.text((fx + (W - 60 - fx - d.textlength("activates", font=regular(28))) / 2, fy + 6), "activates",
           font=regular(28), fill="white")

    y = top + panel_h + 30
    d.text((60, y), "Order matters: the same signs in another order do nothing.   "
                    "Hold each sign still for about 1 second, then move to the next one.",
           font=bold(26), fill=INK)
    y += 50
    d.line((60, y, W - 60, y), fill=LINE, width=2)
    y += 12
    credits = [COMMONS_CREDIT] + ([PALM_CREDIT] if any(not SIGNS[k]["official"] for k in j["steps"]) else [])
    for c in credits:
        d.text((60, y), c, font=regular(20), fill=MUTED)
        y += 28
    return img


def main():
    arts = {key: sign_art(key) for key in SIGNS}
    for jutsu_key, j in JUTSU.items():
        out = REF / jutsu_key
        out.mkdir(parents=True, exist_ok=True)
        for step in range(4):
            step_card(jutsu_key, j, step, arts[j["steps"][step]]).save(out / f"step_{step + 1}.png")
        sequence_sheet(jutsu_key, j, arts).save(out / "sequence_reference.png")
        print(f"{jutsu_key}: {' -> '.join(j['steps'])}")


if __name__ == "__main__":
    main()
