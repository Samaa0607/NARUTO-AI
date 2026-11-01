# 08 — أساسيات الـ Effects

[⬅ الفهرس](00_index.md)

---

الملف ده بيشرح الأساس اللي كل الـ effects مبنية عليه:

| الملف | دوره |
|---|---|
| `shinobi/effects/base.py` | الكلاس الأب `Effect` (عمر الـ effect: يبدأ، يظهر تدريجيًا، يختفي) + `EffectManager` اللي بيشغّل الـ effect الحالي |
| `shinobi/effects/fx.py` | أدوات الرسم المشتركة: الـ glow (توهج)، الـ `color_ramp`، ونظام الـ particles |
| `shinobi/effects/__init__.py` | القاموس `EFFECTS` اللي بيربط اسم كل effect بالكود اللي بيبنيه |

لو فهمنا الملفات التلاتة دول، كل effect بعد كده (Rasengan، Chidori، Fire، Shadow Clone) هيبقى مجرد "استخدام" للأدوات دي.

---

# الجزء الأول: `effects/base.py`

## 1. الملف ده بيعمل إيه؟

كل effect في المشروع ليه نفس "دورة الحياة": بيبدأ لما الـ jutsu يتعرف عليه، بيظهر تدريجيًا (fade in)، بيفضل شغال شوية، وبعدين بيختفي تدريجيًا (fade out) ويخلص. بدل ما نكرر المنطق ده في كل effect، اتحط مرة واحدة في الكلاس `Effect`، وكل effect بيورث منه (inheritance) ويكتب بس طريقة الرسم بتاعته في `render`.

وجنبه `EffectManager`: ده "المدير" اللي `main.py` بيكلمه. `main.py` مايعرفش Rasengan ولا Chidori؛ هو بس بيقول للمدير "شغّل effect اسمه كذا" و"ارسم الـ frame ده".

مكانه في الـ pipeline:

```
controller ──"rasengan"──► EffectManager.start("rasengan")
                                 │
main loop كل frame ──────► EffectManager.render(frame, tracking, dt, segmentation)
                                 │
                                 ▼
                          active effect.render(...)  ──► frame جديد عليه الـ effect
```

## 2. الكود سطر بسطر

```python
"""Base class every visual effect inherits from, plus the manager that runs the active one."""
```

- ده الـ docstring بتاع الـ module: جملة بتوصف الملف. مالهاش أي تأثير على التشغيل، بس بتظهر لو عملنا `help()` وبتساعد اللي بيقرا الكود.

```python
class Effect:
    name = "base"
    needs_segmentation = False   # True -> main loop runs the person segmenter for us
    follows_hand = False         # True -> effect fades out when the hand disappears
    fade_in = 0.3
    fade_out = 0.5
```

- `class Effect:` تعريف الكلاس الأب. مش هنعمل منه object مباشرة، إحنا بنورث منه بس.
- `name = "base"` اسم الـ effect. ده **class attribute** (متعرّف على الكلاس نفسه مش جوه `__init__`)، فكل كلاس ابن بيغيّره بسطر واحد زي `name = "rasengan"`. الـ HUD بيعرض الاسم ده.
- `needs_segmentation = False` هل الـ effect محتاج يعرف "فين الشخص في الصورة"؟ الـ segmentation غالية (بتاخد وقت)، فـ `main.py` مش بيشغّلها إلا لو الـ effect الحالي قال `True`. الـ Shadow Clone بس هو اللي بيقول `True`.
- `follows_hand = False` هل الـ effect مربوط بالإيد؟ لو `True` (Rasengan، Chidori، Fire) والإيد اختفت، الـ effect يبدأ يختفي. الـ Shadow Clone مش مربوط بالإيد، فبيفضل `False`.
- `fade_in = 0.3` الـ effect بياخد 0.3 ثانية عشان يوصل لكامل قوته.
- `fade_out = 0.5` وبياخد 0.5 ثانية عشان يختفي خالص بعد ما يتوقف.
- **ليه class attributes مش parameters؟** لأنها صفات ثابتة لنوع الـ effect، مش حاجة بتتغير من مرة للتانية. الكلاس الابن بيغيّرها بمجرد إنه يكتبها تاني (override)، من غير ما يلمس `__init__`.

```python
    def __init__(self, duration):
        self.duration = duration
        self.t0 = None
        self.stop_at = None      # time the fade-out started
        self.age = 0.0
```

- `__init__(self, duration)` الـ constructor. بياخد `duration`: المدة اللي الـ effect يفضل فيها شغال (من `config.EFFECT_DURATION`، مثلًا 8 ثواني للـ Rasengan).
- `self.duration = duration` بنحفظ المدة جوه الـ object.
- `self.t0 = None` وقت البداية. `None` معناها "لسه ما بدأش"، وهتتملي في `start`.
- `self.stop_at = None` الوقت اللي الـ fade out بدأ فيه. طول ما هو `None` يبقى الـ effect لسه شغال عادي.
- `self.age = 0.0` عمر الـ effect بالثواني من ساعة ما بدأ. بيتحدّث في `opacity`، والـ effects بتستخدمه (مثلًا الـ Rasengan بيكبر في أول 0.6 ثانية من عمره).

```python
    def start(self, now):
        self.t0 = now

    def stop(self, now):
        if self.stop_at is None:
            self.stop_at = now
```

- `start(self, now)` بتسجل وقت البداية. `now` جاي من `time.perf_counter()` في `main.py` (ساعة بالثواني).
- `stop(self, now)` بتطلب من الـ effect إنه يبدأ يختفي.
- `if self.stop_at is None:` **السطر ده مهم جدًا**: `stop` ممكن تتنادى كل frame (مثلًا كل frame والإيد مش ظاهرة). لو كنا بنكتب `self.stop_at = now` كل مرة، وقت الـ fade out هيفضل يتأجل للأبد والـ effect عمره ما هيختفي. الشرط ده بيخلي أول نداء بس هو اللي يتحسب.

```python
    def opacity(self, now):
        """0..1 envelope: fades in at the start, fades out at the end."""
        self.age = now - self.t0
        if self.stop_at is None and self.age >= self.duration:
            self.stop_at = now
        a = min(1.0, self.age / self.fade_in)
        if self.stop_at is not None:
            a = min(a, max(0.0, 1.0 - (now - self.stop_at) / self.fade_out))
        return a
```

