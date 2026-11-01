# 04 — جمع الداتا (`collect_data.py`)

[⬅ الفهرس](00_index.md)

---

## 1. الملف ده بيعمل إيه؟

`collect_data.py` هو البرنامج اللي بنسجّل بيه الـ dataset. بيفتح الكاميرا، بيشغّل MediaPipe على كل frame، ولما ندوس SPACE بيعدّ 3 ثواني وبعدين يسجّل "session" مدتها 20 ثانية للـ gesture المختار. كل session بتتحفظ كملف `.npz` فيه الـ **landmarks الخام** (مش الـ features) + فيديو صغير للمراجعة.

هو مش جزء من الـ pipeline الحي، لكنه بيستخدم أول مرحلتين منه (camera → hands) وبيجهّز الداتا اللي `train.py` هيحوّلها features ويدرّب عليها الـ classifier:

```
collect_data:  camera → hands → [حفظ landmarks خام]
train:                          [landmarks خام] → features → تدريب classifier
main (حي):     camera → hands → features → classifier → controller → effects → screen
```

## 2. الكود سطر بسطر

### الـ docstring

```python
"""Record gesture sessions from the webcam.

Run:   python collect_data.py --person sara --lighting day
Keys:  0-4 choose gesture   SPACE record one session   Q quit

Each session is saved as raw landmarks (not features), so features can be
recomputed later if features.py changes, plus a small video for reference.
"""
```

- بيشرح طريقة التشغيل: مع `--person` (مين بيسجّل) و `--lighting` (الإضاءة).
- المفاتيح: `0`–`4` لاختيار الـ gesture، `SPACE` لتسجيل session، `Q` للخروج.
- وبيوضح أهم قرار تصميم: بنحفظ landmarks خام مش features، عشان لو `features.py` اتغير نقدر نعيد الحساب، + فيديو صغير للمراجعة.

### الـ imports

```python
import argparse
import json
import time
from datetime import datetime

import cv2
import numpy as np

from shinobi import config
from shinobi.camera import Camera
from shinobi.features import hands_to_arrays
from shinobi.hands import HandTracker, draw_hands
from shinobi.hud import text
```

- `argparse`: لقراءة الـ options من الـ command line (`--person` إلخ).
- `json`: لتحويل الـ meta (اسم الـ gesture، الشخص، ...) لنص يتحفظ جوه الـ npz.
- `time`: لـ `time.perf_counter()` (قياس الوقت للعدّ التنازلي والتسجيل).
- `datetime`: لعمل اسم فريد لكل session من التاريخ والساعة.
- `cv2` و `numpy`: العرض والفيديو والـ arrays.
- `config`: أسماء الـ gestures والمسارات والأوقات.
- `Camera` و `HandTracker` و `draw_hands`: نفس الكود اللي في البرنامج الحي (شرحناه في [02](02_camera_and_hands.md))، فالداتا بتتسجل بنفس الظروف بالظبط.
- `hands_to_arrays`: بيحوّل الـ `Hand` objects للصيغة الخام (شرحناه في [03](03_features.md)).
- `text`: دالة من `hud.py` بتكتب نص على الصورة بـ outline أسود عشان يبان على أي خلفية.

### عدّ الـ sessions المتسجلة: `count_sessions`

```python
def count_sessions():
    counts = {}
    for label in config.GESTURES:
        folder = config.LANDMARKS_DIR / label
        counts[label] = len(list(folder.glob("*.npz"))) if folder.exists() else 0
    return counts
```

- بترجّع dictionary زي `{"idle": 5, "clone_seal": 4, ...}` بنعرضه على الشاشة عشان نعرف ناقصنا إيه.
- `config.LANDMARKS_DIR / label`: الـ `/` مع `Path` بتركّب المسار: `data/landmarks/rasengan`.
- `folder.glob("*.npz")`: كل ملفات الـ `.npz` في الفولدر. `list(...)` عشان نقدر نعدّهم بـ `len`.
- `if folder.exists() else 0`: لو الفولدر لسه مااتعملش (مافيش ولا session) نرجّع 0 بدل error.

