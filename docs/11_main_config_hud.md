# 11 — البرنامج الرئيسي والإعدادات (`main.py` · `config.py` · `hud.py` · `__init__.py`)

[⬅ الفهرس](00_index.md)

---

## مقدمة

الملفات اللي فاتت كانت **قطع**: كاميرا، تتبع إيد، features، classifier، controller، effects. الملفات دي هي اللي بتركّب القطع على بعض:

| الملف | دوره |
|---|---|
| `__init__.py` | أول حاجة بتتنفذ لما أي جزء من الـ package يتعمله import. بيظبط إعداد للكاميرا على Windows |
| `config.py` | كل الأرقام والإعدادات في مكان واحد |
| `main.py` | الـ main loop: بيلف على كل frame ويعدّيه على كل المراحل |
| `hud.py` | الكلام والأرقام اللي بتظهر على الشاشة (FPS، الاحتمالات، ...) |

هنمشي بترتيب التنفيذ: `__init__.py` الأول (لأنه بيتنفذ قبل أي حاجة)، بعدين `config.py`، بعدين `main.py`، وفي الآخر `hud.py`.

---

# الجزء الأول: `shinobi/__init__.py`

## الملف ده بيعمل إيه؟

أي فولدر فيه `__init__.py` بيبقى **package** في Python. والملف ده بيتنفذ **تلقائياً أول مرة** أي حاجة جوه الـ package تتعمل import (زي `from shinobi import config` أو `python -m shinobi.main`). إحنا مستغلين ده عشان نظبط متغير بيئة (environment variable) لازم يتظبط قبل ما الكاميرا تتفتح.

## الكود سطر بسطر

```python
"""SHINOBI AI — real-time hand-sign recognition with anime-style visual effects."""

import os
```

- docstring بيوصف المشروع كله: التعرف على إشارات الإيد في الوقت الحقيقي مع effects بستايل الأنمي.
- `os`: مكتبة Python للتعامل مع نظام التشغيل، ومنها متغيرات البيئة `os.environ`.

```python
# Must be set before OpenCV opens a camera: without it the Windows Media Foundation
# backend takes ~15 s to open the webcam. (Measured on this laptop: 14.4 s -> 0.6 s.)
os.environ.setdefault("OPENCV_VIDEOIO_MSMF_ENABLE_HW_TRANSFORMS", "0")
```

- الكومنت: لازم يتظبط قبل ما OpenCV يفتح الكاميرا. من غيره، الـ backend بتاع Windows (Media Foundation) بياخد حوالي 15 ثانية عشان يفتح الكاميرا. اتقاس على اللابتوب ده: **14.4 ثانية → 0.6 ثانية**.
- `os.environ` زي dictionary فيه متغيرات البيئة بتاعة البرنامج.
- `setdefault(key, value)`: بتحط القيمة **بس لو المتغير مش موجود أصلاً**. لو حد عايز يجرّب القيمة التانية، يقدر يظبطها في الـ terminal قبل التشغيل والكود مش هيمسحها.
- `"0"` = اقفل الـ hardware transforms.

## مفاهيم مهمة (`__init__.py`)

### إيه هو `OPENCV_VIDEOIO_MSMF_ENABLE_HW_TRANSFORMS`؟

- على Windows، OpenCV بيقرا الكاميرا عن طريق **Media Foundation (MSMF)** (في `camera.py` بنختاره بـ `cv2.CAP_MSMF` لأنه بيدّي 30 FPS على 720p، بينما DirectShow بيدّي حوالي 10 بس).
- MSMF بيحاول افتراضياً يستخدم الـ GPU في تحويل صيغة الصورة (hardware transforms). على أجهزة كتير، تجهيز ده وقت الفتح بياخد وقت طويل جداً.
- لما نقفله (`"0"`)، التحويل بيتعمل على الـ CPU، وده بالنسبة لصورة 720p سريع، فالفتح بقى 0.6 ثانية بدل 14.4.

### ليه لازم قبل فتح الكاميرا؟ وليه في `__init__.py` بالذات؟

- OpenCV بيقرا المتغير ده وقت ما بيجهّز الـ MSMF عشان يفتح الكاميرا. لو ظبطناه بعد ما الكاميرا اتفتحت، مالوش أي تأثير.
- لو حطيناه في `main.py` بس، `collect_data.py` (اللي بيفتح الكاميرا هو كمان) مش هياخده، وكمان لازم نفتكر نحطه قبل أي حاجة.
- لكن `__init__.py` بيتنفذ **أوتوماتيك** قبل أي module جوه `shinobi`. يعني أول ما `main.py` أو `collect_data.py` يعمل `from shinobi import ...`، المتغير بيتظبط، وده أكيد قبل ما `Camera()` تتنادى. مكان واحد، وبيغطي كل البرامج.

---

# الجزء التاني: `shinobi/config.py`

## الملف ده بيعمل إيه؟

كل رقم ممكن نحتاج نغيّره (مسارات، thresholds، أوقات، تعريف الـ jutsu) موجود هنا. باقي الملفات بتعمل `from shinobi import config` وبتقرا منه. الفايدة: أي تجربة أو ضبط = تعديل رقم في ملف واحد، من غير ما ندوّر في الكود.

## الكود سطر بسطر

```python
"""Central configuration: every path, threshold and tunable lives here."""

from pathlib import Path
```

- docstring: الإعدادات المركزية، كل مسار وكل threshold وكل رقم بيتظبط موجود هنا.
- `Path` من `pathlib`: طريقة حديثة للتعامل مع مسارات الملفات. بتسمح نكتب `MODELS_DIR / "x.task"` بدل ما نلزق strings، وبتشتغل صح على Windows و Linux.

```python
# ---------------------------------------------------------------- paths
ROOT = Path(__file__).resolve().parent.parent
MODELS_DIR = ROOT / "models"
DATA_DIR = ROOT / "data"
LANDMARKS_DIR = DATA_DIR / "landmarks"
VIDEOS_DIR = DATA_DIR / "videos"
```

- `__file__`: مسار الملف ده نفسه (`.../SHINOBI-AI/shinobi/config.py`).
- `.resolve()`: بيحوّله لمسار كامل (absolute).
- `.parent` مرة = فولدر `shinobi`، ومرتين = فولدر المشروع `SHINOBI-AI`. كده `ROOT` صح **مهما كان المكان اللي شغّلنا منه البرنامج**.
- `MODELS_DIR`: فولدر الموديلات.
- `DATA_DIR`: فولدر الداتا، وجواه `landmarks` (ملفات `.npz` اللي بنتدرب عليها) و `videos` (فيديوهات التسجيل للمراجعة).

```python
HAND_MODEL_PATH = MODELS_DIR / "hand_landmarker.task"
SEGMENTER_MODEL_PATH = MODELS_DIR / "selfie_segmenter.tflite"
GESTURE_MODEL_PATH = MODELS_DIR / "gesture_model.joblib"
```

- `HAND_MODEL_PATH`: موديل MediaPipe لتتبع الإيد (21 نقطة لكل إيد).
- `SEGMENTER_MODEL_PATH`: موديل MediaPipe لفصل الشخص عن الخلفية (للـ shadow clone).
- `GESTURE_MODEL_PATH`: الموديل **بتاعنا** اللي `train.py` بيدرّبه ويحفظه. لو الملف ده مش موجود، `main.py` بيشتغل في وضع الكيبورد بس.

```python
# ---------------------------------------------------------------- camera
CAMERA_INDEX = None   # None = use the first camera that shows a real (non-black) picture
CAMERA_WIDTH = 1280
CAMERA_HEIGHT = 720
MIRROR = True  # selfie view: what you see behaves like a mirror
```

