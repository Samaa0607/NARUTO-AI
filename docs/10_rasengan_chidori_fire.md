# 10 — Rasengan و Chidori و Fire (`rasengan.py` · `chidori.py` · `fire.py`)

[⬅ الفهرس](00_index.md)

---

## مقدمة: الـ 3 effects دول شبه بعض في إيه؟

الـ 3 ملفات دول هم آخر محطة في الـ pipeline:

```
camera → hands → features → classifier → controller → effects ← (إحنا هنا) → screen
```

لما الـ controller يقرر "شغّل rasengan" (أو نضغط زرار `2`)، الـ `EffectManager` بيبني object جديد من الكلاس `Rasengan`، وبعدها `main.py` في كل frame بينادي `render(frame, tracking, dt)`. الـ effect بيرسم على الصورة ويرجّعها.

الـ 3 effects بيشتركوا في حاجات كتير، وكلها اتشرحت في [08 — أساسيات الـ Effects](08_effects_basics.md). هنفكّر بيها بسرعة لأننا هنستخدمها في كل سطر:

| الحاجة | جاية منين | بتعمل إيه |
|---|---|---|
| `Effect` | `base.py` | الكلاس الأب. فيه `duration` و `opacity(now)` (بترجّع رقم من 0 لـ 1 للـ fade in/out، **وكمان بتحدّث `self.age` و `self.stop_at`**) و `finished(now)` |
| `follows_hand = True` | `base.py` | لو الإيد اختفت (بعد فترة سماح 0.6 ثانية)، الـ `EffectManager` بيوقّف الـ effect |
| `tracking.anchor` | `tracking.py` | مركز كف الإيد بالـ pixels، بعد ما اتنعّم بـ One Euro filter |
| `tracking.size` | `tracking.py` | طول الإيد بالـ pixels (من الرسغ لمفصل الصباع الوسطاني). بنستخدمه عشان الـ effect يكبر لما الإيد تقرّب من الكاميرا |
| `tracking.direction` | `tracking.py` | vector طوله 1 من الرسغ ناحية الصوابع (الإيد شايرة فين) |
| `Particles` | `fx.py` | نظام particles: كل particle صف في arrays (`pos`, `vel`, `life`, `max_life`, `size`). فيه `emit` و `update` و `draw` و `t` (العمر من 0 لـ 1) |
| `add_glow` | `fx.py` | بيجمع طبقة الرسم على الصورة (additive) + هالة ضبابية حواليها (bloom)، وبيشتغل بس على المربع اللي فيه الـ effect (ROI) |
| `random_directions` | `fx.py` | بيرجّع `n` اتجاهات عشوائية طول كل واحد 1 |
| `color_ramp` | `fx.py` | تدرّج ألوان حسب رقم من 0 لـ 1 |

**الفكرة الثابتة في الـ 3:** بنرسم على `layer` سودا فاضية (كلها أصفار)، وبعدين `add_glow` بيجمع الـ layer دي على صورة الكاميرا. الأسود (صفر) لما يتجمع على أي لون مابيغيّرش حاجة، فاللي بيظهر بس هو اللي رسمناه، وبيظهر "منوّر" لأنه بيتجمع على الصورة مش بيغطيها.

---

# الجزء الأول: `shinobi/effects/rasengan.py`

## الملف ده بيعمل إيه؟

بيرسم كورة طاقة زرقا بتلف على كف الإيد. الكورة متكوّنة من **5 طبقات** فوق بعض: قشرة خارجية باهتة، قلب منوّر، أقواس بتلف، شرارات بتدور في مدارات، وجزيئات "رياح" بتطير من الحافة. الكورة بتكبر في أول 0.6 ثانية (كأنها بتتشحن) وبتمشي مع الإيد.

## الكود سطر بسطر

```python
"""Rasengan: a spinning blue energy sphere that sits on the palm."""

import cv2
import numpy as np

from shinobi.effects.base import Effect
from shinobi.effects.fx import Particles, add_glow, random_directions
```

- السطر الأول docstring بيوصف الملف: كورة طاقة زرقا بتلف وقاعدة على الكف.
- `cv2` (OpenCV): هنستخدمه للرسم (`cv2.circle` و `cv2.ellipse`).
- `numpy`: للحسابات على arrays كاملة مرة واحدة (زي حساب مكان 70 شرارة في سطر واحد).
- `Effect`: الكلاس الأب اللي هنورث منه.
- `Particles, add_glow, random_directions`: أدوات الرسم المشتركة من `fx.py` (اتشرحت فوق).

```python
BLUE = np.array([255, 150, 40], np.float32)     # BGR
LIGHT = np.array([255, 225, 170], np.float32)
```

- `BLUE`: لون أزرق. **الترتيب BGR مش RGB** (OpenCV بيخزّن الصور كده): Blue=255، Green=150، Red=40. يعني أزرق سماوي فاقع.
- `LIGHT`: أزرق فاتح جداً قريب من الأبيض (كل القنوات عالية). ده لون القلب والأقواس والشرارات.
- عملناهم `np.array` من نوع `float32` (مش tuple عادي) عشان نقدر نضربهم في رقم بسهولة: `BLUE * 0.35` بيدّي نسخة أغمق من نفس اللون. لو كانوا tuple، `(255, 150, 40) * 0.35` كانت هتدّي error.

```python
def bgr(color):
    """OpenCV wants a tuple of plain Python numbers, not a NumPy array."""
    return tuple(float(c) for c in color)
```

- دالة صغيرة بتحوّل الـ NumPy array لـ tuple فيه أرقام Python عادية (`float`).
- **ليه؟** OpenCV 5 بيرفض إن الـ `color` يبقى NumPy array. جرّبنا على النسخة المتسطّبة (5.0.0): `cv2.circle(..., np.array([1.,2.,3.]), ...)` بيرمي error: `Scalar value for argument 'color' is not numeric`.
- فالحل: نحسب الألوان بـ NumPy (عشان الضرب سهل)، وقبل ما نديها لـ OpenCV نعدّيها على `bgr()`.

```python
class Rasengan(Effect):
    name = "rasengan"
    follows_hand = True
```

- `Rasengan` بيورث من `Effect`، فبياخد `start` و `stop` و `opacity` و `finished` جاهزين.
- `name`: الاسم اللي بيظهر في الـ HUD (`RASENGAN`).
- `follows_hand = True`: الـ effect ده مربوط بالإيد. لو الإيد اختفت أكتر من فترة السماح، الـ `EffectManager` بينادي `stop()` والكورة بتختفي تدريجياً.

```python
    def __init__(self, duration, n_orbit=70, seed=None):
        super().__init__(duration)
        self.rng = np.random.default_rng(seed)
```

- `duration`: مدة الـ effect بالثواني (جاية من `config.EFFECT_DURATION["rasengan"]` = 8.0).
- `n_orbit=70`: عدد الشرارات اللي بتلف حوالين الكورة.
- `seed=None`: بذرة الأرقام العشوائية. `None` = عشوائي فعلاً كل مرة. لو حطينا رقم، هيطلع نفس الشكل كل مرة (مفيد في الـ tests).
- `super().__init__(duration)`: بننادي constructor الأب عشان يجهّز `self.duration` و `self.t0` و `self.stop_at` و `self.age`.
- `self.rng`: مولّد أرقام عشوائية خاص بالـ object ده (الطريقة الحديثة في NumPy بدل `np.random.rand`).

```python
        # Each orbiting spark has its own radius, speed, phase and tilted orbit plane.
        self.orb_radius = self.rng.uniform(0.45, 1.15, n_orbit)
        self.orb_speed = self.rng.uniform(5.0, 11.0, n_orbit) * self.rng.choice([-1, 1], n_orbit)
        self.orb_phase = self.rng.uniform(0, 2 * np.pi, n_orbit)
        self.orb_tilt = self.rng.uniform(0.15, 1.0, n_orbit)       # 1 = circle, small = flat ellipse
        self.orb_rot = self.rng.uniform(0, np.pi, n_orbit)          # rotation of the ellipse
```

كل شرارة ليها مدار خاص بيها، وكل الأرقام دي بتتعمل **مرة واحدة بس** عند إنشاء الـ effect (مش كل frame)، فالشرارة بتفضل ماشية على نفس المدار:

- `orb_radius`: نص قطر المدار كنسبة من نص قطر الكورة (من 0.45 لـ 1.15). يعني فيه شرارات جوه الكورة وشرارات بره حافتها شوية.
- `orb_speed`: السرعة الزاوية (radian في الثانية) من 5 لـ 11. بنضربها في `choice([-1, 1])` عشان نص الشرارات تقريباً يلف مع عقارب الساعة والنص التاني عكسها. ده بيدّي إحساس فوضى طاقة.
- `orb_phase`: نقطة البداية على المدار (زاوية من 0 لـ 2π). من غيرها كل الشرارات هتبدأ من نفس المكان.
- `orb_tilt`: مدى "فرطحة" المدار. 1 = دايرة كاملة، 0.15 = بيضاوي مفرطح جداً. البيضاوي المفرطح بيبان كأنه دايرة مايلة في 3D شايفينها من الجنب.
- `orb_rot`: زاوية دوران البيضاوي نفسه (من 0 لـ π). من غيرها كل البيضاويات هتبقى أفقية.