- `opacity(self, now)` بترجع رقم من 0 لـ 1: الـ effect "ظاهر قد إيه" دلوقتي. 0 = مش ظاهر خالص، 1 = ظاهر بكامل قوته. الـ effects بتضرب ألوانها في الرقم ده.
- `self.age = now - self.t0` العمر = الوقت دلوقتي ناقص وقت البداية.
- `if self.stop_at is None and self.age >= self.duration:` لو الـ effect لسه ما اتوقفش، وعمره عدّى المدة المسموحة...
- `self.stop_at = now` ...نوقفه أوتوماتيك. يعني الـ effect بيوقف نفسه لما وقته يخلص، من غير ما حد يناديله `stop`.
- `a = min(1.0, self.age / self.fade_in)` جزء الـ fade in: عند age=0 القيمة 0، عند age=0.15 القيمة 0.5، ومن age=0.3 وطالع القيمة بتوصل 1 والـ `min` بيقفلها عند 1.
- `if self.stop_at is not None:` لو الـ effect في مرحلة الاختفاء...
- `a = min(a, max(0.0, 1.0 - (now - self.stop_at) / self.fade_out))` جزء الـ fade out: `(now - self.stop_at) / self.fade_out` هو "كام في المية من الـ fade out خلص". `1.0 - ...` بيقلبه فيبقى بينزل من 1 لـ 0. الـ `max(0.0, ...)` بيمنع القيمة إنها تبقى سالبة بعد ما الـ fade out يخلص. والـ `min(a, ...)` بياخد الأصغر بين الـ fade in والـ fade out، عشان لو الـ effect اتوقف وهو لسه بيظهر (مثلًا عند 0.1 ثانية) مايقفزش فجأة لـ 1 وبعدين ينزل.
- `return a` نرجّع القيمة.
- ملاحظة: الدالة دي مش بس "بتحسب"، دي كمان **بتحدّث الحالة** (`age` و `stop_at`). عشان كده أي effect لازم يناديها كل frame، حتى لو مش محتاج الرقم نفسه (الـ Shadow Clone بيعمل كده بالظبط).

```python
    def finished(self, now):
        return self.stop_at is not None and now - self.stop_at >= self.fade_out
```

- `finished` بترجع `True` لو الـ effect خلص خالص: يعني اتوقف (`stop_at` مش `None`) **و** الـ fade out كله عدّى. ساعتها المدير بيشيله.

```python
    def render(self, frame, tracking, dt, segmentation=None):
        """Draw the effect onto frame (BGR uint8) and return it."""
        raise NotImplementedError
```

- `render` هي الدالة اللي كل effect لازم يكتبها بنفسه: بتاخد الـ frame وترجّع frame جديد عليه الرسم.
  - `frame`: صورة الكاميرا (NumPy array، BGR، uint8، هنشرحها تحت).
  - `tracking`: object من `tracking.py` فيه مكان الإيد المتنعّم (`anchor`)، حجمها (`size`)، اتجاهها (`direction`)، هل هي ظاهرة (`visible`)، والوقت (`now`).
  - `dt`: الوقت بين الـ frame ده واللي قبله بالثواني (للـ particles).
  - `segmentation`: نتيجة فصل الشخص عن الخلفية، أو `None` لو الـ effect مش محتاجها.
- `raise NotImplementedError` لو حد نسي يكتب `render` في الكلاس الابن، البرنامج هيقع برسالة واضحة بدل ما يرسم ولا حاجة في صمت.

```python
class EffectManager:
    def __init__(self, factories):
        self.factories = factories   # name -> callable that builds a fresh effect
        self.active = None
```

- `class EffectManager:` المدير. في أي لحظة فيه effect واحد بس شغال (أو مافيش).
- `self.factories = factories` قاموس: اسم الـ effect ← دالة بتبني object جديد منه. ده القاموس `EFFECTS` من `effects/__init__.py` (`main.py` بيعمل `EffectManager(EFFECTS)`).
- `self.active = None` الـ effect الشغال دلوقتي. `None` = مافيش effect.

```python
    def start(self, name, now):
        self.active = self.factories[name]()
        self.active.start(now)

    def stop(self, now):
        if self.active is not None:
            self.active.stop(now)
```

- `self.factories[name]()` بنجيب الدالة بالاسم وبنناديها (مع ملاحظة القوسين `()`) فترجع **object جديد** من الـ effect. لو كان فيه effect شغال قبله، بيتشال فورًا ويتحط الجديد مكانه.
- `self.active.start(now)` نسجّل وقت البداية.
- `stop(self, now)` لو فيه effect شغال، نطلب منه يبدأ يختفي (زرار `0` في الكيبورد بيناديها). الشرط `is not None` بيمنع error لو مافيش effect.

```python
    @property
    def needs_segmentation(self):
        return self.active is not None and self.active.needs_segmentation
```

- `@property` بتخلينا نكتب `effects.needs_segmentation` من غير أقواس كأنها متغير عادي، مع إنها بتتحسب كل مرة.
- بترجع `True` بس لو فيه effect شغال **و** الـ effect ده محتاج segmentation. `main.py` بيسألها كل frame عشان يقرر يشغّل الـ segmenter ولا لأ.

```python
    def render(self, frame, tracking, dt, segmentation=None):
        effect = self.active
        if effect is None:
            return frame
```

- `effect = self.active` نسخة محلية قصيرة الاسم.
- لو مافيش effect، نرجّع الـ frame زي ما هو من غير أي شغل.

```python
        if effect.follows_hand and not tracking.visible:
            effect.stop(tracking.now)
        if effect.finished(tracking.now):
            self.active = None
            return frame
        return effect.render(frame, tracking, dt, segmentation)
```

- `if effect.follows_hand and not tracking.visible:` لو الـ effect مربوط بالإيد والإيد مش ظاهرة... (`visible` في `tracking.py` بتفضل `True` لمدة `HAND_LOST_GRACE = 0.6` ثانية بعد ما الإيد تختفي، عشان رمشة واحدة في الـ detection ماتطفيش الـ effect).
- `effect.stop(tracking.now)` ...نبدأ الـ fade out. وبفضل الشرط اللي جوه `stop` النداء المتكرر كل frame مش بيأجّل حاجة.
- `if effect.finished(tracking.now):` لو الـ effect خلص الـ fade out...
- `self.active = None` نشيله (والـ object هيتمسح من الذاكرة لوحده بالـ garbage collector).
- `return frame` ونرجّع الصورة من غير رسم.
- `return effect.render(...)` غير كده، نخلي الـ effect يرسم ونرجّع نتيجته.

## 3. مفاهيم مهمة

### دورة حياة الـ effect (Lifecycle)

```
 EffectManager.start()          duration خلصت                fade_out خلص
        │                    أو stop() اتنادت                      │
        ▼                           ▼                              ▼
   ┌─────────┐   0.3s   ┌────────┐       ┌──────────────┐  0.5s  ┌──────────┐
   │ start   │────────►│ active │──────►│ fading out   │───────►│ finished │
   │ fade in │         │ (1.0)  │       │ (stop_at set)│        │ active=None
   └─────────┘         └────────┘       └──────────────┘        └──────────┘
```