- `CAMERA_INDEX = None`: مانحددش رقم الكاميرا، `camera.py` بيجرّب الكاميرات بالترتيب ويختار أول واحدة صورتها مش سودا (لأن الكاميرات الوهمية زي Camo بتفتح عادي بس بتبعت أسود).
- `1280 × 720`: الدقة المطلوبة (720p).
- `MIRROR = True`: نقلب الصورة يمين/شمال، عشان الصورة تتصرف زي المراية. من غيرها، لما نحرك الإيد اليمين، الصورة هتتحرك شمال، وده بيلخبط.

```python
# ---------------------------------------------------------------- hand tracking
MAX_HANDS = 2
MIN_DETECTION_CONFIDENCE = 0.5
MIN_PRESENCE_CONFIDENCE = 0.5
MIN_TRACKING_CONFIDENCE = 0.5
```

- `MAX_HANDS = 2`: أقصى عدد إيدين MediaPipe يدوّر عليهم (بعض الإشارات زي `clone_seal` محتاجة إيدين).
- الـ 3 thresholds دول لـ MediaPipe: قد إيه لازم يكون متأكد إن فيه إيد (detection)، وإنها لسه موجودة (presence)، وإن التتبع من frame للتاني صح (tracking). **لو علّيناهم:** إيدين غلط أقل بس ممكن يضيّع الإيد الحقيقية في الإضاءة الوحشة. **لو وطّيناهم:** بيلاقي الإيد أسهل بس ممكن يشوف إيد في حاجات مش إيد.

```python
# ---------------------------------------------------------------- gestures
# Index 0 must be "idle". Order matters: it is saved with the trained model.
GESTURES = ["idle", "clone_seal", "rasengan", "chidori", "fire"]
```

- قايمة كل الـ gestures اللي الموديل بيتعرف عليها.
- `idle` لازم يبقى رقم 0، وده "مفيش إشارة". مهم جداً: من غيره، الموديل هيبقى مجبر يختار إشارة من الإشارات في كل frame حتى لو الإيد واقفة عادي.
- **الترتيب مهم:** `train.py` بيحوّل كل اسم لرقم بـ `GESTURES.index(label)`، والموديل بيتعلم الأرقام. لو غيّرنا الترتيب بعد التدريب، الأرقام هتتلخبط. (الـ labels بتتحفظ بالأسماء مع الموديل كمان، وده حماية إضافية.)

```python
GESTURE_HINTS = {
    "idle": "anything else: hands down, waving, touching face, no hands",
    "clone_seal": "both hands: index+middle up, crossed like a plus sign",
    "rasengan": "one hand: open palm toward camera, fingers spread",
    "chidori": "one hand: claw (all fingers half-bent and spread)",
    "fire": "one hand: OK-ring (thumb+index circle) in front of mouth",
}
```

- وصف كل إشارة. `collect_data.py` بيعرضه على الشاشة وقت التسجيل عشان نعرف نعمل إيه:
  - `idle`: أي حاجة تانية: إيد تحت، تلويح، لمس الوش، مافيش إيد.
  - `clone_seal`: الإيدين: السبابة والوسطى لفوق، متقاطعين زي علامة +.
  - `rasengan`: إيد واحدة: كف مفتوح للكاميرا، صوابع مفرودة.
  - `chidori`: إيد واحدة: مخلب (كل الصوابع نص مثنية ومفرودة).
  - `fire`: إيد واحدة: حلقة OK (الإبهام والسبابة دايرة) قدام البُق.

```python
# ---------------------------------------------------------------- recognition -> action
PROB_SMOOTHING = 0.4     # EMA weight of the newest prediction (0..1)
CONF_ON = 0.75           # smoothed probability needed to start confirming
CONF_OFF = 0.45          # probability below which a confirmed gesture is released
MIN_MARGIN = 0.25        # top1 - top2 must be at least this
HOLD_SECONDS = 0.30      # gesture must stay above CONF_ON this long
COOLDOWN_SECONDS = 1.5   # after a jutsu fires, ignore new jutsu for this long
SEQUENCE_MAX_GAP = 1.5   # max seconds between two gestures of one sequence
```

دي أرقام الـ controller (اتشرحت بالتفصيل في [06 — الـ Controller](06_controller.md)). أهم حاجة نعرفها هي تأثير كل رقم:

| الثابت | معناه | لو كبّرناه | لو صغّرناه |
|---|---|---|---|
| `PROB_SMOOTHING` | وزن آخر توقع في المتوسط المتحرك (EMA) | استجابة أسرع بس رعشة أكتر | أنعم بس أبطأ |
| `CONF_ON` | الاحتمال اللازم عشان نبدأ نعتبرها إشارة | تفعيل بالغلط أقل، بس محتاج إشارة أوضح | بيتفعّل أسهل (وممكن بالغلط) |
| `CONF_OFF` | تحته الإشارة المؤكدة بتتلغي | بتتلغي أسرع | لازم ننزّل الإيد خالص عشان تتلغي |
| `MIN_MARGIN` | الفرق بين الأول والتاني | لازم الموديل يبقى متأكد جداً من الاختيار | بيقبل حالات الحيرة بين إشارتين |
| `HOLD_SECONDS` | لازم نمسك الإشارة المدة دي | أصعب في التفعيل بالغلط بس أبطأ | أسرع بس أي حركة عابرة ممكن تفعّل |
| `COOLDOWN_SECONDS` | بعد jutsu، تجاهل الجديد المدة دي | مايبقاش فيه تفعيل متكرر | ممكن jutsu ورا jutsu بسرعة |
| `SEQUENCE_MAX_GAP` | أقصى وقت بين إشارتين في تسلسل | تسلسلات أسهل للبطيء | لازم نعمل الإشارات بسرعة |

- ملاحظة: إن `CONF_ON` (0.75) أكبر من `CONF_OFF` (0.45) ده اسمه **hysteresis**: عتبة للتشغيل أعلى من عتبة الإيقاف، عشان لو الاحتمال بيتذبذب حوالين رقم واحد، الحالة ماتفضلش تتقلب on/off.

```python
# A jutsu is an ordered list of gestures. One gesture = static jutsu,
# several = dynamic hand-sign sequence (e.g. ["clone_seal", "fire"]).
# Rule: a single-gesture jutsu must not also be the first step of a longer one.
JUTSU = {
    "shadow_clone": {"sequence": ["clone_seal"], "effect": "shadow_clone"},
    "rasengan": {"sequence": ["rasengan"], "effect": "rasengan"},
    "chidori": {"sequence": ["chidori"], "effect": "chidori"},
    "fire_style": {"sequence": ["fire"], "effect": "fire"},
}
```

- **الـ jutsu** = تسلسل مرتب من الإشارات + اسم الـ effect اللي يشتغل.
  - **static jutsu:** إشارة واحدة (`["rasengan"]`). أول ما تتأكد، الـ effect يشتغل.
  - **dynamic jutsu:** كذا إشارة ورا بعض (مثلاً `["clone_seal", "fire"]`)، والـ `SequenceMatcher` بيتأكد إنهم جم بالترتيب ومن غير فجوة أكبر من `SEQUENCE_MAX_GAP`.
- دلوقتي الـ 4 jutsu كلهم static.
- اسم الـ jutsu (`fire_style`) ممكن يختلف عن اسم الإشارة (`fire`) وعن اسم الـ effect (`fire`). الـ dictionary هو اللي بيربطهم.
- **القاعدة في الكومنت:** jutsu من إشارة واحدة مايبقاش هو أول خطوة في jutsu أطول. ليه؟ لو عندنا `["fire"]` و `["fire", "chidori"]`: أول ما `fire` تتأكد، الـ matcher هيلاقي تطابق مع `["fire"]` على طول، ويشغّله، **ويمسح التاريخ** (`history.clear()`). فالتسلسل الأطول عمره ما هيكمل. القاعدة دي مش مجرد كومنت: `SequenceMatcher` في `controller.py` بيفحصها وقت ما يتعمل (دالة `_check_prefixes`)، ولو اتكسرت بيرمي `ValueError` والبرنامج مايفتحش، بدل ما التسلسل يفشل بصمت.
- **إضافة jutsu جديد = سطر واحد هنا.** بس بسبب القاعدة اللي فوق، أول إشارة في التسلسل الجديد مينفعش تكون jutsu لوحدها. ودلوقتي الـ 4 إشارات كلهم static jutsu، فعشان نعمل تسلسل لازم نحوّل واحد منهم. مثال: نغيّر `fire_style` لـ `"fire_style": {"sequence": ["fire", "chidori"], "effect": "fire"}`، وكده `fire` لوحدها مابقتش jutsu، ونار الـ effect محتاجة الإشارتين ورا بعض. (لو سبنا `fire_style` القديم وضفنا تسلسل تاني بيبدأ بـ `fire`، البرنامج هيرفض يفتح بـ `ValueError`.)

