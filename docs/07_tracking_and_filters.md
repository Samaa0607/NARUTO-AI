# 07 — التتبع والفلاتر (`shinobi/filters.py` و `shinobi/tracking.py`)

[⬅ الفهرس](00_index.md)

---

## الملف ده بيعمل إيه؟

```
camera → hands ─┬─► features → classifier → controller ─┐
                │                                       ▼
                └─► [ tracking + filters ] ─────────► effects → screen
                     "الـ effect يترسم فين؟"
```

الـ controller بيقول **إيه** الـ effect اللي يشتغل. الملفين دول بيقولوا **فين** يترسم وبأي حجم واتجاه:

- **`filters.py`** — فيه **One Euro filter**: فلتر صغير بينعّم أرقام مهزوزة (زي مكان الإيد) من غير ما يعمل تأخير ملحوظ.
- **`tracking.py`** — فيه `AnchorTracker`: بيختار **أنهي إيد** الـ effect يمشي وراها (لو فيه إيدين)، ويحسب مكان نص الكف وحجم الإيد واتجاهها، ويعدّي كل ده على One Euro filters. وكمان بيتعامل مع لحظات "الإيد اختفت لثانية".

ليه محتاجين ده؟ MediaPipe بيدّي نقط الإيد بتترعش بكام pixel حتى لو الإيد ثابتة. لو رسمنا الـ Rasengan على النقط دي مباشرة، هيرتعش بشكل واضح ومزعج. ولو نعّمناه بفلتر عادي جامد، هيتأخر ورا الإيد لما نحركها بسرعة ("بيجري وراها"). الـ One Euro filter بيحل المشكلتين مع بعض.

---

## الكود سطر بسطر — `filters.py`

### 1) الـ docstring والـ imports

```python
"""One Euro filter: smooths jittery positions without adding visible lag.

Reference: Casiez et al., "1€ Filter", CHI 2012 — https://gery.casiez.net/1euro/
Slow movement -> strong smoothing (kills jitter). Fast movement -> light smoothing (no lag).
"""
```

- بيعرّف الفلتر: بينعّم المواقع المرتعشة من غير lag ظاهر.
- المرجع: ورقة بحثية لـ Casiez وزمايله في مؤتمر CHI 2012 (مؤتمر Human-Computer Interaction). الاسم "1€" لأنه بسيط و"رخيص" في الحساب.
- آخر سطر هو الفكرة كلها: **حركة بطيئة → smoothing قوي** (يقتل الرعشة)، **حركة سريعة → smoothing خفيف** (مافيش تأخير).

```python
import math

import numpy as np

from shinobi import config
```

- `math`: لـ `math.pi`.
- `numpy`: الفلتر بيشتغل على arrays (نقطة x,y أو vector اتجاه)، مش رقم واحد بس.
- `config`: القيم الافتراضية `FILTER_MIN_CUTOFF = 1.5` و `FILTER_BETA = 0.02`.

### 2) `_alpha` — من cutoff لـ alpha

```python
def _alpha(cutoff, dt):
    tau = 1.0 / (2 * math.pi * cutoff)
    return 1.0 / (1.0 + tau / dt)
```

- الـ underscore في الاسم = دالة داخلية (private) للملف ده.
- `cutoff`: الـ cutoff frequency بالـ Hz. التغيرات اللي أبطأ من كده بتعدّي، والأسرع (زي الرعشة) بتتشال.
- `tau = 1 / (2π · cutoff)`: الـ **time constant** بالثواني — تقريبًا "الفلتر بيفتكر آخر قد إيه من الزمن".
- `alpha = 1 / (1 + tau/dt)`: وزن القيمة الجديدة في الـ EMA (زي `alpha` بتاعة الـ controller بالظبط)، بس محسوب من الـ cutoff والوقت بين الـ frames `dt`.
- ليه نحسبها كده بدل رقم ثابت؟ لأن الـ frame rate بيتغير (20 أو 30 fps). لو alpha ثابت، الفلتر هيبقى أنعم أو أخشن حسب سرعة الجهاز. مع الحساب ده، `dt` أكبر → `alpha` أكبر → الفلتر بيتصرف بنفس الشكل **في الزمن** مهما كان الـ fps.

