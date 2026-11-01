# 09 — Shadow Clone

[⬅ الفهرس](00_index.md)

---

ده أصعب effect في المشروع. الفكرة: لما نعمل الـ clone seal، يطلع **نسختين مننا** على الشمال واليمين وسط سحابة دخان، وبيتحركوا زينا بالظبط بس متأخرين شوية، وإحنا نفضل قدامهم.

> **تحديث: النسخ بقوا 10** (11 شخص على الشاشة معانا). الشرح سطر سطر اللي تحت اتكتب لنسخة الـ 2 clones. الفكرة نفسها ماتغيرتش: buffer للـ frames القديمة، وقص بالـ mask، وطبقة واحدة، والشخص الحقيقي قدام، والدخان. اللي اتغيّر:
>
> | الحاجة | قبل | دلوقتي |
> |---|---|---|
> | عدد النسخ | 2 | **10**: 5 شمال و 5 يمين (`CLONE_COUNT`) |
> | الإعدادات | `CLONE_DELAYS`، `CLONE_OFFSETS`، `CLONE_SCALE` (رقم واحد) | 4 lists، فيهم قيمة لكل نسخة: `CLONE_OFFSETS`، `CLONE_SCALES`، `CLONE_LIFTS` (قد إيه النسخة متعلّية)، `CLONE_DELAYS`. لو الأطوال مش زي بعض، الكود بيطلّع **error**، مش بيتجاهل نسخة بصمت |
> | الترتيب | النسختين جنب بعض | **3 صفوف** (2 قدام، 4 في النص، 4 ورا): الصف اللي ورا أصغر و**أعلى بوضوح**، وبيترسم الأول عشان اللي قدامه يغطّيه. ومكان كل صف في الفراغات اللي بين نسخ الصف اللي قدامه |
> | المكان | حوالين نص الشاشة | **بيتحسب كل frame حسب مكاننا (Adaptive):** كل صف بيتوزّع على المساحة الفاضية شمالنا ويميننا، **بنسبة المساحة** في كل ناحية (`plan_row`). لو إحنا في النص: 5 و5. لو على اليمين خالص: العشرة على الشمال، والعكس. لو المساحة مش كفاية، الصف بيصغر شوية (لحد 80%)، ولو برضه مش كفاية بيتوزّع على الصورة كلها، و`crowded` بتبقى True. **ولا نسخة بتتشال أبداً** |
> | لما نتحرك | — | النسخة اللي محتاجة تروح الناحية التانية مش بتعدّي من ورانا: **بتختفي وتظهر في سحابة دخان** في مكانها الجديد. واللي فاضلة في نفس الناحية بتتزحلق بنعومة (`GLIDE`). فيه "سماحية" (`SIDE_HYSTERESIS` و `ROOM_SLACK`) عشان النسخ ماتترعشش بين الناحيتين، وعرض الجسم بيتحسب ببطء عشان حركة الإيد ماتلخبطش التوزيع. اتجرّب على مشي من الشمال لليمين: كل نسخة غيّرت ناحيتها **مرة واحدة بس** |
> | القص | الصورة كلها بتتصغّر | المستطيل اللي حوالين الجسم بس، فالشغل أقل بكتير |
> | الحواف | زي ما الـ mask طالع | الـ mask بيتربّع وبيتقص بيكسل (`erode`)، فالحيطة اللي ورانا تبان أقل حوالين النسخة. والصفوف المتعلّية بتختفي بالتدريج من تحت (`BOTTOM_FADE`). ولو راسنا لامسة أعلى الكاميرا، راس كل نسخة بيختفي بالتدريج من فوق (`TOP_FADE`) بدل خط مقصوص |
> | الدخان | بالمقاس الكامل | بنص المقاس، لأنه ناعم أصلاً. و"poof" كل نسخة على قد حجمها |
>
> **مشكلة اتصلحت في `segmentation.py`:** الـ guided filter كان بياخد صورة الـ guide بقيم 0..255. في الأماكن السادة (حيطة، أو حيطة بيضا منوّرة زيادة) الـ variance بتبوظ في float32، والـ mask كان بيتملي **NaN**. اتقاس على 82 frame من 180 من تسجيلاتنا. دلوقتي الـ guide بقى 0..1، والـ NaN بقى صفر.
>
> **ليه الصفوف اللي ورا أعلى كده؟** النسخة الأصغر راسها بينزل لتحت. فلو الـ lift قليل، راس الصف اللي ورا بييجي ورا راس الصف اللي قدامه بالظبط. ده حصل فعلاً: بـ lifts `0 / 0.10 / 0.20`، الكود كان بيقول إن الـ 10 اترسموا، بس **2 منهم ماكانوش باينين خالص**. عشان كده فيه test (`test_all_ten_clone_heads_are_visible`) بيحسب قد إيه من راس كل نسخة باين فعلاً.
>
> **الرسم في thread لوحده (`CLONE_PARALLEL`):** طبقة النسخ والدخان (الجزء التقيل) بتترسم في thread تاني، في نفس الوقت اللي البرنامج بيتتبع فيه الإيد في الـ frame اللي بعده، وبتظهر بعدها بـ frame. النسخ أصلاً متأخرة عنّا من 0.25 لـ 1.6 ثانية، ففريم زيادة مش بيبان. أما قصّنا إحنا (عشان نفضل قدام) فدايماً بالـ mask بتاع الـ frame الحالي.
>
> **السرعة على اللابتوب ده** (فيديوهات حقيقية من تسجيلاتنا، البرنامج كله مع YOLOX، والشاحن متوصل، 3 مرات بالتبادل):
>
> | | الـ effect | FPS |
> |---|---|---|
> | 8 نسخ (القديم) | حوالي 32 ms | 9.5 / 9.7 / 9.6 |
> | 10 نسخ من غير thread | حوالي 35 ms | 9.4 / 9.5 / 9.7 |
> | **10 نسخ مع الـ thread** | **حوالي 23 ms** | **10.6 / 10.2 / 10.5** |
>
> التقل الأكبر لسه من تتبع الإيد (حوالي 65 ms وهو شغال جنب الـ segmentation وYOLOX).

عشان نعمل كده محتاجين حاجتين:

| الملف | دوره |
|---|---|
| `shinobi/segmentation.py` | يعرف **فين الشخص** في الصورة (mask) |
| `shinobi/effects/shadow_clone.py` | يستخدم الـ mask عشان يقص الشخص ويرسم منه نسخ، ويضيف الدخان |

قبل الملف ده، يُفضّل نكون فاهمين [08 — أساسيات الـ Effects](08_effects_basics.md) (الكلاس `Effect`، الـ `opacity`، والـ `Particles`).

---

# الجزء الأول: `segmentation.py`

## 1. الملف ده بيعمل إيه؟

**Person segmentation** = لكل pixel في الصورة، نجاوب على سؤال: "الـ pixel ده جزء من الشخص ولا من الخلفية؟". النتيجة اسمها **mask**: صورة رمادي بنفس مقاس الصورة، فيها 1 مكان الشخص و 0 مكان الخلفية.

```
  الصورة                      الـ mask
┌──────────────────┐        ┌──────────────────┐
│   ▒▒  (شخص)  ▒▒  │        │0 0 0 1 1 1 0 0 0 │
│ ▒▒▒ ╭───╮ ▒▒▒▒   │  ───►  │0 0 1 1 1 1 1 0 0 │
│ ▒▒  │   │ ▒▒▒▒   │        │0 1 1 1 1 1 1 1 0 │
│ ▒  ╱     ╲  ▒▒▒  │        │0 1 1 1 1 1 1 1 0 │
└──────────────────┘        └──────────────────┘
```

بنستخدم موديل MediaPipe اسمه **selfie segmenter** (`models/selfie_segmenter.tflite`). الملف ده بيلف الموديل في كلاس `PersonSegmenter` وبيضيف عليه 3 تحسينات: تنعيم عبر الزمن (عشان الـ mask مايرعشش)، guided filter (عشان الحواف تلزق في حواف الشخص الحقيقية)، ومنحنى contrast (عشان الحافة تبقى واضحة بس ناعمة).

مكانه في الـ pipeline: `main.py` بيشغّله **بس** لو الـ effect الحالي `needs_segmentation = True` (يعني الـ Shadow Clone)، وبيشغّله في thread تاني بالتوازي مع تتبع الإيد.

## 2. الكود سطر بسطر

```python
"""Person segmentation (MediaPipe selfie segmenter) with temporal smoothing and edge refinement."""
```

- الـ docstring: فصل الشخص (بموديل MediaPipe) مع تنعيم عبر الزمن (temporal smoothing) وتحسين الحواف (edge refinement).

```python
import time

import cv2
import mediapipe as mp
import numpy as np
from mediapipe.tasks.python import BaseOptions, vision

from shinobi import config
```