```python
# ---------------------------------------------------------------- effects
EFFECT_DURATION = {"shadow_clone": 10.0, "rasengan": 8.0, "chidori": 8.0, "fire": 6.0}
EFFECT_KEYS = {ord("1"): "shadow_clone", ord("2"): "rasengan", ord("3"): "chidori", ord("4"): "fire"}
HAND_LOST_GRACE = 0.6    # seconds a hand-anchored effect survives without a hand
```

- `EFFECT_DURATION`: مدة كل effect بالثواني (قبل الـ fade out). `effects/__init__.py` بيقرا منها.
- `EFFECT_KEYS`: زراير الكيبورد. `ord("1")` = كود الحرف `"1"` (49)، لأن `cv2.waitKey` بيرجّع كود رقمي مش حرف.
- `HAND_LOST_GRACE`: الـ effects اللي ماشية مع الإيد بتستحمل اختفاء الإيد 0.6 ثانية قبل ما تقف. MediaPipe أحياناً بيضيّع الإيد لـ frame أو اتنين (حركة سريعة، blur)، ومش عايزين الراسينجان يطفي كل ما ده يحصل.

```python
CLONE_COUNT = 10
CLONE_OFFSETS = [-0.36, 0.36, -0.46, -0.27, 0.27, 0.46, -0.19, 0.19, -0.37, 0.37]
CLONE_SCALES = [0.68, 0.68, 0.56, 0.56, 0.56, 0.56, 0.45, 0.45, 0.45, 0.45]
CLONE_LIFTS = [0.00, 0.00, 0.22, 0.22, 0.22, 0.22, 0.40, 0.40, 0.40, 0.40]
CLONE_DELAYS = [0.25, 0.40, 0.55, 0.70, 0.85, 1.00, 1.15, 1.30, 1.45, 1.60]
CLONE_PARALLEL = True
SEGMENT_WIDTH = 640                # segmentation runs at this width (speed)
MASK_SMOOTHING = 0.5               # EMA weight of newest mask (less = steadier)
```

إعدادات الـ shadow clone (اتشرح في [09](09_shadow_clone.md)). كل list فيها قيمة لكل نسخة بنفس الترتيب: أول اتنين الصف اللي قدام، وبعدهم 4 الصف اللي في النص، وآخر 4 الصف اللي ورا:

- `CLONE_COUNT`: عدد النسخ (10: خمسة شمال وخمسة يمين، يعني 11 شخص على الشاشة معانا). لو أي list أقصر من العدد ده، الـ effect بيطلّع error بدل ما يقلل النسخ من غير ما يقول.
- `CLONE_OFFSETS`: **ترتيب** النسخة من الشمال لليمين جوه صفها، ومكانها الأولاني قبل ما الكود يلاقينا. المكان الحقيقي بيتحسب كل frame حسب مكاننا والمساحة الفاضية (Adaptive Positioning، الشرح في [09](09_shadow_clone.md)).
- `CLONE_SCALES`: حجم كل نسخة. الصف اللي ورا أصغر (45%)، فيبان أبعد.
- `CLONE_LIFTS`: قد إيه النسخة متعلّية عن تحت الصورة. الصفوف اللي ورا أعلى (22% و 40%)، فراسهم تبان فوق الصف اللي قدامهم. لو قللناها، راس النسخ اللي ورا بيستخبى ورا اللي قدام.
- `CLONE_DELAYS`: كل نسخة متأخرة عنّا بوقت مختلف (من 0.25 لـ 1.6 ثانية)، فالنسخ مابيتحركوش مع بعض زي بعض.
- `CLONE_PARALLEL`: طبقة النسخ بتترسم في thread لوحدها، بالتوازي مع تتبع الإيد. أسرع بحوالي 10ms في الـ frame، والتفاصيل في [09](09_shadow_clone.md).
- `SEGMENT_WIDTH`: الـ segmentation بيشتغل على صورة عرضها 640 بس (أسرع 4 مرات تقريباً من 1280).
- `MASK_SMOOTHING`: وزن الـ mask الجديد في المتوسط المتحرك. أقل = أثبت بس بيتأخر عن الحركة.

```python
# One Euro filter for effect anchors (smaller min_cutoff = smoother, more lag)
FILTER_MIN_CUTOFF = 1.5
FILTER_BETA = 0.02
```

- إعدادات فلتر One Euro اللي بينعّم مكان الإيد (اتشرح في [07](07_tracking_and_filters.md)).
- `FILTER_MIN_CUTOFF`: أصغر = أنعم وقت الوقوف بس بيتأخر أكتر.
- `FILTER_BETA`: أكبر = بيلحق الحركة السريعة أسرع (أقل تأخير) بس الرعشة بترجع.

```python
# ---------------------------------------------------------------- data collection
RECORD_SECONDS = 20
COUNTDOWN_SECONDS = 3
```

- `collect_data.py`: كل session تسجيل مدتها 20 ثانية، وقبلها عدّ تنازلي 3 ثواني.

## مفاهيم مهمة (`config.py`)

1. **مكان واحد للإعدادات:** باقي الملفات بتاخد القيم دي كـ default arguments (مثلاً `GestureStabilizer(labels, alpha=config.PROB_SMOOTHING, ...)`). فالـ tests تقدر تبعت أرقام تانية (`hold=0.3`) من غير ما تلمس `config.py`.
2. **مجموعات الإعدادات:** paths → camera → hand tracking → gestures → recognition → jutsu → effects → shadow clone → filter → data collection. نفس ترتيب الـ pipeline تقريباً.
3. **الـ JUTSU dictionary:** بيفصل "إيه الإشارات" عن "إيه اللي يحصل". الموديل بيتعلم الإشارات بس، والتسلسلات بتتعرّف هنا من غير أي تدريب جديد.

---

# الجزء التالت: `shinobi/main.py`

## الملف ده بيعمل إيه؟

ده البرنامج اللي بنشغّله (`python -m shinobi.main`). بيجهّز كل الأجزاء، وبعدين بيدخل في **loop** مابيخلصش. في كل لفة:

```
0) الكيبورد
1) قراية أحدث frame (لو مفيش جديد → نرجع لـ 0)
   حساب dt و FPS
2) perception: الإيدين (+ segmentation بالتوازي لو محتاجينها)
3) recognition: features → classifier → controller → يمكن يبدأ effect
4) tracking: مكان الإيد المتنعّم
5) effects: رسم الـ effect
6) overlays: النقط على الإيد + الـ HUD
7) العرض على الشاشة
```

## الكود سطر بسطر

```python
"""SHINOBI AI main loop.  Run:  python -m shinobi.main"""

import time
from concurrent.futures import ThreadPoolExecutor
```

- docstring: ده الـ main loop، وبيتشغّل بـ `python -m shinobi.main`. (الـ `-m` معناها "تشغيل الـ module ده من جوه الـ package"، وده بيخلي `__init__.py` يتنفذ الأول وبيخلي الـ imports زي `from shinobi import config` تشتغل.)
- `time`: لقياس الوقت بـ `time.perf_counter()` (ساعة دقيقة جداً، مناسبة لقياس فترات قصيرة).
- `ThreadPoolExecutor`: لتشغيل الـ segmentation في thread تاني بالتوازي.

```python
import cv2
```