فيه 3 طرق الـ effect يدخل بيها مرحلة الـ fade out:
1. المدة خلصت (`age >= duration`) جوه `opacity`.
2. المستخدم داس `0` فـ `EffectManager.stop` اتنادت.
3. الـ effect `follows_hand` والإيد اختفت أكتر من فترة السماح.

### الـ opacity envelope (شكل منحنى الظهور)

مثال: Rasengan بـ `duration = 8`، `fade_in = 0.3`، `fade_out = 0.5`:

```
opacity
  1.0 |       ________________________________
      |      /                                \
  0.5 |     /                                  \
      |    /                                    \
  0.0 |___/                                      \__________
      +---+---+----------------------------------+---+------► الوقت (ثانية)
          0  0.3                                 8  8.5
         t0  (fade in خلص)                 stop_at   finished
```

الكلمة "envelope" (غلاف) جاية من الصوت: نفس فكرة إن النغمة بتعلى وبتوطى تدريجيًا بدل ما تبدأ وتقطع فجأة. التدرج ده هو اللي بيخلي الـ effect شكله احترافي بدل ما "يطق" على الشاشة.

### `needs_segmentation` و `follows_hand`

دول "أعلام" (flags) بيحكوا للنظام عن احتياجات الـ effect، من غير ما النظام يعرف تفاصيله:

| الـ effect | `needs_segmentation` | `follows_hand` |
|---|---|---|
| Shadow Clone | `True` | `False` |
| Rasengan | `False` | `True` |
| Chidori | `False` | `True` |
| Fire | `False` | `True` |

الفايدة: `main.py` مافيهوش أي `if effect == "shadow_clone"`. لو ضفنا effect جديد محتاج segmentation، يكفي يكتب `needs_segmentation = True`.

### `EffectManager` والـ factory dict (ليه lambda؟)

القاموس `EFFECTS` مش بيخزّن effects جاهزة، بيخزّن **دوال بتبني** effects (factory = مصنع). كل مرة `start` بتتنادى، بنبني object **جديد**. ليه؟

- الـ effect جواه **حالة** (state): `t0`، `stop_at`، `age`، الـ particles، والـ Shadow Clone جواه buffer فيه frames قديمة، وأعلام `shown` و `gone` لكل clone.
- لو كنا بنستخدم نفس الـ object تاني، التفعيل التاني هيبدأ بـ `stop_at` قديم (فيخلص فورًا)، وparticles قديمة لسه طايرة، وframes قديمة في الـ buffer. object جديد = بداية نضيفة مضمونة.
- كمان `lambda` بتقرا `config.EFFECT_DURATION[...]` **وقت التفعيل** مش وقت تحميل الملف.

ليه `lambda` ومش اسم الكلاس بس (`ShadowClone`)؟ لأن الكلاس محتاج argument (`duration`)، والمدير بينادي `self.factories[name]()` من غير arguments. الـ `lambda` بتلف النداء ده: `lambda: ShadowClone(10.0)`.

---

# الجزء التاني: `effects/fx.py`

## 1. الملف ده بيعمل إيه؟

ده "صندوق العدة" اللي كل الـ effects بتستخدمه:

- `add_glow`: بتحط طبقة الرسم على صورة الكاميرا بطريقة **الإضاءة** (additive) وبتضيف هالة متوهجة (bloom). هي اللي بتخلي الـ Rasengan "منوّر" مش مجرد دواير زرقا مرسومة.
- `color_ramp`: بتدّي لون حسب رقم من 0 لـ 1 (مثلًا لون النار حسب عمر الـ particle: أبيض ← أصفر ← برتقاني ← أحمر ← دخان).
- `Particles`: نظام particles (آلاف النقط الصغيرة اللي بتطير) مكتوب بالـ NumPy عشان يبقى سريع.
- `random_directions`: بتطلّع اتجاهات عشوائية للـ particles.

## 2. الكود سطر بسطر

```python
"""Shared drawing tools: additive glow and a vectorized particle system."""

import cv2
import numpy as np
```

- الـ docstring: أدوات رسم مشتركة: glow بالجمع، ونظام particles "vectorized" (يعني بيشتغل على arrays كاملة مرة واحدة بدل loop على كل عنصر).
- `import cv2` مكتبة OpenCV: الرسم (`circle`)، التنعيم (`GaussianBlur`)، تغيير الحجم (`resize`)، والدمج (`addWeighted`).
- `import numpy as np` العمليات الحسابية على الـ arrays.

```python
def add_glow(frame, layer, center, extent, strength=1.0, blur=25, opacity=1.0, soften=0.0):
    """Additive blend of `layer` onto `frame`, plus a soft blurred halo (bloom).

    Speed tricks:
      * only the square around the effect (center +- extent, plus room for the halo) is processed
      * the blur runs on a shrunken copy: a halo is soft anyway, so nobody sees the difference
    soften > 0 also blurs the sharp core a little (melts separate particles into one flame).
    """
```

- الـ parameters:
  - `frame`: صورة الكاميرا.
  - `layer`: صورة سودا بنفس المقاس، الـ effect رسم عليها (اللون الأسود = 0 = "مافيش ضوء").
  - `center`: مركز الـ effect بالـ pixels `(x, y)`.
  - `extent`: نص قطر المنطقة اللي فيها الرسم (الـ effect مش هيطلع براها).
  - `strength`: قوة الهالة.
  - `blur`: قد إيه الهالة واسعة (الـ sigma بتاع الـ Gaussian blur).
  - `opacity`: من `Effect.opacity` (للـ fade in/out).
  - `soften`: لو أكبر من صفر، بينعّم الرسم الأصلي نفسه شوية.
- الـ docstring بيشرح الفكرة وحيلتين السرعة اللي هنشرحهم في المفاهيم تحت، و`soften` (بيدوّب particles النار في بعض فتبان شعلة واحدة).

```python
    h, w = frame.shape[:2]
    pad = extent + 2 * blur
    x0, y0 = max(0, int(center[0] - pad)), max(0, int(center[1] - pad))
    x1, y1 = min(w, int(center[0] + pad)), min(h, int(center[1] + pad))
```

- `h, w = frame.shape[:2]` الطول والعرض. `shape` بتاع صورة ملونة هو `(H, W, 3)`، و`[:2]` بياخد أول اتنين.
- `pad = extent + 2 * blur` نص ضلع المربع اللي هنشتغل فيه: مساحة الرسم (`extent`) + مساحة زيادة للهالة، لأن الـ blur بيفرش الضوء لحد حوالي 2-3 sigma بره الرسم.
- `x0, y0 = max(0, ...)` الركن الشمال-فوق للمربع. الـ `max(0, ...)` بيمنعه يطلع برّه الصورة من الشمال أو من فوق.
- `x1, y1 = min(w, ...)` الركن اليمين-تحت، والـ `min` بيقفله على حدود الصورة. `int(...)` لأن الـ slicing محتاج أرقام صحيحة.