### 3) `OneEuroFilter.__init__`

```python
class OneEuroFilter:
    def __init__(self, min_cutoff=config.FILTER_MIN_CUTOFF, beta=config.FILTER_BETA, d_cutoff=1.0):
        self.min_cutoff, self.beta, self.d_cutoff = min_cutoff, beta, d_cutoff
```

- `min_cutoff`: الـ cutoff وإحنا **ثابتين** (أقل cutoff). أصغر = أنعم بس lag أكتر.
- `beta`: قد إيه الـ cutoff بيعلى مع السرعة. أكبر = استجابة أسرع للحركة السريعة.
- `d_cutoff = 1.0`: cutoff الفلتر اللي بينعّم **السرعة** نفسها (السرعة كمان بتبقى noisy، لأنها فرق بين قيمتين مرتعشين). 1 Hz هي القيمة اللي الورقة الأصلية بتنصح بيها.

```python
        self.x = None       # last filtered value
        self.dx = None      # last filtered speed
        self.t = None
```

- `x`: آخر قيمة متفلترة. `dx`: آخر سرعة متفلترة. `t`: وقت آخر قيمة.
- `None` = لسه مااستقبلناش أي قيمة.

### 4) `__call__` — تطبيق الفلتر

```python
    def __call__(self, value, now):
        value = np.asarray(value, dtype=np.float32)
```

- `__call__` بيخلّي الـ object يتنده كأنه دالة: `filter(value, now)`.
- `np.asarray(..., float32)`: يقبل list أو array أو tuple ويحوّلها array — عشان نفس الفلتر يشتغل لنقطة `(x, y)` أو لرقم في list `[size]`.

```python
        if self.x is None:
            self.x, self.dx, self.t = value, np.zeros_like(value), now
            return value
```

- أول قيمة: مافيش تاريخ نعمل عليه smoothing، فنرجّعها زي ما هي. السرعة الابتدائية صفر.
- من غير كده (لو بدأنا من صفر مثلًا)، الـ effect هيطلع من ركن الشاشة `(0,0)` ويتزحلق لحد الإيد.

```python
        dt = max(now - self.t, 1e-3)
        self.t = now
```

- `dt`: الوقت من آخر قيمة. `max(..., 1e-3)`: على الأقل 1ms، عشان مانقسمش على صفر لو جالنا قيمتين بنفس الوقت.
- نحدّث `self.t`.

```python
        speed = (value - self.x) / dt
        a_d = _alpha(self.d_cutoff, dt)
        self.dx = a_d * speed + (1 - a_d) * self.dx
```

- `speed`: السرعة الخام = (القيمة الجديدة − آخر قيمة متفلترة) / الزمن. لو القيمة pixels، السرعة بالـ pixels/ثانية.
- `a_d`: alpha لفلتر السرعة (cutoff = 1 Hz).
- `self.dx = ...`: EMA على السرعة، عشان رعشة frame واحد ماتبانش كأنها "حركة سريعة".

```python
        cutoff = self.min_cutoff + self.beta * float(np.linalg.norm(self.dx))
        a = _alpha(cutoff, dt)
        self.x = a * value + (1 - a) * self.x
        return self.x
```

- **الـ adaptive cutoff** (الفكرة الأساسية): `cutoff = min_cutoff + beta · |السرعة|`.
  - `np.linalg.norm(self.dx)`: مقدار السرعة (لو vector 2D: `sqrt(vx² + vy²)`).
  - إيد ثابتة → سرعة ≈ 0 → cutoff = `min_cutoff` (1.5 Hz) → smoothing قوي.
  - إيد بتتحرك بسرعة → cutoff كبير → alpha قريب من 1 → القيمة الجديدة تكاد تعدّي زي ما هي → مافيش lag.
- `a = _alpha(cutoff, dt)` ثم EMA على القيمة نفسها.
- نرجّع القيمة المتفلترة.

### 5) `reset`