```python
        self.wind = Particles()
```

- نظام particles فاضي لجزيئات الرياح اللي هتطير من حافة الكورة.

```python
    def render(self, frame, tracking, dt, segmentation=None):
        now = tracking.now
        alpha = self.opacity(now)
        if tracking.anchor is None or alpha <= 0:
            return frame
```

- `render` بتتنادى كل frame. `dt` = الوقت من الـ frame اللي فات بالثواني. `segmentation` مش محتاجينها هنا (موجودة بس عشان كل الـ effects ليها نفس الـ signature).
- `now`: الوقت الحالي.
- `alpha = self.opacity(now)`: الشفافية من 0 لـ 1. **وكمان** بتحدّث `self.age` (عمر الـ effect)، وده مهم للسطر الجاي.
- لو مافيش إيد اتشافت خالص (`anchor is None`) أو الشفافية صفر: نرجّع الصورة زي ما هي من غير رسم.

```python
        grow = min(1.0, self.age / 0.6) ** 0.5                       # sphere grows while charging
        radius = max(25.0, tracking.size * 0.95) * grow
        cx, cy = tracking.anchor
        center = (int(cx), int(cy))
        layer = np.zeros_like(frame)
```

- `grow`: معامل الكبر من 0 لـ 1 خلال أول 0.6 ثانية. `self.age / 0.6` بيطلع من 0 لـ 1، و `min(1.0, ...)` بيوقفه عند 1. الـ `** 0.5` (جذر تربيعي) بيخلي الكبر سريع في الأول وبيهدى في الآخر (اتشرح في المفاهيم تحت).
- `radius`: نص قطر الكورة = تقريباً طول الإيد (`size * 0.95`). `max(25.0, ...)` بيضمن إن الكورة ماتبقاش صغيرة أوي لو الإيد بعيدة. وبعدين بنضرب في `grow`.
- `cx, cy`: مركز الكف (float).
- `center`: نفس المركز بس integers، لأن دوال الرسم في OpenCV محتاجة pixels صحيحة.
- `layer`: صورة سودا بنفس مقاس الـ frame. هنرسم كل حاجة عليها.

```python
        # 1) soft outer shell and bright core
        cv2.circle(layer, center, int(radius * 1.05), bgr(BLUE * 0.35), -1, cv2.LINE_AA)
        cv2.circle(layer, center, int(radius * 0.55), bgr(BLUE * 0.8), -1, cv2.LINE_AA)
        cv2.circle(layer, center, int(radius * 0.28), bgr(LIGHT), -1, cv2.LINE_AA)
```

**الطبقة 1: 3 دواير جوه بعض**، من الكبيرة للصغيرة (كل واحدة بترسم فوق اللي قبلها):

- القشرة الخارجية: نص قطر `1.05 × radius`، لون `BLUE * 0.35` (أزرق غامق، لأنه 35% بس من الشدة). لما يتجمع على الصورة بيدّي توهج أزرق خفيف.
- الطبقة الوسطانية: `0.55 × radius`، أزرق أقوى (`0.8`).
- القلب: `0.28 × radius`، بلون `LIGHT` (شبه أبيض). ده "قلب" الطاقة المنوّر.
- `-1` = thickness سالب يعني "املا الدايرة" (filled) بدل ما ترسم الحدود بس.
- `cv2.LINE_AA` = anti-aliasing: الحواف ناعمة بدل ما تبان سلّمة pixels.
- النتيجة: تدرّج من حافة غامقة لقلب منوّر، وده اللي بيخلي الشكل يبان كورة مش دايرة مسطحة.

```python
        # 2) spinning arcs: ellipses whose angle changes every frame -> rotation illusion
        for k in range(8):
            direction = 1 if k % 2 == 0 else -1.4
            angle = (now * 420 * direction + k * 45) % 360
            axes = (int(radius * (0.95 - 0.05 * (k % 3))), int(radius * (0.25 + 0.12 * (k % 4))))
            cv2.ellipse(layer, center, axes, angle, 0, 220, bgr(LIGHT * 0.9), 2, cv2.LINE_AA)
```

**الطبقة 2: 8 أقواس بتلف:**

- `for k in range(8)`: 8 أقواس.
- `direction`: الأقواس الزوجية بتلف في اتجاه (سرعة 1)، والفردية في الاتجاه العكسي وأسرع (`-1.4`). اتجاهين مختلفين بيدّوا إحساس دوامة مش مجرد عجلة بتلف.
- `angle`: زاوية ميل البيضاوي بالدرجات. `now * 420` يعني 420 درجة في الثانية (أكتر من لفة كاملة في الثانية). `k * 45` بيوزّع الأقواس عشان مايبقوش فوق بعض. `% 360` بيرجّع الزاوية في المدى من 0 لـ 360.
- **ده سر الدوران:** في كل frame `now` بيزيد، فالـ `angle` بيتغير، فالقوس بيترسم مايل بزاوية مختلفة. العين بتشوف ده كأنه بيلف.
- `axes`: نصّين القطر للبيضاوي (الطويل، القصير). الطويل من `0.85` لـ `0.95 × radius` حسب `k % 3`، والقصير من `0.25` لـ `0.61 × radius` حسب `k % 4`. استخدام `%` بأرقام مختلفة (3 و 4) بيخلي كل قوس شكله مختلف شوية من غير ما نكتب 8 أرقام بإيدنا.
- `cv2.ellipse(layer, center, axes, angle, 0, 220, color, 2, LINE_AA)`: بيرسم جزء من بيضاوي، من زاوية 0 لـ 220 درجة (يعني حوالي 60% من البيضاوي، مش قفلة كاملة). القوس الناقص بيبان "ماشي" أكتر من البيضاوي الكامل. السُمك 2 pixel، واللون `LIGHT * 0.9`.

```python
        # 3) orbiting sparks (computed in one shot with NumPy)
        theta = self.orb_phase + self.orb_speed * now
        ex = np.cos(theta) * self.orb_radius * radius
        ey = np.sin(theta) * self.orb_radius * radius * self.orb_tilt
        c, s = np.cos(self.orb_rot), np.sin(self.orb_rot)
        xs, ys = cx + ex * c - ey * s, cy + ex * s + ey * c
        for x, y in zip(xs, ys):
            cv2.circle(layer, (int(x), int(y)), 2, bgr(LIGHT), -1, cv2.LINE_AA)
```

**الطبقة 3: 70 شرارة في مدارات.** كل السطور دي شغالة على arrays فيها 70 قيمة مرة واحدة (vectorized):

- `theta`: زاوية كل شرارة دلوقتي = نقطة البداية + السرعة × الوقت. (زي "المسافة = السرعة × الزمن" بس للزوايا.)
- `ex, ey`: مكان الشرارة على بيضاوي **مش متلفّ**، مركزه صفر: `x = r·cos θ` و `y = r·tilt·sin θ`. الـ `tilt` بيضغط المحور الرأسي فالدايرة تبقى بيضاوي.
- `c, s`: الـ cos والـ sin لزاوية دوران كل بيضاوي.
- `xs, ys`: بنلف النقطة بزاوية `orb_rot` (rotation matrix، اتشرحت تحت) وبعدين نزوّد مركز الكف `cx, cy` عشان المدار يبقى حوالين الإيد.
- اللوب الأخير: بيرسم كل شرارة كدايرة صغيرة نص قطرها 2 pixel. (الرسم نفسه لازم يبقى loop لأن `cv2.circle` بترسم دايرة واحدة كل مرة.)

```python
        # 4) wind particles thrown off the rim
        n = int(120 * dt) + 1
        dirs = random_directions(n, self.rng)
        tangent = np.stack([-dirs[:, 1], dirs[:, 0]], axis=1)
```

**الطبقة 4: جزيئات الرياح:**

- `n`: عدد الجزيئات الجديدة في الـ frame ده. `120 * dt` يعني **120 جزيء في الثانية** مهما كان الـ FPS (لو الـ FPS عالي، `dt` صغير، فبنطلّع عدد أقل في كل frame). الـ `+ 1` بيضمن جزيء واحد على الأقل. عند 30 FPS: `int(4) + 1 = 5` جزيئات في الـ frame.
- `dirs`: `n` اتجاهات عشوائية في كل الاتجاهات (vectors طولها 1)، array شكله `(n, 2)`.
- `tangent`: الاتجاه **المماسي** لكل جزيء: لو الاتجاه `(x, y)` فالمماس `(-y, x)`، يعني نفس الـ vector ملفوف 90 درجة. ده اتجاه "اللف" حوالين الكورة (اتشرح تحت).