- `import time` عشان الـ timestamps اللي MediaPipe بيطلبها.
- `import cv2` تغيير الحجم، تحويل الألوان، والـ guided filter.
- `import mediapipe as mp` عشان `mp.Image` (الصيغة اللي MediaPipe بيقبلها).
- `import numpy as np` للحسابات على الـ mask.
- `from mediapipe.tasks.python import BaseOptions, vision` الـ **Tasks API** الجديد بتاع MediaPipe: `BaseOptions` (مكان ملف الموديل) و `vision` (فيه `ImageSegmenter`).
- `from shinobi import config` الإعدادات (مسار الموديل، `SEGMENT_WIDTH`، `MASK_SMOOTHING`).
- الترتيب ده (مكتبات Python الأساسية، بعدين المكتبات الخارجية، بعدين ملفات المشروع) هو العرف المتفق عليه في Python (PEP 8).

```python
class PersonSegmenter:
    def __init__(self, work_width=config.SEGMENT_WIDTH, smoothing=config.MASK_SMOOTHING):
        options = vision.ImageSegmenterOptions(
            base_options=BaseOptions(model_asset_path=str(config.SEGMENTER_MODEL_PATH)),
            running_mode=vision.RunningMode.VIDEO,
            output_confidence_masks=True,
            output_category_mask=False,
        )
```

- `work_width=config.SEGMENT_WIDTH` العرض اللي هنشغّل عليه الموديل (640). القيم الافتراضية جاية من `config` عشان نغيّرها من مكان واحد.
- `smoothing=config.MASK_SMOOTHING` وزن الـ mask الجديد في التنعيم (0.5).
- `options = vision.ImageSegmenterOptions(` بنجهّز إعدادات الموديل:
  - `base_options=BaseOptions(model_asset_path=str(...))` مسار ملف الموديل. `str(...)` لأن المسار في `config` من نوع `Path` وMediaPipe عايز نص.
  - `running_mode=vision.RunningMode.VIDEO` وضع الفيديو: MediaPipe بيعرف إن الصور متتالية، وبيطلب timestamp مع كل صورة (هنشرحه تحت).
  - `output_confidence_masks=True` عايزين **confidence mask**: لكل pixel رقم من 0 لـ 1 = "قد إيه الموديل متأكد إن ده شخص".
  - `output_category_mask=False` مش عايزين الـ category mask (اللي فيه 0 أو 1 بس من غير تدرج) لأنه بيدّي حواف مسننة، ولأن حسابه وقت ضايع.

```python
        self._segmenter = vision.ImageSegmenter.create_from_options(options)
        self.work_width = work_width
        self.smoothing = smoothing
        self._prev = None
        self._last_ts = -1
```

- `self._segmenter = ...create_from_options(options)` بنحمّل الموديل فعلًا. الـ `_` في أول الاسم عُرف في Python معناه "ده داخلي، مش المفروض يتستخدم من برّه الكلاس".
- `self.work_width` و `self.smoothing` نحفظ الإعدادات.
- `self._prev = None` الـ mask بتاع الـ frame اللي فات (للتنعيم). `None` = لسه مافيش.
- `self._last_ts = -1` آخر timestamp بعتناه للموديل.

```python
    def _timestamp(self):
        ts = int(time.monotonic() * 1000)
        self._last_ts = max(ts, self._last_ts + 1)
        return self._last_ts
```

- `_timestamp` بترجّع timestamp بالـ milliseconds لكل صورة.
- `time.monotonic()` ساعة بالثواني **عمرها ما بترجع لورا** (حتى لو حد غيّر ساعة الجهاز). `* 1000` للـ milliseconds، و`int` لأن MediaPipe عايز رقم صحيح.
- `self._last_ts = max(ts, self._last_ts + 1)` MediaPipe في وضع VIDEO **بيرفض** أي timestamp مش أكبر من اللي قبله (بيعمل error). لو اتنادت مرتين في نفس الـ millisecond، `ts` هيبقى زي اللي قبله، فبناخد `اللي قبله + 1` بدلًا منه. كده الأرقام بتزيد دايمًا.
- `return self._last_ts` نرجّعه.

```python
    def segment(self, frame_bgr):
        """Return (small_frame, mask): both at work resolution, mask float32 0..1 (1 = person)."""
        h, w = frame_bgr.shape[:2]
        small_h = int(h * self.work_width / w)
        small = cv2.resize(frame_bgr, (self.work_width, small_h), interpolation=cv2.INTER_AREA)
```

- `segment(self, frame_bgr)` الدالة الأساسية. الـ docstring: بترجّع `(small_frame, mask)`، الاتنين بالمقاس الصغير، والـ mask أرقام `float32` من 0 لـ 1.
- `h, w = frame_bgr.shape[:2]` مقاس الصورة الأصلية (720 × 1280).
- `small_h = int(h * self.work_width / w)` الطول الجديد مع الحفاظ على النسبة: `720 × 640 / 1280 = 360`.
- `small = cv2.resize(..., (self.work_width, small_h), interpolation=cv2.INTER_AREA)` نصغّر لـ 640×360. `INTER_AREA` الأحسن للتصغير.
- **ليه بنرجّع `small` كمان؟** لأن الـ Shadow Clone محتاج الصورة والـ mask **بنفس المقاس** عشان يقص الشخص منها. والمقاس الصغير بيوفر ذاكرة ووقت في كل حاجة بعد كده.

```python
        rgb = cv2.cvtColor(small, cv2.COLOR_BGR2RGB)
        result = self._segmenter.segment_for_video(
            mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb), self._timestamp())
        mask = result.confidence_masks[0].numpy_view().reshape(small_h, self.work_width).copy()
```

- `rgb = cv2.cvtColor(small, cv2.COLOR_BGR2RGB)` OpenCV بيخزّن BGR بس MediaPipe متدرب على RGB، فلازم نقلب ترتيب القنوات.
- `segment_for_video(mp.Image(...), self._timestamp())` نلف الصورة في `mp.Image` (`SRGB` = صورة ملونة RGB عادية) ونبعتها مع timestamp. ده النداء اللي بيشغّل الموديل فعلًا.
- `result.confidence_masks[0]` أول (والوحيد) confidence mask: احتمال إن كل pixel شخص.
- `.numpy_view()` نشوفه كـ NumPy array من غير نسخ.
- `.reshape(small_h, self.work_width)` نتأكد إن شكله `(360, 640)` (ممكن يرجع بـ dimension زيادة).
- `.copy()` **مهم**: `numpy_view` شباك على ذاكرة جوه MediaPipe، ممكن تتغير أو تتمسح في النداء الجاي. وإحنا هنخزّن الـ mask ده (في `_prev` وفي buffer الـ Shadow Clone)، فلازم نسخة خاصة بينا.

```python
        # 1) temporal EMA: removes flicker between frames
        if self._prev is not None and self._prev.shape == mask.shape:
            mask = self.smoothing * mask + (1 - self.smoothing) * self._prev
        self._prev = mask
```

- التعليق: الخطوة 1، تنعيم EMA عبر الزمن عشان نشيل الرعشة بين الـ frames.
- `if self._prev is not None and self._prev.shape == mask.shape:` لو عندنا mask قديم وبنفس المقاس (الشرط التاني حماية لو المقاس اتغير، مثلًا لو الكاميرا اتغيرت).
- `mask = self.smoothing * mask + (1 - self.smoothing) * self._prev` الـ EMA: الجديد = 0.5 × اللي الموديل قاله دلوقتي + 0.5 × اللي كان عندنا. كده لو الموديل غيّر رأيه فجأة في pixel لـ frame واحد، التغيير بيتقسم على النص.
- `self._prev = mask` نحفظ النتيجة المتنعّمة للمرة الجاية (قبل الـ guided filter، يعني الـ EMA شغال على الـ mask الخام المتنعّم بس).

```python
        # 2) guided filter: snaps the mask edge to real edges in the image (hair, shoulders).
        #    A gray guide is ~2x faster than a color one and looks almost the same.
        gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
        mask = cv2.ximgproc.guidedFilter(gray, mask, 6, 1e-3)
```

- التعليق: الخطوة 2، الـ guided filter بيلزّق حافة الـ mask في الحواف الحقيقية في الصورة (الشعر، الكتاف). والـ guide الرمادي أسرع مرتين تقريبًا من الملون وشكله تقريبًا نفس الحاجة.
- `gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)` نسخة رمادي من الصورة (قناة واحدة بدل 3).
- `cv2.ximgproc.guidedFilter(gray, mask, 6, 1e-3)` الـ guided filter (موجود في `ximgproc`، وده جزء من `opencv-contrib-python`):
  - `gray` الـ **guide**: الصورة اللي بنسترشد بيها.
  - `mask` الصورة اللي بننعّمها.
  - `6` نص قطر الشباك (شباك 13×13 pixel).
  - `1e-3` الـ `eps`: رقم صغير بيحدد قد إيه الفلتر يحترم الحواف. كل ما صغر، كل ما الفلتر لزق في الحواف أكتر.

```python
        # 3) soft contrast curve: crisp but feathered edge
        mask = np.clip((mask - 0.3) / 0.4, 0.0, 1.0)
        return small, mask.astype(np.float32)
```