- OpenCV: للشباك (`namedWindow`, `imshow`)، والكيبورد (`waitKey`).

```python
from shinobi import config
from shinobi.camera import Camera
from shinobi.classifier import GestureClassifier
from shinobi.controller import ActionController
from shinobi.effects import EFFECTS
from shinobi.effects.base import EffectManager
from shinobi.features import extract, hands_to_arrays
from shinobi.hands import HandTracker, draw_hands
from shinobi.hud import draw_hud
from shinobi.segmentation import PersonSegmenter
from shinobi.tracking import AnchorTracker
```

كل قطعة من الـ pipeline:

- `config`: الإعدادات.
- `Camera`: الكاميرا (بتقرا في thread لوحدها وبتدّينا أحدث frame).
- `GestureClassifier`: الموديل المتدرب.
- `ActionController`: بيحوّل الاحتمالات لـ jutsu.
- `EFFECTS`: dictionary فيه اسم كل effect ودالة بتعمله.
- `EffectManager`: بيشغّل الـ effect النشط.
- `extract, hands_to_arrays`: تحويل الإيدين لـ feature vector.
- `HandTracker, draw_hands`: MediaPipe لتتبع الإيد، ورسم النقط عليها.
- `draw_hud`: المعلومات على الشاشة.
- `PersonSegmenter`: فصل الشخص عن الخلفية.
- `AnchorTracker`: مكان الإيد المتنعّم للـ effects.

```python
WINDOW = "SHINOBI AI"
```

- اسم الشباك. OpenCV بيعرّف الشبابيك بالاسم، فبنستخدم نفس الـ string في كل مكان.

```python
def main():
    camera = Camera()
    hands_tracker = HandTracker()
    segmenter = PersonSegmenter()
    seg_worker = ThreadPoolExecutor(max_workers=1)   # runs segmentation in parallel with hand tracking
    anchor = AnchorTracker()
    effects = EffectManager(EFFECTS)
```

التجهيز (بيحصل مرة واحدة):

- `camera`: بتفتح الكاميرا وبتبدأ الـ thread بتاعها.
- `hands_tracker`: بيحمّل موديل MediaPipe للإيد.
- `segmenter`: بيحمّل موديل الـ segmentation.
- `seg_worker`: thread pool فيه **worker واحد بس**. هنبعتله شغل الـ segmentation عشان يشتغل في نفس الوقت مع تتبع الإيد. واحد كفاية لأن عندنا مهمة segmentation واحدة كل frame.
- `anchor`: متتبع مكان الإيد.
- `effects`: مدير الـ effects، وبنديله الـ dictionary عشان يعرف يبني أي effect بالاسم.

```python
    classifier = GestureClassifier() if GestureClassifier.exists() else None
    controller = ActionController(classifier.labels) if classifier else None
    message = None if classifier else "No trained model yet: keyboard mode (press 1-4)"
```

- **وضع الكيبورد:** لو ملف الموديل (`gesture_model.joblib`) موجود، نحمّله. لو مش موجود، `classifier = None`.
- `controller`: بيتعمل بس لو فيه classifier، وبياخد أسماء الـ labels من الموديل نفسه (بنفس الترتيب اللي الموديل بيطلّع بيه الاحتمالات).
- `message`: لو مافيش موديل، بنعرض رسالة إن البرنامج في وضع الكيبورد (نضغط 1-4).
- **ليه ده مهم؟** البرنامج بيشتغل حتى قبل ما نسجّل داتا وندرّب. فنقدر نجرّب الـ effects ونعرضها من أول يوم.

```python
    cv2.namedWindow(WINDOW, cv2.WINDOW_NORMAL)
    cv2.resizeWindow(WINDOW, config.CAMERA_WIDTH, config.CAMERA_HEIGHT)
    show_landmarks, show_hud, fullscreen = True, True, False
    last_id, last_time, fps = -1, time.perf_counter(), 0.0
    state, probs = None, None
```

- `namedWindow(..., WINDOW_NORMAL)`: بنعمل الشباك. `WINDOW_NORMAL` معناه إن الشباك ينفع يتكبّر ويتصغّر (والصورة تتمط معاه)، وده لازم عشان الـ fullscreen.
- `resizeWindow`: حجم الشباك الأولي = حجم الكاميرا.
- 3 مفاتيح on/off: عرض نقط الإيد، عرض الـ HUD، شاشة كاملة.
- `last_id = -1`: رقم آخر frame عالجناه. (-1 = لسه ماعالجناش ولا واحد.)
- `last_time`: وقت آخر frame (عشان نحسب `dt`).
- `fps = 0.0`: الـ FPS المتنعّم.
- `state`: آخر حالة من الـ controller (للـ HUD). `probs`: آخر احتمالات.

```python
    try:
        while True:
```

- `try` (والـ `finally` في الآخر): عشان مهما حصل (خروج عادي، error، Ctrl+C)، الكاميرا والموارد تتقفل صح.
- `while True`: loop مابيخلصش لوحده؛ بنخرج منه بـ `break`.

```python
            # 0) keyboard: checked on EVERY pass, also while waiting for a new frame,
            #    otherwise key presses that arrive in between are lost.
            key = cv2.waitKey(1) & 0xFF
            if key in (ord("q"), 27):
                break
```

- الكومنت: الكيبورد بيتشيك في **كل لفة**، حتى واحنا مستنيين frame جديد، وإلا الضغطات اللي بتيجي في النص بتضيع (اتشرح في المفاهيم).
- `cv2.waitKey(1)`: بتستنى لحد 1 ms لضغطة زرار. بترجّع كود الزرار، أو -1 لو مفيش. **وكمان** هي اللي بتخلي شباك OpenCV يعالج الأحداث بتاعته (يرسم الصورة، يستقبل الكيبورد). من غيرها `imshow` مابيظهرش حاجة.
- `& 0xFF`: بناخد آخر 8 bits بس. على بعض الأنظمة الكود بيرجع فيه bits زيادة (زي حالة Shift أو NumLock)، فده بيخلي المقارنة بـ `ord("q")` تشتغل دايماً. (-1 بتبقى 255، ومش بتطابق أي حاجة.)
- `q` أو `27` (كود زرار Esc) → نخرج من الـ loop.

```python
            if key in config.EFFECT_KEYS:
                effects.start(config.EFFECT_KEYS[key], time.perf_counter())
            elif key == ord("0"):
                effects.stop(time.perf_counter())
```

- لو الزرار من 1 لـ 4: نشغّل الـ effect بتاعه على طول (من غير الموديل).
- `0`: نوقف الـ effect الحالي (بيعمل fade out).
- بنستخدم `time.perf_counter()` لأن `now` لسه ماتحسبش في اللفة دي، ونفس الساعة اللي بيستخدمها باقي الكود.

```python
            elif key == ord("l"):
                show_landmarks = not show_landmarks
            elif key == ord("h"):
                show_hud = not show_hud
```

- `l`: إظهار/إخفاء النقط والخطوط على الإيد.
- `h`: إظهار/إخفاء الـ HUD. (مفيد في العرض عشان الشاشة تبقى نضيفة.)
- `not x` بيقلب `True` لـ `False` والعكس (toggle).

```python
            elif key == ord("f"):
                fullscreen = not fullscreen
                cv2.setWindowProperty(WINDOW, cv2.WND_PROP_FULLSCREEN,
                                      cv2.WINDOW_FULLSCREEN if fullscreen else cv2.WINDOW_NORMAL)
```

- `f`: شاشة كاملة/عادي. `setWindowProperty` بيغيّر خاصية الـ fullscreen للشباك.

```python
            if last_id >= 0 and cv2.getWindowProperty(WINDOW, cv2.WND_PROP_VISIBLE) < 1:
                break                                     # window closed with the X button
```