```python
        self.wind.emit(np.array([cx, cy]) + dirs * radius,
                       (tangent * 1.5 + dirs * 0.6) * radius * self.rng.uniform(1.5, 3.0, (n, 1)),
                       self.rng.uniform(0.2, 0.45, n), self.rng.uniform(1.0, 2.5, n))
```

`emit(pos, vel, max_life, size)` بيضيف `n` جزيء جديد:

- **المكان:** `center + dirs * radius` = نقطة على حافة الكورة بالظبط في الاتجاه العشوائي.
- **السرعة:** `tangent * 1.5 + dirs * 0.6`: معظمها مماسية (بتلف حوالين الكورة) وجزء صغير لبره (بتبعد عن الكورة). النتيجة: الجزيء بيطلع في شكل حلزوني. بنضرب في `radius` عشان الكورة الكبيرة يبقى ليها رياح أسرع، وفي رقم عشوائي من 1.5 لـ 3 (شكله `(n, 1)` عشان يتضرب في العمودين x و y مع بعض) عشان مش كل الجزيئات بنفس السرعة.
- **العمر:** من 0.2 لـ 0.45 ثانية، يعني بتعيش وقت قصير جداً.
- **الحجم:** نص قطر من 1 لـ 2.5 pixel.

```python
        self.wind.update(dt, drag=2.0)
        self.wind.draw(layer, np.outer(1.0 - self.wind.t, BLUE))
```

- `update(dt, drag=2.0)`: بيحرّك كل الجزيئات بسرعتها، والـ `drag` (مقاومة الهوا) بيقلّل السرعة كل frame، وبيمسح الجزيئات اللي عمرها خلص. مافيش gravity هنا لأن الرياح مش بتقع.
- `np.outer(1.0 - self.wind.t, BLUE)`: لون كل جزيء. `t` عمر الجزيء من 0 (لسه مولود) لـ 1 (بيموت)، فـ `1 - t` بيبدأ 1 وبينزل لـ 0. `np.outer` بيضرب كل رقم في اللون `BLUE`، فبيطلع array شكله `(n, 3)`: كل جزيء لونه أزرق بيغمق لحد ما يختفي.

```python
        return add_glow(frame, layer, (cx, cy), radius * 2.5, strength=1.4, blur=radius * 0.6, opacity=alpha)
```

**الطبقة 5: التوهج.** `add_glow` بيجمع الـ `layer` على الصورة الأصلية وبيضيف هالة ضبابية:

- `(cx, cy)` و `radius * 2.5`: المربع اللي هيتعالج بس (ROI) حوالين الكورة، مش الصورة كلها، عشان السرعة.
- `strength=1.4`: الهالة قوية (أكتر من 1)، لأن الراسينجان المفروض يبان منوّر جداً.
- `blur=radius * 0.6`: قد إيه الهالة منتشرة. بيكبر مع الكورة.
- `opacity=alpha`: هنا الـ fade in/out بيتطبق. لما `alpha` تبقى 0.5 كل حاجة بتتجمع بنص قوتها.

## مفاهيم مهمة (Rasengan)

### 1) الرسم بالطبقات (Layered drawing)

الشكل النهائي مش رسمة واحدة، دي 5 طبقات كل واحدة بسيطة:

| الطبقة | بترسم إيه | بتدّي إحساس إيه |
|---|---|---|
| القشرة والقلب | 3 دواير متداخلة | حجم وعمق (كورة مش دايرة) |
| الأقواس | 8 بيضاويات ناقصة بتلف | دوران |
| الشرارات | 70 نقطة في مدارات مايلة | طاقة 3D حوالين الكورة |
| الرياح | particles طالعة بشكل حلزوني | قوة بتشفط وبترمي هوا |
| الـ glow | هالة ضبابية | إنه مصدر نور |

كل طبقة لوحدها شكلها عادي، بس مع بعض بيطلعوا شكل مقنع. ودي نفس الطريقة اللي بتتعمل بيها الـ VFX في الألعاب.

### 2) خدعة الدوران

الكمبيوتر مابيلفّش حاجة فعلاً. كل frame بنرسم من الأول على `layer` جديدة سودا، والفرق الوحيد إن زاوية البيضاوي اتغيرت:

```
frame 1 (now=0.000):  angle = 0°     ⟋
frame 2 (now=0.033):  angle = 14°    ⟋ لافف شوية
frame 3 (now=0.067):  angle = 28°    ⟋ لافف أكتر
```

بسرعة 420 درجة في الثانية وعند 30 FPS، القوس بيتحرك 14 درجة كل frame. العين بتوصّل النقط ببعض وبتشوف حركة مستمرة (نفس فكرة أفلام الكارتون: صور ثابتة ورا بعض).

### 3) رياضيات المدار

كل شرارة بتتحسب على خطوتين:

**الخطوة 1: بيضاوي parametric مش متلفّ.** الدايرة العادية: `x = r·cos θ` و `y = r·sin θ`. لو ضربنا y في رقم أقل من 1 (`tilt`)، الدايرة بتتفرطح وتبقى بيضاوي:

```
x = r · cos θ
y = r · tilt · sin θ
```

ولما `θ` بتزيد مع الوقت، النقطة بتلف على البيضاوي.

**الخطوة 2: نلف البيضاوي بزاوية φ (= `orb_rot`).** بنستخدم الـ 2D rotation matrix:

```
┌ x' ┐   ┌ cos φ   −sin φ ┐ ┌ x ┐
│    │ = │                │ │   │
└ y' ┘   └ sin φ    cos φ ┘ └ y ┘
```

يعني:

```
x' = x·cos φ − y·sin φ
y' = x·sin φ + y·cos φ
```

وده بالظبط السطر ده في الكود (مع زيادة مركز الكف):

```python
        xs, ys = cx + ex * c - ey * s, cy + ex * s + ey * c
```

حيث `c = cos φ` و `s = sin φ`. ليه بنعمل كده؟ لأن البيضاويات المايلة بزوايا مختلفة بتبان كأنها مدارات في 3D حوالين كورة (زي رسمة الذرة المشهورة)، من غير ما نعمل أي حسابات 3D حقيقية.

### 4) الـ easing بالجذر التربيعي

```python
        grow = min(1.0, self.age / 0.6) ** 0.5
```

| العمر (ثانية) | خطي `age/0.6` | بالجذر `sqrt(age/0.6)` |
|---|---|---|
| 0.00 | 0.00 | 0.00 |
| 0.06 | 0.10 | 0.32 |
| 0.15 | 0.25 | 0.50 |
| 0.30 | 0.50 | 0.71 |
| 0.60 | 1.00 | 1.00 |

بالجذر، الكورة بتوصل لنص حجمها في ربع الوقت، وبعدين بتكبر ببطء لحد الآخر. ده بيدّي إحساس "انفجار طاقة في الأول وبعدين بتستقر"، وده أطبع للعين من الكبر الخطي اللي شكله ميكانيكي. الدوال اللي بتغير شكل الحركة كده اسمها **easing functions**.

### 5) الـ tangent vector `(-y, x)`

لو عندنا vector `d = (x, y)` من مركز الكورة لنقطة على الحافة، الـ vector `(-y, x)`:

- **عمودي عليه:** حاصل الضرب النقطي `x·(-y) + y·x = 0`.
- **نفس الطول:** `√(y² + x²)`.

يعني ده الاتجاه "الماشي على الحافة" (زي اتجاه عربية بتلف في دوران). لو الجزيء اتحرك في الاتجاه ده بس، هيلف حوالين الكورة. ولما نزوّد عليه شوية من `d` نفسه (`dirs * 0.6`)، بيلف وهو بيبعد، فبيطلع شكل حلزوني زي الدوامة:

```
            ↑ tangent (-y, x)
            │
   مركز ●───┼──► d = (x, y)
            ╲
             ↗ المجموع = tangent×1.5 + d×0.6  ← حلزوني لبره
```

### 6) ألوان BGR والدالة `bgr()`

- OpenCV بيخزّن الصورة BGR مش RGB (لأسباب تاريخية). فـ `(255, 0, 0)` في OpenCV = **أزرق** مش أحمر.
- بنمسك الألوان كـ NumPy arrays عشان نقدر نعمل `BLUE * 0.35` (نغمّق اللون).
- بس OpenCV 5 بيرفض NumPy array كلون، فـ `bgr()` بتحوّله لـ tuple فيه `float` عادي. (في `fx.py` نفس المشكلة اتحلت بـ `.tolist()`).

---

# الجزء التاني: `shinobi/effects/chidori.py`

## الملف ده بيعمل إيه؟

