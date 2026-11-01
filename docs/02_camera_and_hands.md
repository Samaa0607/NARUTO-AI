# 02 — الكاميرا وتتبع الإيد (`camera.py` و `hands.py`)

[⬅ الفهرس](00_index.md)

الملف ده بيشرح أول مرحلتين في الـ pipeline:

```
camera → hands → features → classifier → controller → effects → screen
^^^^^^   ^^^^^
 الجزء الأول  الجزء التاني
```

---

# الجزء الأول: `shinobi/camera.py`

## 1. الملف ده بيعمل إيه؟

`camera.py` مسؤول عن حاجة واحدة: يجيب **أحدث frame** من الكاميرا في أي لحظة. بيفتح الكاميرا الصح (ويتخطّى الكاميرات الوهمية اللي بتبعت شاشة سودا)، وبيشغّل **thread** منفصل بيقرا من الكاميرا طول الوقت، عشان البرنامج الرئيسي ياخد آخر صورة فورًا من غير ما يستنى.

هو أول حلقة في السلسلة: **camera** → hands → features → classifier → controller → effects → screen.

## 2. الكود سطر بسطر

### الـ docstring والـ imports

```python
"""Threaded webcam capture that always hands out the newest frame."""

import threading
import time

import cv2

from shinobi import config
```

- السطر الأول docstring بيوصف الملف في جملة: "التقاط من الكاميرا في thread، وبيدّي دايمًا أحدث frame".
- `threading`: مكتبة Python الأساسية للـ threads والـ locks.
- `time`: محتاجينها عشان `time.sleep` لما القراءة تفشل.
- `cv2`: هي OpenCV، المكتبة اللي بتكلّم الكاميرا وبتعمل عمليات على الصور.
- `from shinobi import config`: بنجيب الإعدادات (رقم الكاميرا، الأبعاد، الـ mirror). السطر ده كمان بيشغّل `shinobi/__init__.py` أول مرة، وده مهم جدًا (هنشرحه تحت في "MSMF").

### فتح الكاميرا: `_open`

```python
def _open(index, width, height):
    # Media Foundation (MSMF) delivers 30 FPS at 720p on this laptop; DirectShow only ~10.
    cap = cv2.VideoCapture(index, cv2.CAP_MSMF)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, width)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, height)
    return cap
```

- `def _open(...)`: الـ underscore في أول الاسم معناها إن الدالة "داخلية" للملف ده، مش معمولة إن حد من بره يستخدمها.
- التعليق بيقول السبب: الـ backend اسمه Media Foundation (MSMF) بيدّي 30 FPS على 720p على اللابتوب ده، و DirectShow بيدّي حوالي 10 بس.
- `cv2.VideoCapture(index, cv2.CAP_MSMF)`: بيفتح الكاميرا رقم `index` (0 = أول كاميرا، 1 = التانية ...). الـ parameter التاني بيحدد الـ backend صراحةً بدل ما نسيب OpenCV يختار، عشان نضمن الـ 30 FPS.
- `cap.set(cv2.CAP_PROP_FRAME_WIDTH, width)` و `cap.set(cv2.CAP_PROP_FRAME_HEIGHT, height)`: بنطلب الدقة اللي عايزينها (1280×720 من `config`). ده "طلب" مش أمر؛ لو الكاميرا مابتدعمش الدقة دي هتختار أقرب حاجة، وعشان كده بنطبع الدقة الحقيقية بعدين.
- `return cap`: بنرجّع الـ object اللي هنقرا منه الـ frames.

### هل الكاميرا دي حقيقية؟ `_is_real`

```python
def _is_real(cap, tries=10):
    """Virtual cameras (e.g. Camo with no phone attached) open fine but send black frames."""
    for _ in range(tries):
        ok, frame = cap.read()
        if ok and frame is not None and frame.mean() > 5:
            return True
    return False
```

- الـ docstring بيشرح المشكلة: الكاميرات الوهمية (زي برنامج Camo لما الموبايل مش متوصّل) بتتفتح عادي جدًا، بس بتبعت frames سودا.
- `for _ in range(tries)`: بنجرّب لحد 10 frames. الـ `_` معناها "مش محتاجين رقم اللفة". ليه أكتر من frame؟ لأن الكاميرا الحقيقية ساعات أول frame أو اتنين بيطلعوا سود وهي لسه بتظبط الإضاءة (auto exposure).
- `ok, frame = cap.read()`: `read` بترجع حاجتين: `ok` (نجحت ولا لأ) والصورة نفسها كـ NumPy array شكله `(height, width, 3)`.
- `frame.mean() > 5`: متوسط كل قيم البكسلات (من 0 لـ 255). الصورة السودا متوسطها تقريبًا 0. أوضة ضلمة بكاميرا حقيقية متوسطها غالبًا أكبر من 5 بكتير. فالرقم 5 حد صغير بيفرق بين "أسود تمامًا" و"صورة فيها أي حاجة".
- أول ما نلاقي frame واحد كويس بنرجع `True`. لو الـ 10 فشلوا بنرجع `False`.

### البحث عن أول كاميرا شغالة: `find_camera`

```python
def find_camera(width, height, max_index=4):
    """Return (index, capture) of the first camera that shows a real picture."""
    for index in range(max_index):
        cap = _open(index, width, height)
        if cap.isOpened() and _is_real(cap):
            return index, cap
        cap.release()
    raise RuntimeError("No working camera found. Check that the webcam is not disabled or in use.")
```

- `for index in range(max_index)`: بنجرّب الكاميرات 0 و 1 و 2 و 3 بالترتيب.
- `cap.isOpened()`: هل الكاميرا اتفتحت أصلًا؟ (لو الرقم ده مافيهوش كاميرا هترجع `False`).
- `and _is_real(cap)`: لو اتفتحت، نتأكد إنها مش بتبعت أسود. الـ `and` في Python "short-circuit": لو الشرط الأول `False` مش هيشغّل التاني خالص، وده بيوفّر وقت.
- `return index, cap`: بنرجّع الرقم والـ object مع بعض (tuple)، عشان مانفتحش الكاميرا مرتين.
- `cap.release()`: لو الكاميرا دي مش نافعة لازم نقفلها قبل ما نجرّب اللي بعدها، وإلا هتفضل محجوزة.
- `raise RuntimeError(...)`: لو خلصنا كل الأرقام ومالقيناش حاجة، بنوقف البرنامج برسالة واضحة بدل ما يكمّل بشاشة سودا ونحتار السبب.