### حفظ الـ session: ملف الـ landmarks

```python
def save_session(label, args, frames, video_frames, aspect):
    session_id = f"{args.person}_{args.lighting}_{datetime.now():%Y%m%d_%H%M%S}"
    out_dir = config.LANDMARKS_DIR / label
    out_dir.mkdir(parents=True, exist_ok=True)
```

- المدخلات: اسم الـ gesture، الـ args (فيها الشخص والإضاءة)، الـ frames المتسجلة، صور الفيديو، ونسبة العرض للطول.
- `session_id`: اسم فريد زي `sara_day_20261030_154512`. الـ `:%Y%m%d_%H%M%S` جوه الـ f-string بيعمل format للتاريخ (سنة شهر يوم _ ساعة دقيقة ثانية). اسم الشخص والإضاءة في الاسم بيسهّل نعرف الملف ده إيه بمجرد ما نشوفه.
- `out_dir.mkdir(parents=True, exist_ok=True)`: بيعمل الفولدر (وأي فولدر أب ناقص)، ومايطلعش error لو موجود.

```python
    np.savez_compressed(
        out_dir / f"{session_id}.npz",
        image_lm=np.stack([f[0] for f in frames]),
        world_lm=np.stack([f[1] for f in frames]),
        present=np.stack([f[2] for f in frames]),
        timestamps=np.array([f[3] for f in frames]),
        meta=json.dumps({"label": label, "session": session_id, "person": args.person,
                         "lighting": args.lighting, "aspect": aspect}),
    )
```

- `np.savez_compressed`: بيحفظ كذا array في ملف واحد مضغوط. كل keyword argument بيبقى array باسمه جوه الملف.
- كل عنصر في `frames` عبارة عن tuple: `(image_lm, world_lm, present, timestamp)`.
- `np.stack([f[0] for f in frames])`: بنجمّع الـ `image_lm` بتاع كل الـ frames في array واحد شكله `(N, 2, 21, 3)` (N = عدد الـ frames).
- `world_lm`: نفس الشكل `(N, 2, 21, 3)`. `present`: شكله `(N, 2)`.
- `timestamps`: `(N,)` — وقت كل frame بالثواني من أول التسجيل.
- `meta`: معلومات الـ session كـ JSON string (الـ npz بيحفظ arrays بس، فبنحوّل الـ dictionary لنص). أهم حاجة فيه `aspect` لأن `features.extract` محتاجاه، و `session` و `person` لأن `train.py` بيقسم الداتا بيهم.

### حفظ الفيديو المرجعي

```python
    if video_frames:
        video_dir = config.VIDEOS_DIR / label
        video_dir.mkdir(parents=True, exist_ok=True)
        h, w = video_frames[0].shape[:2]
        writer = cv2.VideoWriter(str(video_dir / f"{session_id}.mp4"),
                                 cv2.VideoWriter_fourcc(*"mp4v"), 15, (w, h))
        for f in video_frames:
            writer.write(f)
        writer.release()
```

- `if video_frames`: لو شغّلنا بـ `--no-video` الـ list هتبقى فاضية ومش هنحفظ فيديو.
- الفيديو بيتحفظ في `data/videos/<gesture>/` بنفس اسم الـ session، فسهل نربط الفيديو بملف الداتا بتاعه.
- `h, w = video_frames[0].shape[:2]`: أبعاد الفيديو من أول صورة (كلهم نفس الحجم).
- `cv2.VideoWriter(مسار, codec, fps, (عرض, طول))`: بيفتح ملف فيديو للكتابة. `str(...)` لأن OpenCV عايز نص مش `Path`. الحجم هنا `(w, h)` (العرض الأول)، عكس ترتيب الـ shape، وده مصدر غلط شائع.
- `cv2.VideoWriter_fourcc(*"mp4v")`: الـ codec. الـ `*` بتفرد `"mp4v"` لـ 4 حروف منفصلة `'m','p','4','v'` لأن الدالة عايزاهم كده. `mp4v` شغال مع OpenCV من غير مكتبات زيادة.
- `15`: الـ FPS بتاع الملف.
- `writer.write(f)` لكل صورة، و `writer.release()` بيقفل الملف (من غيرها الملف ممكن يبقى بايظ).