```python
    def reset(self):
        self.x = self.dx = self.t = None
```

- يرجّع الفلتر لحالته الأولى. القيمة الجاية هتتاخد زي ما هي. `tracking.py` بيستخدمه لما الإيد تختفي خالص (للمكان والحجم والاتجاه)، عشان لما تظهر في مكان تاني القيم الجديدة تتاخد على طول بدل ما تتزحلق ببطء من القديمة.
- `a = b = c = None`: تخصيص نفس القيمة لكذا متغير.

---

## الكود سطر بسطر — `tracking.py`

### 1) الـ docstring والـ imports

```python
"""Picks the hand that effects should follow and smooths its position, size and direction."""

from dataclasses import dataclass

import numpy as np

from shinobi import config
from shinobi.filters import OneEuroFilter
from shinobi.hands import MIDDLE_MCP, WRIST
```

- الوظيفة: نختار الإيد اللي الـ effects تمشي وراها، وننعّم مكانها وحجمها واتجاهها.
- `dataclass`: لـ `Tracking`.
- `OneEuroFilter`: الفلتر اللي فوق.
- `MIDDLE_MCP, WRIST`: أرقام النقط في MediaPipe: `WRIST = 0` (الرسغ) و `MIDDLE_MCP = 9` (مفصل الصباع الأوسط مع الكف). الخط بينهم = "محور" الإيد.

### 2) `Tracking` dataclass

```python
@dataclass
class Tracking:
    hands: list                 # all detected hands this frame
    now: float
```

- ده "التقرير" اللي بيروح للـ effects كل frame.
- `hands`: كل الإيدين اللي اتشافوا في الـ frame (متاحة لأي effect محتاجها؛ الـ effects الحالية بتستخدم `anchor` و `size` و `direction` بس).
- `now`: الوقت الحالي. الاتنين دول إجباريين (مالهمش default).

```python
    visible: bool = False       # anchor hand seen now (or lost for less than the grace period)
    anchor: np.ndarray = None   # smoothed palm centre in pixels
    size: float = 0.0           # smoothed hand size in pixels
    direction: np.ndarray = None  # unit vector wrist -> middle knuckle (where the hand points)
```

- `visible`: هل الإيد ظاهرة دلوقتي، **أو** اختفت من أقل من فترة السماح. مدير الـ effects (`effects/base.py`) بيبص عليه: لو الـ effect ماشي ورا الإيد (`follows_hand`) و `visible` بقى `False`، الـ effect بيتوقف (`effect.stop`).
- `anchor`: نص الكف (متفلتر) بالـ pixels — المكان اللي الـ Rasengan مثلًا يترسم فيه.
- `size`: حجم الإيد بالـ pixels (المسافة من الرسغ لمفصل الصباع الأوسط) — الإيد القريبة من الكاميرا أكبر، فالـ effect يكبر معاها.
- `direction`: unit vector (طوله 1) من الرسغ ناحية الصوابع — الـ effect يعرف الإيد "بتشاور" فين (مثلًا `fire.py` بيطلّع النار في الاتجاه ده، ولو `None` بيستخدم "لفوق" `[0, -1]`).

### 3) `AnchorTracker.__init__`

```python
class AnchorTracker:
    def __init__(self, grace=config.HAND_LOST_GRACE):
        self.grace = grace
        self.pos_filter = OneEuroFilter()
```

- `grace = 0.6` ثانية: قد إيه الـ effect يفضل عايش لو الإيد اختفت.
- `pos_filter`: فلتر المكان بالإعدادات الافتراضية (`min_cutoff=1.5`, `beta=0.02`) — هنا محتاجين الاتنين: ثبات وإحنا واقفين، وسرعة وإحنا بنتحرك.

```python
        self.size_filter = OneEuroFilter(min_cutoff=0.8, beta=0.0)
        self.dir_filter = OneEuroFilter(min_cutoff=1.0, beta=0.0)
```

