# 06 — الـ Controller (`shinobi/controller.py`)

[⬅ الفهرس](00_index.md)

---

## الملف ده بيعمل إيه؟

```
camera → hands → features → classifier → [ controller ] → effects → screen
```

الـ classifier بيدّينا كل frame (حوالي 30 مرة في الثانية) vector احتمالات زي:

```
idle 0.05 | clone_seal 0.02 | rasengan 0.88 | chidori 0.03 | fire 0.02
```

لو شغّلنا effect كل ما أعلى احتمال يبقى gesture، هتحصل كارثة: الموديل ساعات بيغلط في frame واحد (إيد بتتحرك، blur، إضاءة)، فالـ effects هتشتغل لوحدها، أو نفس الـ effect هيشتغل 30 مرة في الثانية.

الـ controller هو "المخ الهادي" اللي بياخد التوقعات المهزوزة دي ويطلع منها قرار واحد واضح: **"شغّل effect كذا دلوقتي"**. وده بيحصل في 3 مراحل (زي ما الـ docstring بيقول):

```
probabilities ─► GestureStabilizer ─► gesture مؤكد (مرة واحدة)
              ─► SequenceMatcher    ─► اسم jutsu (لو التسلسل اكتمل)
              ─► ActionController   ─► cooldown ─► اسم الـ effect
```

1. **`GestureStabilizer`**: يعمل smoothing للاحتمالات، ويأكّد الـ gesture بس لو كان قوي وواضح وفضل ثابت لمدة كافية — ومرة واحدة بس.
2. **`SequenceMatcher`**: يحفظ آخر الـ gestures المؤكدة ويشوف هل كوّنت jutsu (ممكن jutsu = إشارة واحدة، أو تسلسل إشارات).
3. **`ActionController`**: يربط الاتنين ويضيف **cooldown** عشان مايشتغلش jutsu ورا التاني على طول.

---

## الكود سطر بسطر

### 1) الـ docstring والـ imports

```python
"""Turns noisy per-frame predictions into confirmed gestures and jutsu activations.

Pipeline:  probabilities -> GestureStabilizer -> confirmed gesture events
           -> SequenceMatcher -> jutsu name -> ActionController (cooldown) -> effect name
"""
```

- بيوصف وظيفة الملف: تحويل توقعات كل frame "المهزوزة" لـ gestures مؤكدة وتفعيل jutsu، وبيرسم الـ pipeline اللي فوق.

```python
from dataclasses import dataclass, field

import numpy as np

from shinobi import config
```

- `dataclass, field`: لعمل `ControllerState` (class بسيط بيشيل بيانات).
- `numpy`: للعمليات على vector الاحتمالات.
- `config`: كل الأرقام (thresholds، أوقات، تعريف الـ jutsu) جاية من هناك، فمافيش أرقام "سحرية" جوه الكود.

### 2) `GestureStabilizer.__init__`

```python
class GestureStabilizer:
    """Smooths probabilities and only confirms a gesture after it is held steadily."""

    def __init__(self, labels, alpha=config.PROB_SMOOTHING, conf_on=config.CONF_ON,
                 conf_off=config.CONF_OFF, margin=config.MIN_MARGIN, hold=config.HOLD_SECONDS):
```

- `labels`: أسماء الـ gestures بترتيب أعمدة الموديل (جاية من `classifier.labels`).
- الباقي defaults من `config.py`:
  - `alpha = 0.4`: وزن الـ frame الجديد في الـ EMA.
  - `conf_on = 0.75`: الاحتمال المطلوب عشان نبدأ نعتبر الـ gesture "مرشح".
  - `conf_off = 0.45`: لو الـ gesture المؤكد نزل تحت ده، يبقى "اتساب".
  - `margin = 0.25`: الفرق المطلوب بين الأول والتاني.
  - `hold = 0.30`: ثواني لازم الـ gesture يفضل قوي فيها.
- خلّيناهم parameters (مش ثوابت جوه الكود) عشان نقدر نجرّب قيم تانية في الـ tests من غير ما نلمس `config.py`.

```python
        self.labels = list(labels)
        self.idle = self.labels.index("idle")
        self.alpha, self.conf_on, self.conf_off = alpha, conf_on, conf_off
        self.margin, self.hold = margin, hold
```

- `list(labels)`: نسخة كـ list (لو جت tuple أو حاجة تانية).
- `self.idle`: **رقم عمود** `idle`. مش بنفترض إنه 0؛ بندوّر عليه في الليستة عشان نكون صح دايمًا. لو `idle` مش موجود هنا هيطلع `ValueError` — وده سبب إن `train.py` بيرفض يدرّب من غير `idle`.
- باقي السطور بتحفظ الإعدادات. (`a, b, c = x, y, z` = تخصيص متعدد في سطر.)

```python
        self.smoothed = np.zeros(len(self.labels), np.float32)
        self.smoothed[self.idle] = 1.0
```

- `self.smoothed`: الاحتمالات بعد الـ smoothing. بنبدأها "100% idle" — منطقي: أول ما البرنامج يفتح، مافيش gesture، ومش عايزين الـ EMA يبدأ من أصفار (كل الـ classes 0) لأن ده حالة مالهاش معنى.