- التعليق: الخطوة 3، منحنى contrast ناعم: حافة واضحة بس متدرجة (feathered).
- `(mask - 0.3) / 0.4` أي قيمة تحت 0.3 تبقى سالبة، وأي قيمة فوق 0.7 تبقى أكبر من 1، واللي في النص بيتمط.
- `np.clip(..., 0.0, 1.0)` نقفل القيم بين 0 و 1.
- `return small, mask.astype(np.float32)` نرجّع الصورة الصغيرة والـ mask. `astype(np.float32)` تضمن النوع (الـ guided filter أو الحسابات ممكن تطلّع نوع تاني)، لأن دوال OpenCV في الـ Shadow Clone عايزة `float32` بالظبط.

```python
    def reset(self):
        self._prev = None

    def close(self):
        self._segmenter.close()
```

- `reset` بتمسح الـ mask القديم. `main.py` بيناديها لما مافيش effect شغال، عشان المرة الجاية مايبقاش فيه mask قديم من دقيقة فاتت بيتخلط مع الجديد.
- `close` بتقفل الموديل وتحرر الذاكرة. `main.py` بيناديها في الـ `finally` وقت الخروج.

## 3. مفاهيم مهمة

### الـ confidence mask

الموديل مش بيقول "شخص / مش شخص" وخلاص، بيقول **احتمال**:

```
خلفية بعيدة    حافة الكتف    وسط الجسم
   0.02          0.55          0.98
```

ده أحسن بكتير من 0/1، لأن الحواف بتبقى متدرجة طبيعي، ونقدر نستخدم الرقم نفسه كـ **alpha** (درجة شفافية) وقت الدمج.

### ليه بنشغّله على عرض 640 بس؟

- الكاميرا 1280×720 = 921,600 pixel. على 640×360 = 230,400 pixel، يعني **ربع** الشغل في كل خطوة (التحويل، الـ EMA، الـ guided filter، وبعدين كل حسابات الـ Shadow Clone).
- الموديل نفسه أصلًا بيصغّر الصورة جواه لمقاس صغير، فبعتها كبيرة مش بيدّي دقة أحسن تقريبًا، بس بيكلّف وقت.
- النتيجة بتتكبر تاني في الآخر وهي ناعمة، فالفرق مش باين.

### الـ EMA (Exponential Moving Average) عبر الزمن

```
mask_out = 0.5 × mask_new + 0.5 × mask_prev
```

لو فكّينا المعادلة، الـ mask الحالي = 0.5 من الـ frame ده + 0.25 من اللي قبله + 0.125 من اللي قبله ... أوزان بتقل "أُسّيًا" (exponential)، ومن هنا جه الاسم. الفايدة: لو الموديل تردد في pixel (مرة 0.4 ومرة 0.7)، الناتج بيتهدى. التمن: لو اتحركنا بسرعة، الـ mask بيتأخر شوية ورا الحركة (ghosting بسيط). `MASK_SMOOTHING` هو اللي بيوزن بين الاتنين.

### الـ Guided Filter (تنعيم بيحترم الحواف)

الـ blur العادي بينعّم كل حاجة، حتى الحواف، فحافة الشخص بتسيّح في الخلفية. الـ guided filter أذكى: بيبص على **صورة مرشدة** (الـ guide، هنا الصورة الرمادي) وبيقول: "حيث الصورة ناعمة (حيطة)، نعّم الـ mask براحتك. وحيث الصورة فيها حافة قوية (حد الكتف مع الحيطة)، خلّي حافة الـ mask عند نفس المكان بالظبط".

الفكرة الرياضية باختصار: في كل شباك صغير، بيفترض إن `mask ≈ a × guide + b` (علاقة خطية). لو الـ guide فيه حافة جوه الشباك، الـ mask بيتعلم يقفز معاها. لو الـ guide مسطّح، `a ≈ 0` والـ mask بيبقى متوسط ناعم.

```
 قبل (mask الموديل)          بعد guided filter
 حافة مربعات وبعيدة          حافة ماشية مع خط الكتف الحقيقي
   ░░▓▓▓▓                       ░░░▓▓▓
   ░▓▓▓▓▓                       ░░▓▓▓▓
   ▓▓▓▓▓▓                       ░▓▓▓▓▓
```

**ليه guide رمادي؟** الملون فيه 3 قنوات فالحسابات أتقل بكتير. اتقاس على اللابتوب ده: **13.7 ms بالـ guide الملون ← 7.7 ms بالرمادي**، والشكل تقريبًا واحد.

### منحنى الـ contrast `(mask - 0.3) / 0.4`

```
output
 1.0 |              ________
     |             /
 0.5 |            /
     |           /
 0.0 |__________/
     +----+----+----+----+----► input
     0   0.3  0.5  0.7   1.0
```

| input | output |
|---|---|
| 0.2 | 0 (خلفية أكيد) |
| 0.3 | 0 |
| 0.5 | 0.5 |
| 0.7 | 1 |
| 0.9 | 1 (شخص أكيد) |

بعد الـ EMA والـ guided filter، الـ mask بقى "باهت" (قيم كتير في النص). المنحنى ده بيرجّع الخلفية لـ 0 بالظبط والجسم لـ 1 بالظبط، فمايبقاش فيه "شبح" باهت من الخلفية حوالين الـ clone، ويسيب منطقة انتقال ضيقة (0.3 لـ 0.7) عشان الحافة تفضل ناعمة.

### الـ timestamps في وضع VIDEO

في وضع VIDEO، MediaPipe بيستغل إن الصور متتالية (بيقدر يستخدم معلومات من الـ frame اللي فات). عشان كده بيطلب timestamp لكل صورة، ولازم يكون **أكبر تمامًا** من اللي قبله. `_timestamp` بتضمن ده بحاجتين: `time.monotonic()` اللي مابترجعش لورا، و `max(ts, last + 1)` لو نداءين حصلوا في نفس الـ millisecond.

---

# الجزء التاني: `effects/shadow_clone.py`

## 1. الملف ده بيعمل إيه؟

بياخد الصورة الصغيرة والـ mask من `PersonSegmenter` كل frame، ويعمل الآتي:

1. يحفظهم في **buffer** (ذاكرة لآخر ثانية تقريبًا).
2. لكل clone، يجيب frame **قديم** من الـ buffer (من 0.35 ثانية أو 0.75 ثانية)، يقص منه الشخص، يصغّره، ويحطه على جنب.
3. يقص **الشخص الحقيقي** من طبقة الـ clones، عشان يفضل قدامهم.
4. يضيف **دخان** (particles) لما الـ clones يظهروا أو يختفوا.
5. يدمج كل ده على الصورة الأصلية **مرة واحدة**.

## 2. الكود سطر بسطر

```python
"""Shadow Clone: delayed, segmented copies of the user appear beside them in a puff of smoke.

Everything (clones, smoke, "real person stays in front") is composed into ONE layer at the
segmentation resolution, then blended onto the full frame once. One full-size blend instead
of four keeps this effect fast on a laptop CPU.
"""
```

- الـ docstring بيلخّص التصميم كله: نسخ **متأخرة** (delayed) ومقصوصة (segmented) من المستخدم بتظهر جنبه وسط دخان. وكل حاجة (الـ clones، الدخان، "الشخص الحقيقي قدام") بتتجمع في **طبقة واحدة** بمقاس الـ segmentation الصغير، وبعدين تتدمج على الصورة الكبيرة **مرة واحدة**. دمج واحد بالمقاس الكامل بدل 4 هو اللي بيخلي الـ effect سريع على CPU لابتوب.

```python
from collections import deque

import cv2
import numpy as np

from shinobi import config
from shinobi.effects.base import Effect
from shinobi.effects.fx import Particles, random_directions
```

- `from collections import deque` الـ `deque` (بتتنطق "deck") list بيتضاف لها من آخرها وبيتشال من أولها بسرعة (O(1)). مثالية للـ buffer.
- `cv2` و `numpy` للصور.
- `config` للإعدادات الافتراضية للـ clones.
- `Effect` الكلاس الأب.
- `Particles, random_directions` من `fx.py` للدخان.

```python
SMOKE_COLOR = 235.0
```

- لون الدخان: رمادي فاتح جدًا (235 من 255 في التلات قنوات). مش أبيض صافي (255) عشان يبان "دخان" مش "نور".

```python
class ShadowClone(Effect):
    name = "shadow_clone"
    needs_segmentation = True
    fade_out = 0.6
```

- `class ShadowClone(Effect):` بيورث من `Effect`.
- `name = "shadow_clone"` الاسم اللي بيظهر في الـ HUD.
- `needs_segmentation = True` بيقول لـ `main.py`: "شغّلّي الـ segmenter".
- `fade_out = 0.6` بدل 0.5 الافتراضي. هنا الرقم ده مش بيتحكم في شفافية الـ clones (ليهم fade خاص بيهم 0.25 ثانية)، بيتحكم في `finished`: الـ effect مايتشالش قبل 0.6 ثانية من التوقف، عشان دخان الاختفاء يلحق يتلعب.
- الملاحظ إن `follows_hand` فاضل `False` (الافتراضي)، لأن بعد ما نعمل الـ seal ننزّل إيدينا عادي والـ clones يفضلوا.

```python
    def __init__(self, duration, delays=config.CLONE_DELAYS, offsets=config.CLONE_OFFSETS,
                 scale=config.CLONE_SCALE, seed=None):
        super().__init__(duration)
        self.rng = np.random.default_rng(seed)
```

