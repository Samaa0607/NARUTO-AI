# 12 — الـ Tests (`tests/test_core.py`)

[⬅ الفهرس](00_index.md)

---

## الملف ده بيعمل إيه؟

الملف ده مش جزء من البرنامج اللي بيشتغل قدام الكاميرا. ده كود **بيختبر** الكود التاني. فيه 14 test بيتأكدوا إن أهم الأجزاء في الـ pipeline شغالة صح، **من غير كاميرا ولا إيد حقيقية ولا موديل متدرب**:

```
camera → hands → features → classifier → controller → effects → screen
                    ▲            ▲            ▲            ▲
                    │            │            │            │
              3 tests      1 test (تدريب    6 tests      4 tests
              features     كامل end-to-end)  controller   effects
```

| المجموعة | عدد الـ tests | بتختبر إيه |
|---|---|---|
| features | 3 | حجم الـ vector، الثبات مع الحركة والحجم، الـ mirror |
| controller | 6 | الـ hold، تجاهل الـ spikes، إعادة التسليح، التسلسلات، الـ cooldown، رفض إعدادات jutsu مستحيلة |
| effects | 4 | كل effect بيرسم من غير ما يوقع |
| training | 1 | `train.py` كله على داتا صناعية |

## الكود سطر بسطر

```python
"""Run:  python -m pytest -q"""
```

- docstring بيقول إزاي نشغّل الـ tests: `python -m pytest -q`. (على الجهاز ده بنستخدم Python بتاع الـ venv: `.venv\Scripts\python.exe -m pytest -q`.)

```python
import json
import subprocess
import sys
```

- `json`: لكتابة الـ metadata في ملفات الداتا الصناعية (زي ما `collect_data.py` بيعمل).
- `subprocess`: لتشغيل `train.py` كبرنامج منفصل (زي ما بنشغّله من الـ terminal بالظبط).
- `sys`: عشان `sys.executable` = مسار الـ Python اللي شغّال دلوقتي (Python بتاع الـ venv)، فـ `train.py` يشتغل بنفس المكتبات.

```python
import numpy as np
import pytest
```

- `numpy`: لعمل داتا وهمية ومقارنة arrays.
- `pytest`: مكتبة الـ testing. محتاجينها هنا عشان `@pytest.mark.parametrize`.

```python
from shinobi import config
from shinobi.controller import ActionController, GestureStabilizer, SequenceMatcher
from shinobi.effects import EFFECTS
from shinobi.features import FEATURE_SIZE, extract, mirror
from shinobi.tracking import Tracking
```

الحاجات اللي هنختبرها:

- `config`: محتاجين `config.ROOT` (فولدر المشروع) عشان نشغّل `train.py` منه.
- `ActionController, GestureStabilizer, SequenceMatcher`: الـ 3 أجزاء بتوع الـ controller.
- `EFFECTS`: كل الـ effects.
- `FEATURE_SIZE, extract, mirror`: حجم الـ feature vector، ودالة الـ features، ودالة الـ mirror.
- `Tracking`: الـ dataclass اللي فيها مكان الإيد. هنعمل منها نسخة وهمية بدل ما نجيبها من كاميرا.

```python
RNG = np.random.default_rng(0)
```

- مولّد أرقام عشوائية بـ **seed ثابت (0)**. يعني كل مرة نشغّل الـ tests، نفس الأرقام "العشوائية" بتطلع. ده مهم جداً: الـ test لازم يدّي نفس النتيجة كل مرة. لو test فشل مرة ونجح مرة من غير ما نغيّر حاجة، مش هنعرف نثق فيه (اسمه **flaky test**).

```python
def fake_hand(offset=(0.3, 0.5)):
    image = np.zeros((21, 3), np.float32)
    image[:, :2] = np.array(offset) + RNG.normal(0, 0.03, (21, 2))
    world = RNG.normal(0, 0.03, (21, 3)).astype(np.float32)
    return image, world
```

دالة مساعدة بتعمل **إيد وهمية** (مش test، لأن اسمها مش بيبدأ بـ `test_`):

- `image`: 21 نقطة × 3 (x, y, z) بإحداثيات الصورة (من 0 لـ 1).
- السطر التاني: x و y لكل نقطة = `offset` (مكان الإيد في الصورة، افتراضياً 30% من العرض و 50% من الارتفاع) + شوية عشوائية صغيرة (انحراف 0.03). الـ z بيفضل صفر.
- `world`: 21 نقطة × 3 بالمتر (world coordinates)، عشوائية حوالين الصفر.
- مش شكل إيد حقيقية، بس ده مش مهم: الـ tests بتختبر **خواص** (زي "لو حركنا الإيد، الـ features ماتتغيرش")، والخواص دي لازم تبقى صح لأي أرقام.

```python
def frame_arrays(two_hands=True):
    a, wa = fake_hand((0.3, 0.5))
    b, wb = fake_hand((0.7, 0.5))
    present = np.array([1.0, 1.0 if two_hands else 0.0], np.float32)
    if not two_hands:
        b, wb = np.zeros_like(b), np.zeros_like(wb)
    return np.stack([a, b]), np.stack([wa, wb]), present
```

بتعمل **frame وهمي** بنفس الشكل اللي `hands_to_arrays` بيطلّعه:

- إيد `a` على الشمال (x = 0.3) وإيد `b` على اليمين (x = 0.7).
- `present`: الإيد الأولى موجودة دايماً (1.0)، والتانية موجودة بس لو `two_hands=True`.
- لو إيد واحدة بس: نخلي بيانات التانية أصفار (زي ما الكود الحقيقي بيعمل للإيد المش موجودة).
- `np.stack([a, b])`: بيحط الإيدين في array واحد شكله `(2, 21, 3)`.
- بترجّع `(image_lm, world_lm, present)`: نفس الـ 3 arguments اللي `extract` بتاخدهم.

```python
# ------------------------------------------------------------------ features
def test_feature_size_and_missing_hand():
    img, wld, pres = frame_arrays(two_hands=False)
    f = extract(img, wld, pres)
    assert f.shape == (FEATURE_SIZE,)
    assert np.all(np.isfinite(f))
```

**Test 1: حجم الـ vector صح حتى لو إيد ناقصة.**

- frame بإيد واحدة بس.
- `f = extract(...)`: الـ feature vector.
- `assert f.shape == (FEATURE_SIZE,)`: لازم الطول يبقى ثابت (206) حتى لو إيد ناقصة. الموديل محتاج نفس عدد الأرقام كل مرة، وإلا هيوقع.
- `assert np.all(np.isfinite(f))`: كل الأرقام لازم تبقى أرقام حقيقية، مافيش `NaN` ولا `inf`. (مثلاً لو الكود قسم على طول إيد = صفر للإيد الناقصة، كان هيطلع `NaN` ويبوّظ الموديل بصمت.)

```python
def test_features_ignore_position_and_scale_of_world_coords():
    img, wld, pres = frame_arrays()
    moved = wld + np.array([0.1, -0.2, 0.05], np.float32)     # translate whole hands
    f1, f2 = extract(img, wld, pres), extract(img, moved, pres)
    np.testing.assert_allclose(f1, f2, atol=1e-5)
```

**Test 2 (الجزء الأول): الـ features مابتتأثرش بمكان الإيد.**

- `moved`: نفس الإيدين بالظبط بس متحركين كلهم 10 سم يمين، 20 سم فوق، 5 سم لقدام.
- `f1` للأصلية و `f2` للمتحركة.
- `assert_allclose(f1, f2, atol=1e-5)`: لازم يبقوا **متساويين تقريباً** (الفرق أقل من 0.00001). ليه؟ لأن `_hand_features` بتطرح مكان الرسغ من كل النقط (`world - world[0]`)، فالإزاحة بتتلغي. ونفس الإشارة لازم تدّي نفس الـ features مهما كانت الإيد فين.

```python
    f3 = extract(img, wld * 1.7, pres)                         # bigger hands
    np.testing.assert_allclose(f1, f3, atol=1e-4)
```

**Test 2 (الجزء التاني): الـ features مابتتأثرش بحجم الإيد.**

- `wld * 1.7`: نفس الإيد بس أكبر 1.7 مرة (إيد شخص كبير، أو إيد طفل لو العكس).
- لازم الـ features تبقى نفسها، لأن الكود بيقسم على طول الكف (`scale`)، والزوايا مابتتغيرش مع التكبير، ومسافات الصوابع كمان متقسومة على `scale`.
- `atol=1e-4` أكبر شوية من اللي فوق، لأن الضرب والقسمة بيعملوا أخطاء تقريب أكبر في الـ float32.

```python
def test_mirror_twice_is_identity():
    img, wld, pres = frame_arrays()
    back = mirror(*mirror(img, wld, pres))
    np.testing.assert_allclose(extract(img, wld, pres), extract(*back), atol=1e-5)
```

**Test 3: الـ mirror مرتين = الأصل.**

- `mirror` بتقلب الـ frame يمين/شمال (بنستخدمها في التدريب عشان نضاعف الداتا: إيد يمين تبقى إيد شمال).
- `mirror(*mirror(...))`: بنقلب مرتين. (الـ `*` بيفك الـ tuple اللي راجع لـ 3 arguments.)
- لو قلبنا صورة في المراية مرتين، المفروض ترجع زي ما كانت بالظبط. فبنقارن features الأصل بـ features اللي رجعت.
- **ده بيكشف إيه؟** لو فيه bug في الـ mirror (مثلاً نسينا نقلب x في world، أو ترتيب الإيدين اتلخبط ومارجعش)، الـ test هيفشل. ده نوع اسمه **round-trip test** (نروح ونرجع، ونتأكد إننا رجعنا لنفس النقطة).

```python
# ------------------------------------------------------------------ controller
LABELS = ["idle", "clone_seal", "rasengan"]
```

- قايمة labels صغيرة (3 بس) للـ tests بتاعة الـ controller. أبسط من الـ 5 الحقيقيين، وكفاية لاختبار المنطق.

```python
def probs(name, p=0.95):
    out = np.full(len(LABELS), (1 - p) / (len(LABELS) - 1), np.float32)
    out[LABELS.index(name)] = p
    return out
```

دالة مساعدة بتعمل **احتمالات وهمية** كأن الموديل متأكد من إشارة:

- `np.full(3, 0.025)`: كل الـ labels واخدين نصيب متساوي من الباقي: `(1 − 0.95) / 2 = 0.025`.
- الإشارة المطلوبة تاخد 0.95.
- مثال: `probs("rasengan")` → `[0.025, 0.025, 0.95]` (المجموع 1، زي الاحتمالات الحقيقية).

```python
def feed(stab, name, seconds, start, fps=30):
    confirmed = []
    for i in range(int(seconds * fps)):
        g = stab.update(probs(name) if name else None, start + i / fps)
        if g:
            confirmed.append(g)
    return confirmed
```

دالة مساعدة بتحاكي إننا **ماسكين إشارة لمدة معينة**:

- `stab`: الـ stabilizer. `name`: الإشارة (أو `None` = مفيش إيد). `seconds`: المدة. `start`: وقت البداية. `fps=30`.
- `range(int(seconds * fps))`: عدد الـ frames. نص ثانية = 15 frame.
- كل frame: نبعت الاحتمالات (أو `None`)، والوقت `start + i / fps` (كل frame بعد اللي قبله بـ 1/30 ثانية).
- لو الـ stabilizer أكّد إشارة (`g` مش `None`)، نضيفها للقايمة.
- بترجّع كل الإشارات اللي اتأكدت. فنقدر نقول مثلاً "لازم تبقى `["rasengan"]` بالظبط".
- **الفكرة المهمة:** الوقت هنا **وهمي**؛ إحنا اللي بنحدده. فالـ test بيحاكي 10 ثواني في جزء من الثانية، ونتيجته ثابتة مش معتمدة على سرعة الجهاز.

```python
def test_stabilizer_needs_hold_and_fires_once():
    stab = GestureStabilizer(LABELS, hold=0.3)
    assert feed(stab, "rasengan", 0.2, 0.0) == []            # too short
    assert feed(stab, "rasengan", 1.0, 0.2) == ["rasengan"]  # held long enough: exactly once
```

**Test 4: الإشارة محتاجة hold، وبتتأكد مرة واحدة بس.**

- stabilizer بـ hold = 0.3 ثانية.
- أول 0.2 ثانية: **مفيش تأكيد** (`[]`)، لأن المدة أقل من الـ hold.
- نكمل نفس الإشارة ثانية كمان (من 0.2 لـ 1.2): لازم تتأكد **مرة واحدة بالظبط**، مش 30 مرة (مرة لكل frame).
- بالأرقام: الاحتمال المتنعّم بيبدأ من 0 وبيطلع: 0.38، 0.61، 0.74، 0.83... فبيعدّي `CONF_ON = 0.75` في الـ frame الرابع (t = 0.1). يبقى التأكيد عند t ≈ 0.1 + 0.3 = 0.4، وده جوه الـ feed التاني.
- **ده بيحمي من إيه؟** إن الـ effect يتشغّل بحركة عابرة، أو يتشغّل من جديد كل frame.

```python
def test_stabilizer_ignores_single_frame_spikes():
    stab = GestureStabilizer(LABELS)
    for i in range(60):
        name = "rasengan" if i % 10 == 0 else "idle"           # one noisy frame every 10
        assert stab.update(probs(name), i / 30) is None
```

**Test 5: frame غلط لوحده مايفعّلش حاجة.**

- 60 frame (ثانيتين). كل 10 frames، frame واحد الموديل "بيغلط" ويقول `rasengan` بـ 95%، والباقي `idle`.
- `assert ... is None` **في كل frame**: ولا مرة يتأكد حاجة.
- ليه؟ الـ smoothing: `0.4 × 0.95 + 0.6 × 0.025 ≈ 0.39`، وده أقل بكتير من 0.75. والـ frame اللي بعده بيرجّعه لتحت.
- **ده بيحمي من:** الموديل الحقيقي بيغلط أحياناً في frame لوحده (blur، إيد في نص حركة). من غير الـ smoothing، كل غلطة كانت هتشغّل effect.

```python
def test_stabilizer_rearms_after_release():
    stab = GestureStabilizer(LABELS, hold=0.2)
    assert feed(stab, "rasengan", 0.8, 0.0) == ["rasengan"]
    feed(stab, None, 0.5, 0.8)                                 # hands down
    assert feed(stab, "rasengan", 0.8, 1.3) == ["rasengan"]
```

**Test 6: بعد ما ننزّل الإيد، نقدر نعمل نفس الإشارة تاني.**

- نمسك `rasengan` 0.8 ثانية → تتأكد مرة.
- ننزّل الإيد نص ثانية (`None` = مفيش إيد = idle). الاحتمال المتنعّم بينزل تحت `CONF_OFF = 0.45` فالـ **latch** بيتفك.
- نعمل `rasengan` تاني → لازم تتأكد **تاني**.
- Test 4 بيتأكد إن الإشارة **مابتتكررش** وهي ماسكة. Test 6 بيتأكد إنها **بتشتغل تاني** بعد الفك. لو الـ latch عمره ما بيتفك، Test 4 هينجح بس Test 6 هيفشل. فالاتنين مع بعض بيختبروا السلوك كامل.

```python
def test_sequence_matcher_prefers_full_sequence_and_times_out():
    jutsu = {"fire": {"sequence": ["a", "b", "c"], "effect": "fire"},
             "single": {"sequence": ["x"], "effect": "x"}}
    m = SequenceMatcher(jutsu, max_gap=1.0)
```

**Test 7: الـ SequenceMatcher.**

- بنعمل jutsu وهميين: واحد تسلسل من 3 إشارات (`a → b → c`)، وواحد من إشارة واحدة (`x`).
- `max_gap=1.0`: أقصى ثانية بين إشارتين.
- بنستخدم أسماء وهمية (`a`, `b`, `x`) لأن الـ matcher مايهموش أسماء الإشارات الحقيقية، بيقارن strings بس.

```python
    assert m.push("a", 0.0) is None
    assert m.push("b", 0.5) is None
    assert m.push("c", 1.0) == "fire"
    assert m.push("x", 1.2) == "single"
```