### رسالة التأكيد

```python
    with_hands = sum(1 for f in frames if f[2].any())
    print(f"saved {label}/{session_id}: {len(frames)} frames, {with_hands} with hands")
```

- `f[2]` هو `present` بتاع الـ frame. `.any()` = هل فيه إيد واحدة على الأقل؟ فبنعدّ الـ frames اللي فيها إيد.
- بنطبع مثلًا `saved rasengan/sara_day_...: 590 frames, 575 with hands`. لو الرقم التاني صغير أوي، يبقى الإيد ماكانتش ظاهرة كويس والـ session دي مش مفيدة.

### الـ command line options

```python
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--person", default="me", help="who is recording (used to split train/test)")
    parser.add_argument("--lighting", default="normal", help="e.g. day, night, lamp")
    parser.add_argument("--seconds", type=float, default=config.RECORD_SECONDS)
    parser.add_argument("--no-video", action="store_true", help="do not save the reference video")
    args = parser.parse_args()
```

- `--person`: اسم اللي بيسجّل. الـ help بيقول إنه بيُستخدم لتقسيم train/test (مثلًا نختبر على شخص الموديل ماشافهوش).
- `--lighting`: وصف الإضاءة (day، night، lamp ...)؛ بيدخل في اسم الملف والـ meta.
- `--seconds`: مدة الـ session، `type=float` عشان نقدر نكتب `12.5`. الافتراضي `RECORD_SECONDS = 20`.
- `--no-video`: `action="store_true"` معناها إنه flag من غير قيمة: لو كتبناه يبقى `True`. في الكود بيتقري `args.no_video` (الـ `-` بتتحول `_`).
- `parser.parse_args()`: بيقرا اللي اتكتب في الـ terminal ويرجّعه في object.

### تجهيز الحالة

```python
    camera = Camera()
    tracker = HandTracker()
    label_idx = 0
    phase, phase_start = "idle", 0.0        # idle -> countdown -> recording
    frames, video_frames = [], []
    counts = count_sessions()
    last_id, last_video = -1, 0.0
```

- `Camera()` و `HandTracker()`: نفس إعدادات البرنامج الحي.
- `label_idx = 0`: الـ gesture المختار = `GESTURES[0]` = `"idle"`.
- `phase`: الحالة الحالية في الـ state machine (التعليق بيوضح الترتيب: idle → countdown → recording). `phase_start`: إمتى بدأت الحالة دي.
- `frames, video_frames`: هنجمّع فيهم أثناء التسجيل.
- `counts`: عدد الـ sessions الحالي للعرض.
- `last_id = -1`: آخر `frame_id` عالجناه (−1 عشان أول frame يتعالج أكيد). `last_video`: آخر وقت حفظنا فيه صورة فيديو.

### أول الـ loop: الكيبورد

```python
    try:
        while True:
            # keyboard first, on every pass: keys pressed while waiting for a frame are not lost
            key = cv2.waitKey(1) & 0xFF
            if key in (ord("q"), 27):
                break
```

- `try:` ... `finally:` (تحت): أيًا كان اللي حصل (خروج عادي، error، Ctrl+C) الكاميرا والموديل هيتقفلوا.
- التعليق مهم: بنقرا الكيبورد **في أول** كل لفة، عشان الضغطات اللي بتحصل وإحنا مستنيين frame ماتضيعش (تفاصيل في "مفاهيم مهمة").
- `cv2.waitKey(1)`: بتستنى 1ms لضغطة، وبترجّع كود الزرار أو `-1`. كمان هي اللي بتخلّي شباك OpenCV يحدّث نفسه.
- `& 0xFF`: بناخد آخر 8 bits بس، لأن على بعض الأنظمة القيمة بيبقى فيها bits زيادة. (`-1 & 0xFF = 255` ومش بيطابق أي زرار.)
- `key in (ord("q"), 27)`: `q` أو `ESC` (كوده 27) → نخرج من الـ loop.