- الـ parameters: `duration` (10 ثواني)، `delays` (تأخير كل clone: `[0.35, 0.75]`)، `offsets` (إزاحة كل clone كنسبة من عرض الشاشة: `[-0.30, 0.30]`)، `scale` (حجم الـ clone: 0.82)، و`seed` (للـ tests، عشان العشوائية تتكرر).
- `super().__init__(duration)` نشغّل `__init__` بتاع `Effect` (يجهّز `duration`، `t0`، `stop_at`، `age`).
- `self.rng = np.random.default_rng(seed)` مولّد أرقام عشوائية خاص بالـ effect ده (للدخان).

```python
        self.scale = scale
        self.clones = [{"delay": d, "offset": o, "shown": False, "gone": False}
                       for d, o in zip(delays, offsets)]
```

- `self.scale = scale` نحفظ الحجم.
- `self.clones = [...]` list فيها dictionary لكل clone. `zip(delays, offsets)` بتمشي على الاتنين مع بعض: `(0.35, -0.30)` و `(0.75, 0.30)`. كل clone عنده:
  - `"delay"` تأخيره بالثواني.
  - `"offset"` مكانه.
  - `"shown"` هل ظهر خلاص؟ (عشان نطلّع دخان الظهور مرة واحدة بس).
  - `"gone"` هل بدأ يختفي؟ (عشان دخان الاختفاء مرة واحدة بس).

```python
        self.buffer = deque()               # (time, small_frame, small_mask), oldest first
        self.keep = max(delays) + 0.3       # seconds of history we need
        self.smoke = Particles()            # positions are stored as fractions of the frame (0..1)
```

- `self.buffer = deque()` الذاكرة: كل عنصر `(الوقت، الصورة الصغيرة، الـ mask)`، الأقدم في الأول.
- `self.keep = max(delays) + 0.3` قد إيه نحتفظ بتاريخ: أكبر تأخير (0.75) + 0.3 ثانية احتياطي = 1.05 ثانية. أي حاجة أقدم من كده مالهاش لازمة.
- `self.smoke = Particles()` particles الدخان. ملاحظة التعليق مهمة: المواقع متخزنة **كنسب** من الصورة (0..1) مش pixels، هنشرح ليه تحت.

```python
    def _delayed(self, now, delay):
        """The newest buffered frame that is at least `delay` seconds old."""
        for t, small, mask in reversed(self.buffer):
            if t <= now - delay:
                return small, mask
        return self.buffer[0][1], self.buffer[0][2]
```

- `_delayed` بتجيب الـ frame المناسب لـ clone معين: أحدث frame عمره `delay` ثانية على الأقل.
- `for t, small, mask in reversed(self.buffer):` نمشي من الأحدث للأقدم.
- `if t <= now - delay:` أول frame وقته قبل "دلوقتي ناقص التأخير"...
- `return small, mask` ...هو اللي عايزينه.
- `return self.buffer[0][1], self.buffer[0][2]` لو مالقيناش (يعني الـ effect لسه بادئ والـ buffer أقصر من التأخير)، نرجّع أقدم حاجة عندنا. الـ clone هيبان شبه متجمد للحظات في الأول، بس الدخان بيداري ده.

```python
    def _clone_box(self, w, h, offset):
        """Where a clone goes: scaled down, shifted sideways, feet on the bottom edge."""
        cw, ch = int(w * self.scale), int(h * self.scale)
        x0 = int(w / 2 + offset * w - cw / 2)
        return x0, h - ch, cw, ch
```

- `_clone_box` بتحسب مستطيل الـ clone على الشاشة: متصغّر، متزاح لجنب، ورجليه على الحافة اللي تحت.
- `cw, ch = int(w * self.scale), int(h * self.scale)` عرض وطول الـ clone = 82% من الصورة.
- `x0 = int(w / 2 + offset * w - cw / 2)` الحافة الشمال: مركز الشاشة (`w / 2`) + الإزاحة (`offset * w`) − نص عرض الـ clone. كده **مركز** الـ clone يبقى عند `w/2 + offset*w`.
- `return x0, h - ch, cw, ch` الـ `y0 = h - ch` يعني تحت الـ clone لازق في تحت الشاشة (رجليه على الأرض، أو على الأقل نفس مكان رجلينا).

```python
    def _poof(self, offset):
        """Burst of smoke where a clone appears or vanishes (hides the first rough frames)."""
        center = np.array([0.5 + offset, 1.0 - self.scale * 0.55])   # middle of the clone's body
        n = 90
```

- `_poof` بتطلّع سحابة دخان مكان الـ clone (لما يظهر أو يختفي). الـ docstring بيقول كمان إنها بتداري أول frames "الخشنة".
- `center = np.array([0.5 + offset, 1.0 - self.scale * 0.55])` مركز الدخان **كنسبة**: أفقيًا عند مركز الـ clone (`0.5 + offset`)، ورأسيًا عند `1 - 0.82 × 0.55 ≈ 0.55`. الـ clone ممتد رأسيًا من `1 - 0.82 = 0.18` لـ `1.0`، فنصه عند 0.59، والـ 0.55 أعلى بشوية (عند الصدر تقريبًا).
- `n = 90` عدد particles الدخان في كل poof.

```python
        vel = random_directions(n, self.rng) * self.rng.uniform(0.02, 0.12, (n, 1)) + np.array([0, -0.04])
        self.smoke.emit(center, vel, self.rng.uniform(0.6, 1.1, n), self.rng.uniform(0.03, 0.06, n))
```

- `vel = ...` السرعات (برضه كنسب من الشاشة في الثانية):
  - `random_directions(n, self.rng)` 90 اتجاه عشوائي في كل الاتجاهات (انفجار).
  - `* self.rng.uniform(0.02, 0.12, (n, 1))` كل واحد بسرعة عشوائية من 2% لـ 12% من الشاشة في الثانية. الشكل `(n, 1)` عشان يتضرب في الـ x والـ y بتوع نفس الصف (broadcasting).
  - `+ np.array([0, -0.04])` دفعة صغيرة لفوق لكل الدخان (y سالب = لفوق)، لأن الدخان بيطلع.
- `self.smoke.emit(center, vel, ...)` نطلق الـ particles من المركز. عمر كل واحد من 0.6 لـ 1.1 ثانية، وحجمه من 3% لـ 6% من عرض الشاشة.

```python
        spread = self.rng.normal(0, 1, (n, 2)) * np.array([self.scale * 0.14, self.scale * 0.2])
        self.smoke.pos[-n:] += spread.astype(np.float32)
```

- `spread = self.rng.normal(0, 1, (n, 2)) * ...` إزاحة عشوائية من توزيع طبيعي (Gaussian)، أفقيًا بـ `0.82 × 0.14 ≈ 0.11` ورأسيًا بـ `0.82 × 0.2 ≈ 0.16`. الرأسي أكبر عشان السحابة تبقى **طويلة زي جسم إنسان** مش كورة.
- `self.smoke.pos[-n:] += ...` نضيف الإزاحة على آخر `n` صف بس (اللي لسه اتولدوا حالًا في `emit`). كده الدخان بيبدأ منتشر على مساحة الجسم كله مش من نقطة واحدة.

```python
    def render(self, frame, tracking, dt, segmentation=None):
        now = tracking.now
        self.opacity(now)                   # updates age / stop_at
        if segmentation is None:
            return frame
        small, mask = segmentation
```

- `render` الدالة الأساسية، بتتنادى كل frame.
- `now = tracking.now` الوقت الحالي.
- `self.opacity(now)` بنناديها **مش عشان الرقم** (الـ clones ليهم شفافية خاصة)، لكن عشان تحدّث `age` و `stop_at` (يعني لما الـ 10 ثواني يخلصوا الـ effect يبدأ يقفل). التعليق بيقول كده بالظبط.
- `if segmentation is None: return frame` لو مافيش نتيجة segmentation، مانقدرش نعمل حاجة، نرجّع الصورة زي ما هي.
- `small, mask = segmentation` الصورة الصغيرة (640×360) والـ mask بتاعها.

```python
        self.buffer.append((now, small, mask))
        while now - self.buffer[0][0] > self.keep:
            self.buffer.popleft()
```

- `self.buffer.append(...)` نضيف الـ frame الحالي في آخر الـ buffer.
- `while now - self.buffer[0][0] > self.keep:` طول ما أقدم عنصر أقدم من 1.05 ثانية...
- `self.buffer.popleft()` ...نشيله من الأول. الـ buffer مستحيل يفضى هنا لأن الـ frame الحالي عمره صفر.

```python
        sh, sw = mask.shape
        color = np.zeros((sh, sw, 3), np.uint8)     # clone layer colors
        alpha = np.zeros((sh, sw), np.float32)      # clone layer opacity 0..1
        stopping = self.stop_at is not None
```