- `size_filter`: `min_cutoff=0.8` (ناعم جدًا) و `beta=0` (مافيش تكيّف مع السرعة → فلتر low-pass عادي ثابت). الحجم مش محتاج يستجيب بسرعة، والـ effect اللي حجمه بيرتعش شكله وحش جدًا.
- `dir_filter`: `min_cutoff=1.0`، `beta=0`. الاتجاه بيتغير بنعومة.
- ليه `beta=0` هنا؟ الـ beta مفيدة لما فيه حركات سريعة عايزين نلحقها بدون lag. الحجم والاتجاه مش محتاجين ده، وكمان مقياس السرعة بتاعهم مختلف عن الـ pixels، فـ `beta=0.02` المظبوطة للـ pixels مش هتبقى مناسبة ليهم.

```python
        self.last = Tracking(hands=[], now=0.0)
        self.last_seen = -1e9
```

- `self.last`: آخر نتيجة. بنبدأ بـ Tracking فاضي (`anchor=None`).
- `last_seen`: آخر وقت شفنا فيه إيد. `-1e9` = "زمان جدًا"، فمن الأول `visible = False`.

### 4) `_pick` — اختيار الإيد

```python
    def _pick(self, hands):
        # Stay on the hand closest to where we were, so the effect does not jump between hands.
        if self.last.anchor is not None:
            dists = [np.linalg.norm(h.palm_center - self.last.anchor) for h in hands]
            best = int(np.argmin(dists))
```

- لو عندنا مكان سابق (`anchor` مش `None`): نحسب المسافة من نص كف كل إيد للمكان السابق.
- `h.palm_center`: متوسط 5 نقط في الكف (الرسغ + مفاصل الصوابع الأربعة)، بالـ pixels.
- `np.argmin(dists)`: رقم الإيد الأقرب. `int(...)` يحوّله من NumPy int لـ int عادي.
- الفكرة (من التعليق): **"stickiness"** — نفضل على نفس الإيد. من غير كده، لو الإيدين ظاهرين وحجمهم قريب، الاختيار ممكن ينط بينهم كل frame والـ effect يرقص بين الإيدين.

```python
            if dists[best] < 3 * max(self.last.size, 40):
                return hands[best]
```

- نقبل الإيد الأقرب بس لو قريبة **كفاية**: أقل من 3 أضعاف حجم الإيد. يعني لو الإيد اتحركت بين frame والتاني مسافة معقولة، دي هي نفس الإيد.
- `max(self.last.size, 40)`: حد أدنى 40 pixel، عشان لو الحجم المحفوظ صغير جدًا (أو 0)، المسافة المسموحة ماتبقاش صغيرة لدرجة إن أي حركة تخسرنا الإيد.

```python
        return max(hands, key=lambda h: h.size_px)   # otherwise the biggest (closest) hand
```

- لو مافيش مكان سابق، أو الإيد الأقرب بعيدة جدًا (يعني الإيد القديمة غالبًا مش موجودة): ناخد **أكبر** إيد. الإيد الأكبر = الأقرب للكاميرا = غالبًا الإيد اللي المستخدم بيعمل بيها الإشارة.
- `key=lambda h: h.size_px`: المقارنة بحجم الإيد.

### 5) `update` — لما فيه إيد

```python
    def update(self, hands, now):
        if hands:
            hand = self._pick(hands)
            vec = hand.px[MIDDLE_MCP] - hand.px[WRIST]
```

- بتتنده كل frame من `main.py` بالإيدين اللي MediaPipe لقاهم.
- لو فيه إيد واحدة على الأقل: نختار واحدة.
- `vec`: vector من الرسغ لمفصل الصباع الأوسط (بالـ pixels) = اتجاه الإيد.

```python
            direction = self.dir_filter(vec / (np.linalg.norm(vec) + 1e-6), now)
```

- `vec / norm`: نخليه **unit vector** (طوله 1) قبل الفلتر. كده الفلتر بينعّم **الاتجاه** بس، مش الطول (الطول ده حجم الإيد، وله فلتر لوحده).
- `+ 1e-6`: لو الطول صفر بالصدفة، مانقسمش على صفر.