- لو قفلنا الشباك بزرار X، OpenCV مابيقفلش البرنامج لوحده (الـ loop هيفضل شغال، و `imshow` الجاية هتفتح شباك جديد!). فبنسأل: الشباك لسه ظاهر؟ لو لأ (`< 1`) → نخرج.
- `last_id >= 0`: بنعمل الفحص ده بس بعد ما عرضنا أول frame. قبل كده الشباك لسه مافيهوش صورة، وممكن يرجّع إنه مش ظاهر، فالبرنامج كان هيقفل على طول.

```python
            frame_id, frame = camera.read()
            if frame is None or frame_id == last_id:     # no new frame yet
                continue
            last_id = frame_id
```

- `camera.read()`: بترجّع أحدث frame ورقمه. (الكاميرا في thread تاني، وكل frame جديد رقمه بيزيد 1.)
- لو مفيش frame خالص (الكاميرا لسه بتبدأ) أو نفس الـ frame اللي عالجناه قبل كده → `continue` (نرجع لأول الـ loop من غير ما نعمل حاجة).
- **ليه؟** الـ loop بيلف أسرع من الكاميرا (30 FPS). لو عالجنا نفس الـ frame مرتين، بنضيّع CPU، والـ particles هتتحرك على صورة واقفة.
- `last_id = frame_id`: نسجّل إننا عالجنا الـ frame ده.

```python
            now = time.perf_counter()
            dt = min(now - last_time, 0.1)                # clamp: a hiccup must not explode particles
            last_time = now
            fps = 0.9 * fps + 0.1 / max(dt, 1e-3)
            timings = {}
```

- `now`: وقت الـ frame ده. كل حاجة بعد كده (الـ controller، الـ tracking، الـ effects) بتاخد نفس `now`.
- `dt`: الوقت من آخر frame، **بحد أقصى 0.1 ثانية** (clamp). لو البرنامج اتجمّد ثانية (مثلاً سحبنا الشباك)، `dt` الحقيقي هيبقى 1. والـ particles بتتحرك `vel × dt` وبتطلع `rate × dt`، فـ dt = 1 معناه 650 particle نار مرة واحدة وكل حاجة تتنط مسافة كبيرة. الـ clamp بيمنع "الانفجار" ده.
- `fps`: **EMA** (متوسط متحرك أُسّي): 90% من القيمة القديمة + 10% من الجديدة (`1/dt`). كده الرقم اللي على الشاشة ثابت ومابيترعشش كل frame. الـ `max(dt, 1e-3)` بيمنع القسمة على صفر.
- `timings`: dictionary هنحط فيه وقت كل مرحلة بالـ ms عشان يظهر في الـ HUD.

```python
            # 1) perception. Segmentation (only when the active effect needs it) starts first on the
            #    worker thread, so both MediaPipe models run at the same time on different CPU cores.
            seg_job = None
            if effects.needs_segmentation:
                seg_start = time.perf_counter()
                seg_job = seg_worker.submit(segmenter.segment, frame)
```

- الكومنت: الـ segmentation (بس لو الـ effect النشط محتاجها) بيبدأ **الأول** في الـ worker thread، عشان الموديلين يشتغلوا في نفس الوقت على cores مختلفة.
- `seg_job = None`: افتراضياً مفيش segmentation.
- `effects.needs_segmentation`: True بس لو الـ effect النشط هو الـ shadow clone. الـ segmentation غالية، فمابنشغلهاش إلا لو محتاجينها.
- `seg_start`: نسجّل وقت البداية لقياس الوقت.
- `seg_worker.submit(segmenter.segment, frame)`: بنبعت المهمة للـ worker. **`submit` بترجع على طول** (مابتستناش)، وبتدّينا `Future` = "وعد" إن النتيجة هتبقى جاهزة بعدين.

```python
            t = time.perf_counter()
            hands = hands_tracker.detect(frame)
            timings["hands"] = (time.perf_counter() - t) * 1000
```

- **في نفس الوقت** اللي الـ worker شغال فيه على الـ segmentation، الـ main thread بيشغّل تتبع الإيد.
- `hands`: list من الإيدين اللي اتلقوا (ممكن تبقى فاضية).
- بنقيس الوقت ونحوّله لـ ms (× 1000).

```python
            # 2) recognition -> controller
            if classifier:
                t = time.perf_counter()
                probs = None
                if hands:
                    h, w = frame.shape[:2]
                    probs = classifier.predict(extract(*hands_to_arrays(hands), aspect=w / h))
```

- كل ده بيحصل بس لو فيه موديل (مش وضع الكيبورد).
- `probs = None`: افتراضياً (لو مفيش إيد) مفيش احتمالات.
- لو فيه إيد:
  - `frame.shape[:2]` = (الارتفاع، العرض).
  - `hands_to_arrays(hands)`: بيحوّل الإيدين لـ 3 arrays (image landmarks، world landmarks، present).
  - الـ `*` بيفك الـ tuple لـ 3 arguments منفصلين لـ `extract`.
  - `aspect=w / h`: نسبة العرض للارتفاع (16/9)، لأن إحداثيات الصورة من 0 لـ 1 في الاتجاهين، والـ features محتاجة النسبة الحقيقية.
  - `classifier.predict(...)`: احتمال كل إشارة.

```python
                state = controller.update(probs, now)
                if state.effect:
                    effects.start(state.effect, now)
                timings["model"] = (time.perf_counter() - t) * 1000
```

- `controller.update(probs, now)`: بيتنادى **كل frame حتى لو `probs = None`**، لأن "مفيش إيد" معلومة مهمة: بتنزّل الاحتمالات المتنعّمة وبتفك الإشارة المؤكدة.
- لو الـ controller قال "شغّل effect" → نشغّله.
- نسجّل وقت المرحلة دي.

```python
            # 3) effects
            tracking = anchor.update(hands, now)
            segmentation = None
            if seg_job is not None:
                segmentation = seg_job.result()               # wait for the worker (usually already done)
                timings["seg"] = (time.perf_counter() - seg_start) * 1000
```

- `tracking`: مكان وحجم واتجاه الإيد المتنعّمين (للـ effects).
- لو كنا بعتنا segmentation: `seg_job.result()` **بتستنى** لحد ما الـ worker يخلص وترجّع النتيجة. غالباً بيبقى خلص، لأنه بدأ قبل تتبع الإيد والـ classifier.
- الوقت المسجل = من البعت لحد الاستلام (بيشمل أي انتظار).

```python
            t = time.perf_counter()
            output = effects.render(frame, tracking, dt, segmentation)
            timings["fx"] = (time.perf_counter() - t) * 1000
            if effects.active is None:
                segmenter.reset()
```

- `effects.render`: بيرسم الـ effect النشط (لو فيه) ويرجّع الصورة الجديدة. `output` ممكن يبقى نفس الـ `frame` لو مفيش effect.
- `timings["fx"]`: وقت الرسم.
- لو مفيش effect نشط: نمسح ذاكرة الـ segmenter (الـ mask القديم اللي بيتعمله متوسط مع الجديد). كده الـ shadow clone الجاي مايبدأش بـ mask قديم من مكان كنا فيه من دقيقة.

```python
            # 4) overlays
            if show_landmarks:
                output = draw_hands(output, hands)
```

- لو مفعّل: نرسم النقط الـ 21 والخطوط على كل إيد. بنرسمها **بعد** الـ effect عشان تبان فوقه.

```python
            if show_hud:
                stab = controller.stabilizer if controller else None
                draw_hud(output, fps, timings,
                         labels=stab.labels if stab else None,
                         probs=stab.smoothed if stab else None,
                         candidate=stab.candidate if stab else None,
                         latched=stab.latched if stab else None,
                         hold=stab.hold_progress(now) if stab else 0.0,
                         history=state.history if state else (),
                         effect=effects.active.name if effects.active else None,
                         cooldown=controller.cooldown_left(now) if controller else 0.0,
                         message=message)
```