- `sh, sw = mask.shape` المقاس الصغير (360, 640).
- `color = np.zeros((sh, sw, 3), np.uint8)` طبقة **ألوان** فاضية (سودا) بالمقاس الصغير، هنرسم عليها الـ clones والدخان.
- `alpha = np.zeros((sh, sw), np.float32)` طبقة **شفافية** بنفس المقاس: لكل pixel قد إيه الطبقة مغطية الصورة (0 = شفاف تمامًا، 1 = مغطي تمامًا). بتبدأ كلها 0.
- `stopping = self.stop_at is not None` هل الـ effect في مرحلة الاختفاء؟

```python
        for i, clone in enumerate(self.clones):
            if now < self.t0 + 0.3 + 0.25 * i:          # clones pop in one after the other
                continue
            if not clone["shown"]:
                clone["shown"] = True
                self._poof(clone["offset"])
```

- `for i, clone in enumerate(self.clones):` نلف على الـ clones، و`i` رقمه (0، 1).
- `if now < self.t0 + 0.3 + 0.25 * i:` الـ clone رقم 0 يظهر بعد 0.3 ثانية من البداية، ورقم 1 بعد 0.55 ثانية. ظهورهم ورا بعض أحلى من ظهورهم مع بعض.
- `continue` لو لسه وقته ماجاش، نعدّيه.
- `if not clone["shown"]:` أول مرة الـ clone يظهر...
- `clone["shown"] = True` نعلّم إنه ظهر (عشان الـ poof مايتكررش كل frame)...
- `self._poof(clone["offset"])` ...ونطلّع سحابة دخان مكانه.

```python
            if stopping and not clone["gone"]:
                clone["gone"] = True
                self._poof(clone["offset"])
            visibility = 1.0 if not stopping else max(0.0, 1.0 - (now - self.stop_at) / 0.25)
            if visibility <= 0:
                continue
```

- `if stopping and not clone["gone"]:` أول frame بعد التوقف...
- `clone["gone"] = True` نعلّم...
- `self._poof(clone["offset"])` ...ونطلّع دخان الاختفاء.
- `visibility = ...` شفافية الـ clone: 1 طول ما الـ effect شغال. بعد التوقف بتنزل من 1 لـ 0 في **0.25 ثانية** (أسرع من الـ `fade_out`)، عشان الـ clone يختفي **جوه** سحابة الدخان وهي لسه كثيفة، فيبان إنه "اتبخر".
- `if visibility <= 0: continue` لو اختفى خالص، مانرسمهوش (توفير وقت).

```python
            src, src_mask = self._delayed(now, clone["delay"])
            x0, y0, cw, ch = self._clone_box(sw, sh, clone["offset"])
            fx0, fx1 = max(0, x0), min(sw, x0 + cw)             # clip to the screen
            if fx1 <= fx0:
                continue
```

- `src, src_mask = self._delayed(now, clone["delay"])` الصورة والـ mask القديمين بتوع الـ clone ده.
- `x0, y0, cw, ch = self._clone_box(sw, sh, clone["offset"])` مستطيله.
- `fx0, fx1 = max(0, x0), min(sw, x0 + cw)` القص على حدود الشاشة (clipping): الـ clone ممكن يطلع جزء منه برّه الشاشة (x0 سالب مثلًا)، فبناخد الجزء اللي جوه بس. الـ `f` = "final".
- `if fx1 <= fx0: continue` لو الـ clone كله برّه الشاشة، نعدّيه.

```python
            img = np.ascontiguousarray(cv2.resize(src, (cw, ch))[:, fx0 - x0:fx1 - x0])
            a = np.ascontiguousarray(cv2.resize(src_mask, (cw, ch))[:, fx0 - x0:fx1 - x0]) * visibility
            self._over(color, alpha, (slice(y0, sh), slice(fx0, fx1)), img, a)
```

- `cv2.resize(src, (cw, ch))` نصغّر الصورة القديمة **كلها** لمقاس الـ clone (82%).
- `[:, fx0 - x0:fx1 - x0]` ناخد الأعمدة اللي جوه الشاشة بس. مثلًا لو `x0 = -134`، يبقى `fx0 - x0 = 134`: بنرمي أول 134 عمود (اللي كانوا هيبقوا برّه الشاشة على الشمال).
- `np.ascontiguousarray(...)` قص الأعمدة بيعمل view "متقطع" في الذاكرة (كل صف فيه فجوة). دوال OpenCV زي `blendLinear` محتاجة الـ array متصل في الذاكرة، فبنعمل نسخة متصلة.
- `a = ... * visibility` نفس الكلام للـ mask، ومضروب في `visibility`. الـ mask هنا هو الـ **alpha** بتاع الـ clone: 1 على جسمنا القديم و0 على الخلفية القديمة. يعني الخلفية القديمة مش هتترسم، الشخص بس.
- `self._over(color, alpha, (slice(y0, sh), slice(fx0, fx1)), img, a)` نحط الـ clone "فوق" اللي في الطبقة لحد دلوقتي، في المنطقة `[y0:sh, fx0:fx1]`. `slice(y0, sh)` هي نفسها `y0:sh` بس كـ object نقدر نبعته لدالة.

```python
        # The real person stays in front: cut them out of the clone layer.
        alpha = cv2.multiply(alpha, 1.0 - mask)
```

- التعليق: الشخص الحقيقي يفضل قدام: نقصّه من طبقة الـ clones.
- `alpha = cv2.multiply(alpha, 1.0 - mask)` لكل pixel: `alpha × (1 - mask)`. مكان الشخص الحقيقي دلوقتي `mask = 1` فـ `alpha` بتبقى 0 (الطبقة شفافة هناك وبنشوف الصورة الأصلية، يعني إحنا). في الخلفية `mask = 0` فـ `alpha` مابتتغيرش. كده الـ clones يبانوا **ورانا**.

```python
        # Smoke goes on top of everything.
        density = self._smoke_density(sw, sh, dt)
        if density is not None:
            smoke = np.full_like(color, int(SMOKE_COLOR))
            self._over(color, alpha, (slice(None), slice(None)), smoke, density)
```

- التعليق: الدخان فوق كل حاجة (فوق الـ clones وفوقنا كمان، لأنه بيترسم **بعد** القص).
- `density = self._smoke_density(sw, sh, dt)` كثافة الدخان لكل pixel (0..1)، أو `None` لو مافيش دخان.
- `smoke = np.full_like(color, int(SMOKE_COLOR))` صورة كلها لون الدخان (235) بنفس مقاس الطبقة.
- `self._over(color, alpha, (slice(None), slice(None)), smoke, density)` نحط الدخان فوق الطبقة كلها (`slice(None)` = `:` = كل الصفوف/الأعمدة)، والـ alpha بتاعه هي الكثافة.

```python
        if alpha.max() < 1e-3:
            return frame
        h, w = frame.shape[:2]
        layer = cv2.resize(color, (w, h))
        a_full = cv2.resize(alpha, (w, h))
        return cv2.blendLinear(layer, frame, a_full, 1.0 - a_full)
```

- `if alpha.max() < 1e-3: return frame` لو الطبقة كلها شفافة تقريبًا (مثلًا قبل ما أول clone يظهر، أو بعد ما كل حاجة اختفت)، نرجّع الصورة على طول ونوفّر الدمج الغالي.
- `h, w = frame.shape[:2]` المقاس الكبير (720، 1280).
- `layer = cv2.resize(color, (w, h))` نكبّر طبقة الألوان للمقاس الكامل.
- `a_full = cv2.resize(alpha, (w, h))` ونكبّر الـ alpha.
- `cv2.blendLinear(layer, frame, a_full, 1.0 - a_full)` **الدمج الوحيد بالمقاس الكامل**: لكل pixel `layer × a + frame × (1 - a)`. وده الـ "over" العادي للطبقة فوق الصورة.

```python
    @staticmethod
    def _over(color, alpha, region, img, a):
        """Porter-Duff "over": put img (opacity a) in front of the layer, in place.

        cv2.blendLinear divides by the sum of the two weights, which is exactly the
        formula for the resulting color: (img*a + old*old_a*(1-a)) / (a + old_a*(1-a)).
        """
```

- `@staticmethod` الدالة مش محتاجة `self` (مابتستخدمش أي حاجة من الـ object)، فبتتعلّم كده.
- `_over(color, alpha, region, img, a)` بتحط `img` بشفافية `a` **قدام** اللي موجود في `color`/`alpha`، في المنطقة `region`، وبتعدّل الطبقة مكانها (in place).
- الـ docstring بيقول: ده عامل الـ "over" بتاع Porter-Duff، و`cv2.blendLinear` بتقسم على مجموع الوزنين، وده بالظبط معادلة اللون الناتج. هنشتقها في المفاهيم تحت.

```python
        old_w = cv2.multiply(alpha[region], 1.0 - a)
        color[region] = cv2.blendLinear(img, np.ascontiguousarray(color[region]), a, old_w)
        alpha[region] = cv2.add(a, old_w)
```

- `old_w = cv2.multiply(alpha[region], 1.0 - a)` وزن القديم = شفافيته × الجزء اللي الجديد سايبه مكشوف `(1 - a)`.
- `color[region] = cv2.blendLinear(img, ..., a, old_w)` اللون الجديد = `(img × a + old × old_w) / (a + old_w)`. `np.ascontiguousarray` لنفس السبب اللي فوق (`color[region]` جزء من array أكبر).
- `alpha[region] = cv2.add(a, old_w)` الشفافية الجديدة = `a + old_a × (1 - a)`.