```python
            self.last = Tracking(
                hands=hands, now=now, visible=True,
                anchor=self.pos_filter(hand.palm_center, now),
                size=float(self.size_filter([hand.size_px], now)[0]),
                direction=direction / (np.linalg.norm(direction) + 1e-6),
            )
```

- بنبني `Tracking` جديد:
  - `visible=True`: الإيد ظاهرة.
  - `anchor`: نص الكف بعد One Euro filter.
  - `size`: `[hand.size_px]` في list عشان الفلتر بيشتغل على arrays، والنتيجة array فيه عنصر واحد → `[0]` → `float(...)` يرجّعه رقم عادي.
  - `direction`: **بنعمل normalize تاني بعد الفلتر**. ليه؟ متوسط اتنين unit vectors مش unit vector. مثال: متوسط (1,0) و (0,1) = (0.5, 0.5) وطوله 0.71 بس. فلازم نرجّعه لطول 1.

```python
            self.last_seen = now
```

- نسجّل إن آخر مرة شفنا إيد هي دلوقتي.

### 6) `update` — لما مافيش إيد

```python
        else:
            visible = now - self.last_seen < self.grace
```

- مافيش إيد في الـ frame ده. لو آخر مرة شفنا إيد من أقل من 0.6 ثانية → لسه نعتبرها `visible`.
- ليه **grace period**؟ MediaPipe ساعات بيفقد الإيد لـ frame أو اتنين (حركة سريعة، blur، الإيد عند حافة الكادر). من غير السماح ده، أول frame من غير إيد كان هيوقف الـ effect خالص. مع السماح، الـ effect يفضل في آخر مكان لحد ما الإيد ترجع.

```python
            self.last = Tracking(hands=[], now=now, visible=visible, anchor=self.last.anchor,
                                 size=self.last.size, direction=self.last.direction)
```

- `Tracking` جديد بنفس المكان والحجم والاتجاه القدام (الـ effect يفضل "متجمد" في مكانه)، و `hands=[]` لأن مافيش إيدين فعلًا.

```python
            if not visible:                 # hand gone for good: next hand starts fresh
                self.pos_filter.reset()
                self.size_filter.reset()
                self.dir_filter.reset()
        return self.last
```

- لو فترة السماح خلصت (التعليق: "الإيد مشيت بجد، الإيد الجاية تبدأ على نضيف"): نعمل reset للـ **3 فلاتر**:
  - `pos_filter`: لما الإيد ترجع، أول مكان هيتاخد زي ما هو، فالـ effect الجاي يظهر على الإيد على طول بدل ما يتزحلق من المكان القديم.
  - `size_filter`: لو الإيد رجعت أقرب أو أبعد من الكاميرا، الحجم الجديد يتاخد على طول، بدل ما يكبر أو يصغر بالتدريج من الحجم القديم (والفلتر ده بطيء أصلًا: `min_cutoff=0.8`).
  - `dir_filter`: نفس الفكرة للاتجاه.
- الفكرة: بعد غياب طويل، القيم القديمة مابقاش ليها علاقة بالإيد الجديدة، فمافيش معنى إننا ننعّم منها.
- لاحظ إن الـ reset ده بيتكرر كل frame طول ما مافيش إيد بعد فترة السماح. ده مش مشكلة: الـ reset مجرد إنه يحط `None`.
- في الحالتين، نرجّع `self.last`.

---

## مفاهيم مهمة

### 1) الـ tradeoff بين الرعشة (jitter) والتأخير (lag)

أي low-pass filter (زي EMA) عنده مقبض واحد:

```
alpha صغير  → ناعم جدًا     → بس متأخر ورا الحركة (lag)
alpha كبير  → متابع سريع    → بس الرعشة بتعدّي (jitter)
```

مافيش قيمة ثابتة تحل الاتنين. الملاحظة الذكية في الـ One Euro filter:
- **الرعشة** بتبان وإحنا **ثابتين أو بنتحرك ببطء** (الـ effect بيترعش في مكانه = مزعج جدًا).
- **التأخير** بيبان وإحنا **بنتحرك بسرعة** (الـ effect بيجري ورا الإيد).