- `a` عند 0.0 → لسه مفيش تطابق.
- `b` عند 0.5 → لسه.
- `c` عند 1.0 → التسلسل كمل: `"fire"`. (الفجوات كلها 0.5 ثانية، أقل من 1.0.)
- `x` عند 1.2 → `"single"`. وده بيأكد كمان إن التاريخ اتمسح بعد `fire` واتعامل مع `x` لوحده.

```python
    m.push("a", 2.0)
    m.push("b", 2.5)
    assert m.push("c", 4.0) is None                            # gap too long: sequence reset
```

- `a` عند 2.0، `b` عند 2.5، وبعدين `c` عند **4.0** (بعد `b` بـ 1.5 ثانية > 1.0).
- الـ matcher لازم يمسح التاريخ (اتأخرنا) فـ `c` تبقى لوحدها → مفيش تطابق (`None`).
- **ده بيحمي من:** إننا نعمل `a` النهارده و `b` و `c` بعد 5 دقايق ويتحسبوا jutsu.

```python
def test_controller_cooldown():
    ctrl = ActionController(["idle", "clone_seal", "rasengan", "chidori", "fire"], cooldown=3.0)
    fired = []
    t = 0.0
```

**Test 8: الـ cooldown.**

- controller حقيقي بالـ 5 labels، و cooldown = 3 ثواني.
- `fired`: كل الـ effects اللي اشتغلت.
- `t`: الوقت الوهمي.
- ملاحظة: الـ `ActionController` بيستخدم `config.JUTSU` الحقيقي (فيه `rasengan` و `chidori` كـ static jutsu).

```python
    for name in ["rasengan", None, "chidori", None]:
        for _ in range(30):
            p = None
            if name:
                p = np.full(5, 0.01, np.float32)
                p[["idle", "clone_seal", "rasengan", "chidori", "fire"].index(name)] = 0.96
```

- 4 مراحل، كل مرحلة 30 frame (ثانية): `rasengan`، مفيش إيد، `chidori`، مفيش إيد.
- `p`: `None` لو مفيش إيد. وإلا: كل الـ labels 0.01 والإشارة المطلوبة 0.96 (المجموع = 4 × 0.01 + 0.96 = 1.0).

```python
            s = ctrl.update(p, t)
            if s.effect:
                fired.append(s.effect)
            t += 1 / 30
    assert fired == ["rasengan"]                                # chidori came during the cooldown
```

- كل frame: نحدّث الـ controller، ولو قال "شغّل effect" نسجّله، ونزوّد الوقت 1/30.
- **النتيجة المطلوبة:** `["rasengan"]` بس.
  - `rasengan` بتتأكد حوالي t = 0.4 → بتشتغل، والـ cooldown يبدأ.
  - `chidori` بتتأكد حوالي t = 2.4 → عدّى 2 ثانية بس من آخر تفعيل (أقل من 3) → **تتجاهل**.
- **ده بيحمي من:** إن effect يقطع effect تاني في نصه لو الموديل اتلخبط بين إشارتين.

```python
# ------------------------------------------------------------------ effects
@pytest.mark.parametrize("name", list(EFFECTS))
def test_effects_render_without_crashing(name):
```

**Tests 9-12: كل effect بيرسم من غير ما يوقع.**

- `@pytest.mark.parametrize("name", list(EFFECTS))`: decorator بيخلي pytest يشغّل الـ test ده مرة لكل قيمة في القايمة، ويحط القيمة في `name`. `list(EFFECTS)` = `["shadow_clone", "rasengan", "chidori", "fire"]`، فالدالة دي بتطلع **4 tests منفصلين**.
- الفايدة: لو ضفنا effect خامس لـ `EFFECTS`، هيتختبر تلقائياً من غير ما نكتب test جديد. ولو واحد فشل، pytest بيقول بالظبط أنهي واحد (مثلاً `test_effects_render_without_crashing[fire]`).

```python
    frame = np.full((360, 640, 3), 60, np.uint8)
    effect = EFFECTS[name]()
    effect.start(0.0)
```

- `frame`: صورة رمادي غامق (كل pixel = 60) بحجم 640×360. حجم صغير عشان الـ test يبقى سريع.
- `EFFECTS[name]()`: نبني الـ effect (بنفس الطريقة اللي `EffectManager` بيستخدمها).
- `effect.start(0.0)`: نبدأه عند الوقت 0.

```python
    small = frame.copy()
    mask = np.zeros((360, 640), np.float32)
    mask[100:360, 250:390] = 1.0                               # a fake "person"
```

- segmentation وهمية للـ shadow clone:
  - `small`: نسخة من الصورة (اللي الـ segmenter الحقيقي بيرجّعها مصغرة).
  - `mask`: كله أصفار (خلفية)، ماعدا مستطيل في النص = 1 (ده "الشخص"). الصفوف من 100 لتحت، والأعمدة من 250 لـ 390.
- كده نقدر نختبر الـ shadow clone من غير موديل segmentation ولا كاميرا.

```python
    for i in range(40):
        now = i / 30
        tracking = Tracking(hands=[], now=now, visible=True, anchor=np.array([320.0, 180.0]),
                            size=60.0, direction=np.array([0.0, -1.0]))
```

- 40 frame (حوالي 1.3 ثانية). المدة دي بتغطي الـ fade in (0.3 ثانية)، وكبر الراسينجان (0.6)، وكذا تجديد للبرق، وبداية النار.
- `tracking` وهمي: إيد في نص الصورة بالظبط `(320, 180)`، حجمها 60 pixel، شايرة لفوق `(0, -1)`، و `visible=True` (عشان الـ effects اللي بتتبع الإيد ماتقفش).
- ده بيبيّن فايدة إن الـ effects بتاخد `Tracking` بسيطة: نقدر نعمل واحدة بإيدنا من غير MediaPipe.