بيرسم برق أزرق بيطقطق حوالين الإيد: 7 صواعق (وفروع منها) طالعة من الكف في اتجاهات عشوائية، بتتغير 20 مرة في الثانية عشان تعمل "رعشة" البرق، وفوقها شرر بيطير ويقع، وأحياناً flash أزرق على الصورة كلها.

## الكود سطر بسطر

```python
"""Chidori: crackling lightning bolts around the hand."""

import cv2
import numpy as np

from shinobi.effects.base import Effect
from shinobi.effects.fx import Particles, add_glow, random_directions
```

- docstring: برق بيطقطق حوالين الإيد.
- نفس الـ imports بتاعة الراسينجان: `cv2` للرسم، `numpy` للحسابات، والأدوات المشتركة.

```python
GLOW = (255, 120, 30)      # BGR electric blue
CORE = (255, 235, 200)     # almost white, slightly blue
```

- `GLOW`: أزرق كهربائي (BGR). ده لون الهالة العريضة حوالين الصاعقة.
- `CORE`: شبه أبيض مايل للأزرق. ده لون الخط الرفيع في قلب الصاعقة.
- هنا عملناهم **tuple** مش NumPy array، فممكن نديهم لـ OpenCV على طول من غير `bgr()`. الفرق إن مش هنحتاج نعمل عليهم حسابات (إلا في الشرر، وهناك `np.outer` بيرجّع array والـ `draw` بتحوّله بـ `.tolist()`).

```python
def lightning_path(start, end, rng, detail=5, roughness=0.28):
    """Midpoint displacement: split the segment, push the middle sideways, repeat."""
    points = np.array([start, end], np.float32)
    offset = np.linalg.norm(np.subtract(end, start)) * roughness
```

دالة بتولّد شكل صاعقة متعرّجة بين نقطتين بخوارزمية **midpoint displacement** (اتشرحت بالتفصيل تحت):

- `start, end`: أول وآخر نقطة.
- `rng`: مولّد الأرقام العشوائية.
- `detail=5`: عدد مرات التقسيم. كل مرة عدد الأجزاء بيتضاعف، فـ 5 مرات = 32 جزء (33 نقطة).
- `roughness=0.28`: قد إيه البرق متعرّج.
- `points`: في الأول خط مستقيم من نقطتين بس، array شكله `(2, 2)`.
- `offset`: أقصى مسافة نزق بيها النص لجنب = طول الخط × 0.28. `np.subtract(end, start)` = الـ vector من البداية للنهاية، و `np.linalg.norm` = طوله.

```python
    for _ in range(detail):
        mids = (points[:-1] + points[1:]) / 2
        seg = points[1:] - points[:-1]
```

- اللوب بيتكرر `detail` مرة.
- `points[:-1]` = كل النقط ماعدا الأخيرة، و `points[1:]` = كل النقط ماعدا الأولى. لو حطيناهم جنب بعض بيطلع كل جزء (من نقطة للي بعدها).
- `mids`: نص كل جزء = (البداية + النهاية) / 2. لو فيه k جزء، فيه k نقطة نص.
- `seg`: الـ vector بتاع كل جزء (النهاية − البداية).

```python
        normal = np.stack([-seg[:, 1], seg[:, 0]], axis=1)
        normal /= np.linalg.norm(normal, axis=1, keepdims=True) + 1e-6
        mids += normal * rng.uniform(-offset, offset, (len(mids), 1))
```

- `normal`: الـ vector العمودي على كل جزء: `(-y, x)`، نفس فكرة الـ tangent في الراسينجان.
- السطر التاني بيخلي طول كل normal = 1 (normalize): بنقسمه على طوله. `keepdims=True` عشان الطول يفضل شكله `(k, 1)` ويتقسم صح على العمودين. الـ `+ 1e-6` بيمنع القسمة على صفر لو جزء طوله صفر.
- السطر التالت هو **قلب الخوارزمية**: بنزق كل نقطة نص لجنب (في اتجاه الـ normal) بمسافة عشوائية بين `-offset` و `+offset`. الرقم العشوائي شكله `(k, 1)` عشان نفس الرقم يتضرب في x و y بتاع نفس الـ normal.

```python
        out = np.empty((len(points) + len(mids), 2), np.float32)
        out[0::2], out[1::2] = points, mids
        points, offset = out, offset / 2
    return points.astype(np.int32)
```

- `out`: array فاضي يساع النقط القديمة + نقط النص.
- `out[0::2] = points`: النقط القديمة في الأماكن الزوجية (0, 2, 4, ...).
- `out[1::2] = mids`: نقط النص في الأماكن الفردية (1, 3, 5, ...). فبيطلع الترتيب صح: `A, M1, B, M2, C, ...` (كل نقطة نص بين النقطتين بتوعها).
- `points, offset = out, offset / 2`: النقط الجديدة بقت هي الأساس للمرة الجاية، **والـ offset بيتقسم على 2**. يعني الزقات بتصغر كل مرة.
- في الآخر بنحوّل لـ `int32` لأن `cv2.polylines` محتاج أرقام pixels صحيحة.

```python
class Chidori(Effect):
    name = "chidori"
    follows_hand = True
```

- زي الراسينجان: بيورث من `Effect`، اسمه `chidori`، ومربوط بالإيد.

```python
    def __init__(self, duration, n_bolts=7, seed=None):
        super().__init__(duration)
        self.rng = np.random.default_rng(seed)
        self.n_bolts = n_bolts
        self.bolts = []           # list of (polyline relative to the hand, thickness)
        self.next_regen = 0.0
        self.sparks = Particles()
```

- `n_bolts=7`: عدد الصواعق الأساسية.
- `self.bolts`: list فيها `(path, thickness)` لكل صاعقة. الـ path **نسبي للإيد** (يعني مركزه `(0, 0)`)، ولما نرسم بنزوّد عليه مكان الإيد.
- `self.next_regen = 0.0`: إمتى نولّد صواعق جديدة. بيبدأ صفر، فأول frame هيولّد على طول.
- `self.sparks`: نظام particles للشرر.

```python
    def _regenerate(self, radius):
        """New random bolts relative to (0, 0); they are shifted to the hand when drawn."""
        self.bolts = []
        for _ in range(self.n_bolts):
            angle = self.rng.uniform(0, 2 * np.pi)
            length = radius * self.rng.uniform(0.7, 1.8)
            end = np.array([np.cos(angle), np.sin(angle)]) * length
            path = lightning_path((0, 0), end, self.rng)
            self.bolts.append((path, 3))
```

- بنمسح الصواعق القديمة ونبني 7 جديدة.
- `angle`: اتجاه عشوائي في أي حتة حوالين الإيد (0 لـ 360 درجة).
- `length`: طول الصاعقة من 0.7 لـ 1.8 من `radius`، عشان مايبقوش كلهم نفس الطول.
- `end`: نقطة النهاية = اتجاه × طول (إحداثيات قطبية → كارتيزية).
- `path`: صاعقة متعرّجة من `(0, 0)` (مركز الإيد) لـ `end`.
- `(path, 3)`: سُمكها 3 (صاعقة أساسية).

```python
            if self.rng.random() < 0.6:                       # a smaller side branch
                fork = path[self.rng.integers(len(path) // 3, len(path) - 1)]
                tip = fork + np.array([np.cos(angle + 0.8), np.sin(angle + 0.8)]) * length * 0.4
                self.bolts.append((lightning_path(fork, tip, self.rng, detail=4), 2))
```

- **الفروع:** بنسبة 60% الصاعقة دي هيطلع منها فرع.
- `fork`: نقطة التفرع، نقطة عشوائية من الـ path بين التلت الأول وقبل الآخر. (الـ path فيه 33 نقطة، فبنختار من 11 لـ 31.) مابنبدأش من أول الصاعقة عشان الفرع يبان طالع من الصاعقة نفسها مش من الإيد.
- `tip`: آخر الفرع: من نقطة التفرع، في اتجاه مايل 0.8 radian (حوالي 46 درجة) عن اتجاه الصاعقة الأصلية، وطوله 40% من طولها.
- الفرع بيتولّد بنفس الدالة بس `detail=4` (16 جزء، تفاصيل أقل لأنه أقصر)، وسُمكه 2 (أرفع).

```python
    def render(self, frame, tracking, dt, segmentation=None):
        now = tracking.now
        alpha = self.opacity(now)
        if tracking.anchor is None or alpha <= 0:
            return frame
        radius = max(30.0, tracking.size * 1.5)
        cx, cy = tracking.anchor
        offset = np.array([cx, cy], np.int32)
```

- أول 4 سطور زي الراسينجان: الوقت، الشفافية (وتحديث العمر)، والخروج لو مافيش إيد.
- `radius`: حجم منطقة البرق = 1.5 × طول الإيد (أكبر من الراسينجان، البرق بيوصل لبعيد). أقل حاجة 30.
- `offset`: مكان الإيد كـ integers. هنزوّده على كل نقط الصواعق (اللي متخزنة نسبية) عشان تتنقل لمكان الإيد.