```python
    def _smoke_density(self, w, h, dt):
        self.smoke.update(dt, gravity=(0, -0.03), drag=1.5)
        if len(self.smoke) == 0:
            return None
        canvas = np.zeros((h, w), np.uint8)
```

- `_smoke_density` بتحرّك الدخان وترسمه وترجّع كثافته.
- `self.smoke.update(dt, gravity=(0, -0.03), drag=1.5)` نحرّك الـ particles: "جاذبية" سالبة صغيرة (الدخان بيطلع لفوق ببطء)، وdrag عالي نسبيًا (الانفجار بيفرمل بسرعة، زي الدخان الحقيقي).
- `if len(self.smoke) == 0: return None` لو مافيش دخان، نقول كده.
- `canvas = np.zeros((h, w), np.uint8)` لوحة رمادي (قناة واحدة) بالمقاس الصغير، هنرسم عليها كثافة الدخان.

```python
        t = self.smoke.t
        strength = np.sin(np.pi / 2 * np.minimum(t * 4, 1.0)) * (1 - t) * 140   # rises fast, fades slowly
        sizes = self.smoke.size * (1.0 + 1.5 * t) * w
```

- `t = self.smoke.t` العمر النسبي لكل particle (0 لـ 1).
- `strength = np.sin(np.pi / 2 * np.minimum(t * 4, 1.0)) * (1 - t) * 140` كثافة كل particle حسب عمره، وهي حاصل ضرب جزئين:
  - `np.sin(np.pi / 2 * np.minimum(t * 4, 1.0))` جزء **الظهور**: `t * 4` بيوصل 1 عند `t = 0.25`، والـ `np.minimum(..., 1.0)` بيقفله عند 1 بعد كده. فالـ sine بيطلع من `sin(0) = 0` لـ `sin(π/2) = 1` في **أول ربع** من العمر وبعدين يفضل 1. (الـ sine بيدّي طلوع ناعم: سريع في الأول وبيهدى قرب القمة.)
  - `(1 - t)` جزء **الاختفاء**: بينزل بخط مستقيم من 1 (لسه مولود) لـ 0 (لحظة الموت).
  - `* 140` أقصى كثافة ممكنة (من 255).
  - النتيجة (اتحسبت على اللابتوب ده): `t = 0` ← 0، `t = 0.125` ← 87، القمة حوالي 107 عند `t ≈ 0.22`، `t = 0.5` ← 70، `t = 0.75` ← 35، `t = 1` ← 0. يعني بالظبط زي التعليق: **بيعلى بسرعة** (في أول ربع العمر) **ويختفي ببطء** (على باقي الـ 3 أرباع)، والـ particle بيفضل باين لحد آخر لحظة في عمره، فمافيش وقت "ميت" بيأخّر `finished` على الفاضي.

```
 strength
 107 |       *******
     |     **       *****
  70 |    *              ******
     |   *                     *****
  35 |  *                           ******
     | *                                  ******
   0 |*                                         ***
     +-----------+----------+----------+-----------► t
     0          0.25       0.5        0.75        1.0
      (طلوع سريع)    (نزول بطيء بخط مستقيم لحد الموت)
```
- `sizes = self.smoke.size * (1.0 + 1.5 * t) * w` الحجم بيكبر مع العمر لحد 2.5 مرة (الدخان بيتمدد)، و`* w` بتحوّل من نسبة لـ pixels.

```python
        self.smoke.draw(canvas, np.repeat(strength[:, None], 3, axis=1), sizes,
                        positions=self.smoke.pos * np.array([w, h]))
        canvas = cv2.GaussianBlur(canvas, (0, 0), 9)                    # merge puffs into a cloud
        return canvas.astype(np.float32) / 255.0
```

- `self.smoke.draw(canvas, ...)` نرسم كل particle كدايرة على اللوحة:
  - `np.repeat(strength[:, None], 3, axis=1)` الـ `draw` عايزة لون `(N, 3)`، فبنكرر الكثافة 3 مرات. (اللوحة قناة واحدة، فـ OpenCV بيستخدم أول رقم بس.)
  - `sizes` الأحجام بالـ pixels.
  - `positions=self.smoke.pos * np.array([w, h])` المواقع من نسب لـ pixels: x × العرض، y × الطول.
- `canvas = cv2.GaussianBlur(canvas, (0, 0), 9)` blur كبير (sigma 9) يدوّب الدواير في بعض فتبقى **سحابة** ناعمة بدل كور منفصلة.
- `return canvas.astype(np.float32) / 255.0` نحوّل لـ float من 0 لـ 1 عشان تبقى alpha. أقصى كثافة لـ particle واحد حوالي 107/255 ≈ 0.42 (وبعد الـ blur أقل في الأطراف)، يعني الدخان دايمًا شبه شفاف ومش بيغطي اللي وراه خالص.

```python
    def finished(self, now):
        return super().finished(now) and len(self.smoke) == 0
```

- بنعدّل `finished`: الـ effect يخلص لما **الاتنين** يحصلوا: الـ fade out العادي خلص (`super().finished(now)`)، **و** آخر particle دخان مات. من غير كده، الـ effect كان هيتشال والدخان لسه في الهوا فيختفي فجأة.

## 3. مفاهيم مهمة

### قرار التصميم: clones "متأخرة" بدل نسخ متسجلة

كان فيه طريقتين:

| | **Delayed clones** (اللي اتعمل) | **Recorded copies** |
|---|---|---|
| الفكرة | كل clone بيعرض frame من 0.35 أو 0.75 ثانية فاتت | نسجّل مقطع ونعيد تشغيله |
| الحركة | الـ clones بتقلّد حركتنا لحظيًا بتأخير بسيط، زي الصدى | بتعيد نفس الحركة القديمة |
| الإحساس | "حي": لو رفعنا إيدنا، الـ clones يرفعوها ورانا | ممكن يبان مكرر وميت |
| التعقيد | buffer صغير وخلاص | مرحلة تسجيل + تخزين + تشغيل |

الـ buffer عبارة عن **ring buffer** بالـ `deque`: frames جديدة بتدخل من آخره، والقديمة بتخرج من أوله:

```
 popleft() ◄── [t-1.05] [t-0.9] ... [t-0.75] ... [t-0.35] ... [t-0.03] [t] ◄── append()
                                       ▲                ▲
                                   clone 1          clone 0
                                 (delay 0.75)     (delay 0.35)
```

ولأن التأخيرين مختلفين، الـ clones مش بيتحركوا زي بعض بالظبط، وده بيبان طبيعي أكتر.

**تمن الذاكرة:** كل عنصر = صورة 640×360×3 (≈ 0.69 MB) + mask `float32` 640×360 (≈ 0.92 MB) ≈ 1.6 MB. بنحتفظ بـ 1.05 ثانية، يعني من 30 لـ 50 MB تقريبًا حسب الـ fps. ودي من الأسباب اللي بتخلي المقاس الصغير مهم.

### مكان الـ clones على الشاشة

بالأرقام الافتراضية على المقاس الصغير 640×360 (`scale = 0.82` ← كل clone 524×295):

```
الشكل على الشاشة:

 ┌──────────────────────────────────────────────┐ y=0
 │                      ( )                     │
 │         ( )          /|\          ( )        │ ← y=65: أعلى مستطيل الـ clone
 │         /|\         / | \         /|\        │   (أصغر، فراسه أوطى)
 │        / | \          |          / | \       │
 │          |           / \           |         │
 │         / \         /   \         / \        │
 └──────────────────────────────────────────────┘ y=360 ← رجلين الكل على نفس الخط
         x=128         x=320         x=512
        clone 0        إحنا         clone 1
       (-0.30)                      (+0.30)

مستطيلات الـ clones على محور x:

 x:  -134       0                250       390               640       774
      |.........|====== clone 0 ==|=========|                 |         |
                                 |=========|==== clone 1 =====|.........|
                                 └─ تداخل ─┘
 '.....' = الجزء اللي برّه الشاشة وبيتقص (clipping)
```

- **الحجم (scale):** الـ clone أصغر (82%) فيبان **أبعد** عن الكاميرا شوية، وده منطقي لأنه "ورانا".
- **الإزاحة (offset):** ±0.30 من العرض، يعني ±192 pixel على المقاس الصغير.
- **الرجلين على الحافة اللي تحت:** `y0 = h - ch`. لو كنا بنصغّر من غير ما نحرّك لتحت، الـ clone كان هيبان طاير في الهوا.
- **الـ clipping:** clone 0 بيبدأ عند x = -134 (برّه الشاشة)، فبنرمي أول 134 عمود من صورته. ومش مشكلة، لأن الجزء ده كان خلفية أصلًا (الشخص في نص الصورة القديمة، يعني عند مركز الـ clone).
- الملاحظ إن **المستطيلين بيتداخلوا** في النص (من 250 لـ 390) وبيغطّوا مكاننا إحنا كمان. ده عادي لأن الـ alpha بتاعة كل clone = الـ mask بتاعه (الشخص بس، مش المستطيل كله)، ولأننا بنقص الشخص الحقيقي من الطبقة.