```python
            if phase == "idle" and ord("0") <= key < ord("0") + len(config.GESTURES):
                label_idx = key - ord("0")
            elif phase == "idle" and key == ord(" "):
                phase, phase_start = "countdown", time.perf_counter()
```

- `ord("0")` = 48. الشرط معناه "الزرار رقم من 0 لـ 4" (لأن عندنا 5 gestures). الكتابة دي بتتظبط أوتوماتيك لو زوّدنا gestures.
- `label_idx = key - ord("0")`: بيحوّل كود الزرار لرقم: `ord("2") - ord("0") = 2`.
- `phase == "idle"`: تغيير الـ gesture أو بدء تسجيل مسموح بس واحنا مش بنسجّل؛ عشان ضغطة بالغلط ماتبوّظش session شغالة.
- `SPACE` → ننتقل لـ `"countdown"` ونسجّل وقت البداية بـ `time.perf_counter()` (أدق ساعة لقياس فترات قصيرة).

### قراءة الـ frame ومعالجته

```python
            frame_id, frame = camera.read()
            if frame is None or frame_id == last_id:
                continue
            last_id = frame_id
            now = time.perf_counter()
            h, w = frame.shape[:2]
            hands = tracker.detect(frame)
            label = config.GESTURES[label_idx]
```

- `camera.read()`: بترجع فورًا آخر frame (مابتستناش).
- `if frame is None or frame_id == last_id: continue`: لو لسه مافيش صورة خالص، أو دي نفس الصورة اللي عالجناها، نرجع لأول الـ loop (ونقرا الكيبورد تاني).
- `last_id = frame_id`: نعلّم إن الـ frame ده اتعالج.
- `now`: وقت الـ frame ده؛ هنستخدمه في كل المقارنات تحت عشان كله يبقى متسق.
- `h, w`: أبعاد الصورة للرسم ولحساب `aspect`.
- `hands = tracker.detect(frame)`: MediaPipe → list من `Hand`.
- `label`: اسم الـ gesture المختار (مثلًا `"rasengan"`).

### الانتقال من العدّ للتسجيل

```python
            if phase == "countdown" and now - phase_start >= config.COUNTDOWN_SECONDS:
                phase, phase_start, frames, video_frames = "recording", now, [], []
```

- لو بقالنا 3 ثواني (`COUNTDOWN_SECONDS`) في العدّ → نبدأ التسجيل: نغيّر الحالة، نصفّر الوقت، ونفضّي الـ lists (أهم حاجة عشان مانخلطش داتا session قديمة).
- الـ countdown موجود عشان يدّينا وقت نرفع الإيد ونعمل الـ gesture قبل ما التسجيل يبدأ.

### أثناء التسجيل

```python
            if phase == "recording":
                frames.append((*hands_to_arrays(hands), now - phase_start))
                if not args.no_video and now - last_video >= 1 / 15:      # 15 fps, 480p is plenty
                    video_frames.append(cv2.resize(frame, (int(480 * w / h), 480)))
                    last_video = now
```

- `hands_to_arrays(hands)` بيرجّع 3 arrays. الـ `*` بتفردهم جوه الـ tuple، فبيبقى `(image_lm, world_lm, present, الوقت)`. بنحفظ **كل** frame، حتى اللي مافيهوش إيد (هيبان في `present`).
- `now - phase_start`: الوقت من أول التسجيل.
- الفيديو: لو مش `--no-video`، وعدّى 1/15 ثانية من آخر صورة → نحفظ صورة. كده الفيديو تقريبًا 15 FPS بدل 30.
- `cv2.resize(frame, (int(480 * w / h), 480))`: بنصغّر لطول 480 مع الحفاظ على النسبة. لـ 1280×720: العرض = `int(480 × 1.78) = 853`.
- بنحفظ `frame` الأصلي (من غير الرسم) عشان الفيديو يبقى نضيف.

```python
                if now - phase_start >= args.seconds:
                    save_session(label, args, frames, video_frames, w / h)
                    counts = count_sessions()
                    phase = "idle"
```