```python
        self.candidate = None       # gesture currently being held
        self.candidate_since = 0.0
        self.latched = None         # gesture already confirmed and not yet released
```

- `candidate`: رقم الـ gesture اللي **قوي دلوقتي** وبنعدّ وقته. `None` = مافيش.
- `candidate_since`: إمتى بدأ يبقى قوي (عشان نعرف عدّى `hold` ولا لأ).
- `latched`: الـ gesture اللي **اتأكد خلاص** ولسه الإيد ماسابتهوش. ده اللي بيمنع إنه يتأكد تاني وإحنا لسه ماسكينه (شرح الـ latch تحت).

### 3) `GestureStabilizer.update` — قلب الملف

```python
    def update(self, probs, now):
        """Feed one frame. Returns the confirmed gesture name once, or None."""
        if probs is None:           # no hands -> treat as idle
            probs = np.zeros_like(self.smoothed)
            probs[self.idle] = 1.0
```

- بتتنده مرة كل frame. `probs`: الاحتمالات من الـ classifier، `now`: الوقت الحالي بالثواني.
- بترجّع اسم الـ gesture **مرة واحدة بس** لحظة تأكيده، وفي أي frame تاني `None`.
- لو `probs is None` (مافيش إيد في الصورة، فـ `main.py` ماسألش الموديل أصلًا): بنعمل vector "100% idle". كده الـ smoothing يكمّل طبيعي ويرجع لـ idle بالتدريج بدل ما يقف.
- `np.zeros_like(self.smoothed)`: أصفار بنفس الشكل والنوع.

```python
        self.smoothed = self.alpha * probs + (1 - self.alpha) * self.smoothed
```

- **EMA (Exponential Moving Average)**: القيمة الجديدة = 40% من الـ frame الحالي + 60% من القيمة القديمة. الـ frame الغلط الواحد تأثيره بيتخفف، والقيمة بتتغير بنعومة. (الشرح والمعادلة في المفاهيم.)
- لاحظ إن العملية دي على الـ vector كله مرة واحدة (NumPy)، ومجموع الاحتمالات يفضل 1.

```python
        # Release the latch when the confirmed gesture fades out (hysteresis).
        if self.latched is not None and self.smoothed[self.latched] < self.conf_off:
            self.latched = None
```

- لو فيه gesture "مقفول عليه" (latched)، واحتماله نزل تحت `conf_off = 0.45`، يبقى المستخدم ساب الإشارة → نفك الـ latch. من اللحظة دي، لو عمل نفس الإشارة تاني، تتأكد تاني.
- ليه `0.45` مش `0.75`؟ ده الـ **hysteresis**: عتبة الدخول عالية وعتبة الخروج واطية، فالرعشة حوالين 0.75 مابتعملش "سيب/امسك/سيب/امسك".

```python
        order = np.argsort(self.smoothed)[::-1]
        top, second = order[0], order[1]
```

- `np.argsort(...)`: بيرجّع أرقام الأعمدة مترتبة من الأصغر للأكبر. `[::-1]` بيقلبها → من الأكبر للأصغر.
- `top`: رقم الـ gesture الأعلى احتمال، `second`: التاني.

```python
        strong = (top != self.idle and self.smoothed[top] >= self.conf_on
                  and self.smoothed[top] - self.smoothed[second] >= self.margin)
```

- الـ gesture يتقال عليه "قوي" بـ 3 شروط مع بعض:
  1. `top != self.idle`: الأول مش `idle` (مافيش حاجة نأكّدها لو الأعلى هو "لا شيء").
  2. `self.smoothed[top] >= self.conf_on`: احتماله المنعّم ≥ 0.75.
  3. الـ **margin**: الفرق بينه وبين التاني ≥ 0.25. ده بيمنع حالة "الموديل متردد بين اتنين" (مثلًا rasengan 0.55 و chidori 0.40). ملاحظة دقيقة: مجموع الاحتمالات المنعّمة = 1، فلو الأول ≥ 0.75، التاني ≤ 0.25، والفرق ≥ 0.5. يعني **مع الإعدادات الحالية الشرط ده عمره ما بيفشل لوحده**. بيبدأ يفرق بس لو `CONF_ON` نزل تحت 0.625 (= (1 + 0.25) / 2)، ساعتها الـ margin يبقى هو الحماية. يعني هو "حزام أمان" لو حد غيّر الإعدادات.

```python
        if not strong:
            self.candidate = None
            return None
```

- لو مش قوي: نلغي الـ candidate (عدّاد الوقت يتصفّر) ونرجّع `None`. يعني الـ hold لازم يبقى **متصل**: لو الـ gesture ضعف ولو frame واحد (بعد الـ smoothing)، العد يبدأ من الأول.

```python
        if top != self.candidate:
            self.candidate, self.candidate_since = top, now
            return None
```

- لو الـ gesture القوي ده **جديد** (مختلف عن الـ candidate الحالي، أو مافيش candidate): نبدأ العد من دلوقتي. لسه مافيش تأكيد.

```python
        if top != self.latched and now - self.candidate_since >= self.hold:
            self.latched = top
            return self.labels[top]
        return None
```