```python
        if now >= self.next_regen:                             # flicker: new bolts ~20x / second
            self._regenerate(radius)
            self.next_regen = now + 0.05
```

- لو جه وقت التجديد: نولّد صواعق جديدة بأشكال واتجاهات جديدة، والتجديد الجاي بعد 0.05 ثانية. يعني **20 مرة في الثانية** تقريباً.
- عند 30 FPS ده معناه إن الصواعق بتتغير تقريباً كل frame ونص. ده اللي بيعمل الطقطقة والرعشة.
- **ليه نسبي؟** لو الإيد اتحركت بين تجديدين، الصواعق القديمة لسه بتترسم في المكان الصح، لأننا بنزوّد `offset` الجديد في كل frame.

```python
        layer = np.zeros_like(frame)
        cv2.circle(layer, (int(cx), int(cy)), int(radius * 0.25), GLOW, -1, cv2.LINE_AA)
```

- `layer` سودا جديدة.
- دايرة مليانة باللون الأزرق في مركز الإيد (ربع الـ radius): ده "مصدر" البرق اللي الصواعق طالعة منه.

```python
        for path, thick in self.bolts:
            pts = (path + offset).reshape(-1, 1, 2)
            cv2.polylines(layer, [pts], False, GLOW, thick * 2, cv2.LINE_AA)       # wide colored glow
            cv2.polylines(layer, [pts], False, CORE, 1, cv2.LINE_AA)               # thin bright core
```

لكل صاعقة:

- `path + offset`: ننقل الصاعقة لمكان الإيد.
- `.reshape(-1, 1, 2)`: `cv2.polylines` عايز النقط بالشكل `(N, 1, 2)`. الـ `-1` معناها "NumPy يحسب العدد ده لوحده".
- `[pts]`: `polylines` بتاخد **list** من الخطوط (ممكن نرسم كذا خط مرة واحدة)، فبنحط الخط بتاعنا في list.
- `False`: الخط مفتوح (مش closed)، يعني آخر نقطة مش هتتوصل بأول نقطة.
- **الرسمة الأولى:** خط عريض (`thick * 2` = 6 للأساسية، 4 للفرع) باللون الأزرق `GLOW`.
- **الرسمة التانية:** خط رفيع (1 pixel) باللون الأبيض `CORE` **فوق** الأول.
- النتيجة: قلب أبيض حواليه أزرق. ده شكل البرق الحقيقي في الصور: الأبيض في النص لأنه أسخن حتة، والأزرق حواليه.

```python
        n = int(250 * dt) + 1
        self.sparks.emit(np.array([cx, cy]), random_directions(n, self.rng) *
                         self.rng.uniform(150, 550, (n, 1)) * radius / 100,
                         self.rng.uniform(0.1, 0.3, n), self.rng.uniform(1, 2.5, n))
```

**الشرر:**

- `n`: 250 شرارة في الثانية (حوالي 9 في كل frame عند 30 FPS).
- المكان: كلهم بيطلعوا من مركز الإيد `[cx, cy]` (الـ `emit` بيكرره n مرة بـ `broadcast_to`).
- السرعة: اتجاه عشوائي × سرعة من 150 لـ 550 pixel/ثانية × `radius / 100`. القسمة على 100 والضرب في `radius` معناها إن السرعة متظبطة على إيد حجمها 100، ولو الإيد أكبر الشرر بيطير أسرع وأبعد بنفس النسبة.
- العمر: من 0.1 لـ 0.3 ثانية (الشرر بيعيش وقت قصير جداً).
- الحجم: نص قطر من 1 لـ 2.5 pixel.

```python
        self.sparks.update(dt, gravity=(0, 400), drag=1.0)
        self.sparks.draw(layer, np.outer(1.0 - self.sparks.t * 0.5, CORE))
```

- `gravity=(0, 400)`: جاذبية لتحت. **في الصور، y بيزيد لتحت**، فـ y موجب = لتحت. يعني الشرر بيطير وبعدين بيقع في قوس، زي شرر اللحام.
- `drag=1.0`: مقاومة هوا خفيفة.
- اللون: `1.0 - t * 0.5` بيبدأ 1 وبينزل لـ 0.5 بس (مش لصفر)، فالشرر بيفضل منوّر نسبياً لحد ما يموت فجأة. ده مناسب للشرر لأنه بيختفي فجأة في الحقيقة. `np.outer` بيطلّع لون لكل شرارة.

```python
        frame = add_glow(frame, layer, (cx, cy), radius * 2.2, strength=1.1, blur=radius * 0.4, opacity=alpha)
        if self.rng.random() < 0.12 * alpha:                   # occasional blue flash on the whole scene
            frame = cv2.add(frame, (45, 18, 0, 0))
        return frame
```

- `add_glow`: يجمع الطبقة على الصورة مع هالة. الـ blur هنا (`0.4`) أقل من الراسينجان (`0.6`)، عشان البرق محتاج يفضل حاد شوية.
- **الـ flash:** في كل frame فيه احتمال `12% × alpha` إن الصورة **كلها** تنوّر أزرق. `cv2.add(frame, (45, 18, 0, 0))` بيزوّد 45 على قناة الأزرق و 18 على الأخضر و 0 على الأحمر لكل pixel. (القيمة الرابعة 0 دي لقناة alpha في الـ Scalar بتاع OpenCV، ومش مستخدمة هنا.)
- `cv2.add` **saturating**: لو pixel قيمته 250 وزوّدنا 45، بيبقى 255 (بيقف عند الحد الأقصى). جرّبناها: `[250,250,250] + (45,18,0,0) = [255, 255, 250]`. لو كنا عملناها بـ NumPy العادي (`frame + 45`) كان الـ uint8 هيلف ويرجع رقم صغير (250+45=295 → 39)، والـ pixel المنوّر هيبقى غامق!
- عند 30 FPS و `alpha = 1`: `0.12 × 30 ≈ 3.6` flash في الثانية في المتوسط، كأن البرق بينوّر الأوضة.

## مفاهيم مهمة (Chidori)

### 1) خوارزمية Midpoint Displacement خطوة بخطوة

فكرة بسيطة جداً بتطلّع أشكال طبيعية (برق، جبال، سواحل):

> ناخد خط مستقيم → نقسمه نصين → نزق النص لجنب بمسافة عشوائية → نكرر على كل جزء جديد بزقة أصغر.

مثال صغير: خط من `A = (0, 0)` لـ `B = (100, 0)`، و `roughness = 0.28`:

```
البداية:   offset = 100 × 0.28 = 28        (2 نقطة، جزء واحد)

  A ●─────────────────────────────────● B

المستوى 1: نص AB = (50, 0)، الـ normal = (0, 1)، زقة عشوائية مثلاً +20
          → M = (50, 20)                     (3 نقط، 2 أجزاء)  ثم offset = 14

                      ● M
                   ╱     ╲
  A ●──────────╱             ╲──────────● B

المستوى 2: نص AM ونص MB، كل واحد بيتزق عمودي على جزئه بزقة لحد ±14
                                             (5 نقط، 4 أجزاء)  ثم offset = 7

                 m1●
                ╱   ╲     ● M
  A ●────────╱        ╲╱     ╲
                                ╲     ╱● B
                                 ● m2
...
```

| المستوى | عدد النقط | أقصى زقة |
|---|---|---|
| 0 (البداية) | 2 | — |
| 1 | 3 | 28 |
| 2 | 5 | 14 |
| 3 | 9 | 7 |
| 4 | 17 | 3.5 |
| 5 | 33 | 1.75 |

### 2) الـ normal vector

لو الجزء اتجاهه `(sx, sy)`، فالـ normal `(-sy, sx)` عمودي عليه (حاصل الضرب النقطي = `-sx·sy + sy·sx = 0`). بنزق في الاتجاه ده عشان التعرّج يبقى **لجنب** الخط مش على طوله. لو زقّينا على طول الخط، النقط هتتلخبط ومش هيبقى فيه تعرّج. وبنعمل normalize (طوله = 1) عشان الزقة تبقى بالظبط الرقم العشوائي اللي اخترناه، مهما كان طول الجزء.

### 3) ليه بنقسم الـ roughness على 2 كل مستوى؟

- في المستوى الأول بنحدد **الشكل العام** للصاعقة (انحناءة كبيرة).
- في المستويات اللي بعدها بنضيف **تفاصيل** أصغر وأصغر.
- لو الزقة فضلت ثابتة (28) في كل مستوى، الأجزاء الصغيرة (طولها 3 pixels) هتتزق 28 pixel، والخط هيبقى شخبطة عشوائية مش صاعقة.
- ده اسمه **self-similarity** (التشابه الذاتي): الصاعقة لو كبّرنا أي حتة فيها، شكلها شبه الصاعقة كلها. وده سبب إن الشكل طبيعي (fractal).