- لو الـ HUD مفعّل:
- `stab`: الـ stabilizer جوه الـ controller (فيه الاحتمالات المتنعّمة والحالة). `None` في وضع الكيبورد.
- كل argument فيه `if ... else` عشان البرنامج مايوقعش في وضع الكيبورد (لو `stab = None`، `stab.labels` هتدّي error).
- `labels`: أسماء الإشارات. `probs`: الاحتمالات **المتنعّمة** (مش الخام)، لأن دي اللي الـ controller بيقرر عليها فعلاً.
- `candidate`: الإشارة اللي بنعدّ لها وقت دلوقتي. `latched`: الإشارة المؤكدة.
- `hold`: قد إيه قرّبنا من التأكيد (0 لـ 1).
- `history`: الإشارات المؤكدة في التسلسل الحالي.
- `effect`: اسم الـ effect الشغال. `cooldown`: الوقت الباقي في الـ cooldown.
- `message`: رسالة وضع الكيبورد (أو `None`).

```python
            cv2.imshow(WINDOW, output)
```

- نعرض الصورة النهائية في الشباك. (الشاشة بتتحدّث فعلاً لما `waitKey` تتنادى في اللفة الجاية.)

```python
    finally:
        camera.release()
        seg_worker.shutdown()
        hands_tracker.close()
        segmenter.close()
        cv2.destroyAllWindows()
```

- `finally` بيتنفذ **دايماً** لما نخرج من الـ `try`، سواء بـ `break`، أو error، أو Ctrl+C.
- `camera.release()`: نوقف الـ thread ونقفل الكاميرا. من غيرها ممكن الكاميرا تفضل مقفولة على البرنامج ده (لمبة الكاميرا منوّرة، وبرنامج تاني مايعرفش يفتحها).
- `seg_worker.shutdown()`: نقفل الـ thread pool (بيستنى أي مهمة شغالة تخلص).
- `hands_tracker.close()` و `segmenter.close()`: نقفل موديلات MediaPipe ونرجّع الذاكرة.
- `cv2.destroyAllWindows()`: نقفل كل شبابيك OpenCV.

```python
if __name__ == "__main__":
    main()
```

- `__name__` بيبقى `"__main__"` بس لو الملف ده هو اللي اتشغّل مباشرة (`python -m shinobi.main`). لو حد عمله import (زي test)، `main()` مش هتتنادى لوحدها.

## مفاهيم مهمة (`main.py`)

### 1) الـ main loop خطوة بخطوة

```
┌─────────────────────────────── كل لفة ──────────────────────────────────┐
│ 0) waitKey(1) ← كيبورد + تحديث الشباك                                   │
│    q/Esc → break      1-4 → start      0 → stop      l/h/f → toggle      │
│    الشباك اتقفل؟ → break                                                 │
│                                                                          │
│ 1) camera.read() ── مفيش frame جديد؟ ──► continue (نرجع لـ 0)            │
│        │                                                                 │
│        ▼ فيه جديد                                                        │
│    dt = min(now − last, 0.1)      fps = 0.9·fps + 0.1/dt                 │
│                                                                          │
│ 2) [worker]  segmentation ═══════════╗  (لو shadow clone)                │
│    [main]    hands.detect             ║                                  │
│ 3) [main]    extract → predict → controller → effects.start?             │
│ 4) [main]    anchor.update                                               │
│              seg_job.result() ◄══════╝                                   │
│ 5) effects.render                                                        │
│ 6) draw_hands + draw_hud                                                 │
│ 7) imshow                                                                │
└──────────────────────────────────────────────────────────────────────────┘
```

### 2) ليه الكيبورد بيتشيك في أول كل لفة؟ (bug حقيقي)

الـ loop بيلف أسرع بكتير من الكاميرا. الكاميرا بتدّي frame كل 33 ms، والـ loop لما مفيش frame جديد بيعمل `continue` في أقل من 1-2 ms. يعني **معظم اللفات** بتبقى "مفيش frame جديد".

في الاختبار، لما فحص الكيبورد كان بييجي **بعد** الـ `continue`، الضغطات اللي بتيجي في اللفات دي كانت بتضيع: نضغط `2` ومايحصلش حاجة. الحل: `cv2.waitKey(1)` في **أول** اللفة، قبل أي `continue`، فكل لفة (حتى اللي مفيهاش frame جديد) بتقرا الكيبورد وبتخلي الشباك يعالج أحداثه.

ودرس عام: في أي loop فيه `continue`، أي حاجة لازم تحصل كل لفة لازم تتحط **قبل** الـ `continue`.

### 3) الـ ThreadPoolExecutor والتوازي الحقيقي

**المشكلة:** في الـ shadow clone لازم نشغّل موديلين MediaPipe كل frame: تتبع الإيد والـ segmentation. ورا بعض = وقت الاتنين مجموع.

**الحل:** نشغّلهم في نفس الوقت على cores مختلفة:

```
من غير thread (ورا بعض):
main:    |── segmentation ──|── hands ──|── fx ──|            ≈ 91 ms

مع thread (بالتوازي):
worker:  |── segmentation ──|
main:    |── hands ──|─ model ─|·wait·|── fx ──|              ≈ 59 ms
```

**بس مش Python فيها GIL؟** صح. الـ **GIL (Global Interpreter Lock)** قفل جوه Python بيسمح لـ thread واحد بس ينفّذ Python bytecode في أي لحظة. يعني لو الشغل كله Python عادي، الـ threads مش هتسرّع حاجة.

**ليه هنا بيسرّع؟** MediaPipe (الـ Tasks API) بتنادي مكتبة C جاهزة عن طريق **ctypes**. و ctypes **بتفك الـ GIL** طول فترة النداء للـ C. يعني وأحد الـ threads جوه كود C بيحسب الموديل، الـ GIL متساب والـ thread التاني يقدر يشتغل (ويدخل هو كمان في كود C بتاع الموديل التاني). فالموديلين بيشتغلوا فعلاً في نفس الوقت على 2 cores. (ونفس الحكاية مع معظم دوال OpenCV اللي في `segment()`، زي الـ resize والـ guided filter.)

**القياس:** على الـ i7-8550U (4 cores)، لفة الـ shadow clone نزلت من **91 ms لـ 59 ms**. يعني من حوالي 11 FPS لحوالي 17 FPS.

**ليه `max_workers=1`؟** عندنا مهمة واحدة بس في الخلفية كل frame. ومهم كمان إن الـ segmenter مايتنادىش من 2 threads في نفس الوقت (بيحتفظ بـ mask قديم في `self._prev`)، فـ worker واحد بيضمن الترتيب.

### 4) الـ clamp بتاع `dt`

| الحالة | `dt` الحقيقي | `dt` بعد الـ clamp | النار (650/ثانية) |
|---|---|---|---|
| عادي (30 FPS) | 0.033 | 0.033 | 22 particle |
| تهنيجة ثانية | 1.0 | 0.1 | 66 بدل 650 |

من غير الـ clamp، بعد أي تهنيجة: دفعة ضخمة من الـ particles، والجزيئات الموجودة تتنط مسافة كبيرة، والـ physics تبوظ. التمن: لو البرنامج فعلاً أبطأ من 10 FPS، الـ effects هتتحرك في "slow motion" شوية. (والـ FPS المعروض كمان بيتحسب من `dt` بعد الـ clamp، فمش هيظهر أقل من 10.)

### 5) الـ FPS بالـ EMA

```
fps_جديد = 0.9 × fps_قديم + 0.1 × (1 / dt)
```

لو عرضنا `1/dt` على طول، الرقم هيترعش (29.4، 31.2، 28.8...) ومش هنعرف نقراه. الـ EMA بيدّي متوسط ناعم بيتبع التغيير الحقيقي بس ببطء. الأوزان (0.9 و 0.1) معناها إن تقريباً آخر 10 frames هما اللي مأثرين. (الرقم بيبدأ من 0 وبياخد ثانية تقريباً عشان يوصل للقيمة الحقيقية.)

### 6) وضع الكيبورد بس