- هنا الـ candidate هو نفسه من frames فاتت. نأكّده لو:
  - `top != self.latched`: مش هو نفسه اللي اتأكد قبل كده ولسه ماتسابش (ده اللي بيمنع التكرار).
  - `now - self.candidate_since >= self.hold`: فضل قوي 0.3 ثانية على الأقل.
- لو الاتنين اتحققوا: نعمل latch عليه ونرجّع **اسمه** (`self.labels[top]`). ده الـ "event" الوحيد.
- غير كده `None`: يا لسه الوقت ماخلصش، يا هو already latched.

### 4) `hold_progress` — للـ HUD

```python
    def hold_progress(self, now):
        """0..1 how close the current candidate is to being confirmed (for the HUD)."""
        if self.candidate is None or self.candidate == self.latched:
            return 0.0
        return min(1.0, (now - self.candidate_since) / self.hold)
```

- بترجّع رقم من 0 لـ 1 = نسبة الوقت اللي عدّى من الـ `hold`. الـ HUD بيرسمه كـ progress bar، فالمستخدم يشوف "فاضل قد إيه" ويفضل ماسك الإشارة.
- لو مافيش candidate، أو الـ candidate هو already latched (يعني مش هيتأكد تاني): 0.
- `min(1.0, ...)`: عشان مايعدّيش 100%.

> **تحديث 2026-10-31:** الـ `SequenceMatcher` اتكتب من جديد، والشرح سطر بسطر تحت ده بتاع النسخة القديمة
> (history ومقارنة آخر الإشارات). القواعد دلوقتي:
> - **كل jutsu ليه عدّاده:** عدد الخطوات اللي خلصت ووقت آخر خطوة اتأكدت. الإشارة المؤكدة بتقدّم كل jutsu هي
>   الخطوة الجاية بتاعته.
> - **الإشارة الغلط مابتمسحش حاجة** (في الـ Live والـ Practice): المستخدم يعيد نفس الخطوة لحد ما تصح.
> - **لما jutsu يكمل** بيشتغل (الأطول يكسب، ولو متساويين ترتيب الـ config)، وكل العدّادات ترجع 0.
> - **الوقت:** في الـ Live (`max_gap = SEQUENCE_MAX_GAP` = 7 ثواني) الـ jutsu اللي آخر خطوة ليه أقدم من 7 ثواني
>   بيرجع 0 (`expire`)، والإشارة الغلط مابتمدّش الوقت. في الـ Practice (`max_gap = None`) مفيش وقت خالص.
> - **التكرار:** نفس الإشارة تاني مش خطوة جديدة، إلا لو هي الخطوة الجاية لـ jutsu (بدأ من الأول). بتحدّث وقت
>   الـ jutsu اللي آخر خطوة ليه هي الإشارة دي بس.
> - **فحص الإعدادات** (`_check_conflicts`): بيرفض أي jutsu تسلسله موجود **بالترتيب** (حتى لو فيه إشارات في
>   النص) جوه أول خطوات jutsu تاني، لأنه هيشتغل في النص والتاني عمره ما هيكمل.
>
> الكود الحالي في `shinobi/controller.py`، والـ tests في `tests/test_sequences.py` و `tests/test_events.py`.

### 5) `SequenceMatcher.__init__`

```python
class SequenceMatcher:
    """Matches the history of confirmed gestures against jutsu sequences."""

    def __init__(self, jutsu=config.JUTSU, max_gap=config.SEQUENCE_MAX_GAP):
        self.jutsu = jutsu
        self.max_gap = max_gap
```

- `jutsu`: الـ dict من `config.py`. كل jutsu ليه `"sequence"` (ليستة gestures بالترتيب) و `"effect"`.
- `max_gap = 1.5`: أقصى وقت مسموح بين إشارتين في نفس التسلسل.

```python
        self.max_len = max(len(j["sequence"]) for j in jutsu.values())
        self.history = []           # list of (gesture, time)
        self._check_prefixes()
```

- `max_len`: طول أطول تسلسل. مش محتاجين نحفظ أكتر من كده في الـ history، لأن أي حاجة أقدم مستحيل تكون جزء من match.
- `history`: ليستة `(اسم الـ gesture، وقت تأكيده)`.
- `self._check_prefixes()`: قبل ما نبدأ، نتأكد إن تعريف الـ jutsu في `config.py` مافيهوش تعارض (الشرح في الدالة الجاية). بنعمل الفحص ده **مرة واحدة وقت الإنشاء**، فلو فيه غلطة في الإعدادات البرنامج يقع أول ما يفتح برسالة واضحة، بدل ما المشكلة تبان بعدين في صورة "jutsu مابيشتغلش ومش عارفين ليه".

### 6) `SequenceMatcher._check_prefixes` — فحص الإعدادات

```python
    def _check_prefixes(self):
        """A one-gesture jutsu that starts a longer one would always fire first: refuse that config."""
```

- الـ underscore = دالة داخلية.
- الـ docstring بيشرح المشكلة: jutsu من إشارة واحدة لو هو **أول خطوة** في jutsu أطول، هيشتغل هو الأول دايمًا (ويمسح الـ history)، فالأطول عمره ما هيكمل. فبنرفض الإعدادات دي.