### 4) الفروع

البرق الحقيقي بيتفرع. بنسبة 60% بنختار نقطة من الصاعقة (بعد التلت الأول) ونطلّع منها صاعقة أصغر (40% من الطول، مايلة 46 درجة، أرفع، تفاصيل أقل). ده بيخلي الشكل شجري بدل خطوط مستقيمة طالعة من المركز.

### 5) التجديد ~20 مرة في الثانية (الـ flicker)

البرق الحقيقي مابيقفش ثابت. لو ولّدنا الصواعق مرة واحدة، هتبان زي شروخ ثابتة في الإزاز. بتوليدها من جديد كل 0.05 ثانية، الشكل بيتغير باستمرار والعين بتشوفه "بيطقطق". ومابنولّدش كل frame لأن ده بيعتمد على الـ FPS: على جهاز سريع (60 FPS) هيبقى أسرع من اللازم ويبان ضوضاء. بالوقت الثابت (0.05 ثانية) الإحساس نفسه على أي جهاز.

### 6) الرسم على مرتين (two-pass drawing)

```
الرسمة 1 (أزرق، عريض):   ████████████████
الرسمة 2 (أبيض، رفيع):   ────────────────   ← فوق الأزرق
النتيجة:                  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓   قلب أبيض بحواف زرقا
+ add_glow:               هالة زرقا ضبابية حوالين الكل
```

نفس الطريقة اللي بتترسم بيها الـ neon والـ lasers والـ lightsabers في الألعاب.

### 7) الشرر بالجاذبية

`gravity=(0, 400)` = عجلة 400 pixel/ثانية² لتحت. في `Particles.update`:

```
vel += gravity × dt      ← السرعة الرأسية بتزيد لتحت كل frame
pos += vel × dt          ← المكان بيتحرك بالسرعة
```

فالشرارة اللي طالعة لفوق بتبطّأ، وبتقف، وبعدين بتقع: قوس زي الكورة المرمية (projectile motion).

### 8) الـ flash الأزرق بـ `cv2.add` و scalar

- `cv2.add(image, scalar)` بيزوّد نفس الرقم على كل pixel في كل قناة.
- الـ saturating هو المهم: الأرقام بتقف عند 255 بدل ما تلف.
- الاحتمال مضروب في `alpha`، فوقت الـ fade out الـ flashes بتقل، ولما `alpha = 0` مفيش flash خالص.

---

# الجزء التالت: `shinobi/effects/fire.py`

## الملف ده بيعمل إيه؟

بيطلّع تيار نار من الإيد في الاتجاه اللي الإيد شايرة له. النار عبارة عن **particle system**: مئات النقط الصغيرة، كل واحدة بتتولد بيضا سخنة، بتطير، بتطلع لفوق (الهوا السخن بيطلع)، بيتغير لونها لأصفر فبرتقالي فأحمر فدخان، وبتكبر، وبعدين بتموت. و الـ blur بيدوّبهم في بعض فيبانوا لهب واحد.

## الكود سطر بسطر

```python
"""Fire Style: a stream of flame particles blown out of the hand."""

import numpy as np

from shinobi.effects.base import Effect
from shinobi.effects.fx import Particles, add_glow, color_ramp, random_directions
```

- docstring: تيار particles نار طالع من الإيد.
- **ملاحظة:** مافيش `import cv2` هنا! كل الرسم بيتعمل جوه `Particles.draw` و `add_glow` في `fx.py`، فالملف ده مش محتاج OpenCV مباشرة.
- `color_ramp`: جديدة هنا، بنستخدمها لتدرّج لون النار حسب العمر.

```python
# BGR color by particle age: white-hot -> yellow -> orange -> red -> dark smoke
FIRE_RAMP = [
    (0.00, (190, 250, 255)),
    (0.15, (60, 220, 255)),
    (0.40, (10, 120, 255)),
    (0.70, (0, 40, 190)),
    (1.00, (10, 10, 30)),
]
```

الـ **color ramp**: list من نقط توقف، كل نقطة = (العمر من 0 لـ 1، اللون BGR):

| العمر `t` | اللون BGR | الشكل | ليه |
|---|---|---|---|
| 0.00 | (190, 250, 255) | أبيض مصفر | أسخن حتة، طالعة من الإيد على طول |
| 0.15 | (60, 220, 255) | أصفر | (أخضر + أحمر عاليين، أزرق قليل = أصفر) |
| 0.40 | (10, 120, 255) | برتقالي | أحمر كامل + أخضر نص |
| 0.70 | (0, 40, 190) | أحمر | بيبرد |
| 1.00 | (10, 10, 30) | شبه أسود (دخان) | خلاص بردت |

`color_ramp` بيعمل interpolation خطي بين النقط: لو `t = 0.275` (بين 0.15 و 0.40 بالظبط)، اللون بيبقى نص المسافة بين الأصفر والبرتقالي. وده نفس ترتيب ألوان النار الحقيقية حسب الحرارة.

```python
class FireStyle(Effect):
    name = "fire"
    follows_hand = True
```

- الكلاس `FireStyle`، اسمه `fire`، ومربوط بالإيد.

```python
    def __init__(self, duration, rate=650, seed=None):
        super().__init__(duration)
        self.rng = np.random.default_rng(seed)
        self.rate = rate               # particles per second
        self.flames = Particles()
```

- `duration`: من `config` = 6 ثواني.
- `rate=650`: عدد particles النار الجديدة **في الثانية**.
- `self.flames`: نظام particles فاضي.

```python
    def render(self, frame, tracking, dt, segmentation=None):
        now = tracking.now
        self.opacity(now)               # updates self.age and starts the fade-out when time is up
        if tracking.anchor is None:
            return frame
```

- `self.opacity(now)`: **مش بنستخدم الرقم اللي بترجّعه!** بنناديها عشان التأثير الجانبي بس: بتحدّث `self.age`، ولو المدة خلصت بتحط `self.stop_at`. (النار بتعمل الـ fade بطريقة تانية، هنشوفها.)
- لو مافيش إيد: نرجّع الصورة. (ماعندناش `alpha <= 0` هنا لأننا مش بنستخدم alpha.)

```python
        size = max(30.0, tracking.size)
        cx, cy = tracking.anchor
        direction = tracking.direction if tracking.direction is not None else np.array([0.0, -1.0])
        # Emit from just past the fingers, in the direction the hand points.
        origin = np.array([cx, cy]) + direction * size * 0.9
```

- `size`: حجم الإيد (أقل حاجة 30). كل أرقام النار بتتضرب فيه، فالنار بتكبر وتصغر مع الإيد.
- `direction`: اتجاه الإيد (vector طوله 1 من الرسغ للصوابع). لو مش موجود، بنستخدم `(0, -1)` = لفوق (y سالب = لفوق في الصورة).
- `origin`: نقطة خروج النار = مركز الكف + 0.9 × طول الإيد في اتجاه الصوابع. يعني النار بتطلع من قدام الصوابع، مش من نص الكف.

```python
        if self.stop_at is None:        # stop feeding the fire once fading out; existing flames die naturally
            n = int(self.rate * dt * min(1.0, self.age / 0.3)) + 1
            angle = np.arctan2(direction[1], direction[0])
```

- `if self.stop_at is None`: نولّد نار جديدة **بس** لو الـ effect لسه ماوقفش. لما الوقت يخلص أو الإيد تختفي، بنبطّل نولّد، والنار الموجودة بتكمل لحد ما تموت لوحدها. ده **الـ fade out** بتاع النار، وشكله طبيعي جداً (زي ما نقفل البوتاجاز).
- `n`: عدد الـ particles الجديدة = المعدل × `dt` (عشان يبقى 650 في الثانية مهما كان الـ FPS) × معامل بيكبر من 0 لـ 1 في أول 0.3 ثانية. ده **الـ fade in**: النار بتبدأ خفيفة وبتقوى. عند 30 FPS بعد الـ fade in: `int(650/30) + 1 = 22` particle في الـ frame.
- `angle`: زاوية اتجاه الإيد بالـ radian. `np.arctan2(y, x)` بيرجّع الزاوية صح في كل الأرباع (أحسن من `arctan(y/x)` اللي بيتلخبط لو x سالب أو صفر).

```python
            dirs = random_directions(n, self.rng, center_angle=angle, spread=0.35)
            speed = self.rng.uniform(4.0, 9.0, (n, 1)) * size
```

- `dirs`: `n` اتجاه عشوائي، بس **حوالين** اتجاه الإيد بحد أقصى ±0.35 radian (حوالي ±20 درجة). يعني مخروط عرضه 40 درجة، زي فوهة الخرطوم.
- `speed`: سرعة من 4 لـ 9 أضعاف طول الإيد في الثانية. لإيد طولها 60 pixel: من 240 لـ 540 pixel/ثانية. الشكل `(n, 1)` عشان يتضرب في الـ x والـ y.