```python
    out = frame.copy()
    if x1 - x0 < 8 or y1 - y0 < 8:                                # effect is off screen
        return out
```

- `out = frame.copy()` نسخة من الصورة نرسم عليها، عشان مانغيّرش الـ `frame` الأصلي (ممكن حد تاني بيستخدمه).
- لو المربع بعد القص أصغر من 8 pixels في أي اتجاه، يبقى الـ effect برّه الشاشة تقريبًا، فنرجّع النسخة على طول بدل ما نعمل blur على حاجة فاضية (وكمان نتجنب أحجام صفر في `resize` اللي بتعمل error).

```python
    roi_layer = layer[y0:y1, x0:x1]
    if soften > 0:                                                # blur at half size: 4x cheaper
        rh, rw = roi_layer.shape[:2]
        half = cv2.resize(roi_layer, (max(1, rw // 2), max(1, rh // 2)), interpolation=cv2.INTER_AREA)
        roi_layer = cv2.resize(cv2.GaussianBlur(half, (0, 0), soften / 2), (rw, rh))
```

- `roi_layer = layer[y0:y1, x0:x1]` الـ ROI (Region Of Interest): الجزء من طبقة الرسم اللي جوه المربع بس. الملاحظ إن الـ indexing في NumPy **صفوف الأول** (y) وبعدين أعمدة (x). وده view (شباك على نفس الذاكرة) مش نسخة، فمش بيكلف حاجة.
- `if soften > 0:` لو مطلوب تنعيم للرسم نفسه (الـ Fire بس بيستخدمه).
- `rh, rw = roi_layer.shape[:2]` مقاس الـ ROI.
- `half = cv2.resize(..., (max(1, rw // 2), max(1, rh // 2)), interpolation=cv2.INTER_AREA)` نصغّر للنص. `cv2.resize` بياخد المقاس `(width, height)` (عكس الـ shape!). `INTER_AREA` هي أحسن طريقة للتصغير لأنها بتاخد متوسط الـ pixels بدل ما تنط عليهم. والـ `max(1, ...)` يمنع مقاس صفر.
- `roi_layer = cv2.resize(cv2.GaussianBlur(half, (0, 0), soften / 2), (rw, rh))` نعمل blur على النسخة الصغيرة ونرجّعها للمقاس الأصلي. الـ sigma اتقسمت على 2 لأن الصورة نص الحجم، فـ blur بـ `soften/2` على الصغيرة = blur بـ `soften` على الكبيرة تقريبًا. `(0, 0)` معناها "احسب حجم الـ kernel من الـ sigma لوحدك". التعليق بيقول "4x أرخص" لأن نص العرض × نص الطول = ربع عدد الـ pixels.

```python
    shrink = 8 if blur > 40 else 4
    sw, sh = max(1, (x1 - x0) // shrink), max(1, (y1 - y0) // shrink)
    small = cv2.resize(roi_layer, (sw, sh), interpolation=cv2.INTER_AREA)
    small = cv2.GaussianBlur(small, (0, 0), max(1.0, blur / shrink))
    halo = cv2.resize(small, (x1 - x0, y1 - y0), interpolation=cv2.INTER_LINEAR)
```

ده عمل الهالة (الـ bloom):
- `shrink = 8 if blur > 40 else 4` هنصغّر الصورة كام مرة. لو الهالة واسعة جدًا (blur كبير) نقدر نصغّر أكتر (8 مرات) من غير ما حد يلاحظ، غير كده 4 مرات.
- `sw, sh = ...` المقاس الصغير.
- `small = cv2.resize(roi_layer, (sw, sh), interpolation=cv2.INTER_AREA)` نصغّر الرسم.
- `small = cv2.GaussianBlur(small, (0, 0), max(1.0, blur / shrink))` blur على الصغيرة. الـ sigma اتقسمت على `shrink` لنفس السبب اللي فوق. والـ `max(1.0, ...)` يضمن blur حقيقي حتى لو الرقم طلع صغير.
- `halo = cv2.resize(small, (x1 - x0, y1 - y0), interpolation=cv2.INTER_LINEAR)` نكبّرها تاني لمقاس الـ ROI. `INTER_LINEAR` للتكبير بتعمل انتقال ناعم بين الـ pixels (والهالة أصلًا ناعمة فمش هيبان أي "تكسير").

```python
    roi = out[y0:y1, x0:x1]
    roi = cv2.addWeighted(roi, 1.0, roi_layer, opacity, 0)              # sharp core (saturating add)
    out[y0:y1, x0:x1] = cv2.addWeighted(roi, 1.0, halo, strength * opacity, 0)   # soft halo
    return out
```

- `roi = out[y0:y1, x0:x1]` الجزء المقابل من صورة الكاميرا.
- `cv2.addWeighted(roi, 1.0, roi_layer, opacity, 0)` بتحسب `roi*1.0 + roi_layer*opacity + 0` لكل pixel، مع **saturation** (لو الناتج عدّى 255 بيقف عند 255). ده الرسم الحاد نفسه (الـ core) بيتضاف كضوء على الصورة.
- السطر اللي بعده بيضيف الهالة بنفس الطريقة، بقوة `strength * opacity`، ويكتب النتيجة جوه `out` في نفس المكان. كده الـ effect بيبقى: رسم حاد في النص + توهج ناعم حواليه، والاتنين بيخفّوا مع الـ opacity.
- `return out` الصورة النهائية.

```python
def color_ramp(t, stops):
    """Interpolate colors. t: (N,) in 0..1, stops: list of (position, (b, g, r))."""
    pos = np.array([s[0] for s in stops], np.float32)
    cols = np.array([s[1] for s in stops], np.float32)
    return np.stack([np.interp(t, pos, cols[:, c]) for c in range(3)], axis=1)
```

- `color_ramp(t, stops)` بتاخد array من أرقام `t` (واحد لكل particle) وقائمة "محطات" ألوان، وبترجع لون لكل `t`.
- `pos = np.array([s[0] for s in stops], np.float32)` مواقع المحطات، مثلًا `[0, 0.15, 0.4, 0.7, 1.0]`.
- `cols = np.array([s[1] for s in stops], np.float32)` ألوان المحطات، array شكلها `(عدد المحطات, 3)`.
- `np.interp(t, pos, cols[:, c])` الـ linear interpolation: لكل `t` بتشوف هو بين أنهي محطتين وبتاخد قيمة في النص بالنسبة. بنعملها لكل قناة لون لوحدها (`c` = 0 للأزرق، 1 للأخضر، 2 للأحمر).
- `np.stack([...], axis=1)` بتلزق التلات قنوات جنب بعض فيبقى الناتج `(N, 3)`: لون لكل particle.