- لما المدة تخلص: نحفظ (و `aspect = w / h`)، نحدّث العدد على الشاشة، ونرجع لـ `"idle"` مستنيين SPACE تاني.

### الرسم على الشاشة

```python
            view = draw_hands(frame.copy(), hands)
            for i, name in enumerate(config.GESTURES):
                color = (0, 255, 255) if i == label_idx else (200, 200, 200)
                text(view, f"[{i}] {name}: {counts[name]} sessions", (10, 30 + 24 * i), 0.6, color, 2)
            text(view, config.GESTURE_HINTS[label], (10, h - 50), 0.6, (0, 255, 255), 2)
```

- `frame.copy()`: بنرسم على نسخة؛ الـ `frame` الأصلي هو نفس الـ object اللي محفوظ جوه `Camera`، فالرسم عليه مباشرةً هيعدّل الصورة "الأصلية" نفسها. الأسلم إن الصورة الخام تفضل نضيفة، والرسم يبقى على نسخة للعرض بس.
- `draw_hands`: الهيكل العظمي، عشان نتأكد إن MediaPipe شايف الإيد كويس.
- القايمة: كل gesture في سطر `[2] rasengan: 4 sessions`. المختار بالأصفر `(0, 255, 255)` (BGR) والباقي رمادي. `30 + 24 * i`: كل سطر تحت اللي قبله بـ 24 بكسل.
- `GESTURE_HINTS[label]`: وصف الـ gesture المختار تحت الشاشة (مثلًا "one hand: open palm toward camera, fingers spread") عشان كل الناس تسجّل نفس الحركة.

```python
            if phase == "countdown":
                left = config.COUNTDOWN_SECONDS - (now - phase_start)
                text(view, f"{left:.0f}", (w // 2 - 30, h // 2), 3, (0, 200, 255), 6)
```

- في العدّ: الوقت الباقي برقم كبير في نص الشاشة (حجم 3، سُمك 6). `:.0f` = من غير كسور. `w // 2` قسمة صحيحة لأن الإحداثيات لازم int.

```python
            elif phase == "recording":
                left = args.seconds - (now - phase_start)
                cv2.circle(view, (w - 40, 40), 15, (0, 0, 255), -1)
                text(view, f"REC {label}  {left:4.1f}s  - move, rotate, change distance",
                     (w // 2 - 300, 40), 0.7, (0, 0, 255), 2)
```

- أثناء التسجيل: دايرة حمرا مليانة فوق على اليمين (زي أي كاميرا بتسجّل).
- النص بيعرض الـ gesture والوقت الباقي (`:4.1f` = رقم عشري واحد بعرض 4) + تذكير مهم بمعنى "حركة، لف للإيد، تغيير المسافة" — عشان الداتا تبقى متنوعة.

```python
            else:
                text(view, "SPACE = record   0-4 = choose gesture   Q = quit", (10, h - 20), 0.6)
            cv2.imshow("SHINOBI AI - data collection", view)
```

- في الـ idle: سطر المساعدة بالمفاتيح.
- `cv2.imshow`: بيعرض الصورة في شباك بالاسم ده (لو الشباك موجود بيحدّثه).

### التنضيف والتشغيل

```python
    finally:
        camera.release()
        tracker.close()
        cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
```

- `finally`: بيتنفذ دايمًا: يوقف thread الكاميرا ويسيبها، يقفل موديل MediaPipe، ويقفل الشبابيك.
- `if __name__ == "__main__"`: `main()` تشتغل بس لو شغّلنا الملف مباشرةً (`python collect_data.py`)، مش لو حد عمله `import`.

## 3. مفاهيم مهمة

### أ) الـ state machine

البرنامج دايمًا في حالة واحدة من 3:

```
                 SPACE                     بعد 3 ثواني
   ┌────────┐ ─────────────► ┌───────────┐ ──────────────► ┌───────────┐
   │  idle  │                │ countdown │                 │ recording │
   └────────┘ ◄───────────────────────────────────────────── └───────────┘
     ▲  │              بعد 20 ثانية: save_session()
     │  │ 0-4
     └──┘ (تغيير الـ gesture مسموح هنا بس)
```