### الكلاس `Camera`: اختيار الكاميرا

```python
class Camera:
    def __init__(self, index=config.CAMERA_INDEX, width=config.CAMERA_WIDTH,
                 height=config.CAMERA_HEIGHT, mirror=config.MIRROR):
        if index is None:
            index, self.cap = find_camera(width, height)
        else:
            self.cap = _open(index, width, height)
            if not self.cap.isOpened():
                raise RuntimeError(f"Cannot open camera {index}. Set CAMERA_INDEX = None in config.py")
```

- القيم الافتراضية كلها جاية من `config`، فممكن نكتب `Camera()` بس، وفي نفس الوقت نقدر نغيّر أي حاجة لو احتجنا (مثلًا في الـ tests).
- `if index is None`: في `config.py` القيمة `CAMERA_INDEX = None` معناها "دوّر لوحدك". ساعتها بنستخدم `find_camera`.
- `else`: لو حد حدد رقم معيّن، بنفتحه مباشرةً من غير بحث (أسرع)، بس من غير فحص الأسود.
- `if not self.cap.isOpened(): raise ...`: لو الرقم ده مش شغال، الرسالة بتقول الحل بالظبط: نخلّي `CAMERA_INDEX = None`.

```python
        self.index = index
        self.mirror = mirror
        print(f"camera {index}: {int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH))}x"
              f"{int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT))}")
```

- بنحفظ الرقم اللي اشتغلنا عليه وهل هنعمل mirror ولا لأ.
- `print(...)`: بنطبع الدقة **الحقيقية** اللي الكاميرا وافقت عليها (`cap.get` بيقرا القيمة). مثلًا `camera 1: 1280x720`. ده مفيد جدًا في الـ debugging. الـ f-string متقسّم على سطرين وPython بيلزقهم في string واحد.

### الكلاس `Camera`: تجهيز الـ thread

```python
        self._frame = None
        self._frame_id = 0
        self._lock = threading.Lock()
        self._running = True
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()
```

- `self._frame = None`: لسه مافيش أي frame. اللي بيقرا لازم يتعامل مع `None` في الأول.
- `self._frame_id = 0`: عدّاد بيزيد مع كل frame جديد. بيخلّي اللي بيقرا يعرف "هل ده frame جديد ولا نفس اللي اتعالج قبل كده؟".
- `self._lock = threading.Lock()`: القفل اللي بيمنع الـ thread بتاع الكاميرا والبرنامج الرئيسي إنهم يلمسوا `_frame` و `_frame_id` في نفس اللحظة.
- `self._running = True`: علم (flag) الـ thread بيبص عليه عشان يعرف إمتى يقف.
- `threading.Thread(target=self._loop, daemon=True)`: بنعمل thread هيشغّل الدالة `_loop`. `daemon=True` معناها إن البرنامج لو خلص، مش هيستنى الـ thread ده (مايعلّقش البرنامج عند القفل).
- `self._thread.start()`: من هنا الـ thread بدأ يشتغل بالتوازي مع باقي البرنامج.

### الـ loop اللي بيقرا من الكاميرا: `_loop`

```python
    def _loop(self):
        while self._running:
            ok, frame = self.cap.read()
            if not ok:
                time.sleep(0.01)
                continue
            if self.mirror:
                frame = cv2.flip(frame, 1)
            with self._lock:
                self._frame = frame
                self._frame_id += 1
```

- `while self._running`: بيفضل يلف لحد ما `release()` تخلّي الـ flag بـ `False`.
- `ok, frame = self.cap.read()`: السطر ده **بيستنى** لحد ما الكاميرا تبعت الـ frame الجاي (حوالي 33ms على 30 FPS). الاستنا ده بيحصل هنا في الـ thread، مش في البرنامج الرئيسي — وده كل الفكرة.
- `if not ok: time.sleep(0.01); continue`: لو القراءة فشلت (مثلًا الكاميرا لسه بتصحى)، نستنى 10ms ونجرّب تاني. من غير الـ sleep كان الـ loop هيلف بسرعة جنونية وياكل الـ CPU.
- `if self.mirror: frame = cv2.flip(frame, 1)`: بنقلب الصورة يمين-شمال عشان تبقى زي المراية. الرقم `1` معناه "القلب حوالين المحور الرأسي". بنعملها هنا مرة واحدة، فكل اللي بعدنا (MediaPipe والرسم والتسجيل) بيشوف نفس الصورة المقلوبة.
- `with self._lock:`: بناخد القفل، ونحدّث الصورة والعدّاد **مع بعض**، وبعدين القفل بيتفك أوتوماتيك لما الـ block يخلص (حتى لو حصل error). كده مستحيل حد يقرا frame جديد مع id قديم.

### قراءة آخر frame: `read`

```python
    def read(self):
        """Return (frame_id, frame). frame_id lets callers skip frames they already processed."""
        with self._lock:
            return self._frame_id, self._frame
```

- الدالة دي **مابتستناش** الكاميرا خالص؛ بترجع آخر حاجة اتحفظت فورًا.
- بترجع `(frame_id, frame)`. الـ docstring بيوضح الفايدة: اللي بيقرا يقدر يقارن الـ id بآخر id شافه، ولو زي بعض يتخطاه بدل ما يشغّل MediaPipe على نفس الصورة مرتين.
- `with self._lock`: عشان ناخد الاتنين كـ "صورة لحظية" متسقة.

### القفل: `release`

```python
    def release(self):
        self._running = False
        self._thread.join(timeout=1.0)
        self.cap.release()
```

- `self._running = False`: بنقول للـ thread "اقف" في اللفة الجاية.
- `self._thread.join(timeout=1.0)`: بنستنى الـ thread يخلص، بحد أقصى ثانية واحدة (عشان لو `cap.read()` علقت، البرنامج مايعلقش للأبد).
- `self.cap.release()`: بنسيب الكاميرا عشان برامج تانية (أو تشغيل تاني للبرنامج) تقدر تفتحها.