```python
class Particles:
    """All particles live in NumPy arrays: one row per particle, no Python object per particle."""

    def __init__(self):
        self.pos = np.zeros((0, 2), np.float32)
        self.vel = np.zeros((0, 2), np.float32)
        self.life = np.zeros(0, np.float32)       # seconds lived so far
        self.max_life = np.zeros(0, np.float32)
        self.size = np.zeros(0, np.float32)
```

- الـ docstring بيلخّص الفكرة: كل الـ particles في arrays، كل particle = صف، مافيش Python object لكل particle.
- `self.pos` المواقع، شكلها `(N, 2)`: لكل particle `(x, y)`. بنبدأ بـ 0 صفوف (فاضية).
- `self.vel` السرعات `(N, 2)`: `(vx, vy)` بالـ pixels في الثانية.
- `self.life` كل particle عاش كام ثانية لحد دلوقتي `(N,)`.
- `self.max_life` كل particle هيعيش قد إيه في المجموع `(N,)`.
- `self.size` نص قطر كل particle `(N,)`.
- `np.float32` بدل float64 الافتراضي: نص الذاكرة وأسرع، والدقة كفاية جدًا للرسم.

```python
    def __len__(self):
        return len(self.life)
```

- `__len__` بتخلي `len(particles)` يشتغل ويرجّع عدد الـ particles العايشة. الـ Shadow Clone بيستخدمها عشان يعرف الدخان خلص ولا لأ.

```python
    def emit(self, pos, vel, max_life, size):
        n = len(vel)
        self.pos = np.vstack([self.pos, np.broadcast_to(pos, (n, 2))]).astype(np.float32)
        self.vel = np.vstack([self.vel, vel]).astype(np.float32)
        self.life = np.concatenate([self.life, np.zeros(n, np.float32)])
        self.max_life = np.concatenate([self.max_life, max_life]).astype(np.float32)
        self.size = np.concatenate([self.size, size]).astype(np.float32)
```

- `emit` بتولّد (تطلق) particles جديدة.
- `n = len(vel)` عدد الـ particles الجديدة = عدد صفوف السرعات.
- `np.broadcast_to(pos, (n, 2))` لو `pos` نقطة واحدة `(x, y)`، بتكررها `n` مرة من غير نسخ فعلي (كل الـ particles تطلع من نفس النقطة). ولو `pos` أصلًا `(n, 2)` (موقع لكل particle، زي الـ Rasengan) بتسيبها زي ما هي.
- `np.vstack([...])` بتلزق الصفوف الجديدة تحت القديمة. `.astype(np.float32)` تضمن النوع.
- `self.life = np.concatenate([..., np.zeros(n, np.float32)])` الجداد عمرهم صفر.
- `max_life` و `size`: نلزق القيم الجديدة (array طولها `n`) في آخر الـ arrays القديمة.
- مهم: كل الـ 5 arrays لازم يفضلوا نفس الطول دايمًا، عشان الصف رقم `i` في كل واحد يبقى نفس الـ particle.

```python
    def update(self, dt, gravity=(0.0, 0.0), drag=0.0):
        self.vel += np.array(gravity, np.float32) * dt
        self.vel *= max(0.0, 1.0 - drag * dt)
        self.pos += self.vel * dt
        self.life += dt
        alive = self.life < self.max_life
        for name in ("pos", "vel", "life", "max_life", "size"):
            setattr(self, name, getattr(self, name)[alive])
```

- `update(self, dt, gravity, drag)` بتحرّك كل الـ particles خطوة واحدة في الزمن (مرة كل frame).
- `self.vel += np.array(gravity, np.float32) * dt` الجاذبية (أو أي قوة ثابتة) بتغيّر السرعة: السرعة الجديدة = القديمة + العجلة × الوقت. الـ `gravity` بتتجمع على **كل الصفوف** مرة واحدة (broadcasting). ملحوظة: في الصور محور y لتحت، فـ `gravity=(0, 400)` (Chidori) بتوقّع الشرار لتحت، و`(0, -3*size)` (Fire) بتطلّع النار لفوق.
- `self.vel *= max(0.0, 1.0 - drag * dt)` الـ drag (مقاومة الهوا): كل frame السرعة بتقل بنسبة. مثلًا `drag=2` و `dt=0.033` يبقى بنضرب في 0.933، يعني الـ particle بيفرمل تدريجيًا. الـ `max(0.0, ...)` بيمنع إن الرقم يبقى سالب لو `drag * dt > 1` (ساعتها السرعة كانت هتعكس اتجاهها، وده غلط فيزيائيًا).
- `self.pos += self.vel * dt` الموقع الجديد = القديم + السرعة × الوقت.
- `self.life += dt` كل particle كبر `dt` ثانية.
- `alive = self.life < self.max_life` **boolean mask**: array من `True`/`False`، `True` للي لسه عايش.
- الـ loop: لكل اسم من أسماء الـ arrays الخمسة، `getattr(self, name)` بتجيب الـ array، و`[alive]` بتاخد الصفوف العايشة بس، و`setattr` بترجّعها مكانها. كده الـ particles الميتة اتشالت من الخمس arrays مع بعض في سطرين، من غير loop على الـ particles نفسها.

```python
    @property
    def t(self):
        """Normalized age 0 (born) .. 1 (dies)."""
        return self.life / np.maximum(self.max_life, 1e-6)
```

- `t` العمر **النسبي**: 0 = لسه مولود، 1 = خلاص هيموت. مفيد جدًا للرسم: الـ particle يصغر أو يغمق أو يتغير لونه حسب `t`، مهما كان عمره الحقيقي ثانية ولا نص ثانية.
- `np.maximum(self.max_life, 1e-6)` حماية من القسمة على صفر لو حد عمل particle بـ `max_life = 0`.

```python
    def draw(self, layer, colors, sizes=None, positions=None):
        sizes = self.size if sizes is None else sizes
        positions = self.pos if positions is None else positions
        h, w = layer.shape[:2]
```

- `draw` بترسم الـ particles كدواير على `layer`.
- `colors` لون لكل particle `(N, 3)`.
- `sizes` و `positions` اختياريين: لو مااتبعتوش، بنستخدم الحجم والموقع المتخزنين. الـ Fire بيبعت أحجام متغيرة حسب العمر، والـ Shadow Clone بيبعت مواقع متحولة من نسب لـ pixels.
- `h, w` مقاس الطبقة، للتأكد إن النقطة جوه الصورة.