| الحالة | بيحصل إيه | المفاتيح المسموحة |
|---|---|---|
| `idle` | عرض الكاميرا والقايمة | 0–4، SPACE، Q/ESC |
| `countdown` | رقم كبير بيعدّ 3، 2، 1 | Q/ESC بس |
| `recording` | حفظ كل frame + صور الفيديو | Q/ESC بس (والـ session الحالية مش هتتحفظ) |

ميزة الـ state machine إن كل حالة ليها قواعد واضحة، ومستحيل مثلًا نغيّر الـ gesture في نص تسجيل.

### ب) ليه بنحفظ landmarks خام مش features؟

```
خام (اللي بنحفظه):   2 إيد × 21 نقطة × 3  (image + world) + present
features:            206 رقم محسوبين بطريقة معينة
```

لو حفظنا الـ features، وبعدين اكتشفنا إن feature جديدة (مثلًا زاوية إضافية) هتحسّن الدقة، كنا هنضطر نسجّل الداتا كلها من الأول. بالخام، بنعدّل `features.py`، نزوّد `FEATURE_VERSION`، ونشغّل `train.py` بس. كمان `train.py` بيعمل الـ mirror والـ jitter على الخام قبل حساب الـ features.

### ج) صيغة الملفات

```
data/
├── landmarks/
│   ├── idle/
│   │   └── sara_day_20261030_154512.npz
│   └── rasengan/
│       └── sara_day_20261030_160203.npz
└── videos/
    └── rasengan/
        └── sara_day_20261030_160203.mp4
```

جوه ملف `.npz` واحد (session فيها N frame):

| الاسم | الشكل | المعنى |
|---|---|---|
| `image_lm` | `(N, 2, 21, 3)` | normalized landmarks |
| `world_lm` | `(N, 2, 21, 3)` | world landmarks بالمتر |
| `present` | `(N, 2)` | 1 لو الـ slot فيه إيد |
| `timestamps` | `(N,)` | الثواني من أول التسجيل |
| `meta` | نص JSON | `label`، `session`، `person`، `lighting`، `aspect` |

الـ npz عبارة عن zip فيه ملف `.npy` لكل array. `savez_compressed` بيضغطه (الأصفار بتاعة الإيد الغايبة بتضغط كويس جدًا). القراءة في `train.py`:

```python
d = np.load(path)
meta = json.loads(str(d["meta"]))
```

### د) ليه الفيديو 480p و 15 FPS؟

الفيديو للمراجعة البشرية بس (نشوف هل الـ session فيها غلط، مثلًا حد دخل في الكادر أو الحركة غلط)، الموديل مابيستخدموش. والصور بتفضل في الـ RAM لحد آخر التسجيل:

| الإعداد | حجم الصورة | 20 ثانية |
|---|---|---|
| 720p × 30 FPS | 1280×720×3 ≈ 2.8 MB | 600 صورة ≈ **1.6 GB** في الـ RAM |
| 480p × 15 FPS | 853×480×3 ≈ 1.2 MB | 300 صورة ≈ **0.37 GB** |

يعني أقل من الربع في الذاكرة وفي حجم الملف، وكفاية تمامًا عشان نشوف الإيد والحركة. ولو مش محتاجينه خالص: `--no-video`.

### هـ) ليه الكيبورد في أول الـ loop؟ (bug حقيقي)

`cv2.waitKey` هي الطريقة **الوحيدة** اللي OpenCV بيقرا بيها الكيبورد. في نسخة قديمة كانت في آخر الـ loop بعد `imshow`:

```
النسخة القديمة:                          النسخة الحالية:
while True:                              while True:
    read frame                               key = waitKey(1)   ← كل لفة
    if no new frame: continue  ──┐           handle key
    ... detect, draw ...         │           read frame
    imshow                       │           if no new frame: continue
    key = waitKey(1)  ◄──────────┘ (بيتخطاها)  ... detect, draw ...
                                             imshow
```