### ملف مرتبط: `shinobi/__init__.py`

```python
"""SHINOBI AI — real-time hand-sign recognition with anime-style visual effects."""

import os

# Must be set before OpenCV opens a camera: without it the Windows Media Foundation
# backend takes ~15 s to open the webcam. (Measured on this laptop: 14.4 s -> 0.6 s.)
os.environ.setdefault("OPENCV_VIDEOIO_MSMF_ENABLE_HW_TRANSFORMS", "0")
```

- الملف ده بيتنفذ أوتوماتيك أول ما أي كود يعمل `import` لأي حاجة من `shinobi` (زي `from shinobi import config`).
- `os.environ.setdefault(...)`: بيحط environment variable اسمه `OPENCV_VIDEOIO_MSMF_ENABLE_HW_TRANSFORMS` بقيمة `"0"`، **إلا لو** كان متحدد قبل كده (ده معنى `setdefault`)، فلو حد عايز يجرّب قيمة تانية من بره يقدر.
- التعليق بيوضح السبب والقياس: من غيره MSMF بياخد ~15 ثانية عشان يفتح الكاميرا؛ معاه 0.6 ثانية بس.

## 3. مفاهيم مهمة

### أ) ليه thread منفصل للكاميرا؟

من غير thread، الـ loop الرئيسي كان هيبقى كده:

```
read (يستنى ~33ms) → MediaPipe (~20ms) → effects (~10ms) → عرض → read ...
```

كل خطوة بتستنى اللي قبلها، فالوقت بيتجمع والـ FPS بيقل. وكمان OpenCV بيحتفظ بـ buffer صغير من الـ frames، فلو إحنا أبطأ من الكاميرا هناخد frames **قديمة** متخزنة، والصورة هتبان متأخرة عن الحركة الحقيقية (lag).

مع الـ thread:

```
Thread الكاميرا:   read ─ read ─ read ─ read ─ read ─ read ─►   (بيفرّغ الكاميرا باستمرار)
                     │      │      │      │      │
                     ▼      ▼      ▼      ▼      ▼
                  [ آخر frame + frame_id ]   ← متغير واحد محمي بـ lock
                            ▲             ▲
البرنامج الرئيسي:     read() فوري ─ معالجة ─ read() فوري ─ معالجة ─►
```

البرنامج الرئيسي مابيستناش الكاميرا خالص، ودايمًا بياخد **أحدث** صورة.

### ب) نمط "آخر frame بس" (latest frame pattern)

ممكن نسأل: ليه مش بنحط الـ frames في queue ونعالجهم كلهم؟ لأن في التطبيقات الـ real-time المهم هو **دلوقتي**. لو المعالجة أبطأ من الكاميرا، الـ queue هتكبر ويفضل التأخير يزيد. إحنا عن قصد **بنرمي** الـ frames اللي مالحقناش نعالجها، وبنفضّل نتعامل مع آخر واحد بس.

### ج) الـ lock وليه لازم

الـ thread بتاع الكاميرا بيكتب، والبرنامج الرئيسي بيقرا، في نفس الوقت. من غير lock ممكن يحصل التسلسل ده:

```
Thread الكاميرا:  self._frame = frame_جديد    ← اتكتب
البرنامج الرئيسي:          read() → (id القديم, frame الجديد)   ← مش متسقين!
Thread الكاميرا:  self._frame_id += 1         ← اتأخر خطوة
```

الـ lock بيضمن إن "الكتابة" (السطرين مع بعض) و"القراءة" ماحدش فيهم يتقطع في النص. `with self._lock:` بتاخد القفل في الأول وبتسيبه في الآخر أوتوماتيك.

### د) الـ `frame_id`

بما إن `read()` مابتستناش، ممكن نناديها مرتين قبل ما الكاميرا تبعت frame جديد. لو ماعندناش `frame_id` هنشغّل MediaPipe على نفس الصورة تاني ونضيّع وقت. في `collect_data.py` مثلًا:

```python
frame_id, frame = camera.read()
if frame is None or frame_id == last_id:
    continue
```

### هـ) MSMF ضد DirectShow، والـ environment variable

Windows عنده أكتر من "backend" للكلام مع الكاميرا. اتقاسوا على اللابتوب ده:

| الـ backend | FPS على 720p | ملاحظة |
|---|---|---|
| MSMF (`cv2.CAP_MSMF`) | **30** | الأحسن، بس بطيء جدًا في الفتح من غير الإعداد |
| DirectShow (`cv2.CAP_DSHOW`) | ~9.5 | بيفتح بسرعة، بس بطيء جدًا في القراءة |

مشكلة MSMF إن فتح الكاميرا كان بياخد **14.4 ثانية** بسبب حاجة اسمها "hardware transforms". لما بنقفلها بالـ environment variable `OPENCV_VIDEOIO_MSMF_ENABLE_HW_TRANSFORMS=0` الفتح بقى **0.6 ثانية**.

ليه اتحطت في `shinobi/__init__.py` بالذات؟ لأن OpenCV بيقرا المتغير ده لحظة فتح الكاميرا، فلازم يكون متحدد **قبلها**. و `__init__.py` بيتنفذ تلقائي أول ما أي ملف يعمل `import` من `shinobi`، يعني قبل ما أي `Camera()` تتعمل، من غير ما نفتكر نحطه في كل script.

### و) ليه فحص الـ frame الأسود؟

على اللابتوب ده كان فيه برنامج **Camo** (بيحوّل الموبايل لكاميرا ويب) عامل كاميرا وهمية على **index 0**. لما الموبايل مش متوصّل، الكاميرا دي بتتفتح عادي (`isOpened()` بترجع `True`) بس بتبعت أسود. الكاميرا الحقيقية كانت على **index 1**. لو كنا فتحنا 0 وخلاص، البرنامج كان هيشتغل بشاشة سودا ومايلاقيش إيد أبدًا. عشان كده `find_camera` بتدور على أول كاميرا **فيها صورة فعلًا**.

### ز) الـ mirror