```python
        # Convert to plain Python lists once: much faster than converting inside the loop.
        pts = positions.astype(np.int32).tolist()
        radii = np.maximum(1, sizes).astype(np.int32).tolist()
        cols = np.asarray(colors, np.float64).tolist()
        for (x, y), r, c in zip(pts, radii, cols):
            if 0 <= x < w and 0 <= y < h:
                cv2.circle(layer, (x, y), r, c, -1, cv2.LINE_AA)
```

- التعليق: بنحوّل لـ Python lists مرة واحدة، لأن ده أسرع بكتير من التحويل جوه الـ loop.
- `pts = positions.astype(np.int32).tolist()` المواقع لأرقام صحيحة (OpenCV بيرسم على pixels) وبعدين lists عادية: `[[x, y], [x, y], ...]`.
- `radii = np.maximum(1, sizes).astype(np.int32).tolist()` الأحجام، وأقل حاجة 1 pixel (دايرة نص قطرها 0 مش هتبان).
- `cols = np.asarray(colors, np.float64).tolist()` الألوان كـ lists من Python floats.
- `for (x, y), r, c in zip(pts, radii, cols):` لفة على كل particle: موقعه ونص قطره ولونه.
- `if 0 <= x < w and 0 <= y < h:` نرسم بس لو المركز جوه الصورة.
- `cv2.circle(layer, (x, y), r, c, -1, cv2.LINE_AA)` نرسم دايرة. `-1` = مليانة (filled)، و `LINE_AA` = حواف ناعمة (anti-aliased) بدل حواف مسننة.

```python
def random_directions(n, rng, center_angle=None, spread=np.pi):
    """n unit vectors. With center_angle: within +-spread of it; otherwise any direction."""
    base = 0.0 if center_angle is None else center_angle
    ang = base + rng.uniform(-spread, spread, n)
    return np.stack([np.cos(ang), np.sin(ang)], axis=1).astype(np.float32)
```

- بترجّع `n` اتجاه عشوائي، كل واحد **unit vector** (طوله 1)، فنضربه في أي سرعة إحنا عايزينها.
- `rng` مولّد أرقام عشوائية (`np.random.default_rng`) بيتبعت من الـ effect، عشان لو حطينا `seed` نقدر نكرر نفس النتيجة بالظبط (مفيد في الـ tests).
- `base = 0.0 if center_angle is None else center_angle` الزاوية اللي حوليها هنوزع.
- `ang = base + rng.uniform(-spread, spread, n)` زوايا عشوائية في المدى `base ± spread`. الافتراضي `spread = π` يعني ±180° = أي اتجاه في الدايرة. الـ Fire بيستخدم `spread=0.35` (حوالي ±20°) عشان النار تطلع في اتجاه الإيد بس.
- `np.stack([np.cos(ang), np.sin(ang)], axis=1)` من الزاوية للاتجاه: `(cos θ, sin θ)` دايمًا طوله 1. الناتج `(n, 2)`.

## 3. مفاهيم مهمة

### الصورة = NumPy array شكلها `(H, W, 3)` من نوع `uint8` بترتيب BGR

صورة الكاميرا 1280×720 هي array شكلها `(720, 1280, 3)`:

```
            x (عمود) ────────────►  1280
        ┌──────────────────────────┐
  y     │ [B,G,R] [B,G,R] [B,G,R]  │
 (صف)   │ [B,G,R] [B,G,R] ...      │
   │    │                          │
   ▼    └──────────────────────────┘
  720           frame[y, x] = [B, G, R]
```

- `uint8` = رقم صحيح من 0 لـ 255 لكل قناة.
- OpenCV بيرتّب الألوان **BGR** مش RGB. عشان كده الأزرق في الكود `(255, 150, 40)`: الـ B = 255.
- الـ indexing `frame[y, x]`: الصف (y) الأول.

### الـ Additive blending والـ saturation

الضوء الحقيقي بيتجمع: لو سلطنا كشاف أزرق على حيطة، الحيطة بتنوّر. عشان كده بنجمع الـ layer على الصورة (`frame + layer`) بدل ما نغطيها. وفايدة كمان: الأسود في الـ layer = 0، والجمع على صفر مابيغيرش حاجة، فالخلفية السودا للطبقة "شفافة" لوحدها.

المشكلة: `uint8` آخره 255. جربنا على اللابتوب ده:

```
numpy:     200 + 100  →  44    (overflow: 300 - 256، النقطة المنوّرة بقت غامقة!)
cv2.add:   200 + 100  →  255   (saturation: بتقف عند الأبيض)
```

NumPy بيعمل **wrap-around** (يلف ويرجع من الصفر)، فأكتر الأماكن نور هتطلع بقع سودا أو ألوانها غلط. دوال OpenCV (`cv2.add`، `cv2.addWeighted`) بتعمل **saturation** (تقف عند 255)، وده بالظبط سلوك الضوء: الحاجة اللي منوّرة أوي بتبقى أبيض. عشان كده `add_glow` بتستخدم `cv2.addWeighted`.

### الـ Bloom / Glow

في الأفلام والألعاب، الحاجات المنوّرة جدًا "بتسيّح" نور حواليها. طريقة عمله بسيطة:

```
layer (الرسم الحاد)  ──blur──►  halo (نسخة مسيّحة)
                                       │
frame + layer + halo × strength  ◄─────┘   (كله بالجمع)
```

يعني: ناخد نسخة من الرسم، نعملها blur كبير، ونجمعها تاني على الصورة. النتيجة: core حاد في النص وهالة ناعمة حواليه.

### حيلتين السرعة

الـ Gaussian blur مكلّف: تكلفته تقريبًا = (عدد الـ pixels) × (حجم الـ kernel)، وحجم الـ kernel حوالي 6 × sigma. والـ blur الكبير للهالة كان أبطأ حاجة في البرنامج.

**الحيلة 1 — نشتغل على الـ ROI بس:**

```
┌───────────────────────────────────────┐ 1280×720 = 921,600 pixel
│                                       │
│          ┌───────────┐                │
│          │   ROI     │ ← center ± pad │
│          │    (●)    │   بس ده اللي   │
│          │           │   بنعالجه      │
│          └───────────┘                │
└───────────────────────────────────────┘
```

بقية الصورة سودا في الـ layer أصلًا، فالـ blur عليها مضيعة وقت.

**الحيلة 2 — الـ blur على نسخة متصغرة:** الهالة ناعمة جدًا أصلًا، فمافيهاش تفاصيل هتضيع لو صغّرنا. مثال: Rasengan نص قطره 80 pixel ← `extent = 200`، `blur = 48`، `pad = 296` ← ROI حوالي 592×592. بما إن `blur > 40` يبقى `shrink = 8` ← بنعمل blur على 74×74 بس (أقل 64 مرة في عدد الـ pixels)، وبـ sigma = 6 بدل 48 (kernel أصغر 8 مرات). الاتنين مع بعض بيخلّوا الـ blur أرخص بالآلاف.