لو `gesture_model.joblib` مش موجود: `classifier = None` و `controller = None`، ومرحلة الـ recognition كلها بتتخطى. كل حاجة تانية (الكاميرا، الإيد، الـ tracking، الـ effects، الـ HUD) شغالة عادي، والـ effects بتشتغل بالزراير 1-4. وكل الأماكن اللي بتستخدم `controller` أو `stab` محمية بـ `if ... else`.

### 7) `try / finally`

```
try:
    ... الـ loop ...
finally:
    ... التنضيف ...   ← بيتنفذ دايماً
```

لو حصل error في أي frame (مثلاً في effect)، البرنامج هيوقع، بس الـ `finally` هيتنفذ الأول: الكاميرا تتقفل، الـ threads تقف، والشباك يتقفل. من غير كده ممكن الكاميرا تفضل "مشغولة" ونضطر نعمل restart.

---

# الجزء الرابع: `shinobi/hud.py`

## الملف ده بيعمل إيه؟

الـ **HUD (Heads-Up Display)** = المعلومات اللي بتظهر فوق الصورة: الـ FPS، وقت كل مرحلة، احتمال كل إشارة كـ bars، شريط الـ hold، تسلسل الإشارات، اسم الـ effect، الـ cooldown، والزراير. ده بيساعد في الـ debugging وفي العرض (نشوف الموديل بيفكر في إيه لحظة بلحظة).

## الكود سطر بسطر

```python
"""On-screen debug information: FPS, timings, live gesture probabilities, sequence, active effect."""

import cv2

FONT = cv2.FONT_HERSHEY_SIMPLEX
```

- docstring: معلومات debug على الشاشة: FPS، الأوقات، احتمالات الإشارات لحظياً، التسلسل، الـ effect النشط.
- `FONT`: الخط اللي OpenCV هيكتب بيه. `HERSHEY_SIMPLEX` خط بسيط وواضح ومدمج في OpenCV.

```python
def text(frame, msg, org, scale=0.55, color=(255, 255, 255), thick=1):
    cv2.putText(frame, msg, org, FONT, scale, (0, 0, 0), thick + 3, cv2.LINE_AA)   # dark outline
    cv2.putText(frame, msg, org, FONT, scale, color, thick, cv2.LINE_AA)
```

- دالة مساعدة بتكتب كلام **بحدود سودا** (outline):
  - `msg`: الكلام. `org`: مكان أول الكلام (الركن الشمال التحتاني للسطر). `scale`: حجم الخط. `color`: لون BGR (افتراضياً أبيض). `thick`: السُمك.
  - السطر الأول: نكتب الكلام **بالأسود** وبسُمك أكبر بـ 3.
  - السطر التاني: نكتب نفس الكلام في نفس المكان باللون المطلوب وبالسُمك العادي **فوق** الأسود.
- النتيجة: كلام ملوّن حواليه حدود سودا (تفاصيل في المفاهيم).
- `collect_data.py` كمان بيستخدم الدالة دي.

```python
def draw_hud(frame, fps, timings, labels=None, probs=None, candidate=None, latched=None,
             hold=0.0, history=(), effect=None, cooldown=0.0, message=None):
    h, w = frame.shape[:2]
```

- الدالة الرئيسية. كل الـ arguments بعد `timings` ليها قيم افتراضية، فالـ HUD بيشتغل في وضع الكيبورد (مفيش labels ولا probs).
- `history=()`: tuple فاضي (مش list) كقيمة افتراضية، لأن الـ default arguments في Python بتتعمل مرة واحدة، والـ tuple مابيتغيرش فمفيش خطر.
- `h, w`: ارتفاع وعرض الصورة، عشان نحط حاجات تحت وعلى اليمين.

```python
    text(frame, f"FPS {fps:4.1f}", (10, 25), 0.7, (0, 255, 0), 2)
    detail = "  ".join(f"{k} {v:4.1f}ms" for k, v in timings.items())
    text(frame, detail, (10, 50), 0.45)
```

- السطر الأول: الـ FPS باللون الأخضر (BGR `(0, 255, 0)`)، فوق على الشمال، بخط أكبر. `{fps:4.1f}` = رقم عشري برقم واحد بعد العلامة، وعرضه 4 حروف على الأقل.
- `detail`: كل الأوقات في سطر واحد، مثلاً `hands 28.3ms  model  1.2ms  fx  6.5ms`. `"  ".join(...)` بيلزقهم بمسافتين بينهم.
- السطر التاني تحت الـ FPS بخط صغير.

```python
    if labels is not None and probs is not None:
        y = 80
        for i, (name, p) in enumerate(zip(labels, probs)):
            color = (0, 255, 255) if i == latched else (0, 200, 0) if i == candidate else (200, 200, 200)
```

- الـ bars بتترسم بس لو فيه موديل.
- `y = 80`: أول bar بيبدأ من y = 80.
- `enumerate(zip(labels, probs))`: لكل إشارة: رقمها `i`، اسمها `name`، واحتمالها `p`.
- `color`: لون الـ bar والكلام (BGR):
  - `(0, 255, 255)` = **أصفر** (أخضر + أحمر): لو دي الإشارة المؤكدة (`latched`).
  - `(0, 200, 0)` = **أخضر**: لو دي المرشحة (`candidate`) اللي بنعدّ لها وقت.
  - `(200, 200, 200)` = رمادي فاتح: باقي الإشارات.
  - الـ `if ... else ... if ... else` المتداخلة دي بتتقرا: "لو latched → أصفر، وإلا لو candidate → أخضر، وإلا → رمادي".

```python
            cv2.rectangle(frame, (110, y - 12), (110 + int(150 * p), y), color, -1)
            cv2.rectangle(frame, (110, y - 12), (260, y), (90, 90, 90), 1)
```

- المستطيل الأول: الـ bar المليان. بيبدأ من x = 110، وعرضه `150 × p` (لو الاحتمال 1 → 150 pixel، لو 0.5 → 75). ارتفاعه 12 pixel. `-1` = مليان.
- المستطيل التاني: إطار رمادي غامق حوالين المساحة الكاملة (من 110 لـ 260 = 150 pixel)، سُمك 1. ده بيوضح "100%" فين، فنقدر نقدّر النسبة بالعين.

```python
            text(frame, name, (10, y), 0.45, color)
            text(frame, f"{p:.2f}", (268, y), 0.45, color)
            y += 20
```

- اسم الإشارة على الشمال (من x = 10)، بنفس اللون.
- الاحتمال كرقم (منزلتين عشريتين) على يمين الـ bar.
- `y += 20`: الإشارة الجاية تنزل 20 pixel.

```python
        if hold > 0:
            cv2.rectangle(frame, (10, y), (10 + int(250 * hold), y + 6), (0, 200, 255), -1)
```

- **شريط الـ hold:** لو فيه إشارة مرشحة لسه ماتأكدتش، بنرسم شريط رفيع (6 pixel) تحت الـ bars، عرضه بيكبر من 0 لـ 250 pixel مع تقدم وقت الـ hold. اللون `(0, 200, 255)` برتقالي مصفر.
- لما الشريط يوصل للآخر = الإشارة اتأكدت (وبيختفي لأن `hold_progress` بترجع 0 للإشارة الـ latched).

```python
    if history:
        text(frame, "seals: " + " > ".join(history), (10, h - 45), 0.6, (0, 220, 255), 2)
```

- لو فيه تسلسل إشارات: نكتبه تحت، مثلاً `seals: clone_seal > fire`. `h - 45` = 45 pixel من تحت.

```python
    if effect:
        text(frame, effect.upper().replace("_", " "), (w // 2 - 110, 45), 1.1, (0, 220, 255), 3)
```

- اسم الـ effect الشغال بخط كبير فوق في النص تقريباً: `shadow_clone` → `SHADOW CLONE`. `.upper()` حروف كبيرة، و `.replace("_", " ")` بيشيل الـ underscore.
- `w // 2 - 110`: نص الشاشة ناقص 110 (تقريب، مش توسيط مظبوط لكل كلمة).