```python
        out = effect.render(frame, tracking, 1 / 30, (small, mask))
        assert out.shape == frame.shape and out.dtype == np.uint8
```

- `render` بـ `dt = 1/30`، والـ segmentation الوهمية (الـ effects اللي مش محتاجاها بتتجاهلها).
- الـ assert: الصورة الراجعة لازم يبقى ليها **نفس الحجم** و **نوعها `uint8`** (أرقام من 0 لـ 255).
- **ده بيكشف إيه؟**
  - أي crash (exception) في كود الرسم. مثلاً لو حد شال `bgr()` من الراسينجان، OpenCV 5 هيرمي error والـ test هيفشل.
  - لو effect رجّع صورة `float` بالغلط (مثلاً بعد ضرب في رقم عشري)، `cv2.imshow` هيعرضها غلط. الـ test بيمسك ده.
  - لو الحجم اتغير (مثلاً قصّينا جزء غلط)، الصورة مش هتتعرض صح.
- الـ test **مابيتأكدش إن الشكل حلو**؛ ده محتاج عين بشرية. بيتأكد بس إن الكود "مابيوقعش وبيرجّع حاجة صالحة". وده اسمه **smoke test**.

```python
# ------------------------------------------------------------------ training pipeline
def test_train_script_on_synthetic_data(tmp_path):
    rng = np.random.default_rng(1)
```

**Test 13: التدريب كله من الأول للآخر (end-to-end).**

- `tmp_path`: **fixture** من pytest. لما نكتب argument بالاسم ده، pytest بيعمل فولدر مؤقت جديد فاضي لكل تشغيل ويديه لنا كـ `Path`. كده الـ test بيكتب ملفاته في مكان معزول، **ومابيلمسش `data/` ولا `models/` الحقيقيين**.
- `rng` بـ seed = 1: داتا عشوائية بس ثابتة.

```python
    for label_i, label in enumerate(["idle", "rasengan", "chidori"]):
        folder = tmp_path / "data" / label
        folder.mkdir(parents=True)
```

- 3 إشارات: `idle` (لازم تبقى موجودة، `train.py` بيرفض من غيرها)، `rasengan`، `chidori`.
- لكل إشارة فولدر بنفس التنظيم الحقيقي: `data/<label>/`.
- `mkdir(parents=True)`: يعمل الفولدر وأي فولدرات قبله مش موجودة.

```python
        for s in range(3):
            n = 40
            img = np.zeros((n, 2, 21, 3), np.float32)
            wld = rng.normal(0, 0.01, (n, 2, 21, 3)).astype(np.float32)
```

- 3 sessions لكل إشارة (`train.py` محتاج 2 على الأقل عشان يقسم بالـ session).
- كل session فيها 40 frame.
- `img`: إحداثيات الصورة، شكلها `(frames, إيدين, 21 نقطة, xyz)`.
- `wld`: world coordinates، ضوضاء صغيرة.

```python
            wld[:, 0, :, 0] += label_i * 0.03 * np.arange(21) / 21    # class-specific hand shape
            img[:, 0, :, :2] = 0.4 + rng.normal(0, 0.02, (n, 21, 2))
            present = np.tile(np.array([1.0, 0.0], np.float32), (n, 1))
```

- **السطر الأهم:** بنخلي كل إشارة ليها "شكل إيد" مختلف. بنزوّد على x بتاع الإيد الأولى رقم بيكبر مع رقم النقطة (`np.arange(21) / 21` = من 0 لـ ~1)، مضروب في `label_i` (0 لـ idle، 1 لـ rasengan، 2 لـ chidori). فـ idle مفيش تغيير، rasengan إيد "مايلة" شوية، chidori مايلة أكتر. كده الموديل عنده حاجة يتعلمها.
- `img`: الإيد الأولى حوالين (0.4, 0.4) في الصورة.
- `present`: كل frame فيه إيد أولى بس `[1, 0]`. `np.tile` بيكرره 40 مرة → شكله `(40, 2)`.

```python
            np.savez_compressed(folder / f"s{s}.npz", image_lm=img, world_lm=wld, present=present,
                                timestamps=np.arange(n) / 30.0,
                                meta=json.dumps({"label": label, "session": f"{label}{s}",
                                                 "person": "p", "lighting": "x", "aspect": 16 / 9}))
```

- بنحفظ الـ session بنفس صيغة `collect_data.py` بالظبط: ملف `.npz` مضغوط فيه:
  - `image_lm`, `world_lm`, `present`: الداتا.
  - `timestamps`: وقت كل frame (0، 1/30، 2/30...).
  - `meta`: JSON فيه الـ label، واسم session مختلف لكل ملف (`rasengan0`, `rasengan1`...)، والشخص، والإضاءة، ونسبة الصورة.
- اسم الـ session لازم يبقى مختلف لأن `train.py` بيقسم الداتا بالـ session (عشان frames نفس التسجيل ماتبقاش في التدريب والاختبار مع بعض).

```python
    out = tmp_path / "model.joblib"
    subprocess.run([sys.executable, "train.py", "--data", str(tmp_path / "data"), "--out", str(out),
                    "--step", "1"], check=True, cwd=config.ROOT)
```