### عامل Porter-Duff "over" وليه `cv2.blendLinear` بالظبط صح

عندنا طبقة فيها لون `C_old` وشفافية `α_old`، وعايزين نحط فوقها صورة لونها `C_img` بشفافية `a`.

**الشفافية الناتجة:** الجديد بيغطي `a` من الـ pixel. الجزء الباقي `(1 - a)` بيبان من وراه القديم، والقديم بيغطي `α_old` منه:

```
α_out = a + α_old × (1 - a)
```

**اللون الناتج:** "كمية اللون" من كل طبقة = لونها × قد إيه هي باينة:

```
C_out × α_out = C_img × a + C_old × α_old × (1 - a)

C_out = (C_img × a + C_old × α_old × (1 - a)) / (a + α_old × (1 - a))
```

ليه بنقسم على `α_out`؟ لأن الطبقة متخزنة كـ "لون + شفافية منفصلين" (straight alpha): اللون لازم يبقى اللون الحقيقي، مش مضروب في الشفافية. ده مهم عشان في الآخر بنعمل `layer × a + frame × (1 - a)`.

**ودلوقتي `cv2.blendLinear(src1, src2, w1, w2)`** بتحسب لكل pixel:

```
(src1 × w1 + src2 × w2) / (w1 + w2)
```

لو حطينا `w1 = a` و `w2 = α_old × (1 - a)` (ده `old_w` في الكود)، نطلع بالمعادلة فوق **بالظبط**. والمقام `(w1 + w2)` هو نفسه `α_out`، وعشان كده الكود بيكتب `alpha[region] = cv2.add(a, old_w)`.

جربنا على اللابتوب ده: `C_img = 200`، `C_old = 50`، `a = 0.3`، `old_w = 0.2` ← `blendLinear` طلّعت **140**، والمعادلة: `(200×0.3 + 50×0.2) / 0.5 = 140`. النتيجتين متطابقتين.

ميزة إضافية: لو الوزنين صفر (pixel فاضي خالص)، OpenCV مابيقسمش على صفر (بيضيف رقم صغير جدًا للمقام) وبيرجّع 0. والـ alpha هناك 0 فمش هيبان أصلًا.

### الشخص الحقيقي يفضل قدام: `alpha *= 1 - mask`

```
 alpha قبل القص            1 - mask (الحالي)          alpha بعد القص
 ┌─────────────────┐      ┌─────────────────┐       ┌─────────────────┐
 │  ▓▓▓  ▓▓▓  ▓▓▓  │      │ 111 11000011 11 │       │  ▓▓▓  ░░░  ▓▓▓  │
 │  ▓▓▓  ▓▓▓  ▓▓▓  │  ×   │ 111 10000001 11 │   =   │  ▓▓▓  ░░░  ▓▓▓  │
 │ clone إحنا clone│      │      (0 = إحنا) │       │ clone فتحة clone│
 └─────────────────┘      └─────────────────┘       └─────────────────┘
```

في الفتحة دي الطبقة شفافة، فبنشوف الصورة الأصلية (إحنا). يعني ترتيب الطبقات من الخلف للأمام:

```
  (قدام)  ┌───────────────────────────┐
          │  دخان (smoke)              │  ← _over بعد القص، فبيغطي حتى إحنا
          ├───────────────────────────┤
          │  إحنا (الشخص الحقيقي)      │  ← فتحة في الطبقة: alpha × (1 - mask)
          ├───────────────────────────┤
          │  clone 1  (delay 0.75)     │  ← _over تاني واحد، فوق clone 0 لو اتداخلوا
          │  clone 0  (delay 0.35)     │  ← _over أول واحد
          ├───────────────────────────┤
  (ورا)   │  frame الكاميرا (الخلفية)  │
          └───────────────────────────┘
```

### الدخان: particles كنسب ← لوحة كثافة ← blur ← سحابة

1. **ليه المواقع نسب (0..1)؟** عشان الدخان مايعتمدش على مقاس الصورة. نقدر نرسمه على 640 أو 1280 من غير ما نغيّر حاجة، بس نضرب في `(w, h)` وقت الرسم. وكمان مكان الـ clone نفسه معرّف بنسب (`offset`، `scale`).
2. **لوحة كثافة (density canvas):** بدل ما نرسم دخان ملون، بنرسم "قد إيه فيه دخان" في كل pixel على لوحة رمادي.
3. **Blur كبير:** يحوّل الـ 90 دايرة المنفصلين لسحابة واحدة ناعمة.
4. **الكثافة تبقى alpha:** ونحط لون ثابت (235) بالـ alpha دي فوق الطبقة.

```
 particles           canvas (دواير)        بعد GaussianBlur
   ·  ·  ·              ●  ●  ●              ░▒▓▓▓▒░
  · ·· · ·    ──►      ● ●● ● ●     ──►     ░▒▓███▓▒░
   ·  · ·               ●  ● ●               ░▒▓▓▓▒░
```

**ليه الـ poof مهم أكتر من مجرد شكل؟** لأنه بيداري عيوب حقيقية:
- أول لحظات الـ clone: الـ buffer لسه قصير فـ `_delayed` بيرجّع أقدم frame (شبه متجمد).
- ظهور clone فجأة من العدم بيبان "قطع" رخيص.
- حواف الـ segmentation الخشنة في الأول.
- ولحظة الاختفاء: الـ clone بيختفي في 0.25 ثانية، والدخان بيوصل لقمة كثافته عند `t ≈ 0.22` (يعني حوالي 0.13-0.24 ثانية من الـ poof، لأن عمر الـ particle من 0.6 لـ 1.1 ثانية). فالـ clone بيتلاشى **جوه** السحابة وهي في أكثف حالاتها، وبعدين السحابة نفسها بتخف ببطء.

وده تكنيك معروف في الأنمي نفسه: "بوف" الدخان هو حرفيًا الطريقة اللي الـ shadow clones بيظهروا ويختفوا بيها.

### كل حاجة في طبقة واحدة بالمقاس الصغير، ودمج واحد بالمقاس الكامل

الطريقة البديهية كانت: لكل clone نكبّره ونعمل blend على الصورة الكاملة، وبعدين نرجّع الشخص الحقيقي قدام بـ blend تاني، وبعدين الدخان بـ blend تالت. يعني حوالي **4 عمليات دمج بالمقاس الكامل** بـ float. كل دمج float على frame كامل (1280×720×3) بياخد **حوالي 7 ms** على اللابتوب ده.

الطريقة اللي في الكود:

```
 بالمقاس الصغير 640×360 (ربع عدد الـ pixels):
   clone 0 ──over──┐
   clone 1 ──over──┤
   × (1 - mask) ───┤──► طبقة واحدة (color + alpha)
   smoke  ──over───┘
                         │ resize ×2
                         ▼
 بالمقاس الكامل 1280×720:  blendLinear مرة واحدة على الـ frame
```

**النتيجة المقاسة:** الـ effect نزل من **~55 ms لـ ~15 ms** لكل frame.

### الـ segmentation بالتوازي مع تتبع الإيد (في `main.py`)

مقتطفات من `main.py` (السطور 27، 78، 80، 99؛ والـ `...` معناها إن فيه كود في النص اتشال):

```python
    seg_worker = ThreadPoolExecutor(max_workers=1)   # runs segmentation in parallel with hand tracking
...
                seg_job = seg_worker.submit(segmenter.segment, frame)
...
            hands = hands_tracker.detect(frame)
...
                segmentation = seg_job.result()               # wait for the worker (usually already done)
```

- `ThreadPoolExecutor(max_workers=1)` thread واحد إضافي مخصوص للـ segmentation.
- `submit(...)` بتبدأ الـ segmentation على الـ thread التاني **وترجع على طول** من غير ما تستنى، وبترجّع "وعد" بالنتيجة (`seg_job`).
- في نفس الوقت، الـ thread الأساسي بيشغّل `hands_tracker.detect(frame)`.
- `seg_job.result()` بتستنى النتيجة لو لسه ماخلصتش (وغالبًا بتكون خلصت).

```
 من غير توازي:   [── hands ──][──── segmentation ────][fx]   ← 91 ms
 بالتوازي:       [── hands ──]                     [fx]      ← 59 ms
                 [──── segmentation ────]
                 (thread تاني، core تاني)
```

ده بيشتغل رغم الـ GIL بتاع Python، لأن MediaPipe وOpenCV شغالين بـ C++ وبيسيبوا الـ GIL وهما بيحسبوا، فالـ threads بيشتغلوا فعلًا على cores مختلفة. اتقاس على الـ i7-8550U: loop الـ Shadow Clone كله نزل من **91 ms لـ 59 ms** لكل frame.

### الـ timeline الكامل للـ effect (`duration = 10`)

```
 t0       +0.3      +0.55                        +10.0    +10.25   +10.6   ~+11.1
 │         │          │                            │        │        │        │
 start  clone 0     clone 1                     stop_at  clones   fade_out  آخر دخان
        + poof      + poof                      + poof×2  اختفوا   خلص     مات → finished
```

### القيود (Limitations)