فالحل: نخلي الـ alpha **يتغير مع السرعة**.

### 2) معادلة alpha من الـ cutoff

```
tau   = 1 / (2π · cutoff)
alpha = 1 / (1 + tau / dt)

x_filtered = alpha · x_new + (1 − alpha) · x_filtered_old
```

أرقام حقيقية من `_alpha` على 30 fps (`dt = 1/30`):

| cutoff (Hz) | alpha | المعنى |
|---|---|---|
| 1.0 | 0.17 | ناعم جدًا (فلتر الاتجاه) |
| 1.5 | 0.24 | الإيد ثابتة (`min_cutoff`) |
| 5.0 | 0.51 | حركة متوسطة |
| 11.5 | 0.71 | حركة سريعة (500 px/s مع `beta=0.02`) |

### 3) الـ adaptive cutoff

```
cutoff = min_cutoff + beta · |speed|
```

- السرعة نفسها متفلترة (بـ `d_cutoff = 1 Hz`) عشان الرعشة ماتتفهمش غلط كأنها حركة.
- مثال: الإيد بتتحرك 500 pixel/ثانية → `cutoff = 1.5 + 0.02 × 500 = 11.5 Hz` → `alpha ≈ 0.71` → القيمة الجديدة واخدة 71% من الوزن → تقريبًا مافيش lag.
- الإيد ثابتة والرعشة بتعمل "سرعة" متفلترة حوالي 10 px/s → `cutoff ≈ 1.7` → `alpha ≈ 0.26` → smoothing قوي.

### 4) معنى `min_cutoff` و `beta`

- **`min_cutoff`** بيتحكم في **الرعشة وإحنا ثابتين**. أصغر = أثبت، بس lag أكتر في الحركة البطيئة.
- **`beta`** بيتحكم في **الـ lag وإحنا بنتحرك بسرعة**. أكبر = يلحق الحركة السريعة أحسن، بس ممكن الرعشة ترجع مع الحركات المتوسطة.
- طريقة الضبط اللي الورقة بتنصح بيها: `beta = 0` الأول، ونظبط `min_cutoff` لحد ما الرعشة تختفي وإحنا ثابتين. بعدين نزوّد `beta` لحد ما الـ lag يختفي في الحركة السريعة.
- مهم: `beta` مرتبطة بوحدة القياس. هنا السرعة بالـ pixels/ثانية (أرقام بالمئات)، عشان كده `0.02` رقم صغير. لو كنا بنفلتر إحداثيات من 0 لـ 1، كنا هنحتاج `beta` أكبر بكتير.

### 5) اختيار الإيد (stickiness)

```
فيه مكان سابق؟ ── لأ ──► أكبر إيد
     │
     آه
     ▼
أقرب إيد للمكان السابق، مسافتها < 3 × max(الحجم، 40)؟ ── آه ──► هي دي
     │
     لأ
     ▼
أكبر إيد
```

### 6) فترة السماح (grace period)

```
t:      0.0   0.1   0.2   0.3  ...  0.6   0.7
إيد؟     ✔     ✘     ✘     ✘         ✘     ✔
visible  ✔     ✔     ✔     ✔         ✘     ✔
                ◄── الـ effect متجمد ──►  ↑ visible=False: الـ effect يتوقف
                                            + reset للفلاتر الـ 3
```

### 7) اتجاه الإيد

`direction = normalize(px[MIDDLE_MCP] − px[WRIST])` — سهم من الرسغ لقاعدة الصباع الأوسط. اخترنا النقطتين دول لأنهم **ثابتين نسبيًا**: مش بيتأثروا بحركة الصوابع (لو قفلنا الإيد أو فتحناها، الاتجاه مايتغيرش). ونعمل normalize قبل الفلتر وبعده.

### 8) حقول `Tracking`

| الحقل | النوع | المعنى |
|---|---|---|
| `hands` | list | كل الإيدين في الـ frame |
| `now` | float | الوقت |
| `visible` | bool | الإيد ظاهرة أو لسه في فترة السماح |
| `anchor` | array (2,) | نص الكف المتفلتر (pixels) |
| `size` | float | الرسغ → مفصل الصباع الأوسط (pixels) |
| `direction` | array (2,) | unit vector اتجاه الإيد |