`cv2.flip(frame, 1)` بتقلب الصورة أفقيًا:

```
الأصلية (زي ما الكاميرا شايفانا):     بعد flip(frame, 1):
   [ A  B  C ]                            [ C  B  A ]
```

- القيمة `1` = أفقي (يمين↔شمال)، `0` = رأسي (فوق↔تحت)، `-1` = الاتنين.
- **ليه؟** عشان الشاشة تبقى زي المراية: لو رفعنا الإيد اليمين تطلع على يمين الشاشة. ده طبيعي جدًا للمستخدم.
- كمان MediaPipe بيفترض إن الصورة جاية من كاميرا selfie مقلوبة، فالـ handedness (Left/Right) بيطلع صح مع الصورة المقلوبة.

## 4. لو غيّرنا ... هيحصل إيه؟

1. **لو غيّرنا `cv2.CAP_MSMF` لـ `cv2.CAP_DSHOW`:** الكاميرا هتفتح بسرعة، بس الـ FPS هينزل لحوالي 9.5، وكل حاجة هتبان متقطعة والـ gestures هتتعرف أبطأ.
2. **لو شلنا السطر اللي في `shinobi/__init__.py`:** البرنامج هيفضل حوالي 14 ثانية قبل ما الكاميرا تفتح. مفيش error، بس هنفتكر إن البرنامج عالق.
3. **لو شلنا الـ thread وقرينا `cap.read()` جوه الـ loop الرئيسي:** الـ FPS هيقل لأن الاستنا والمعالجة بقوا ورا بعض، وهيظهر lag واضح بين حركة الإيد وظهورها على الشاشة.
4. **لو شلنا الـ `with self._lock`:** غالبًا هيشتغل "عادي" معظم الوقت، وده الخطير: الـ bugs بتاعة الـ threads بتظهر نادرًا وبشكل عشوائي (مثلًا frame بيتعالج مرتين أو يتخطّى). الـ lock بيمنعها من الأساس.
5. **لو خلينا `MIRROR = False`:** الصورة هتبقى زي الصورة الفوتوغرافية مش زي المراية (نرفع الإيد اليمين تطلع شمال)، وكلمة Left/Right اللي MediaPipe بيطلعها هتتعكس. كمان لو الداتا اتسجلت مقلوبة والتشغيل مش مقلوب، الـ features هتختلف (الـ mirror augmentation في التدريب بيقلل المشكلة دي بس الأفضل نفس الإعداد في الاتنين).
6. **لو غيّرنا `frame.mean() > 5` لـ `> 60`:** في أوضة ضلمة شوية، الكاميرا الحقيقية ممكن تترفض كأنها سودا، والبرنامج يطلع `RuntimeError: No working camera found`.

## 5. أسئلة مراجعة

1. ليه بنقرا من الكاميرا في thread منفصل؟
2. إيه فايدة `frame_id`؟
3. ليه بنحدّث `_frame` و `_frame_id` جوه نفس الـ `with self._lock`؟
4. ليه بنستخدم MSMF مش DirectShow؟ وإيه دور `OPENCV_VIDEOIO_MSMF_ENABLE_HW_TRANSFORMS`؟
5. ليه المتغير ده متحدد في `shinobi/__init__.py` تحديدًا؟
6. إيه المشكلة اللي `_is_real` بتحلها؟ وليه بتجرّب 10 frames مش frame واحد؟
7. `daemon=True` بتعمل إيه؟

<details>
<summary>الإجابات</summary>

1. عشان `cap.read()` بتستنى الكاميرا (~33ms). في thread لوحده الاستنا ده مابيوقفش المعالجة، والبرنامج دايمًا ياخد أحدث frame من غير lag.
2. بيخلّي البرنامج يعرف إن الـ frame ده جديد ولا اتعالج قبل كده، فمايشغّلش MediaPipe على نفس الصورة مرتين.
3. عشان يتغيّروا "مع بعض" كخطوة واحدة؛ اللي بيقرا مايشوفش أبدًا frame جديد بـ id قديم أو العكس.
4. MSMF بيدّي 30 FPS على 720p مقابل ~9.5 لـ DirectShow. المتغير بيقفل الـ hardware transforms فوقت الفتح بينزل من 14.4 ثانية لـ 0.6.
5. لأن لازم يتحدد قبل فتح الكاميرا، و `__init__.py` بيتنفذ تلقائي مع أول `import` من الـ package.
6. الكاميرا الوهمية (Camo على index 0) بتتفتح بس بتبعت أسود. بنجرّب 10 لأن أول frames من الكاميرا الحقيقية ممكن تكون سودا وهي لسه بتظبط الإضاءة.
7. البرنامج لما يخلص مايستناش الـ thread ده، فمايعلقش عند الخروج.

</details>

---

# الجزء التاني: `shinobi/hands.py`

## 1. الملف ده بيعمل إيه؟

`hands.py` بياخد الـ frame من الكاميرا ويدّيه لموديل **MediaPipe Hand Landmarker**، وبيرجّع لكل إيد **21 نقطة** (landmarks) بتلات أنواع إحداثيات. بيرتّب الإيدين من الشمال لليمين على الشاشة، وفيه كمان دالة بترسم الهيكل العظمي للإيد على الصورة.

مكانه في السلسلة: camera → **hands** → features → classifier → controller → effects → screen. (وكمان `tracking.py` بيستخدم مخرجاته عشان يعرف الـ effect يتحط فين.)

## 2. الكود سطر بسطر

### الـ docstring والـ imports

```python
"""MediaPipe Hand Landmarker wrapper (Tasks API, mediapipe >= 1.0)."""

import time
from dataclasses import dataclass

import cv2
import mediapipe as mp
import numpy as np
from mediapipe.tasks.python import BaseOptions, vision

from shinobi import config
```