```python
        singles = {spec["sequence"][0]: name for name, spec in self.jutsu.items() if len(spec["sequence"]) == 1}
```

- dict comprehension: بنلف على كل الـ jutsu، وناخد بس اللي التسلسل بتاعه **إشارة واحدة** (`len == 1`).
- المفتاح = الإشارة (`spec["sequence"][0]`)، والقيمة = اسم الـ jutsu. مع الإعدادات الحالية:
  `{"clone_seal": "shadow_clone", "rasengan": "rasengan", "chidori": "chidori", "fire": "fire_style"}`.
- عملناه dict عشان نسأل بسرعة "هل الإشارة دي jutsu لوحدها؟ ولو آه، اسمه إيه؟" (للرسالة).

```python
        for name, spec in self.jutsu.items():
            first = spec["sequence"][0]
            if len(spec["sequence"]) > 1 and first in singles:
```

- بنلف على كل الـ jutsu تاني، وناخد **أول إشارة** في التسلسل.
- الشرط: الـ jutsu ده **طويل** (أكتر من إشارة) **و** أول إشارة فيه هي نفسها jutsu لوحدها → تعارض.
- لاحظ إننا بنفحص أول إشارة بس، لأن ده بالظبط اللي بيكسر الـ matcher: أول إشارة بتتأكد → الـ jutsu القصير يعمل match → الـ history يتمسح. (إشارة في **نص** أو **آخر** التسلسل مش مشكلة، لأن الـ matcher بيختار الأطول لو الاتنين عملوا match في نفس اللحظة.)

```python
                raise ValueError(f"jutsu '{name}' starts with '{first}', which already fires "
                                 f"'{singles[first]}' on its own; '{name}' could never be performed")
```

- بنرمي `ValueError` برسالة بتقول بالظبط: أنهي jutsu، بيبدأ بأنهي إشارة، والإشارة دي بتشغّل أنهي jutsu لوحدها، وإن الـ jutsu الطويل "could never be performed".
- `ValueError` لأن المشكلة في **قيمة** الإعدادات نفسها.

### 7) `SequenceMatcher.push`

```python
    def push(self, gesture, now):
        """Add a confirmed gesture. Returns the matched jutsu name or None."""
        if self.history and now - self.history[-1][1] > self.max_gap:
            self.history.clear()    # too slow: the sequence starts over
```

- بتتنده بس لما gesture **يتأكد** (مش كل frame).
- `self.history[-1][1]`: وقت آخر gesture. لو عدّى أكتر من 1.5 ثانية من ساعتها، المستخدم اتأخر → نمسح الـ history والتسلسل يبدأ من جديد. الـ gesture الحالي هيبقى أول خطوة في تسلسل جديد.

```python
        elif self.history and self.history[-1][0] == gesture:
            self.history[-1] = (gesture, now)   # same sign again (re-confirmed after a dropout): a repeat
            self.repeated = True
            return None
```

- **نفس الإشارة تاني = تكرار (repeat)، مش خطوة جديدة.** لما بنمسك إشارة وقت طويل، YOLOX ساعات بيفوّت frame أو اتنين، فالـ stabilizer بيفك الـ latch ويأكد **نفس** الإشارة تاني. قبل كده الـ history كانت بتبقى مثلاً `ram, snake, snake, tiger` ومفيش jutsu بيشتغل (اتقاس على مسكات 20 ثانية: ram اتأكدت 3 مرات، snake 4، tiger 2).
- دلوقتي لو الإشارة الجديدة هي نفس آخر إشارة والتسلسل لسه عايش (جوه `max_gap`)، مابنزودش خطوة: بس بنحدّث وقتها (فمسك الإشارة كمان بيمنع الـ timeout)، و `ActionController` بيكتب `state.repeat = True`. وعشان كده `_check_conflicts` بيرفض أي jutsu فيه نفس الإشارة مرتين ورا بعض، لأنه مستحيل يتعمل.

```python
        self.history.append((gesture, now))
        self.history = self.history[-self.max_len:]
```

- نضيف الـ gesture الجديد.
- `[-self.max_len:]`: نحتفظ بآخر `max_len` عناصر بس (الأقدم بيقع).

```python
        recent = [g for g, _ in self.history]
        best = None
```

- `recent`: الأسماء بس من غير الأوقات (`_` = متغير مش محتاجينه).
- `best`: أحسن jutsu لقيناه لحد دلوقتي.

```python
        for name, spec in self.jutsu.items():
            seq = spec["sequence"]
            if recent[-len(seq):] == seq and (best is None or len(seq) > len(self.jutsu[best]["sequence"])):
                best = name
```

- لكل jutsu: `recent[-len(seq):]` = آخر `len(seq)` gestures في الـ history. لو مساوية للتسلسل بالظبط = match.
- ليه "آخر" مش "أول"؟ لأن الإشارة الجديدة لازم تكون **آخر خطوة** في التسلسل — بنتأكد إن التسلسل اكتمل **دلوقتي**.
- لو أكتر من jutsu عمل match، ناخد **الأطول** (`len(seq) > ...`). مثال: لو عندنا `["rasengan"]` و `["chidori", "rasengan"]`، والـ history = `[chidori, rasengan]`، الاتنين بيعملوا match، فنختار الأطول لأنه أكثر تحديدًا.
- ملاحظة: لو `recent` أقصر من `seq`، `recent[-len(seq):]` هيرجع `recent` كله، ومش هيساوي `seq` (أطوال مختلفة) → مافيش match غلط.