```python
            self.flames.emit(origin + self.rng.normal(0, size * 0.1, (n, 2)), dirs * speed,
                             self.rng.uniform(0.45, 0.9, n), self.rng.uniform(0.06, 0.14, n) * size)
```

- **المكان:** `origin` + شوية عشوائية (توزيع normal، انحراف معياري 10% من الإيد). فالنار مش طالعة من نقطة واحدة بالظبط، طالعة من منطقة صغيرة. ده بيخلي الجذر بتاع اللهب تخين وطبيعي.
- **السرعة:** الاتجاه × السرعة.
- **العمر:** من 0.45 لـ 0.9 ثانية.
- **الحجم:** نص قطر من 6% لـ 14% من طول الإيد.

```python
        # Hot air rises: negative y acceleration pulls flames upward; drag slows the jet.
        self.flames.update(dt, gravity=(0, -3.0 * size), drag=1.8)
```

- **ده بيتعمل حتى لو بطّلنا نولّد** (بره الـ `if`)، عشان النار الموجودة تكمل حركتها وتموت.
- `gravity=(0, -3.0 * size)`: "جاذبية" **سالبة** في y = لفوق. ده الـ **buoyancy** (الطفو): الهوا السخن أخف فبيطلع لفوق. متناسبة مع حجم الإيد عشان الشكل يفضل نفسه لو الإيد قرّبت أو بعدت.
- `drag=1.8`: مقاومة قوية. في كل frame السرعة بتتضرب في `(1 - 1.8 × dt)`. عند 30 FPS ده `0.94` كل frame، يعني بعد نص ثانية (15 frame) السرعة بتبقى `0.94^15 ≈ 0.39` من الأصلية.
- **الاتنين مع بعض:** في الأول الـ particle بتطير بسرعة في اتجاه الإيد (تيار)، والـ drag بيهدّيها، وبعدين الطفو بيكسب فبتلف لفوق. ده بالظبط شكل النار اللي بتطلع من بوق التنين: تيار أفقي بيتلوى لفوق في آخره.

```python
        if len(self.flames) == 0:
            return frame
```

- لو مافيش ولا particle (مثلاً بعد ما النار كلها ماتت): مافيش حاجة نرسمها. وكمان بنتجنب error في `min()` و `max()` تحت لأنهم مابيشتغلوش على array فاضي.

```python
        t = self.flames.t
        colors = color_ramp(t, FIRE_RAMP) * (1.0 - t[:, None] ** 2)      # fade as they cool
        sizes = self.flames.size * (1.0 + 1.5 * t)                        # flames expand
```

- `t`: عمر كل particle من 0 لـ 1.
- `colors`: لون كل particle من الـ ramp حسب عمرها، مضروب في `(1 - t²)` عشان تغمق وهي بتموت.
  - `t[:, None]` بيحوّل الشكل من `(N,)` لـ `(N, 1)` عشان يتضرب في الـ 3 قنوات بتاعة اللون.
  - ليه `t²` مش `t`؟ `1 - t²` بيفضل عالي فترة طويلة وبينزل بسرعة في الآخر: عند `t = 0.5` لسه 0.75، عند `t = 0.9` بيبقى 0.19. فالنار بتفضل منوّرة معظم عمرها وبتختفي بسرعة في الآخر.
- `sizes`: الحجم بيكبر مع العمر لحد 2.5 ضعف (`1 + 1.5 × 1`). النار الحقيقية بتتمدد وهي بتطلع (والدخان أكبر من اللهب).

```python
        layer = np.zeros_like(frame)
        self.flames.draw(layer, colors * 0.45, sizes)                     # dim: overlaps add up to bright
```

- `layer` سودا.
- بنرسم كل الـ particles بألوانها **مضروبة في 0.45** (أقل من نص الشدة) وبالأحجام الجديدة.
- الكومنت بيقول "dim: overlaps add up to bright" (باهتة، والتداخل بيتجمع ويبقى منوّر). الفكرة صح بس محتاجة توضيح دقيق (في المفاهيم تحت): `cv2.circle` نفسها **مابتجمعش** جوه الـ layer، اللي بيجمع هو الـ blur والـ additive blend في `add_glow`.
- **ترتيب الرسم:** الـ particles الجديدة متخزنة في آخر الـ arrays، فبتترسم في الآخر، يعني **فوق** القديمة. فالجزء الأبيض الأصفر (الجديد) بيبان فوق الأحمر (القديم). صدفة حلوة بتخدم الشكل.

```python
        # Glow only around where the flames actually are (their bounding box).
        lo, hi = self.flames.pos.min(axis=0), self.flames.pos.max(axis=0)
        extent = float(np.max(hi - lo)) / 2 + float(sizes.max())
```

- `lo`: أصغر x وأصغر y بين كل الـ particles (الركن الشمال الفوقاني). `hi`: أكبر x وأكبر y (الركن اليمين التحتاني). المربع اللي بينهم اسمه **bounding box**.
- `extent`: نص أكبر ضلع في المربع + نص قطر أكبر particle (عشان الدواير اللي على الحافة ماتتقصّش).
- **ليه؟** النار مش حوالين الإيد بس زي الراسينجان، دي بتطير لبعيد ولفوق. فبدل ما نحدد مربع ثابت حوالين الإيد، بنحسب المربع من مكان النار الفعلي.

```python
        return add_glow(frame, layer, (lo + hi) / 2, extent, strength=1.0, blur=size * 0.4,
                        soften=max(2.0, size * 0.06))
```

- المركز = نص الـ bounding box. والـ extent اللي حسبناه.
- `strength=1.0`: هالة متوسطة.
- `blur=size * 0.4`: حجم الهالة.
- `soften=max(2.0, size * 0.06)`: **ده المهم للنار.** بيعمل blur خفيف للطبقة نفسها (مش الهالة بس) قبل ما يجمعها. ده بيدوّب الدواير المنفصلة في بعض فتبقى لهب واحد ناعم بدل نقط.
- **مافيش `opacity=alpha`** هنا: النار مابتعملش fade بالشفافية، بتعمل fade بإنها تبطّل تولّد (اتشرح فوق).

```python
    def finished(self, now):
        # Wait until the last flames have burned out, not just the fade-out timer.
        return super().finished(now) and len(self.flames) == 0
```

- بنعمل **override** لـ `finished` من الكلاس الأب.
- الأب بيقول "خلصت" لو عدّى `fade_out` (0.5 ثانية) من وقت الإيقاف.
- بس النار ممكن يكون لسه فيها particles عايشة لحد 0.9 ثانية! لو الـ `EffectManager` شال الـ effect بعد 0.5 ثانية، النار اللي في الهوا هتختفي فجأة في نص طيرانها، وده شكله وحش.
- فبنضيف شرط: **وكمان** مايبقاش فيه ولا particle. كده النار بتخلص بشكل طبيعي.

## مفاهيم مهمة (Fire)

### 1) الـ particle emitter (معدل × dt)

```
عدد الجديد في الـ frame = rate × dt
```

- عند 30 FPS: `650 × 0.033 ≈ 22`.
- عند 15 FPS: `650 × 0.067 ≈ 43`.

في الحالتين: 650 particle في الثانية. لو كتبنا عدد ثابت لكل frame، النار هتبقى أكثف على الجهاز الأسرع. والـ `+ 1` بيضمن إن فيه particle واحدة على الأقل حتى لو `dt` صغير جداً.

وكام particle عايشة في نفس الوقت؟ تقريباً `المعدل × متوسط العمر = 650 × 0.675 ≈ 440`. وده سبب إن الـ particles متخزنة كـ NumPy arrays مش objects: تحديث 440 particle بسطر NumPy واحد أسرع بكتير من loop في Python.

### 2) اتجاه الخروج والـ spread

```
                      ╱  ← +20°
          إيد ●──────────── ← اتجاه الإيد (angle)
                      ╲  ← −20°
```

`random_directions(n, rng, center_angle=angle, spread=0.35)` بيختار زاوية عشوائية بين `angle − 0.35` و `angle + 0.35` لكل particle. فالنار بتطلع مخروط في اتجاه الإيد. لو لفّينا الإيد، `tracking.direction` بيتغير، والنار بتلف معاها.

### 3) الطفو (buoyancy) والـ drag

| القوة | في الكود | بتعمل إيه |
|---|---|---|
| الدفعة الأولى | `dirs * speed` | تيار سريع في اتجاه الإيد |
| الطفو | `gravity=(0, -3.0 * size)` | سحب ثابت لفوق (y سالب) |
| الـ drag | `drag=1.8` | بيقلل السرعة باستمرار |

في أول الحياة السرعة كبيرة فالـ drag بيأثر كتير، وبعد شوية السرعة الأصلية بتختفي والطفو بيكسب، فاللهب بيطلع لفوق.