- الـ docstring بيقول إن الملف ده "غلاف" (wrapper) حوالين Hand Landmarker باستخدام الـ **Tasks API** (الطريقة الجديدة، من أول mediapipe 1.0).
- `time`: للـ timestamps اللي MediaPipe محتاجها.
- `dataclass`: عشان نعمل كلاس `Hand` بسهولة.
- `cv2`: لتحويل الألوان وللرسم.
- `mediapipe as mp`: محتاجينها عشان `mp.Image`.
- `numpy as np`: كل الإحداثيات بنحطها في NumPy arrays عشان الحسابات تبقى سريعة.
- `BaseOptions, vision`: الحاجات الأساسية من الـ Tasks API: `BaseOptions` فيها مسار الموديل، و `vision` فيها `HandLandmarker` وإعداداته.
- `config`: لمسار الموديل وعدد الإيدين والـ thresholds.

### أرقام النقط المهمة

```python
# Landmark indices (see docs/02_camera_and_hands.md for the full map)
WRIST, THUMB_TIP, INDEX_MCP, INDEX_TIP, MIDDLE_MCP, MIDDLE_TIP = 0, 4, 5, 8, 9, 12
RING_MCP, PINKY_MCP = 13, 17
FINGERTIPS = [4, 8, 12, 16, 20]
PALM = [0, 5, 9, 13, 17]
```

- بدل ما نكتب أرقام سحرية زي `px[9]` في الكود، بنديها أسماء: `WRIST = 0` (الرسغ)، `THUMB_TIP = 4` (طرف الإبهام)، `INDEX_MCP = 5` (مفصل السبابة مع الكف)، إلخ. الـ unpacking ده (`a, b = 1, 2`) بيحط كل قيمة في المتغير المقابل لها.
- `MCP` اختصار للمفصل اللي بين الصباع والكف (knuckle).
- `FINGERTIPS`: أطراف الـ 5 صوابع (كل صباع آخره رقم مضاعف 4).
- `PALM`: الرسغ + قواعد الـ 4 صوابع. دي نقط "ثابتة" نسبيًا في الكف، فمتوسطها مكان كويس لنص الكف.

### خطوط الهيكل العظمي

```python
CONNECTIONS = [
    (0, 1), (1, 2), (2, 3), (3, 4),          # thumb
    (0, 5), (5, 6), (6, 7), (7, 8),          # index
    (5, 9), (9, 10), (10, 11), (11, 12),     # middle
    (9, 13), (13, 14), (14, 15), (15, 16),   # ring
    (13, 17), (0, 17), (17, 18), (18, 19), (19, 20),  # pinky + palm
]
```

- كل tuple معناه "ارسم خط بين النقطة دي والنقطة دي". المجموع 21 خط.
- كل سطر صباع: الإبهام، السبابة، الوسطى، البنصر، الخنصر + خطوط الكف (5-9، 9-13، 13-17، 0-17).
- ده بيستخدمه `draw_hands` بس، للعرض.

### كلاس `Hand`

```python
@dataclass
class Hand:
    landmarks: np.ndarray   # (21, 3) normalized: x,y in 0..1 of the image, z relative depth
    world: np.ndarray       # (21, 3) metres, origin near the hand centre
    handedness: str         # "Left" / "Right" (correct for a mirrored image)
    score: float
    px: np.ndarray          # (21, 2) pixel coordinates in the frame
```

- `@dataclass`: بيكتب لنا `__init__` و `__repr__` أوتوماتيك من الحقول، فبنقدر نعمل `Hand(norm, wld, "Right", 0.98, px)` من غير ما نكتب constructor.
- `landmarks`: شكله `(21, 3)` — الإحداثيات "الـ normalized": x و y من 0 لـ 1 بالنسبة لعرض وطول الصورة، و z عمق نسبي.
- `world`: شكله `(21, 3)` — إحداثيات بالمتر في العالم الحقيقي، نقطة الأصل قريبة من نص الإيد.
- `handedness`: `"Left"` أو `"Right"`. التعليق بيوضح إنها صح لأن الصورة مقلوبة (mirror).
- `score`: ثقة الموديل في الـ handedness.
- `px`: شكله `(21, 2)` — إحداثيات بالبكسل جوه الـ frame، جاهزة للرسم.
- الـ type hints (`: np.ndarray`) للتوضيح بس؛ Python مابيتحققش منها.

### خصائص محسوبة: `palm_center` و `size_px`

```python
    @property
    def palm_center(self):
        return self.px[PALM].mean(axis=0)

    @property
    def size_px(self):
        """Wrist -> middle-finger knuckle distance: a scale reference for effects."""
        return float(np.linalg.norm(self.px[MIDDLE_MCP] - self.px[WRIST]))
```

- `@property`: بيخلّي الدالة تتنادى من غير أقواس، كأنها متغير: `hand.palm_center` مش `hand.palm_center()`. القيمة بتتحسب كل مرة بتتطلب.
- `self.px[PALM]`: NumPy بيقبل list من الأرقام كـ index ("fancy indexing")، فبيرجّع الـ 5 نقط بتوع الكف، شكلهم `(5, 2)`.
- `.mean(axis=0)`: متوسط على المحور الأول (الصفوف) → نقطة واحدة `(x, y)` = نص الكف. ده المكان اللي الـ Rasengan مثلًا بيتحط فيه.
- `size_px`: المسافة بالبكسل من الرسغ (0) لقاعدة الوسطى (9). `np.linalg.norm` بتحسب طول الـ vector (فيثاغورث). لو الإيد قريبة من الكاميرا الرقم يكبر، فالـ effects بتستخدمه عشان حجمها يتناسب مع الإيد.
- `float(...)`: بنحوّل من NumPy float لـ Python float عادي.
- ليه المسافة دي بالذات؟ لأن الرسغ وقاعدة الوسطى مابيتغيروش مع ثني الصوابع، فالقياس ثابت مهما الإيد اتقفلت أو اتفتحت.

### `HandTracker`: إعداد الموديل

```python
class HandTracker:
    def __init__(self):
        options = vision.HandLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=str(config.HAND_MODEL_PATH)),
            running_mode=vision.RunningMode.VIDEO,
            num_hands=config.MAX_HANDS,
            min_hand_detection_confidence=config.MIN_DETECTION_CONFIDENCE,
            min_hand_presence_confidence=config.MIN_PRESENCE_CONFIDENCE,
            min_tracking_confidence=config.MIN_TRACKING_CONFIDENCE,
        )
        self._landmarker = vision.HandLandmarker.create_from_options(options)
        self._last_ts = -1
```