الـ `continue` (لما مافيش frame جديد) كان بيرجع لأول الـ loop **من غير ما يعدّي على `waitKey`**. وبما إن الـ loop بيلف بسرعة أكبر بكتير من الكاميرا، أغلب اللفات كانت بتعدّي على الـ `continue`، فضغطات زي SPACE كانت بتضيع أو تتأخر. ده bug حقيقي اتلاقى أثناء تجربة البرنامج. الحل: نقرا الكيبورد في أول كل لفة، قبل أي `continue`.

### و) إيه اللي بيعمل dataset كويس؟

`train.py` بيقسم الداتا **بالـ session** مش بالـ frame: الـ frames اللي جوه نفس الـ session شبه بعض جدًا، فلو frame منها في التدريب وجاره في الاختبار هتطلع دقة وهمية عالية. النتيجة المهمة: **عدد الـ sessions وتنوعها أهم من عدد الـ frames**.

التنوع المطلوب:

| البُعد | ليه | إزاي |
|---|---|---|
| sessions كتير | كل session = "عيّنة مستقلة" فعلًا | أكتر من session لكل gesture |
| الإضاءة | الإضاءة بتغيّر دقة MediaPipe والنقط | `--lighting day/night/lamp` |
| المسافة والزاوية | الإيد قريبة/بعيدة/لافّة | التحرك أثناء التسجيل (الرسالة على الشاشة بتفكّر بده) |
| الأشخاص | إيدين مختلفة الحجم والشكل | `--person`، وبعدين `train.py --test-person <name>` يختبر على شخص جديد |
| الإيدين | يمين وشمال | الـ mirror augmentation بيساعد، بس التسجيل بالاتنين أحسن |

### ز) الـ idle والـ hard negatives

`idle` هو "أي حاجة تانية"، وهو أهم class لمنع التفعيل بالغلط. لازم يحتوي على **hard negatives**: حركات شبه الـ gestures الحقيقية بس مش هي:

- حركات عشوائية، تلويح، الإيد بتتحرك وهي مفتوحة (شبه rasengan).
- لمس الوش، حك الراس، سند الدقن (شبه fire اللي قدام البق).
- صوابع نص مثنية أو مسك حاجة (شبه chidori).
- إيدين قريبين من بعض أو مشبوكين (شبه clone_seal).
- الإيدين نازلين أو بيدخلوا ويخرجوا من الكادر.

ملحوظة مهمة: `train.py` بيرمي الـ frames اللي مافيهاش إيد خالص (`present.any(axis=1)`)، و `main.py` مابيشغّلش الـ classifier لو مافيش إيد. يعني "مافيش إيدين" مش محتاج تعليم، والمهم إن sessions الـ `idle` يبقى فيها إيدين **ظاهرين** بيعملوا حاجات عادية.

### ح) بروتوكول تسجيل مقترح

```
لكل gesture (clone_seal، rasengan، chidori، fire):
    ≥ 4 sessions × 20 ثانية
    موزعين على 2-3 ظروف إضاءة (مثلًا: نهار، ليل بلمبة السقف، أباجورة)
    أثناء التسجيل: تحريك الإيد، لفّها شوية، تقريب وتبعيد، وتبديل الإيد لو الـ gesture بإيد واحدة

لـ idle:
    sessions أكتر من أي gesture (مثلًا 1.5-2 ضعف)
    حركات عشوائية + لمس الوش + الإيدين تحت + حركات شبه الـ gestures

لو فيه أكتر من شخص:
    كل واحد يسجّل بـ --person باسمه، وشخص واحد على الأقل نسيبه للاختبار
```

مثال أوامر:

```powershell
.venv\Scripts\python.exe collect_data.py --person sara --lighting day
.venv\Scripts\python.exe collect_data.py --person sara --lighting lamp
.venv\Scripts\python.exe collect_data.py --person ali --lighting night --no-video
```

## 4. لو غيّرنا ... هيحصل إيه؟