```python
    if cooldown > 0:
        text(frame, f"cooldown {cooldown:.1f}s", (w - 190, 25), 0.55, (0, 140, 255))
```

- لو في cooldown: نكتب الوقت الباقي فوق على اليمين باللون البرتقالي.

```python
    if message:
        text(frame, message, (10, h - 75), 0.6, (0, 200, 255), 2)
    text(frame, "1-4 effects  0 stop  L landmarks  H hud  F fullscreen  Q quit", (10, h - 15), 0.45)
    return frame
```

- `message`: رسالة وضع الكيبورد (لو موجودة)، تحت فوق سطر الـ seals.
- آخر سطر تحت خالص: الزراير المتاحة، دايماً ظاهر.
- `return frame`: الدالة **بترسم على نفس الصورة** (in-place) وبترجعها كمان. (في `main.py` مابنستخدمش القيمة الراجعة لأن الرسم حصل خلاص على `output`.)

## مفاهيم مهمة (`hud.py`)

### 1) خدعة الكلام بالحدود (outlined text)

الكلام الأبيض بيختفي على حيطة بيضا، والأسود بيختفي على تيشيرت أسود. الحل:

```
1) نكتب بالأسود وتخين (thick + 3)  →  ████
2) نكتب باللون ورفيع فوقه           →  ▓▓  ← في النص
النتيجة: حروف ملونة حواليها إطار أسود → واضحة على أي خلفية
```

ودي نفس الطريقة اللي بتتعمل بيها الترجمة في الأفلام.

### 2) الـ probability bars

كل إشارة ليها bar طوله = احتمالها. والاحتمالات دي **المتنعّمة** (`stab.smoothed`)، فالـ bars بتتحرك بنعومة. لما نعمل إشارة، بنشوف الـ bar بتاعها بيطلع تدريجياً، والباقي بينزل.

### 3) معنى الألوان

| اللون | BGR | المعنى |
|---|---|---|
| رمادي | (200, 200, 200) | إشارة عادية، مش مرشحة |
| أخضر | (0, 200, 0) | **candidate**: عدّت `CONF_ON` و `MIN_MARGIN`، وبنعدّ وقت الـ hold |
| أصفر | (0, 255, 255) | **latched**: اتأكدت (وبتفضل صفرا لحد ما الاحتمال ينزل تحت `CONF_OFF`) |
| شريط برتقالي | (0, 200, 255) | تقدّم الـ hold من 0 لـ `HOLD_SECONDS` |

يعني بنشوف رحلة الإشارة كلها: رمادي → أخضر + الشريط بيتملا → أصفر (والـ effect يشتغل).

---

## لو غيّرنا ... هيحصل إيه؟

| التجربة | التغيير | النتيجة المتوقعة |
|---|---|---|
| 1 | في `main.py` ننقل بلوك الكيبورد (`waitKey` وكل الـ `if`) لبعد سطر `continue` | الـ bug يرجع: ضغطات كتير مش هتتسجل، خصوصاً لو ضغطنا بسرعة، لأن معظم اللفات بتعمل `continue` قبل ما توصل للكيبورد |
| 2 | في `main.py` نستبدل `seg_worker.submit(...)` بنداء مباشر `segmenter.segment(frame)` (ورا بعض) | الـ shadow clone هيبقى أبطأ بشكل واضح (حوالي 91 ms للـ frame بدل 59، يعني 11 FPS بدل 17). باقي الـ effects مش هتتأثر لأنها مش بتستخدم segmentation |
| 3 | في `main.py` نشيل الـ clamp: `dt = now - last_time` | في الاستخدام العادي مفيش فرق. بس لو سحبنا الشباك بالماوس ثانية وسبناه، النار هتطلّع دفعة ضخمة مرة واحدة والشرر هيتنط |
| 4 | في `__init__.py` نمسح سطر `os.environ.setdefault(...)` | فتح الكاميرا هيرجع ياخد حوالي 14 ثانية على اللابتوب ده بدل أقل من ثانية |
| 5 | في `config.py` نغيّر `HOLD_SECONDS` من `0.30` لـ `1.0` | لازم نمسك الإشارة ثانية كاملة. التفعيل بالغلط هيقل جداً، بس هيبان بطيء. في الـ HUD الشريط البرتقالي هيتملا ببطء |
| 6 | في `hud.py` نشيل سطر الـ outline الأسود في `text()` | الكلام هيبقى صعب القراية على الخلفيات الفاتحة (حيطة بيضا، شباك منوّر) |

---

## أسئلة مراجعة

<details>
<summary>1. ليه ظبطنا <code>OPENCV_VIDEOIO_MSMF_ENABLE_HW_TRANSFORMS</code> في <code>__init__.py</code> بالذات؟</summary>

لأن المتغير لازم يتظبط قبل ما OpenCV يفتح الكاميرا، و `__init__.py` بيتنفذ تلقائياً أول ما أي module من `shinobi` يتعمله import، يعني أكيد قبل `Camera()`، ولكل البرامج (`main.py` و `collect_data.py`). وده بيقلل وقت فتح الكاميرا من 14.4 لـ 0.6 ثانية.
</details>

<details>
<summary>2. ليه <code>cv2.waitKey(1)</code> في أول الـ loop مش في آخره؟</summary>

لأن معظم اللفات بتعمل `continue` (مفيش frame جديد). لو الكيبورد بعد الـ `continue`، اللفات دي مش بتقراه، والضغطات كانت بتضيع في الاختبار. وكمان `waitKey` هي اللي بتخلي الشباك يعالج أحداثه.
</details>

<details>
<summary>3. Python فيها GIL، إزاي الـ thread بيسرّع الـ shadow clone؟</summary>

MediaPipe بتنادي كود C عن طريق ctypes، و ctypes بتفك الـ GIL أثناء النداء. فالـ segmentation في الـ worker وتتبع الإيد في الـ main thread بيشتغلوا فعلاً في نفس الوقت على cores مختلفة. القياس: 91 ms → 59 ms.
</details>

<details>
<summary>4. إيه فايدة <code>dt = min(now - last_time, 0.1)</code>؟</summary>

بيمنع `dt` يبقى كبير بعد تهنيجة. الـ particles بتتولد وتتحرك بنسبة `dt`، فـ dt كبير = دفعة ضخمة من الـ particles وقفزات كبيرة في الحركة.
</details>

<details>
<summary>5. البرنامج بيعمل إيه لو مفيش موديل متدرب؟</summary>

`classifier` و `controller` بيبقوا `None`، ومرحلة التعرف بتتخطى، ورسالة بتظهر إننا في وضع الكيبورد. الـ effects بتشتغل بالزراير 1-4، وكل حاجة تانية شغالة عادي.
</details>

<details>
<summary>6. إيه الفرق بين static jutsu و dynamic jutsu في <code>config.JUTSU</code>؟ وليه الـ jutsu اللي من إشارة واحدة مايبقاش أول خطوة في jutsu أطول؟</summary>

Static = `sequence` فيها إشارة واحدة، dynamic = كذا إشارة بالترتيب. لو jutsu من إشارة واحدة هي أول خطوة في تسلسل أطول، الـ matcher هيطابقها ويشغّلها على طول ويمسح التاريخ، فالتسلسل الأطول عمره ما هيكمل.
</details>

<details>
<summary>7. في الـ HUD، الأخضر والأصفر معناهم إيه؟</summary>

أخضر = candidate: الإشارة عدّت عتبة الاحتمال والفرق، وبنعدّ وقت الـ hold (والشريط البرتقالي بيتملا). أصفر = latched: الإشارة اتأكدت.
</details>

<details>
<summary>8. ليه بنستخدم <code>try/finally</code> حوالين الـ loop؟</summary>

عشان التنضيف (قفل الكاميرا، إيقاف الـ thread pool، قفل موديلات MediaPipe، قفل الشبابيك) يحصل دايماً، حتى لو البرنامج وقع بـ error أو اتقفل بـ Ctrl+C. من غيره ممكن الكاميرا تفضل مشغولة.
</details>