- `HandLandmarkerOptions(...)`: كل إعدادات الموديل في object واحد.
- `model_asset_path=str(config.HAND_MODEL_PATH)`: مسار ملف الموديل `models/hand_landmarker.task`. بنحوّله لـ `str` لأن `config` بيستخدم `Path`، و MediaPipe عايز نص.
- `running_mode=vision.RunningMode.VIDEO`: بنقول للموديل إن الصور جاية ورا بعض من فيديو، فيقدر يستخدم الـ tracking بين الـ frames (هنشرحه تحت).
- `num_hands=config.MAX_HANDS`: أقصى عدد إيدين = 2 (الـ clone_seal محتاج الإيدين).
- `min_hand_detection_confidence` (0.5): أقل ثقة عشان نعتبر إن فيه كف اتلقى في الصورة.
- `min_hand_presence_confidence` (0.5): أقل ثقة إن الإيد لسه موجودة؛ لو قلّت عنها الموديل بيرجع يدوّر من الأول.
- `min_tracking_confidence` (0.5): أقل ثقة عشان نكمّل tracking من الـ frame اللي فات بدل detection جديد.
- `create_from_options(options)`: بيحمّل الموديل في الذاكرة (بنعملها مرة واحدة بس لأنها تقيلة).
- `self._last_ts = -1`: آخر timestamp بعتناه. بيبدأ بـ -1 عشان أول timestamp أكيد يبقى أكبر منه.

### الـ timestamp: `_timestamp`

```python
    def _timestamp(self):
        # VIDEO mode requires strictly increasing timestamps in milliseconds.
        ts = int(time.monotonic() * 1000)
        self._last_ts = max(ts, self._last_ts + 1)
        return self._last_ts
```

- التعليق بيقول الشرط: في VIDEO mode لازم كل timestamp يبقى **أكبر تمامًا** من اللي قبله، وبالـ milliseconds.
- `time.monotonic()`: ساعة بتزيد بس، عمرها ماترجع لورا (مش زي `time.time()` اللي ممكن تتغير لو ساعة الجهاز اتظبطت). بنضربها في 1000 ونحوّلها `int` عشان تبقى milliseconds.
- `max(ts, self._last_ts + 1)`: لو ناديناها مرتين في نفس الـ millisecond، الوقت هيبقى زي اللي قبله وMediaPipe هيطلع error. الـ `max` بيضمن إنه على الأقل أكبر بـ 1.
- بنحفظه في `self._last_ts` ونرجّعه.

### `detect`: تجهيز الصورة وتشغيل الموديل

```python
    def detect(self, frame_bgr):
        """Return a list of Hand objects sorted left-to-right on screen."""
        h, w = frame_bgr.shape[:2]
        rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        result = self._landmarker.detect_for_video(image, self._timestamp())
```

- اسم الـ parameter `frame_bgr` بيفكّرنا إن OpenCV بيخزن الألوان بترتيب **BGR** (أزرق، أخضر، أحمر) مش RGB.
- `h, w = frame_bgr.shape[:2]`: الـ shape `(height, width, 3)`، فبناخد أول اتنين. محتاجينهم بعدين عشان نحوّل لبكسلات.
- `cv2.cvtColor(..., cv2.COLOR_BGR2RGB)`: بنعكس ترتيب الألوان لأن الموديل اتدرب على صور RGB.
- `mp.Image(...)`: بنلف الـ array في نوع الصورة اللي MediaPipe بيفهمه. `SRGB` = 3 قنوات RGB.
- `detect_for_video(image, self._timestamp())`: بيشغّل الموديل ويرجّع `result` فيه 3 lists: `hand_landmarks`، `hand_world_landmarks`، `handedness` (عنصر لكل إيد اتلقت).

### `detect`: تحويل النتيجة لـ `Hand` objects

```python
        hands = []
        for lms, world, handed in zip(result.hand_landmarks, result.hand_world_landmarks,
                                      result.handedness):
            norm = np.array([[p.x, p.y, p.z] for p in lms], dtype=np.float32)
            wld = np.array([[p.x, p.y, p.z] for p in world], dtype=np.float32)
            px = norm[:, :2] * np.array([w, h], dtype=np.float32)
            hands.append(Hand(norm, wld, handed[0].category_name, handed[0].score, px))
```

- `zip(...)`: بيمشي على الـ 3 lists مع بعض، فكل لفة فيها كل البيانات بتاعة إيد واحدة.
- `norm = np.array([[p.x, p.y, p.z] for p in lms], ...)`: MediaPipe بيرجّع كل نقطة كـ object فيه `.x .y .z`. بنحوّل الـ 21 نقطة لـ array شكله `(21, 3)`. `float32` كفاية دقة وأخف من `float64`.
- `wld = ...`: نفس الكلام للـ world landmarks (بالمتر).
- `px = norm[:, :2] * np.array([w, h], ...)`: بناخد x و y بس (`[:, :2]`) ونضرب x في العرض و y في الطول. الـ NumPy broadcasting بيضرب كل صف `(x, y)` في `(w, h)`. مثال: `(0.5, 0.25)` في frame `1280×720` → `(640, 180)`.
- `handed[0].category_name`: الـ handedness عبارة عن list من الاحتمالات؛ أول عنصر هو الأعلى، و `category_name` هي `"Left"` أو `"Right"`، و `.score` الثقة.
- `hands.append(Hand(...))`: بنجمّع كل حاجة في `Hand` واحد.

### الترتيب من الشمال لليمين

```python
        # Order by wrist x, not by handedness: handedness flips when hands overlap.
        hands.sort(key=lambda hand: hand.landmarks[WRIST, 0])
        return hands
```

- التعليق بيوضح القرار: بنرتّب حسب مكان الرسغ على الشاشة، مش حسب Left/Right، لأن الـ handedness ممكن "تتقلب" لما الإيدين يتداخلوا.
- `key=lambda hand: hand.landmarks[WRIST, 0]`: الترتيب حسب x بتاع الرسغ (normalized). الأصغر = أقرب للشمال. فـ `hands[0]` دايمًا الإيد اللي على شمال الشاشة.
- بنرجّع list ممكن تكون فاضية (مافيش إيد)، أو فيها 1 أو 2.