---

## لو غيّرنا ... هيحصل إيه؟

1. **`FILTER_MIN_CUTOFF` من 1.5 لـ 0.3**: الـ effect ثابت جدًا وإحنا واقفين، بس في الحركة البطيئة هيبان إنه "بيعوم" ورا الإيد (الـ time constant يبقى حوالي 0.5 ثانية بدل 0.1).
2. **`FILTER_MIN_CUTOFF` لـ 10**: تقريبًا مافيش smoothing → الـ effect يترعش مع رعشة MediaPipe.
3. **`FILTER_BETA` من 0.02 لـ 0**: فلتر عادي ثابت؛ ثابت كويس، بس في الحركة السريعة الـ effect هيتأخر واضح ورا الإيد.
4. **`FILTER_BETA` لـ 0.5**: أي حركة صغيرة (حتى رعشة متفلترة 10 px/s → cutoff 6.5) تفتح الفلتر، فالرعشة ترجع تبان.
5. **`HAND_LOST_GRACE` لـ 0**: أول frame يفقد فيه MediaPipe الإيد، `visible` يبقى `False` والـ effect اللي ماشي ورا الإيد يتوقف خالص (rasengan يتقفل في نص الحركة). ولو **3 ثواني**: الـ effect يفضل متعلق في الهوا 3 ثواني بعد ما نشيل إيدنا.
6. **تغيير `3 * max(...)` لـ `1 * max(...)` في `_pick`**: أي حركة سريعة شوية (أكتر من حجم إيد في frame واحد) هتخلي الـ tracker يعتبرها إيد تانية، وممكن ينط للإيد الأكبر.

---

## أسئلة مراجعة

<details>
<summary>اضغط هنا لعرض الأسئلة والإجابات</summary>

1. **إيه المشكلة اللي الـ One Euro filter بيحلها؟**
   الـ tradeoff بين الرعشة والـ lag: الفلتر الثابت يا ناعم ومتأخر يا سريع ومرتعش. One Euro بيغيّر قوة الـ smoothing حسب السرعة.

2. **اكتب معادلة alpha من الـ cutoff.**
   `tau = 1/(2π·cutoff)` و `alpha = 1/(1 + tau/dt)`.

3. **ليه بنحسب alpha من `dt` بدل رقم ثابت؟**
   عشان الفلتر يتصرف بنفس الشكل في الزمن مهما اتغيّر الـ frame rate.

4. **إيه معنى `min_cutoff` و `beta`؟**
   `min_cutoff`: قوة الـ smoothing وإحنا ثابتين (أصغر = أنعم). `beta`: قد إيه الـ cutoff بيعلى مع السرعة (أكبر = lag أقل في الحركة السريعة).

5. **ليه السرعة نفسها بتتفلتر (`d_cutoff`)؟**
   لأنها فرق بين قيمتين مرتعشين، فبتطلع noisy جدًا، ومن غير فلتر الرعشة هتتفهم كأنها حركة سريعة وتفتح الفلتر.

6. **إزاي `AnchorTracker` بيختار الإيد؟**
   الأقرب لآخر مكان لو مسافتها أقل من `3 × max(size, 40)`، غير كده الإيد الأكبر.

7. **ليه بنعمل normalize للـ direction بعد الفلتر كمان؟**
   لأن متوسط unit vectors مش unit vector (طوله بيقل)، فلازم نرجّعه لطول 1.

8. **إيه فايدة الـ grace period وإيه اللي بيحصل بعده؟**
   بيمنع الـ effect إنه يتقفل لو MediaPipe فقد الإيد لحظة. بعد ما يخلص، `visible = False`، فالـ effect اللي ماشي ورا الإيد بيتوقف، والفلاتر الـ 3 (المكان والحجم والاتجاه) بيتعملها reset عشان لما الإيد ترجع، قيمها الجديدة تتاخد مباشرة من غير تزحلق من القيم القديمة.

</details>