- `out`: مكان حفظ الموديل (في الفولدر المؤقت).
- `subprocess.run([...])`: بنشغّل `train.py` **كبرنامج منفصل**، بالظبط زي ما بنكتب في الـ terminal:
  `python train.py --data <tmp>/data --out <tmp>/model.joblib --step 1`
  - `sys.executable`: نفس Python اللي شغّال الـ tests.
  - `--step 1`: استخدام كل frame (الـ default 2 بياخد frame وسايب frame؛ إحنا عندنا 40 بس فمحتاجينهم كلهم).
  - `check=True`: لو `train.py` خلص بـ error (exit code مش صفر)، `subprocess.run` بيرمي `CalledProcessError` والـ test يفشل.
  - `cwd=config.ROOT`: نشغّله من فولدر المشروع، عشان `"train.py"` يتلاقي، وعشان `import shinobi` جوه `train.py` يشتغل.
- **ليه subprocess مش import؟** عشان نختبر السكريبت **زي ما المستخدم بيشغّله فعلاً**: الـ argparse، والـ `main()`، والحفظ. كمان `train.py` بيحفظ صور الـ confusion matrix والتقرير جنب الموديل (يعني في `tmp_path` برضه، مش في `models/`).

```python
    from shinobi.classifier import GestureClassifier
    clf = GestureClassifier(out)
    assert clf.labels == ["idle", "rasengan", "chidori"]
```

- بنعمل import للـ `GestureClassifier` جوه الـ test (مش فوق). ده مش ضروري تقنياً، بس بيوضّح إن الجزء ده خاص بالـ test ده.
- `GestureClassifier(out)`: نحمّل الموديل اللي لسه اتدرب، **بنفس الكود اللي `main.py` بيستخدمه**. لو الملف بايظ، أو الـ `feature_version` مش متطابق، هيرمي error.
- `assert clf.labels == [...]`: الـ labels المحفوظة لازم تبقى الـ 3 دول **بالترتيب ده** (ترتيبهم في `config.GESTURES`: idle=0، rasengan=2، chidori=3).
- **ده بيثبت إيه؟** إن السلسلة كلها شغالة: ملفات `.npz` → `load_sessions` → `extract` و `mirror` → cross-validation → التدريب → الحفظ → التحميل. لو أي حلقة فيها اتكسرت (مثلاً حد غيّر اسم مفتاح في ملف الداتا)، الـ test ده هيمسكها.

```python
def test_sequence_matcher_rejects_single_gesture_prefix():
    jutsu = {"a_alone": {"sequence": ["a"], "effect": "x"},
             "a_then_b": {"sequence": ["a", "b"], "effect": "y"}}
```

**Test 14: إعداد jutsu مستحيل لازم يترفض.**

- بنعمل jutsu وهميين: `a_alone` = إشارة `a` لوحدها، و `a_then_b` = `a` وبعدها `b`.
- الإعداد ده **مستحيل يشتغل**: أول ما `a` تتأكد، الـ matcher هيطابق `a_alone` على طول ويمسح التاريخ، فـ `a_then_b` عمرها ما هتكمل. (دي القاعدة المكتوبة في `config.py` فوق `JUTSU`.)

```python
    with pytest.raises(ValueError):
        SequenceMatcher(jutsu)
```

- `pytest.raises(ValueError)`: context manager بيقول: "الكود اللي جوه الـ `with` **لازم** يرمي `ValueError`". لو رماه → الـ test ينجح. لو مارماش حاجة (أو رمى نوع error تاني) → الـ test يفشل.
- `SequenceMatcher(jutsu)`: مجرد إنشاء الـ matcher بالإعداد ده لازم يرفض. ده بيحصل في دالة `_check_prefixes` جوه `controller.py`: بتدوّر على أي jutsu أطول من إشارة واحدة أول إشارة فيه هي نفسها jutsu لوحدها، ولو لقت ترمي `ValueError` برسالة بتشرح المشكلة.
- **ده بيحمي من إيه؟** من غير الفحص ده، لو حد ضاف تسلسل زي ده في `config.py`، البرنامج هيشتغل عادي والتسلسل الجديد ببساطة **مش هيشتغل أبداً** من غير أي رسالة، وهنضيّع وقت ندوّر على السبب. بالفحص، البرنامج بيوقف من أول ما يفتح ويقول المشكلة فين. الفكرة دي اسمها **fail fast**: الغلط يبان بدري وبصوت عالي.
- ونوع الـ test ده مختلف عن الباقي: مش بيختبر إن الكود بيدّي النتيجة الصح، بيختبر إنه **بيرفض المدخلات الغلط**.

## مفاهيم مهمة

### 1) يعني إيه unit test؟ وليه؟

**Unit test** = كود صغير بيشغّل حتة واحدة من البرنامج (unit) بمدخلات معروفة، وبيتأكد إن المخرجات هي المتوقعة.

ليه نتعب نفسنا؟

- **الثقة بعد التعديل:** لو غيّرنا حاجة في `features.py`، بنشغّل الـ tests في 20 ثانية ونعرف لو كسرنا حاجة، بدل ما نسجّل داتا وندرّب ونجرّب قدام الكاميرا.
- **اختبار الحالات الصعبة:** صعب نعمل "frame غلط واحد كل 10" بإيدنا قدام الكاميرا. في الـ test سهل جداً.
- **توثيق:** الـ test بيوضّح السلوك المطلوب. `assert fired == ["rasengan"]` بيقول بوضوح: "الـ chidori اللي في الـ cooldown مابتشتغلش".
- **من غير hardware:** الـ tests بتشتغل على أي جهاز من غير كاميرا.

أنواع الـ tests هنا:

| النوع | المعنى | مثال |
|---|---|---|
| Unit test | حتة واحدة لوحدها | الـ stabilizer، الـ matcher |
| Property / invariance test | خاصية لازم تبقى صح لأي مدخل | الـ features مابتتأثرش بالمكان والحجم |
| Round-trip test | نروح ونرجع لنفس النقطة | mirror مرتين |
| Smoke test | "بيشتغل من غير ما يوقع؟" | كل effect بيرسم |
| End-to-end test | السلسلة كلها | التدريب من الملفات للموديل |

### 2) أساسيات pytest

- **الاكتشاف التلقائي:** pytest بيدوّر على ملفات اسمها `test_*.py` (أو `*_test.py`)، وجواها على أي دالة اسمها بيبدأ بـ `test_`، وبيشغّلها. مش محتاجين نسجّل الـ tests في أي مكان. (عشان كده `fake_hand` و `feed` و `probs` مش بيتشغّلوا كـ tests.)
- **`assert`:** كلمة عادية في Python: `assert شرط`. لو الشرط `False`، بترمي `AssertionError` والـ test يفشل. pytest بيعرض القيم اللي اتقارنت، فبنعرف الغلط فين على طول.
- **`np.testing.assert_allclose(a, b, atol=...)`:** لمقارنة arrays فيها أرقام عشرية. ليه مش `==`؟ لأن الأرقام العشرية في الكمبيوتر فيها أخطاء تقريب صغيرة: `0.1 + 0.2 == 0.3` بتطلع `False` في Python! فبنقول "متساويين لو الفرق أقل من `atol`".
- **`@pytest.mark.parametrize`:** test واحد بيتشغّل على كذا مدخل. كل مدخل بيبقى test منفصل في النتيجة.
- **`pytest.raises(ErrorType)`:** بنستخدمه مع `with` عشان نتأكد إن كود معين **بيرمي** error معين (الـ test بيفشل لو مارماهوش).
- **Fixtures (`tmp_path`):** حاجات pytest بيجهّزها لنا تلقائياً لما نكتب اسمها كـ argument. `tmp_path` فولدر مؤقت جديد لكل test.
- **Seeds:** `np.random.default_rng(0)` عشان العشوائي يبقى ثابت والـ tests تدّي نفس النتيجة دايماً.
- **الوقت الوهمي:** بدل `time.sleep`، بنبعت `now` بإيدنا (`start + i / fps`). الـ tests بتبقى سريعة وثابتة.

### 3) كل test بيثبت إيه؟ (ملخص)

| # | الـ test | بيثبت إن... |
|---|---|---|
| 1 | `test_feature_size_and_missing_hand` | الـ vector دايماً 206 رقم، ومفيش `NaN` حتى لو إيد ناقصة |
| 2 | `test_features_ignore_position_and_scale_of_world_coords` | الـ features ثابتة لو الإيد اتحركت أو كبرت (invariance) |
| 3 | `test_mirror_twice_is_identity` | الـ mirror (الـ augmentation) صح ومابيبوّظش الداتا |
| 4 | `test_stabilizer_needs_hold_and_fires_once` | لازم hold، والتأكيد بيحصل مرة واحدة بس |
| 5 | `test_stabilizer_ignores_single_frame_spikes` | غلطة frame واحد مابتفعّلش حاجة |
| 6 | `test_stabilizer_rearms_after_release` | بعد تنزيل الإيد نقدر نعيد نفس الإشارة |
| 7 | `test_sequence_matcher_prefers_full_sequence_and_times_out` | التسلسل بيتعرف، والتأخير بيمسحه |
| 8 | `test_controller_cooldown` | مفيش jutsu جديد أثناء الـ cooldown |
| 9-12 | `test_effects_render_without_crashing[...]` | كل effect من الـ 4 بيرسم ويرجّع صورة صالحة |
| 13 | `test_train_script_on_synthetic_data` | التدريب كله من الملفات للموديل المحفوظ شغال |
| 14 | `test_sequence_matcher_rejects_single_gesture_prefix` | إعداد jutsu مستحيل يتنفذ بيترفض على طول بـ `ValueError` |

### 4) إزاي نشغّلهم

من فولدر المشروع:

```powershell
.venv\Scripts\python.exe -m pytest -q
```

- `.venv\Scripts\python.exe`: Python بتاع الـ venv (فيه كل المكتبات).
- `-m pytest`: تشغيل pytest كـ module (أضمن من أمر `pytest` لوحده، لأنه بيستخدم Python ده بالظبط وبيضيف فولدر المشروع للـ path، فـ `import shinobi` بيشتغل).
- `-q` (quiet): نتيجة مختصرة: نقطة لكل test ناجح، و `F` لكل test فاشل.

النتيجة على الجهاز ده:

```
..............                                                           [100%]
14 passed in 20.09s
```

معظم الـ 20 ثانية دي في test التدريب (بيدرّب RandomForest و MLP بـ cross-validation).

أوامر مفيدة كمان:

| الأمر | بيعمل إيه |
|---|---|
| `.venv\Scripts\python.exe -m pytest -v` | اسم كل test ونتيجته في سطر |
| `.venv\Scripts\python.exe -m pytest -k cooldown` | يشغّل بس الـ tests اللي اسمها فيه `cooldown` |
| `.venv\Scripts\python.exe -m pytest -k "not train"` | كله ماعدا test التدريب (أسرع بكتير) |
| `.venv\Scripts\python.exe -m pytest -x` | يقف عند أول فشل |

---

## لو غيّرنا ... هيحصل إيه؟