### `close`

```python
    def close(self):
        self._landmarker.close()
```

- بيقفل الموديل ويحرر الذاكرة والـ resources بتاعته. بنناديها في الـ `finally` في آخر البرنامج.

### الرسم: `draw_hands`

```python
def draw_hands(frame, hands):
    for hand in hands:
        pts = hand.px.astype(int)
        for a, b in CONNECTIONS:
            cv2.line(frame, tuple(pts[a]), tuple(pts[b]), (255, 255, 255), 2, cv2.LINE_AA)
```

- `hand.px.astype(int)`: دوال الرسم في OpenCV عايزة أرقام صحيحة (بكسل 640 مش 640.37).
- `for a, b in CONNECTIONS`: لكل خط في الهيكل...
- `cv2.line(frame, نقطة1, نقطة2, لون, سُمك, نوع)`: بيرسم خط أبيض `(255,255,255)` سُمكه 2. `tuple(...)` لأن OpenCV عايز النقطة كـ tuple. `cv2.LINE_AA` = anti-aliasing، الخط بيبقى ناعم من غير تشريش.

```python
        for i, p in enumerate(pts):
            color = (0, 200, 255) if i in FINGERTIPS else (0, 120, 255)
            cv2.circle(frame, tuple(p), 4, color, -1, cv2.LINE_AA)
        x, y = pts[WRIST]
        cv2.putText(frame, hand.handedness, (x - 20, y + 25), cv2.FONT_HERSHEY_SIMPLEX,
                    0.6, (255, 255, 255), 2, cv2.LINE_AA)
    return frame
```

- `enumerate(pts)`: بيدّينا رقم النقطة `i` وإحداثياتها `p`.
- اللون: أطراف الصوابع أصفر-برتقالي `(0, 200, 255)` وباقي النقط برتقالي أغمق `(0, 120, 255)`. (الترتيب هنا BGR، فـ 255 في الآخر = أحمر.)
- `cv2.circle(frame, مركز, 4, color, -1, ...)`: دايرة نصف قطرها 4. السُمك `-1` معناه "املاها".
- `x, y = pts[WRIST]`: مكان الرسغ.
- `cv2.putText(...)`: بيكتب "Left" أو "Right" تحت الرسغ بشوية (`x - 20, y + 25`)، بخط حجمه 0.6 وسُمك 2.
- `return frame`: الدالة بترسم على نفس الـ array وبترجّعه كمان، عشان نقدر نكتب `view = draw_hands(frame.copy(), hands)` في سطر واحد.

## 3. مفاهيم مهمة

### أ) MediaPipe Tasks API (والـ API القديم اللي اتشال)

معظم الشروحات على النت بتكتب:

```python
mp.solutions.hands.Hands(...)   # الطريقة القديمة
```

الطريقة دي **اتشالت** في mediapipe الجديد (المشروع مثبّت على `mediapipe==1.2.0`)، فالكود ده مش هيشتغل. الطريقة الجديدة (Tasks API) دايمًا بنفس الخطوات:

```
1) Options    → HandLandmarkerOptions(base_options=..., running_mode=..., ...)
2) Create     → HandLandmarker.create_from_options(options)
3) Run        → detect / detect_for_video / detect_async
4) Close      → close()
```

والموديل بقى ملف منفصل (`hand_landmarker.task`) لازم يتنزّل في `models/`.

جوه الموديل فيه مرحلتين: **palm detector** بيلاقي الكف في الصورة كلها، و **landmark model** بيطلع الـ 21 نقطة جوه المربع ده. في الـ VIDEO mode، لو الإيد اتلقت في الـ frame اللي فات، الموديل بيكمّل tracking ومش لازم يشغّل الـ palm detector تاني، وده أسرع وأثبت.

### ب) الـ running modes والـ timestamps

| الـ mode | الدالة | الاستخدام |
|---|---|---|
| `IMAGE` | `detect(image)` | صور منفصلة مالهاش علاقة ببعض |
| `VIDEO` | `detect_for_video(image, ts)` | frames ورا بعض، synchronous (بيرجّع النتيجة فورًا) — **ده اللي بنستخدمه** |
| `LIVE_STREAM` | `detect_async(image, ts)` | asynchronous، النتيجة بترجع في callback — أعقد |

اخترنا VIDEO لأنه بيستفيد من الـ tracking، وفي نفس الوقت النتيجة بترجع في نفس السطر فالكود بسيط. الشرط الوحيد: الـ timestamp لازم يزيد **دايمًا**:

```
ts:  1000 → 1033 → 1066 → 1066  ✗ error (مش أكبر)
ts:  1000 → 1033 → 1066 → 1067  ✓ (ده اللي max(ts, last+1) بيعمله)
```

### ج) خريطة الـ 21 نقطة

```
                 8      12
                 |       |      16
                 7      11       |      20
                 |       |      15       |
          4      6      10       |      19
          |      |       |      14       |
          3      5 ----- 9 ---- 13      18
           \     |                \      |
            2    |                 +--- 17
             \   |                      /
              1  |                    /
               \ |                  /
                 0 ----------------
              WRIST (الرسغ)
```

(الخطوط هنا هي نفس الـ `CONNECTIONS` اللي في الكود.)

| الصباع | قاعدة (MCP) | مفصل 1 | مفصل 2 | الطرف (TIP) |
|---|---|---|---|---|
| الإبهام (thumb) | 1 (CMC) | 2 | 3 | **4** |
| السبابة (index) | 5 | 6 | 7 | **8** |
| الوسطى (middle) | 9 | 10 | 11 | **12** |
| البنصر (ring) | 13 | 14 | 15 | **16** |
| الخنصر (pinky) | 17 | 18 | 19 | **20** |

قاعدة سهلة للحفظ: الأطراف = مضاعفات 4، والقواعد = الطرف − 3.

### د) تلات أنواع إحداثيات