```python
        if best is not None:
            self.history.clear()
        return best
```

- لو لقينا jutsu: نمسح الـ history، عشان نفس الإشارات ماتتحسبش في jutsu تاني بعده.
- نرجّع الاسم أو `None`.

### 8) `ControllerState`

```python
@dataclass
class ControllerState:
    confirmed: str = None          # gesture confirmed this frame (or None)
    jutsu: str = None              # jutsu fired this frame (or None)
    effect: str = None             # effect to start this frame (or None)
    history: list = field(default_factory=list)
```

- `@dataclass`: بايثون بيعمل `__init__` و `__repr__` أوتوماتيك من الـ fields دي.
- ده "تقرير" الـ controller عن الـ frame الحالي:
  - `confirmed`: gesture اتأكد في الـ frame ده؟
  - `jutsu`: jutsu اكتمل واتسمح بيه؟
  - `effect`: اسم الـ effect اللي `main.py` المفروض يشغّله.
  - `history`: الإشارات المتجمعة لحد دلوقتي (الـ HUD بيعرضها، فالمستخدم يشوف تقدّمه في التسلسل).
- `field(default_factory=list)`: لازم كده للـ list. لو كتبنا `history: list = []`، كل الـ objects هيشتركوا في **نفس** الـ list (مشكلة mutable default المشهورة)، والـ dataclass أصلًا بيرفضها بـ error.
- رجّعنا object واحد فيه كل حاجة بدل tuple، عشان الكود اللي بيستخدمه يبقى مقروء: `state.effect` أوضح من `result[2]`.

### 9) `ActionController`

```python
class ActionController:
    def __init__(self, labels, cooldown=config.COOLDOWN_SECONDS):
        self.stabilizer = GestureStabilizer(labels)
        self.matcher = SequenceMatcher()
        self.cooldown = cooldown
        self.last_fire = -1e9
```

- بيجمع المرحلتين: stabilizer و matcher.
- `cooldown = 1.5` ثانية.
- `last_fire = -1e9`: وقت آخر تفعيل. رقم سالب ضخم = "زمان جدًا"، فأول jutsu عمره ما هيتمنع بالـ cooldown.

```python
    def update(self, probs, now):
        state = ControllerState()
        state.confirmed = self.stabilizer.update(probs, now)
```

- بتتنده من `main.py` كل frame.
- `state` جديد فاضي (كله `None`).
- نبعت الاحتمالات للـ stabilizer؛ غالبًا هيرجع `None`، ونادرًا اسم gesture.

```python
        if state.confirmed is not None:
            state.jutsu = self.matcher.push(state.confirmed, now)
```

- بس لو gesture اتأكد، نبعته للـ matcher يشوف لو اكتمل jutsu.

```python
            if state.jutsu is not None:
                if now - self.last_fire >= self.cooldown:
                    self.last_fire = now
                    state.effect = config.JUTSU[state.jutsu]["effect"]
                else:
                    state.jutsu = None   # still cooling down: ignore
```

- لو اكتمل jutsu:
  - لو عدّى الـ cooldown من آخر تفعيل: نسجّل الوقت ونحط اسم الـ effect (من `config.JUTSU`). اسم الـ jutsu واسم الـ effect ممكن يختلفوا (مثلًا `fire_style` → `fire`)، فكذا jutsu ممكن يشغّلوا نفس الـ effect.
  - لو لسه في الـ cooldown: نتجاهله (`state.jutsu = None`). ملاحظة: الـ matcher كان مسح الـ history خلاص، فالإشارات دي "اتصرفت" على الفاضي.

```python
        state.history = [g for g, _ in self.matcher.history]
        return state
```

- ننسخ أسماء الـ history للـ HUD، ونرجّع الـ state. `main.py` بيعمل `if state.effect: effects.start(...)`.

```python
    def cooldown_left(self, now):
        return max(0.0, self.cooldown - (now - self.last_fire))
```

- الوقت الباقي في الـ cooldown (للـ HUD). `max(0.0, ...)` عشان مايرجعش سالب بعد ما يخلص.

---

## مفاهيم مهمة

### 1) ليه توقعات كل frame "noisy"؟

- الموديل بيشوف كل frame **لوحده**، من غير ذاكرة.
- MediaPipe نفسه بيرعش: النقط بتتحرك شوية حتى لو الإيد ثابتة.
- أثناء **الانتقال** بين إشارتين، الإيد بتعدّي على أشكال وسطية ممكن تشبه إشارة تالتة لـ frame أو اتنين.
- motion blur، إضاءة، إيد جزء منها برا الكادر.

النتيجة: ممكن نشوف `rasengan 0.9, 0.9, 0.3, 0.9, 0.85` وإحنا ماسكين rasengan طول الوقت، أو `chidori 0.8` لـ frame واحد وإحنا بنحرك الإيد.