**النتيجة المقاسة على اللابتوب ده:**

| الـ effect | قبل | بعد |
|---|---|---|
| Rasengan | ~38 ms لكل frame | ~6-8 ms |
| Chidori | ~78 ms لكل frame | ~10 ms |

عشان نحس بالرقم: عشان نوصل 30 fps لازم الـ frame كله (كاميرا + MediaPipe + effect + عرض) يخلص في 33 ms. فـ 78 ms للـ effect لوحده كانت معناها أقل من 13 fps.

### `soften`

الـ Fire عبارة عن مئات الدواير الصغيرة. لو اتجمعت زي ما هي، شكلها "حبوب" مش شعلة. `soften` بيعمل blur خفيف على الرسم الحاد نفسه (مش الهالة بس) فالدواير تسيّح في بعض. ونفس فكرة التصغير: بنعمله على نص الحجم (ربع عدد الـ pixels).

### `color_ramp` مع `np.interp`

مثال من `fire.py`:

```
t:     0.00        0.15        0.40         0.70        1.00
      أبيض ساخن ── أصفر ──── برتقاني ──── أحمر ──── دخان غامق
```

لو `t = 0.275` (في النص بالظبط بين 0.15 و 0.40)، اللون = متوسط الأصفر `(60, 220, 255)` والبرتقاني `(10, 120, 255)` = `(35, 170, 255)`. `np.interp` بتعمل ده لكل الـ particles مرة واحدة. ولو `t` طلع برّه 0..1، `np.interp` بتثبّته على لون أول أو آخر محطة.

### نظام الـ particles الـ vectorized (Struct of Arrays)

الطريقة "البديهية" إننا نعمل class اسمه `Particle` ونحط 1000 object في list، ونعمل `for p in particles: p.x += p.vx * dt`. ده بطيء جدًا في Python، لأن كل عملية بتعدّي على الـ interpreter.

الطريقة اللي في الكود اسمها **Struct of Arrays**: بدل list من objects، عندنا 5 arrays، والـ particle رقم `i` هو الصف رقم `i` في كلهم:

```
 index │   pos      │    vel        │ life │ max_life │ size
 ──────┼────────────┼───────────────┼──────┼──────────┼─────
   0   │ [320, 200] │ [ 50, -120]   │ 0.10 │   0.40   │ 2.0
   1   │ [318, 205] │ [-80,  -60]   │ 0.05 │   0.35   │ 1.5
   2   │ [325, 198] │ [ 10, -200]   │ 0.38 │   0.40   │ 2.3   ← قرب يموت (t = 0.95)
  ...  │    ...     │     ...       │ ...  │   ...    │ ...
```

ساعتها `self.pos += self.vel * dt` سطر واحد بيحرّك **كل** الـ particles، والـ loop الحقيقي بيحصل جوه NumPy بلغة C.

### الـ Euler integration (التحريك خطوة بخطوة)

الفيزياء بتقول: العجلة بتغير السرعة، والسرعة بتغير الموقع. في الكمبيوتر بنقرّب ده بخطوات صغيرة كل frame:

```
vel = vel + gravity × dt      ← السرعة تتغير بالجاذبية
vel = vel × (1 - drag × dt)   ← الفرملة (مقاومة الهوا)
pos = pos + vel × dt          ← الموقع يتغير بالسرعة
```

(بالظبط اسمها semi-implicit Euler، لأننا بنحدّث السرعة الأول وبنستخدم السرعة الجديدة في الموقع، ودي أثبت شوية من الـ Euler العادي.) ليه بنضرب في `dt`؟ عشان الحركة تبقى بنفس السرعة الحقيقية سواء البرنامج شغال 15 fps ولا 30 fps. و`main.py` بيقفل `dt` على 0.1 ثانية بالكتير، عشان لو البرنامج هنّج ثانية، الـ particles ماتنطش مسافة ضخمة مرة واحدة.

### شيل الـ particles الميتة بالـ boolean mask

```
life      = [0.10, 0.50, 0.20, 0.90]
max_life  = [0.40, 0.45, 0.60, 0.80]
alive     = [True, False, True, False]
pos[alive] → الصف 0 والصف 2 بس
```

كده من غير أي `if` على particle particle.

### ليه `draw()` بتحوّل لـ Python lists مرة واحدة؟

`cv2.circle` محتاجة نرسمها particle particle (مافيش دالة OpenCV بترسم آلاف دواير مرة واحدة)، فلازم loop. سببين للتحويل:

1. **OpenCV 5 بيرفض NumPy scalars كلون.** جربنا على النسخة المتسطبة هنا (5.0.0): tuple فيها `np.float32` بتعمل error من نوع `Bad argument`. لازم Python `float` عادي.
2. **السرعة:** لو حوّلنا جوه الـ loop (`float(c[0])`، `int(x)` ...) هيبقى فيه آلاف التحويلات الصغيرة البطيئة. `.tolist()` بتحوّل الـ array كلها في نداء واحد سريع (مكتوب بـ C).

### `random_directions`

```
spread = π (الافتراضي)          center_angle = θ, spread = 0.35
        ↑                                 
     ↖  │  ↗                              ↗ ↗
   ←────●────→                       ●──→  → θ
     ↙  │  ↘                              ↘ ↘
        ↓                                
   أي اتجاه (انفجار)                 مخروط ضيق (نار طالعة من الإيد)
```

---

# الجزء التالت: `effects/__init__.py`

## 1. الملف ده بيعمل إيه؟

`__init__.py` بيخلي فولدر `effects` يبقى **package** نقدر نعمل منه import. وكمان فيه القاموس `EFFECTS`: "السجل" اللي فيه كل الـ effects المتاحة. `main.py` بيعمل `from shinobi.effects import EFFECTS` وبيدّيه للـ `EffectManager`.

## 2. الكود سطر بسطر

```python
from shinobi import config
from shinobi.effects.chidori import Chidori
from shinobi.effects.fire import FireStyle
from shinobi.effects.rasengan import Rasengan
from shinobi.effects.shadow_clone import ShadowClone
```

- `from shinobi import config` عشان نقرا المدد من `config.EFFECT_DURATION`.
- السطور التانية: بنستورد كلاس كل effect من الملف بتاعه.