| النوع | الحقل | الوحدة | بنستخدمه في |
|---|---|---|---|
| normalized | `landmarks` | x, y من 0 لـ 1 (نسبة من الصورة)، z عمق نسبي (سالب = أقرب للكاميرا من الرسغ) | ترتيب الإيدين، والـ features اللي بين الإيدين |
| world | `world` | متر، الأصل عند نص الإيد تقريبًا | الـ features بتاعة كل إيد (شكل الإيد الحقيقي) |
| pixel | `px` | بكسل في الـ frame | الرسم والـ effects والـ tracking |

مثال لنفس النقطة في frame `1280×720`:

```
normalized: (0.50, 0.25, -0.03)
pixel:      (640, 180)                    ← 0.50×1280 , 0.25×720
world:      (0.012, -0.045, 0.008) متر    ← مستقل تمامًا عن مكان الإيد في الصورة
```

الـ world مفيد للتعرف على الشكل لأنه مش بيتأثر بمكان الإيد في الصورة ولا (تقريبًا) ببعدها عن الكاميرا. الـ pixel مفيد للرسم لأنه بيقول "فين على الشاشة".

### هـ) الـ handedness، وليه بنرتّب بالـ x

MediaPipe بيقول على كل إيد "Left" أو "Right". المشكلة: ده تخمين من شكل الإيد، ولما الإيدين يتداخلوا (زي في الـ clone_seal اللي الصوابع فيه متقاطعة) أو لما نوري ضهر الإيد، التخمين ممكن يتقلب من frame للتاني. لو كنا رتبنا بالـ handedness، الإيدين كانوا هيتبدلوا في الـ feature vector فجأة والموديل يتلخبط.

مكان الرسغ على الشاشة أثبت بكتير: الإيد اللي على الشمال فاضلة على الشمال. عشان كده:
- `hands[0]` = الإيد اللي على شمال الشاشة، و `hands[1]` = اللي على اليمين.
- ونفس القاعدة بالظبط متطبقة في `features.order_slots` عشان التدريب والتشغيل يبقوا متطابقين.

### و) `@dataclass` و `@property`

`@dataclass` بيوفّر علينا كتابة:

```python
def __init__(self, landmarks, world, handedness, score, px):
    self.landmarks = landmarks
    self.world = world
    ...
```

و `@property` بيخلّي قيمة محسوبة تتقرا زي attribute:

```python
hand.palm_center   # array([612.4, 395.0])  — من غير أقواس
hand.size_px       # 87.3
```

الفايدة: مابنخزنش القيمة (فمستحيل تبقى قديمة)، وبتتحسب بس لما حد يحتاجها.

## 4. لو غيّرنا ... هيحصل إيه؟

1. **لو `MAX_HANDS = 1`:** الموديل هيلاقي إيد واحدة بس، فالـ clone_seal (اللي محتاج الإيدين) مستحيل يتعرف، والـ features بتاعة الإيد التانية هتبقى أصفار دايمًا.
2. **لو رفعنا `MIN_DETECTION_CONFIDENCE` لـ 0.9:** الإيد مش هتتلقى إلا لو واضحة جدًا؛ في الإضاءة الضعيفة أو الحركة السريعة هتختفي كتير. ولو نزّلناه لـ 0.1: هيبدأ يشوف "إيدين" في حاجات مش إيد (false positives).
3. **لو استخدمنا `int(time.time() * 1000)` من غير الـ `max`:** غالبًا هيشتغل، لكن لو اتنادى مرتين في نفس الـ ms أو ساعة الجهاز اتظبطت لورا، MediaPipe هيرمي error إن الـ timestamp مش بيزيد.
4. **لو بعتنا `frame_bgr` على طول من غير `cvtColor`:** مش هيحصل crash، بس الأحمر والأزرق هيتبدلوا، والإيد هتبقى لونها غريب للموديل، فالدقة هتقل.
5. **لو رتبنا بالـ handedness بدل الـ x:** في الـ gestures اللي الإيدين فيها متداخلين، الـ slots هتتبدل من frame للتاني، والـ classifier هيدّي نتايج مهزوزة.
6. **لو غيّرنا `RunningMode.VIDEO` لـ `IMAGE` (واستخدمنا `detect`):** كل frame هيتعامل كصورة لوحدها، فالـ palm detector هيشتغل كل مرة: أبطأ والنقط هتترعش أكتر.

## 5. أسئلة مراجعة

1. إيه الفرق بين `landmarks` و `world` و `px`؟ وكل واحد بيُستخدم في إيه؟
2. ليه الـ timestamp لازم يزيد دايمًا؟ وإزاي الكود بيضمن ده؟
3. ليه بنحوّل الصورة من BGR لـ RGB؟
4. ليه بنرتّب الإيدين بـ x الرسغ مش بالـ handedness؟
5. `size_px` بيقيس إيه، وليه اخترنا النقطتين دول؟
6. إيه رقم طرف السبابة؟ ورقم قاعدة الخنصر؟
7. إيه الفرق بين `mp.solutions.hands` والـ Tasks API؟

<details>
<summary>الإجابات</summary>

1. `landmarks`: نسبة من الصورة (0..1) — لترتيب الإيدين والـ features بين الإيدين. `world`: بالمتر حوالين نص الإيد — لـ features شكل الإيد. `px`: بكسلات — للرسم والـ effects.
2. لأن الـ VIDEO mode بيعتمد على ترتيب الـ frames في الـ tracking وبيرفض أي timestamp مش أكبر من اللي قبله. الكود بيستخدم `time.monotonic()` (مابترجعش لورا) و `max(ts, last + 1)`.
3. OpenCV بيخزن BGR، والموديل متدرب على RGB.
4. الـ handedness ممكن يتقلب لما الإيدين يتداخلوا، لكن مكان الإيد على الشاشة ثابت، فالـ slots بتفضل ثابتة.
5. المسافة بالبكسل من الرسغ (0) لقاعدة الوسطى (9). النقطتين دول مابيتحركوش مع ثني الصوابع، فالقياس بيعبّر عن حجم الإيد/بُعدها بس.
6. طرف السبابة 8، قاعدة الخنصر 17.
7. `mp.solutions` هو الـ API القديم واتشال في النسخ الجديدة (المشروع على 1.2.0). الـ Tasks API: options → create_from_options → detect_for_video → close، والموديل ملف `.task` منفصل.

</details>