1. **لو رجّعنا `cv2.waitKey` لآخر الـ loop:** الـ bug هيرجع: ضغطات SPACE والأرقام هتضيع أو تتأخر، لأن معظم اللفات بتعدّي على `continue` قبل ما توصل لها.
2. **لو شلنا شرط `phase == "idle"` من اختيار الـ gesture:** ضغطة رقم بالغلط أثناء التسجيل هتغيّر `label`، والـ session كلها هتتحفظ تحت الاسم الغلط (لأن `label` بيتحسب كل frame وبيتاخد لحظة الحفظ). داتا متلخبطة = موديل متلخبط.
3. **لو خلينا `COUNTDOWN_SECONDS = 0`:** التسجيل هيبدأ فورًا بعد SPACE، فأول ثانية أو اتنين هيبقى فيهم الإيد لسه رايحة للـ gesture، والـ frames دي هتتعلّم غلط على إنها الـ gesture.
4. **لو حفظنا الـ features بدل الـ landmarks:** أي تعديل في `features.py` بعد كده هيخلّي كل الداتا القديمة مش صالحة، ومش هنقدر نعمل mirror augmentation في التدريب.
5. **لو حفظنا الفيديو 720p × 30 FPS:** الذاكرة أثناء session واحدة هتوصل ~1.6 GB، واللابتوب ممكن يبطّأ أو البرنامج يقع، والملفات هتكبر جدًا من غير أي فايدة للموديل.
6. **لو `--seconds 5`:** sessions كتير قصيرة. ده مش وحش لتنوع الـ sessions، بس الـ countdown والتحضير هياخدوا وقت أكبر نسبيًا، والتنوع جوه الـ session (حركة، مسافة) هيقل.

## 5. أسئلة مراجعة

1. إيه الـ 3 حالات في البرنامج؟ وإيه اللي بينقل من حالة للتانية؟
2. ليه بنحفظ الـ landmarks الخام مش الـ features؟
3. إيه اللي جوه ملف الـ `.npz`؟ وليه `aspect` محفوظ في الـ meta؟
4. ليه الفيديو 480p و 15 FPS؟ وهل الموديل بيستخدمه؟
5. ليه `cv2.waitKey` في أول الـ loop مش في آخره؟
6. ليه عدد الـ sessions أهم من عدد الـ frames؟
7. يعني إيه hard negatives؟ وإيه أمثلة ليها في الـ idle؟
8. ليه بنرسم على `frame.copy()` مش على `frame` نفسه؟

<details>
<summary>الإجابات</summary>

1. `idle` → (SPACE) → `countdown` → (بعد 3 ثواني) → `recording` → (بعد 20 ثانية + حفظ) → `idle`.
2. عشان لو `features.py` اتغير نعيد حساب الـ features من نفس الداتا من غير ما نسجّل تاني، وعشان التدريب يقدر يعمل mirror/jitter على الخام.
3. `image_lm` و `world_lm` `(N,2,21,3)`، `present` `(N,2)`، `timestamps` `(N,)`، و `meta` نص JSON. الـ `aspect` محتاجينه في `features.extract` لتصحيح المسافات بين الإيدين.
4. للمراجعة البشرية بس، والموديل مابيستخدموش. 480p/15 FPS كفاية للمراجعة وبتقلل الذاكرة والحجم لأقل من الربع (~0.37 GB بدل ~1.6 GB في الـ RAM لـ 20 ثانية).
5. `waitKey` هي الوحيدة اللي بتقرا الكيبورد؛ لو في الآخر، الـ `continue` (لما مافيش frame جديد) كان بيتخطاها والضغطات بتضيع — bug اتلاقى فعلًا في التجربة.
6. لأن `train.py` بيقسم بالـ session، والـ frames جوه الـ session شبه بعض جدًا؛ التنوع الحقيقي (إضاءة، مسافة، شخص) بييجي من sessions مختلفة.
7. حركات شبه الـ gestures بس مش هي، عشان الموديل يتعلم الفرق. أمثلة: لمس الوش (شبه fire)، تلويح بإيد مفتوحة (شبه rasengan)، صوابع نص مثنية (شبه chidori).
8. لأن `frame` هو نفس الـ object اللي محفوظ جوه `Camera`؛ الرسم على نسخة بيخلّي الصورة الخام نضيفة (للفيديو أو لأي كود تاني بيقراها)، والخطوط والنصوص تبقى في صورة العرض بس.

</details>