```python
# name -> function that builds a fresh effect (a new object every activation)
EFFECTS = {
    "shadow_clone": lambda: ShadowClone(config.EFFECT_DURATION["shadow_clone"]),
    "rasengan": lambda: Rasengan(config.EFFECT_DURATION["rasengan"]),
    "chidori": lambda: Chidori(config.EFFECT_DURATION["chidori"]),
    "fire": lambda: FireStyle(config.EFFECT_DURATION["fire"]),
}
```

- التعليق: الاسم ← دالة بتبني effect جديد (object جديد كل تفعيل).
- `EFFECTS = {` قاموس.
- كل سطر: المفتاح هو اسم الـ effect (نفس الأسماء اللي في `config.JUTSU[...]["effect"]` و `config.EFFECT_KEYS`)، والقيمة `lambda` (دالة صغيرة من غير اسم ومن غير parameters) لما تتنادى بتعمل object جديد بالمدة بتاعته. مثلًا `EFFECTS["rasengan"]()` ترجع `Rasengan(8.0)` جديد.
- الملاحظ إن اسم المفتاح `"fire"` بس الكلاس اسمه `FireStyle`: القاموس هو اللي بيربط الاتنين.

## 3. مفاهيم مهمة

- **إزاي نضيف effect جديد؟** نعمل ملف فيه كلاس بيورث من `Effect` ويكتب `render`، ونضيفه في القاموس ده، ونحط مدته في `config.EFFECT_DURATION` وزرار في `config.EFFECT_KEYS` (أو jutsu في `config.JUTSU`). مافيش ولا سطر يتغير في `main.py` ولا في `EffectManager`. ده اسمه **Open/Closed**: الكود مفتوح للإضافة ومقفول للتعديل.
- **ليه factory مش objects جاهزة؟** شرحناها فوق في `EffectManager`: كل تفعيل لازم يبدأ بحالة نضيفة.

---

## لو غيّرنا ... هيحصل إيه؟

1. **`fade_in = 0.0` في `Effect`:** `self.age / self.fade_in` هيبقى قسمة على صفر ← `ZeroDivisionError` والبرنامج يقع. لو عايزين ظهور فوري، الأأمن رقم صغير زي `0.01`.
2. **`fade_out = 2.0`:** الـ effect هيختفي ببطء على مدار ثانيتين. والملاحظ إن `finished` بتستنى الـ `fade_out`، فالـ effect هيفضل "شغال" (والـ HUD يعرض اسمه) لحد ما الثانيتين يخلصوا.
3. **نبدّل `cv2.addWeighted` في `add_glow` بجمع NumPy عادي** (`roi + roi_layer`): هيظهر overflow: أكتر الأماكن نور في الـ Rasengan هتطلع بقع غامقة أو ألوان غريبة بدل الأبيض (زي `200 + 100 = 44`).
4. **`shrink = 1` (من غير تصغير):** الشكل تقريبًا نفسه، بس الوقت هيرجع للأرقام القديمة (Rasengan ~38 ms، Chidori ~78 ms) والـ fps هيقع بشكل واضح.
5. **`drag=0` في `update`:** الـ particles مش هتفرمل خالص، هتطير لحد ما عمرها يخلص فتروح أبعد وتبان "متناثرة" أكتر. ولو `drag` كبير أوي (مثلًا 50 مع `dt = 0.033`)، الـ `max(0.0, ...)` هيصفّر السرعة كل frame فالـ particles هتقف مكانها.
6. **نشيل `.tolist()` من `draw` ونبعت NumPy arrays لـ `cv2.circle` على طول:** على OpenCV 5 هيطلع `Bad argument` error من `cv2.circle` بسبب الألوان (NumPy scalars).

---

## أسئلة مراجعة

<details>
<summary>1. ليه <code>stop()</code> فيها شرط <code>if self.stop_at is None</code>؟</summary>

لأنها ممكن تتنادى كل frame (مثلًا والإيد مختفية). من غير الشرط، `stop_at` هيتحدّث كل frame فالـ fade out عمره ما هيخلص، والـ effect مش هيختفي أبدًا.
</details>

<details>
<summary>2. شكل منحنى الـ opacity إيه لـ effect مدته 6 ثواني؟ وليه الكود بيستخدم <code>min</code> بين الـ fade in والـ fade out؟</summary>

بيطلع من 0 لـ 1 في أول 0.3 ثانية، يفضل 1 لحد ثانية 6، وينزل لـ 0 من 6 لـ 6.5. الـ `min` عشان لو الـ effect اتوقف وهو لسه في الـ fade in، القيمة تكمّل نزول من المكان اللي وصلته بدل ما تقفز لـ 1.
</details>

<details>
<summary>3. ليه <code>EFFECTS</code> فيه <code>lambda</code> بدل objects جاهزة؟</summary>

لأن كل effect جواه state (وقت البداية، `stop_at`، particles، buffer). object جديد كل تفعيل = بداية نضيفة. والـ `lambda` لازمة لأن الكلاس محتاج `duration` والمدير بينادي من غير arguments.
</details>

<details>
<summary>4. إيه الفرق بين <code>cv2.add</code> والجمع العادي في NumPy على صور <code>uint8</code>؟</summary>

NumPy بيعمل wrap-around (‏200 + 100 = 44)، وOpenCV بيعمل saturation (‏200 + 100 = 255). الـ saturation هي اللي بتقلّد الضوء الحقيقي.
</details>

<details>
<summary>5. إيه حيلتين السرعة في <code>add_glow</code>، وليه التانية مش بتبوّظ الشكل؟</summary>

(1) نشتغل على ROI حوالين الـ effect بس. (2) نعمل الـ blur على نسخة متصغرة 4 أو 8 مرات ونكبّرها. التانية مش بتبان لأن الهالة ناعمة أصلًا ومافيهاش تفاصيل دقيقة تضيع.
</details>

<details>
<summary>6. يعني إيه Struct of Arrays، وليه أسرع؟</summary>

بدل object لكل particle، عندنا array لكل خاصية (pos, vel, life, max_life, size)، والـ particle = صف. العمليات بتحصل على الـ array كلها مرة واحدة جوه NumPy (C) بدل loop في Python.
</details>

<details>
<summary>7. إزاي الـ particles الميتة بتتشال؟</summary>

`alive = self.life < self.max_life` بتعمل boolean mask، وبعدين كل array من الخمسة بتتفلتر بـ `[alive]`، فبيفضل الصفوف العايشة بس، وكل الـ arrays يفضلوا متطابقين.
</details>

<details>
<summary>8. ليه الـ <code>t</code> (العمر النسبي) مفيد أكتر من <code>life</code>؟</summary>

لأن كل particle ليه عمر مختلف. `t` من 0 لـ 1 بيخلينا نكتب قاعدة واحدة للون والحجم والشفافية (زي `1 - t` أو `color_ramp(t, ...)`) تنفع لكل الـ particles.
</details>