### 2) EMA smoothing

المعادلة:

```
smoothed_new = α · probs + (1 − α) · smoothed_old
```

- `α = 0.4`: الـ frame الجديد ليه 40% من الوزن، والتاريخ 60%. الـ frame اللي قبله تأثيره 0.4×0.6 = 24%، واللي قبله 0.4×0.6² ≈ 14% ... تأثير القديم بيقل **أُسّيًا** (exponential) — ومن هنا الاسم.
- **α كبير** (مثلًا 0.8): استجابة سريعة، بس الـ noise بيعدّي.
- **α صغير** (مثلًا 0.2): ناعم جدًا، بس بطيء في التعرف وفي "السيب".
- من الكود الحقيقي: لو الاحتمال الخام اتنقل فجأة لـ 0.9 وفضل ثابت، الـ smoothed يوصل 0.75 بعد:
  - `α = 0.2` → 9 frames (حوالي 0.3 ثانية على 30 fps)
  - `α = 0.4` → 4 frames (حوالي 0.13 ثانية)
  - `α = 0.8` → 2 frames
- ميزة EMA على "متوسط آخر N frame": محتاج يحفظ رقم واحد بس لكل class (`self.smoothed`)، مش buffer.

### 3) Confidence threshold + margin

- **`CONF_ON = 0.75`**: الموديل لازم يكون "واثق" (بعد الـ smoothing).
- **margin (top1 − top2 ≥ 0.25)**: لازم يكون واثق في **واحد بعينه** مش متردد بين اتنين.
- `idle` مستبعد: لو الأعلى `idle`، مافيش حاجة نعملها.

### 4) Hold duration

حتى لو الـ gesture قوي، لازم يفضل قوي **0.3 ثانية متصلة** (`HOLD_SECONDS`). ده بيقتل الإيجابيات الكاذبة اللي بتعدّي في نص حركة. 0.3 ثانية قصيرة كفاية إن المستخدم مايحسش بتأخير، وطويلة كفاية (9 frames على 30 fps) إن الصدفة صعب تكمّلها.

### 5) Hysteresis والـ latch

المشكلة من غير latch: لو ماسكين rasengan 3 ثواني، كل 0.3 ثانية هيتأكد تاني → 10 تأكيدات = الـ effect يتشغّل 10 مرات.

الحل:
- لما الـ gesture يتأكد → `latched = top`. طول ما هو latched، `top != self.latched` بيبقى `False` → مابيتأكدش تاني.
- الـ latch بيتفك بس لما احتماله المنعّم ينزل **تحت `CONF_OFF = 0.45`** (يعني فعلًا سبنا الإشارة).
- بعد ما يتفك، لو عملنا الإشارة تاني → تتأكد تاني ("re-arm").

ليه عتبتين مختلفتين (0.75 للدخول و 0.45 للخروج) = **hysteresis**؟ زي ترموستات التكييف: بيشتغل عند 26 ويفصل عند 23 بدل ما يفصل ويشتغل كل ثانية عند 25. لو عتبة الخروج كانت 0.75 برضه، أي هبوط بسيط لـ 0.74 يفك الـ latch، ورجوع لـ 0.76 يأكّد تاني → تفعيل مكرر. الفجوة بين 0.45 و 0.75 بتمتص الرعشة.

### 6) Timeline: مثال حقيقي

الجدول ده طالع من تشغيل `GestureStabilizer` الحقيقي بالإعدادات الافتراضية (30 fps، كل frame = 33ms). الأرقام هي احتمال `rasengan` الخام (من الموديل) والمنعّم:

```
frame  t(ms)  raw   smoothed  candidate   latched   output
-----  -----  ----  --------  ----------  --------  ---------
  0      0    0.03    0.01    -           -         -          ← إيد عادية (idle)
  1     33    0.03    0.02    -           -         -
  2     67    0.88    0.36    -           -         -          ← بدأنا rasengan
  3    100    0.88    0.57    -           -         -
  4    133    0.88    0.69    -           -         -          ← لسه < 0.75
  5    167    0.88    0.77    rasengan    -         -          ← قوي: يبدأ العد
  6    200    0.88    0.81    rasengan    -         -
 ...
 11    367    0.88    0.87    rasengan    -         -
 12    400    0.60    0.76    rasengan    -         -          ← frame وحش، الـ EMA استوعبه
 13    433    0.88    0.81    rasengan    -         -          ← 433-167 = 267ms < 300
 14    467    0.88    0.84    rasengan    rasengan  "rasengan" ← 300ms: تأكيد!
 15    500    0.88    0.86    rasengan    rasengan  -          ← latched: مفيش تكرار
 ...
 20    667    0.30    0.65    -           rasengan  -          ← رعشة: candidate اتلغى
 21    700    0.30    0.51    -           rasengan  -          ← بس 0.51 > 0.45: الـ latch باقي
 22    733    0.88    0.66    -           rasengan  -
 24    800    0.88    0.80    rasengan    rasengan  -          ← رجع قوي، بس latched → مفيش تأكيد تاني
```

نفس الأرقام كرسم تقريبي:

```
smoothed
1.0 ┤
    │                 ┌──── التأكيد (frame 14)
0.75┤- - - - -●●●●●●●●●●●●●●●- - - - - - ●●●●●  CONF_ON
    │       ●                  ●       ●
    │      ●                     ●   ●
0.45┤- - - - - - - - - - - - - - - - - - - - -  CONF_OFF (مانزلناش تحته → مفيش re-arm)
    │    ●
    │●●
0.0 ┼──────────────────────────────────────────► frames
     0   2   4   6   8  10  12  14  16  18  20  22  24
```

ملاحظات:
- من أول ما بدأنا الإشارة (frame 2) لحد التأكيد (frame 14) = **400ms** تقريبًا: حوالي 100ms للـ EMA يوصل 0.75 + 300ms hold.
- الـ frame الوحش (12) ماوقفش العد، لأن الـ EMA خلّى الـ smoothed 0.76 (لسه ≥ 0.75).
- في frame 20-21 الاحتمال وقع، فالـ candidate اتلغى، بس **مانزلش تحت 0.45**، فالـ latch فضل، ولما رجع قوي ماتأكدش تاني. لو كان نزل تحت 0.45 (يعني سبنا الإشارة فعلًا)، كان الـ latch اتفك وكان هيتأكد تاني بعد 0.3 ثانية.

### 7) Sequence matching (jutsu ديناميكي من أكتر من إشارة)

- كل gesture مؤكد بيتضاف لـ `history` مع وقته.
- لو الفرق بين إشارة والتانية > `SEQUENCE_MAX_GAP = 1.5s`، الـ history يتمسح (اتأخرنا).
- بعد كل إضافة، بندوّر على jutsu التسلسل بتاعه = **آخر** عناصر الـ history. لو أكتر من واحد، **الأطول** يكسب.
- لو لقينا، الـ history يتمسح.

**القاعدة المهمة**: jutsu من إشارة واحدة **ماينفعش** يكون أول خطوة في jutsu أطول. ليه؟ لأن الإشارة الواحدة هتعمل match فورًا لحظة تأكيدها، والـ history يتمسح، فالتسلسل الأطول عمره ما هيكمل. القاعدة دي مكتوبة كتعليق في `config.py`، **وكمان الكود بيفرضها**: `_check_prefixes()` بتتنده في `SequenceMatcher.__init__` وبترمي `ValueError` لو الإعدادات بتكسرها.

### 8) إزاي نعمل jutsu ديناميكي

في `config.py` حاليًا كل jutsu إشارة واحدة. لو عايزين `fire_style` يبقى `clone_seal` وبعدها `fire`:

```python
JUTSU = {
    "shadow_clone": {"sequence": ["clone_seal"], "effect": "shadow_clone"},
    "rasengan": {"sequence": ["rasengan"], "effect": "rasengan"},
    "chidori": {"sequence": ["chidori"], "effect": "chidori"},
    "fire_style": {"sequence": ["clone_seal", "fire"], "effect": "fire"},
}
```

**المشكلة (prefix conflict)**: `shadow_clone` = `["clone_seal"]` هو أول خطوة في `fire_style`. لو الـ matcher اشتغل بالإعدادات دي، كان هيحصل كده:

```
clone_seal يتأكد → history = [clone_seal] → match "shadow_clone" → الـ effect يشتغل + history يتمسح
fire يتأكد       → history = [fire]       → مافيش jutsu = ["fire"] → مفيش حاجة
```

يعني `fire_style` كان هيبقى **مستحيل** يشتغل، من غير أي رسالة. عشان كده `_check_prefixes()` بتمسك الغلطة دي **أول ما البرنامج يفتح** (لما `ActionController` يعمل `SequenceMatcher()`)، والبرنامج يقع بالرسالة دي (طالعة من تشغيل الكود فعلًا):

```
ValueError: jutsu 'fire_style' starts with 'clone_seal', which already fires 'shadow_clone' on its own; 'fire_style' could never be performed
```

يبقى لازم نحل التعارض في `config.py`. الحلول:
- نشيل `shadow_clone` من الإشارة الواحدة ونخليه تسلسل هو كمان (مثلًا `["clone_seal", "rasengan"]`)، فـ `clone_seal` لوحده مايبقاش jutsu، أو
- نبدأ `fire_style` بإشارة مش jutsu لوحدها، أو
- نضيف gesture جديد (مثلًا `"tiger"`) ونسجّل داتا ليه ونستخدمه أول خطوة: `["tiger", "fire"]`.

كمان لاحظ: بعد التعديل ده، `fire` لوحده مش هيشغّل حاجة (مافيش jutsu = `["fire"]`).

ولاحظ إن عمل نفس الإشارة مرتين ورا بعض (`["fire", "fire"]`) محتاج **نسيب** الإشارة بين المرتين (ينزل تحت `CONF_OFF`)، بسبب الـ latch.

### 9) Cooldown

بعد ما jutsu يشتغل، أي jutsu تاني في خلال 1.5 ثانية بيتجاهل. ده بيمنع:
- تفعيل effect جديد قبل ما المستخدم يلحق يشوف الأول.
- التكرار لو فيه طريقة ما الـ latch اتفك واتقفل بسرعة.