| التجربة | التغيير | النتيجة المتوقعة |
|---|---|---|
| 1 | في `features.py` نشيل القسمة على `scale` (`rel = rel / scale`) | Test 2 هيفشل في الجزء التاني (`f1` ≠ `f3`)، لأن الإيد الأكبر هتدّي أرقام أكبر. ده بالظبط اللي الـ test معمول عشانه |
| 2 | في `test_controller_cooldown` نغيّر `cooldown=3.0` لـ `cooldown=1.0` | الـ test هيفشل: `fired` هتبقى `["rasengan", "chidori"]`، لأن الـ chidori جت بعد ثانيتين وده أكتر من الـ cooldown الجديد |
| 3 | في `test_stabilizer_needs_hold_and_fires_once` نغيّر `hold=0.3` لـ `hold=1.5` | التأكيد المسجل هيفشل: الـ feed التاني بيغطي لحد t ≈ 1.17 بس، والتأكيد محتاج لحد t ≈ 1.6، فالنتيجة `[]` بدل `["rasengan"]` |
| 4 | نضيف effect خامس لـ `EFFECTS` في `effects/__init__.py` | هيظهر test جديد تلقائياً: `test_effects_render_without_crashing[<الاسم>]`، فيبقوا 15 test |
| 5 | في test التدريب نشيل `"idle"` من قايمة الإشارات | `train.py` هيقف بـ `SystemExit` (لازم `idle`)، فـ `check=True` هيرمي `CalledProcessError` والـ test يفشل |
| 6 | نشيل `RNG = np.random.default_rng(0)` ونستخدم seed عشوائي | الـ tests المفروض تفضل ناجحة (لأنها بتختبر خواص)، بس لو حصل فشل مرة، هيبقى صعب نكرره ونفهمه. ده سبب الـ seed الثابت |

---

## أسئلة مراجعة

<details>
<summary>1. إيه هو الـ unit test، وليه مفيد في مشروع زي ده؟</summary>

كود صغير بيشغّل جزء واحد من البرنامج بمدخلات معروفة ويتأكد من النتيجة. مفيد لأننا نقدر نتأكد إن الـ features والـ controller والـ effects والتدريب شغالين في 20 ثانية، من غير كاميرا ولا تسجيل داتا، وأي تعديل يكسر حاجة بيبان على طول.
</details>

<details>
<summary>2. pytest بيعرف الـ tests منين؟</summary>

بيدوّر على ملفات اسمها `test_*.py`، وجواها على الدوال اللي اسمها بيبدأ بـ `test_`. عشان كده `fake_hand` و `feed` و `probs` دوال مساعدة مش tests.
</details>

<details>
<summary>3. ليه بنستخدم <code>np.testing.assert_allclose</code> بدل <code>==</code>؟</summary>

لأن الأرقام العشرية فيها أخطاء تقريب صغيرة (حتى `0.1 + 0.2 != 0.3`). `assert_allclose` بيعتبر الرقمين متساويين لو الفرق أقل من `atol`.
</details>

<details>
<summary>4. الـ test الخاص بتحريك الإيد وتكبيرها بيثبت إيه، وليه ده مهم للموديل؟</summary>

بيثبت إن الـ features مش بتتأثر بمكان الإيد ولا بحجمها (invariance). مهم لأن نفس الإشارة لازم تدّي نفس الأرقام سواء الإيد قريبة أو بعيدة، يمين أو شمال، كبيرة أو صغيرة. وإلا الموديل هيحتاج داتا لكل مكان وحجم.
</details>

<details>
<summary>5. <code>@pytest.mark.parametrize</code> بيعمل إيه في test الـ effects؟</summary>

بيشغّل نفس الدالة 4 مرات، مرة لكل اسم في `EFFECTS`، وكل مرة بتظهر كـ test منفصل. ولو ضفنا effect جديد، بيتختبر تلقائياً.
</details>

<details>
<summary>6. ليه test التدريب بيستخدم <code>tmp_path</code>؟ وليه بيشغّل <code>train.py</code> بـ subprocess؟</summary>

`tmp_path` فولدر مؤقت معزول، فالـ test مابيلمسش الداتا والموديل الحقيقيين. والـ subprocess بيشغّل السكريبت بالظبط زي ما بنشغّله من الـ terminal (arguments، حفظ، exit code)، و `check=True` بيفشّل الـ test لو السكريبت وقع.
</details>

<details>
<summary>7. ليه Test 4 و Test 6 الاتنين مهمين مع بعض؟</summary>

Test 4 بيتأكد إن الإشارة مابتتأكدش أكتر من مرة وهي ماسكة (الـ latch شغال). Test 6 بيتأكد إن الـ latch بيتفك لما ننزّل الإيد فنقدر نعيد الإشارة. لو الـ latch عمره ما بيتفك، Test 4 هينجح لوحده بس Test 6 هيفشل.
</details>

<details>
<summary>8. Test 14 بيختبر إيه، وإيه فايدة <code>pytest.raises</code>؟</summary>

بيتأكد إن `SequenceMatcher` بيرفض بـ `ValueError` أي إعداد فيه jutsu من إشارة واحدة هي أول خطوة في jutsu أطول (لأن الأطول عمره ما هيكمل). `pytest.raises(ValueError)` بيخلي الـ test ينجح بس لو الكود اللي جوه الـ `with` رمى الـ error ده فعلاً.
</details>

<details>
<summary>9. إزاي نشغّل الـ tests، وإيه النتيجة المتوقعة؟</summary>

`.venv\Scripts\python.exe -m pytest -q` من فولدر المشروع. النتيجة: `14 passed` في حوالي 20 ثانية.
</details>