- **لازم نقف بعيد عن الكاميرا:** الـ clone بيتصغّر لـ 82% ورجليه على الحافة اللي تحت. لو قاعدين قريب، رأس الـ clone هيبقى في نص الشاشة وجسمه مقصوص، وكمان الـ clones هيتداخلوا معانا أكتر. أحسن نتيجة لما الجسم كله (أو نصه الفوقاني على الأقل) يبان.
- **الكاميرا لازم تبقى ثابتة:** الـ clone بيستخدم صورة الشخص بس (بالـ mask)، بس لو الكاميرا اتحركت، الـ frames القديمة هتبقى من زاوية تانية والـ clones هيبانوا "بيتزحلقوا".
- **الإضاءة:** الإضاءة الضعيفة أو خلفية بنفس لون الهدوم بتخلي الـ segmentation يغلط: أجزاء من الخلفية تظهر في الـ clone، أو أجزاء من الجسم تختفي.
- **شخص واحد:** الموديل بيفصل "أي حد"، فلو فيه أكتر من شخص، الكل هيتنسخ.
- **مش 3D:** الـ clones نسخ مسطحة متزاحة لجنب، مافيش ظل ولا تفاعل حقيقي مع المكان.

---

## لو غيّرنا ... هيحصل إيه؟

1. **`CLONE_DELAYS = [0.0, 0.0]`:** الـ clones هيتحركوا معانا في نفس اللحظة بالظبط، زي مراية، والإحساس بالـ "صدى" هيروح. ولو `[1.5, 3.0]`: التأخير هيبان واضح جدًا (الـ clones بيعيدوا حركة من ثواني فاتت)، و`keep` هيبقى 3.3 ثانية، يعني الـ buffer هيكبر حوالي 3 مرات في الذاكرة (ممكن يوصل لأكتر من 150 MB).
2. **`CLONE_SCALE = 1.0`:** الـ clones هيبقوا بنفس حجمنا ومش هيبانوا ورانا، وكل clone هياخد عرض الشاشة كله فيتقص أكتر على الجوانب. ولو `0.5`: هيبانوا بعاد جدًا (أو أطفال صغيرين!)، ودخان الـ poof هيتظبط لوحده لأن مركزه وانتشاره معتمدين على `self.scale`.
3. **`MASK_SMOOTHING = 1.0`:** مافيش تنعيم عبر الزمن، `mask = mask` الجديد بس، فحواف الـ clones هتبقى بترعش من frame للتاني. ولو `0.1`: الحواف ثابتة جدًا، بس لو اتحركنا بسرعة، الـ mask هيتأخر ورانا فيبان "ذيل" أو شبح حوالين الحركة.
4. **clones أكتر:** مثلًا `CLONE_DELAYS = [0.35, 0.75, 1.1, 1.5]` و `CLONE_OFFSETS = [-0.30, 0.30, -0.55, 0.55]`. هيطلع 4 clones، بيظهروا ورا بعض كل 0.25 ثانية، كل واحد بـ poof. التكلفة بتزيد شوية بس لأن كل clone إضافي = resize + `_over` على المقاس الصغير، والدمج الكبير فاضل واحد بس. **انتباه:** القائمتين لازم يبقوا نفس الطول، لأن `zip` بيقف عند أقصر واحدة **من غير أي error**، فالـ clone الزيادة هيتجاهل بصمت.
5. **`SEGMENT_WIDTH = 320`:** كل حاجة أسرع تقريبًا 4 مرات في الـ segmentation والتركيب، بس حواف الـ clones هتبقى أنعم وأقل دقة (الشعر والصوابع هيتمسحوا). ولو `1280`: أبطأ بكتير وتقريبًا من غير مكسب في الشكل.
6. **نشيل سطر `alpha = cv2.multiply(alpha, 1.0 - mask)`:** الـ clones هيترسموا **فوقنا**، فلو اتداخلوا مع جسمنا (وده بيحصل في النص من 250 لـ 390)، هيغطّونا بدل ما يبانوا ورانا.

---

## أسئلة مراجعة

<details>
<summary>1. إيه هو الـ confidence mask، وليه أحسن من الـ category mask هنا؟</summary>

صورة فيها لكل pixel احتمال من 0 لـ 1 إنه جزء من الشخص. أحسن لأنه بيدّي حواف متدرجة، ونقدر نستخدمه على طول كـ alpha وقت الدمج، بدل حواف 0/1 مسننة.
</details>

<details>
<summary>2. الـ segmenter بيعمل 3 خطوات بعد الموديل. إيه هما وكل واحدة بتحل مشكلة إيه؟</summary>

(1) EMA عبر الزمن: بيشيل الرعشة بين الـ frames. (2) Guided filter بـ guide رمادي: بيلزّق الحافة في حواف الصورة الحقيقية (وأسرع مرتين من الملون: 13.7 ← 7.7 ms). (3) منحنى `(mask-0.3)/0.4`: بيرجّع الخلفية 0 والجسم 1 مع حافة ناعمة ضيقة.
</details>

<details>
<summary>3. ليه <code>_timestamp</code> بتستخدم <code>max(ts, self._last_ts + 1)</code>؟</summary>

لأن MediaPipe في وضع VIDEO بيرفض أي timestamp مش أكبر تمامًا من اللي قبله. لو نداءين حصلوا في نفس الـ millisecond، بنزوّد 1 عشان الرقم يفضل بيزيد.
</details>

<details>
<summary>4. الـ clones بتعرض إيه بالظبط، وليه بيبانوا "حيين"؟</summary>

كل clone بيعرض frame قديم من الـ buffer (من 0.35 أو 0.75 ثانية)، متقصوص بالـ mask بتاعه ومتصغر ومتزاح. بيبانوا حيين لأنهم بيعيدوا حركتنا الحقيقية بتأخير بسيط، زي الصدى.
</details>

<details>
<summary>5. إزاي نشتق معادلة اللون في الـ "over"، وإزاي <code>cv2.blendLinear</code> بتحققها؟</summary>

`α_out = a + α_old(1-a)` و `C_out = (C_img·a + C_old·α_old(1-a)) / α_out`. `blendLinear(img, old, a, old_w)` بتحسب `(img·a + old·old_w)/(a + old_w)`، ولو `old_w = α_old(1-a)` تبقى نفس المعادلة بالظبط، والمقام هو `α_out` الجديد.
</details>

<details>
<summary>6. إزاي الشخص الحقيقي بيفضل قدام الـ clones، وليه الدخان بيغطيه؟</summary>

بعد ما الـ clones يترسموا، الـ alpha بتتضرب في `1 - mask` (الـ mask الحالي)، فبتبقى 0 مكان الشخص ونشوف الصورة الأصلية. الدخان بيتضاف **بعد** الخطوة دي، فمش بيتقص ويغطي الكل.
</details>

<details>
<summary>7. إيه الحيلتين اللي خلّوا الـ Shadow Clone سريع؟</summary>

(1) كل التركيب (clones + قص + دخان) بيحصل في طبقة واحدة بالمقاس الصغير 640×360، وبعدين دمج واحد بس بالمقاس الكامل (55 ← 15 ms). (2) الـ segmentation بتشتغل في thread تاني بالتوازي مع تتبع الإيد (loop كامل 91 ← 59 ms).
</details>

<details>
<summary>8. ليه <code>finished</code> متعدلة في <code>ShadowClone</code>؟</summary>

عشان الـ effect مايتشالش والدخان لسه في الهوا. لازم الـ fade out العادي يخلص **و** آخر particle دخان يموت، وإلا الدخان هيختفي فجأة.
</details>

---

## ملاحظات على الكود (حاجات ممكن تلخبط)

- **منحنى كثافة الدخان (اتصلّح):** النسخة القديمة من السطر ده كانت `sin(π × min(1.5t, 1)) × 140`، وكانت بتوصل للقمة عند `t = 1/3` وترجع صفر عند `t = 2/3`، فالتلت الأخير من عمر كل particle كان مش باين خالص، وده عكس التعليق "rises fast, fades slowly". النسخة الحالية `sin(π/2 × min(4t, 1)) × (1 - t) × 140` مطابقة للتعليق: طلوع في أول ربع العمر ونزول بطيء لحد الموت. الملحوظة دي متسابة هنا عشان تفسّر لو حد شاف النسخة القديمة.
- **`fade_out = 0.6` مش بيتحكم في شفافية الـ clones:** الـ clones بيختفوا في 0.25 ثانية (رقم مكتوب جوه `render`)، و`fade_out` بيأثر بس على امتى `finished` ترجع `True`.
- **`zip(delays, offsets)`** بيتجاهل بصمت أي عنصر زيادة لو القائمتين مختلفين في الطول، و`max(delays)` هيعمل error لو القائمة فاضية.
- **الـ `eps = 1e-3` في الـ guided filter:** الـ guide هنا `uint8` (قيم من 0 لـ 255)، فالـ `eps` بيتقارن بتباين على المقياس ده، وده رقم صغير جدًا بالنسبة له. يعني الفلتر عمليًا بيلزق في أي حافة في الصورة بقوة. ده مش غلط، بس لو حد قرا `1e-3` وافتكر إنه على مقياس 0..1 هيفهم قوته غلط.