### 10) `ControllerState`

dataclass صغير بيرجع كل frame فيه: `confirmed` (gesture اتأكد؟)، `jutsu` (jutsu اتسمح بيه؟)، `effect` (نشغّل إيه؟)، `history` (للـ HUD). فصل "القرار" عن "التنفيذ": الـ controller مابيعرفش حاجة عن الـ effects، بس بيقول اسم.

---

## لو غيّرنا ... هيحصل إيه؟

1. **`CONF_ON` من 0.75 لـ 0.5**: التعرف أسرع وأسهل (حتى مع إشارة مش متقنة)، بس الإيجابيات الكاذبة تزيد: لحظة متلخبطة بين gestures ممكن تعدّي. هنا الـ margin (0.25) يبدأ يشتغل فعلًا ويبقى هو الحماية الأساسية (مثلًا rasengan 0.6 و chidori 0.38 → الفرق 0.22 → مرفوض). ولو `CONF_ON` بقى أقل من أو قريب من `CONF_OFF` (0.45)، الـ hysteresis يختفي.
2. **`HOLD_SECONDS` من 0.3 لـ 1.0**: إيجابيات كاذبة أقل جدًا، بس المستخدم هيحس بتأخير واضح (لازم يمسك الإشارة ثانية كاملة + وقت الـ EMA). لو **0**: أي frame قوي يأكّد فورًا (بعد ما يبقى candidate بـ frame) → حساس جدًا.
3. **`PROB_SMOOTHING` (α) من 0.4 لـ 0.9**: تقريبًا مافيش smoothing؛ frame وحش واحد (زي frame 12 في الجدول) هيلغي الـ candidate ويبدأ العد من الأول. ولو **0.1**: ناعم جدًا، بس التعرف ياخد وقت أطول، والـ "سيب" كمان أبطأ (الـ latch يفضل فترة أطول).
4. **`CONF_OFF` من 0.45 لـ 0.74**: الـ latch يتفك مع أي هبوط بسيط → نفس الإشارة الممسوكة ممكن تتأكد أكتر من مرة (تفعيل مكرر، والـ cooldown بس اللي هيحمي).
5. **`SEQUENCE_MAX_GAP` من 1.5 لـ 0.5**: التسلسلات لازم تتعمل بسرعة جدًا؛ مع وقت الـ EMA + الـ hold (~0.4s للإشارة) هيبقى صعب جدًا نكمّل تسلسل.
6. **`COOLDOWN_SECONDS` لـ 0**: ممكن jutsu يشتغل ورا التاني على طول، والـ effect الجديد يقطع القديم.

---

## أسئلة مراجعة

<details>
<summary>اضغط هنا لعرض الأسئلة والإجابات</summary>

1. **ليه مانشغّلش الـ effect على طول لما أعلى احتمال يبقى gesture؟**
   لأن توقعات كل frame بتغلط (رعشة، حركة، انتقال بين إشارات)، فهتشتغل effects بالغلط أو تتكرر كل frame.

2. **اكتب معادلة الـ EMA وإيه تأثير α؟**
   `smoothed = α·probs + (1−α)·smoothed`. α كبير = سريع بس noisy، α صغير = ناعم بس بطيء.

3. **إيه الـ 3 شروط عشان الـ gesture يبقى "strong"؟**
   مش `idle`، احتماله المنعّم ≥ `CONF_ON`، والفرق بينه وبين التاني ≥ `MIN_MARGIN`.

4. **ليه الإشارة الممسوكة بتشتغل مرة واحدة بس؟**
   بسبب الـ latch: بعد التأكيد `latched = top`، والشرط `top != self.latched` بيمنع التأكيد تاني لحد ما الاحتمال ينزل تحت `CONF_OFF`.

5. **ليه `CONF_OFF` أقل من `CONF_ON`؟**
   Hysteresis: الفجوة بتمنع الرعشة حوالين عتبة واحدة إنها تعمل سيب/مسك متكرر.

6. **لو عندنا `"a": ["clone_seal"]` و `"b": ["clone_seal", "fire"]`، إيه اللي هيحصل؟**
   `_check_prefixes()` هترمي `ValueError` أول ما البرنامج يفتح. لو الفحص ده ماكانش موجود، `a` كان هيشتغل أول ما `clone_seal` يتأكد والـ history يتمسح، فـ `b` كان هيبقى مستحيل يشتغل من غير أي رسالة. (الفحص بيبص على أول إشارة بس، لأن الإشارة الواحدة لو في **آخر** التسلسل، الاتنين بيعملوا match في نفس اللحظة والأطول بيكسب، فمافيش مشكلة.)

7. **إيه اللي بيحصل لو jutsu اكتمل أثناء الـ cooldown؟**
   بيتجاهل (`state.jutsu = None`) ومافيش effect، والـ history كمان بيكون اتمسح.

8. **ليه `history` في `ControllerState` بتستخدم `field(default_factory=list)`؟**
   عشان كل object ياخد list جديدة؛ الـ default `[]` العادي كان هيتشارك بين كل الـ objects (والـ dataclass بيرفضه أصلًا).

</details>