### 4) تدرّج اللون حسب العمر

كل particle بتمشي على الـ ramp: `أبيض → أصفر → برتقالي → أحمر → دخان`. ومع `(1 − t²)` اللون بيغمق في الآخر. وده بيقلّد الفيزياء: الحاجة الأسخن بتطلّع نور أبيض/أزرق، ولما تبرد بتبقى أصفر ثم أحمر ثم مابتنورش.

### 5) الكبر مع العمر

`sizes = size * (1 + 1.5t)`: اللهب عند الإيد رفيع ومركّز، وبيوسع وهو بيطلع. من غير ده، النار هتبان زي رشاش نقط متساوية.

### 6) الـ particles الباهتة والتجميع (توضيح مهم)

الكومنت في الكود بيقول إن الـ particles الباهتة لما تتداخل بتتجمع وتبقى منوّرة. خلّينا نوضّح بالظبط فين التجميع ده بيحصل، لأن فيه نقطة مش واضحة:

- **جوه الـ `layer`:** `cv2.circle` بتكتب **فوق** القيمة القديمة، مش بتجمع عليها. جرّبنا: دايرتين متداخلين قيمتهم 100 → الـ pixel المشترك = 100، مش 200.
- **التجميع الحقيقي بيحصل في `add_glow`:**
  1. **الـ `soften` blur:** بيعمل متوسط لكل pixel مع جيرانه. في المنطقة الكثيفة (particles كتير جنب بعض) الجيران كلهم ملونين، فاللون بيفضل قوي. في المنطقة المتفرقة الجيران سود، فاللون بيضعف. يعني **الكثافة = الإضاءة**.
  2. **الجمع على الصورة:** الطبقة بتتجمع على صورة الكاميرا (`addWeighted` saturating)، وبعدين الهالة كمان بتتجمع فوقهم. فالنتيجة النهائية = الكاميرا + اللهب + الهالة.
- **ليه `× 0.45`؟** عشان المجموع ده مايوصلش 255 في كل حتة ويبقى بقعة بيضا مسطحة من غير تفاصيل. باللون الباهت، القلب الكثيف بيوصل للأبيض والأطراف بتفضل ملونة.

### 7) الـ `soften` بيدوّب الـ particles

```
من غير soften:   ● ● ●● ●  ●      ← نقط منفصلة
مع soften:       ≈≈≈≈≈≈≈≈≈≈≈      ← لهب واحد ناعم
```

`soften` بيعمل Gaussian blur للطبقة (على نص الحجم عشان أسرع 4 مرات، اتشرح في `fx.py`). الحواف بتتمسح فالدواير بتسيح في بعض.

### 8) الـ ROI من الـ bounding box

`add_glow` غالي (blur على صور). لو اشتغل على الصورة كلها (1280×720)، هيبقى بطيء. فبنحسب المربع اللي فيه النار فعلاً ونشتغل عليه بس. وده بيتغير كل frame مع حركة النار.

### 9) ليه `finished()` بتستنى النار تموت؟

```
الوقت:   0 ─────────── 6s (المدة خلصت) ── 6.5s (fade_out خلص) ── ~6.9s (آخر particle ماتت)
الأب:                                         "خلصت" ✗ (بدري)
FireStyle:                                                            "خلصت" ✓
```

---

## لو غيّرنا ... هيحصل إيه؟

| التجربة | التغيير | النتيجة المتوقعة |
|---|---|---|
| 1 | في `rasengan.py` نغيّر `now * 420` لـ `now * 60` | الأقواس هتلف ببطء شديد (60 درجة في الثانية). الكورة هتبان هادية ومش خطيرة |
| 2 | في `rasengan.py` نشيل `** 0.5` من `grow` | الكورة هتكبر بشكل خطي. هتبان أبطأ وأكثر "ميكانيكية" في البداية |
| 3 | في `rasengan.py` نشيل `bgr(...)` ونكتب `BLUE * 0.35` على طول | البرنامج هيوقع بـ error من OpenCV: `Scalar value for argument 'color' is not numeric` |
| 4 | في `chidori.py` نغيّر `now + 0.05` لـ `now + 1.0` | الصواعق هتتغير مرة واحدة كل ثانية. هتبان شروخ ثابتة بتتحرك مع الإيد، وإحساس "الطقطقة" هيختفي |
| 5 | في `chidori.py` نغيّر `roughness=0.28` لـ `0.02`، أو `detail=5` لـ `1` | مع roughness صغيرة: خطوط شبه مستقيمة. مع detail=1: كل صاعقة خطين بس (زاوية واحدة) من غير تفاصيل |
| 6 | في `fire.py` نغيّر `gravity=(0, -3.0 * size)` لـ `(0, +3.0 * size)` | النار هتقع لتحت زي ميّة أو رمل بدل ما تطلع لفوق. ده بيوضّح إن الطفو هو اللي مخلّيها تبان نار |
| 7 | في `fire.py` نغيّر `colors * 0.45` لـ `colors * 1.0` | القلب هيبقى بقعة بيضا/صفرا مشبّعة ومسطحة، والتدرجات هتختفي |

---

## أسئلة مراجعة

<details>
<summary>1. إزاي الأقواس في الراسينجان بتبان إنها بتلف رغم إن الكود مابيلفّش أي حاجة؟</summary>

كل frame بنرسم من الأول على layer جديدة، وزاوية البيضاوي `angle = (now * 420 * direction + k * 45) % 360` بتتغير مع الوقت. العين بتشوف الصور المتتالية دي كحركة دوران مستمرة (نفس فكرة الكارتون).
</details>

<details>
<summary>2. إيه معادلات مكان الشرارة في المدار، وليه بنستخدم rotation matrix؟</summary>

`x = r·cos θ` ، `y = r·tilt·sin θ` (بيضاوي)، وبعدين `x' = x·cos φ − y·sin φ` ، `y' = x·sin φ + y·cos φ` (لف بزاوية φ)، وبعدين نزوّد مركز الكف. الـ rotation matrix بتخلي كل مدار مايل بزاوية مختلفة، فالمدارات تبان كأنها في 3D حوالين الكورة.
</details>

<details>
<summary>3. إيه هي خوارزمية midpoint displacement، وليه بنقسم الـ offset على 2 كل مرة؟</summary>

بناخد خط، نقسمه من النص، نزق نقطة النص عمودي على الخط بمسافة عشوائية، ونكرر على كل جزء. بنقسم الـ offset على 2 عشان المستوى الأول يحدد الشكل العام والمستويات اللي بعده تضيف تفاصيل أصغر. لو الزقة فضلت ثابتة، الأجزاء الصغيرة هتتزق أكتر من طولها والشكل هيبقى شخبطة.
</details>

<details>
<summary>4. ليه الصاعقة بتترسم مرتين؟</summary>

مرة بخط عريض أزرق (`GLOW`، سُمك `thick * 2`) ومرة بخط رفيع أبيض (`CORE`، سُمك 1) فوقه. النتيجة قلب أبيض منوّر وحواليه هالة زرقا، زي البرق الحقيقي.
</details>

<details>
<summary>5. ليه استخدمنا `cv2.add(frame, (45, 18, 0, 0))` بدل `frame + 45`؟</summary>

لأن `cv2.add` saturating: القيمة بتقف عند 255. لكن جمع NumPy على `uint8` بيلف (250 + 45 = 39)، فالأماكن المنوّرة كانت هتبقى غامقة فجأة.
</details>

<details>
<summary>6. النار بتعمل fade in و fade out إزاي من غير ما تستخدم `alpha`؟</summary>

الـ fade in: عدد الـ particles الجديدة مضروب في `min(1.0, self.age / 0.3)` فبيبدأ قليل وبيزيد. الـ fade out: لما `self.stop_at` يتحط، بنبطّل نولّد (`if self.stop_at is None`) والـ particles الموجودة بتكمل وتموت لوحدها.
</details>

<details>
<summary>7. ليه `FireStyle` عامل override لـ `finished()`؟</summary>

لأن `finished()` بتاعة الأب بتقول "خلصت" بعد 0.5 ثانية من الإيقاف، بس لسه ممكن يكون فيه particles عايشة (عمرها لحد 0.9 ثانية). من غير الـ override، النار اللي في الهوا كانت هتختفي فجأة. فبنستنى كمان `len(self.flames) == 0`.
</details>

<details>
<summary>8. إيه اللي بيخلي اللهب يطلع لفوق؟ وإيه اللي بيخليه يبان قطعة واحدة مش نقط؟</summary>

اللي بيطلّعه لفوق: `gravity=(0, -3.0 * size)` (y سالب = لفوق) مع `drag` بيهدّي التيار الأولاني. واللي بيخليه قطعة واحدة: الـ `soften` blur في `add_glow` بيدوّب الدواير في بعض، والكثافة بتتحول لإضاءة.
</details>
