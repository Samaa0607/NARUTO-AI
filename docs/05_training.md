# 05 — التدريب والـ Classifier (`train.py` و `shinobi/classifier.py`)

[⬅ الفهرس](00_index.md)

---

## الملف ده بيعمل إيه؟

```
camera → hands → features → [ classifier ] → controller → effects → screen
                                  ▲
                        train.py بيصنع الموديل ده
```

عندنا ملفين مرتبطين ببعض:

- **`train.py`** — سكريبت بنشغّله **مرة واحدة** (أو كل ما نسجّل داتا جديدة)، مش جزء من البرنامج اللي شغال على الكاميرا. بيقرأ الـ sessions اللي سجّلناها بـ `collect_data.py`، يحوّلها لـ features، يقيّم موديلين (Random Forest و MLP) بطريقة أمينة (cross-validation مقسّم بالـ session)، يختار الأحسن، يدرّبه على كل الداتا، ويحفظه في `models/gesture_model.joblib`. كمان بيطلع تقرير وصور confusion matrix.
- **`shinobi/classifier.py`** — الجزء اللي بيشتغل **وقت التشغيل**. بيحمّل الملف اللي `train.py` حفظه، ويدّي لكل frame vector فيه احتمال كل gesture (مثلًا `idle: 0.05, rasengan: 0.88, ...`). الاحتمالات دي بتروح بعد كده للـ controller (ملف [06](06_controller.md)).

الفكرة المهمة: الموديل نفسه **مابيقررش** يشغّل effect. هو بس بيقول "أنا شايف rasengan بنسبة 88% في الـ frame ده". القرار النهائي بتاع الـ controller.

---

## الكود سطر بسطر — `train.py`

### 1) الـ docstring

```python
"""Train the gesture classifier from recorded sessions.

Run:  python train.py                    (cross-validation by session + final model)
      python train.py --test-person ali  (also report on a person never seen in training)

Splits are made by *session*, never by frame: frames of one recording are almost
identical, so mixing them between train and test would fake a high accuracy.
"""
```

- السطر الأول بيقول وظيفة الملف: يدرّب الـ classifier من الـ sessions المسجلة.
- `Run:` بيوضّح طريقتين للتشغيل: العادية (cross-validation + موديل نهائي)، والتانية بـ `--test-person` عشان نختبر على شخص الموديل ماشافوش خالص.
- آخر جملة هي أهم فكرة في الملف كله: التقسيم بيكون **بالـ session مش بالـ frame**، لأن الـ frames بتاعة تسجيل واحد شبه متطابقة، ولو خلطناها بين train و test هنطلع accuracy عالية بس "مزيفة". (هنشرحها بالتفصيل في المفاهيم تحت: **data leakage**.)

### 2) الـ imports

```python
import argparse
import json
from datetime import datetime
from pathlib import Path
```

- `argparse`: عشان نقرأ الـ options من الـ command line (`--data`, `--step`, ...).
- `json`: الـ metadata بتاعة كل session (اسم الـ gesture، الشخص، ...) متخزنة كـ JSON string جوه ملف الـ `.npz`.
- `datetime`: عشان نكتب وقت إنشاء الموديل جوه الملف المحفوظ.
- `Path`: للتعامل مع المسارات بشكل نضيف وبيشتغل على Windows و Linux.

```python
import joblib
import matplotlib
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report, confusion_matrix, f1_score
from sklearn.model_selection import StratifiedGroupKFold
from sklearn.neural_network import MLPClassifier
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
```

- `joblib`: بيحفظ ويحمّل objects بايثون (زي موديلات scikit-learn) في ملف. أسرع وأنسب من `pickle` للـ arrays الكبيرة.
- `matplotlib`: لرسم الـ confusion matrix كصورة.
- `numpy as np`: كل الداتا arrays.
- `RandomForestClassifier`: الموديل الأول (غابة من الـ decision trees).
- `classification_report, confusion_matrix, f1_score`: أدوات التقييم.
- `StratifiedGroupKFold`: طريقة التقسيم لـ folds اللي بتحترم الـ groups (الـ sessions) وبتحاول توازن الـ classes.
- `MLPClassifier`: الموديل التاني (neural network بسيطة).
- `make_pipeline`: بيربط خطوات ورا بعض (scaler ثم موديل) كأنهم موديل واحد.
- `StandardScaler`: بيعمل normalization للـ features (متوسط 0 وانحراف 1).

```python
from shinobi import config
from shinobi.features import FEATURE_VERSION, extract, mirror
```

- `config`: فيه أسماء الـ gestures والمسارات.
- `extract`: **نفس** الدالة اللي البرنامج بيستخدمها وقت التشغيل لتحويل الـ landmarks لـ features — كده مضمون إن الموديل بيشوف features محسوبة بنفس الطريقة بالظبط في التدريب وفي التشغيل.
- `mirror`: بتعمل نسخة معكوسة يمين/شمال من الـ frame (للـ augmentation).
- `FEATURE_VERSION`: رقم نسخة طريقة حساب الـ features، هنحفظه مع الموديل (هنعرف ليه بعدين).

```python
matplotlib.use("Agg")                     # save plots to file, no window
import matplotlib.pyplot as plt  # noqa: E402
```

- `matplotlib.use("Agg")`: بنقول لـ matplotlib يستخدم backend اسمه `Agg` اللي بيرسم في الذاكرة ويحفظ لملف من غير ما يفتح نافذة. لازم ده يتعمل **قبل** `import matplotlib.pyplot`، عشان كده الـ import ده جه متأخر.
- `# noqa: E402`: تعليق بيقول لأدوات الـ linting "عارفين إن الـ import مش في أول الملف، ده مقصود".

### 3) `load_sessions` — قراءة الداتا

```python
def load_sessions(data_dir, step):
    sessions = []
    for path in sorted(Path(data_dir).glob("*/*.npz")):
        d = np.load(path)
        meta = json.loads(str(d["meta"]))
```

- `data_dir` هو فولدر `data/landmarks`، وجواه فولدر لكل gesture، وجوه كل واحد ملفات `.npz` (ملف لكل session).
- `glob("*/*.npz")`: كل ملفات `.npz` في أي فولدر فرعي. `sorted` عشان الترتيب يبقى ثابت كل مرة (reproducibility).
- `np.load(path)`: بيفتح الملف المضغوط اللي فيه arrays متسمية.
- `d["meta"]`: الـ metadata متخزنة كـ string جوه array؛ `str(...)` بيطلعها نص، و `json.loads` بيحولها dict فيه `label`, `session`, `person`, `lighting`, `aspect`.

```python
        if meta["label"] not in config.GESTURES:
            print(f"skip {path.name}: unknown label {meta['label']}")
            continue
```

- لو الـ session متسجلة لـ gesture مش موجود دلوقتي في `config.GESTURES` (مثلًا شلناه من الليستة)، بنتجاهلها ونطبع تحذير بدل ما البرنامج يقع.

```python
        keep = d["present"].any(axis=1)                 # frames where at least one hand was found
        idx = np.flatnonzero(keep)[::step]              # every `step`-th frame: neighbours are near-duplicates
```

- `d["present"]` شكلها `(عدد الـ frames, 2)`: لكل frame، هل الإيد في slot 0 موجودة؟ وفي slot 1؟
- `.any(axis=1)`: `True` لو فيه إيد واحدة على الأقل. الـ frames اللي مافيهاش أي إيد بنرميها، لأن features بتاعتها كلها أصفار ومافيهاش معلومة. (ووقت التشغيل، لو مافيش إيد أصلًا، الـ controller بيعتبرها `idle` من غير ما يسأل الموديل.)
- `np.flatnonzero(keep)`: أرقام الـ frames اللي فيها إيد.
- `[::step]`: ناخد frame كل `step` frames. ليه؟ الكاميرا بتصور 30 frame في الثانية، فكل frame تقريبًا نسخة من اللي قبله. الـ frames المتجاورة مش بتزوّد معلومة جديدة، بس بتبطّأ التدريب.

```python
        sessions.append({**meta, "image_lm": d["image_lm"][idx], "world_lm": d["world_lm"][idx],
                         "present": d["present"][idx]})
    return sessions
```

- بنعمل dict لكل session: `**meta` بيفرد كل مفاتيح الـ metadata، وبنضيف الـ arrays بعد ما ناخد بس الـ frames المختارة `[idx]`.
- `image_lm`: إحداثيات الـ 21 نقطة في الصورة (0..1)، و `world_lm`: إحداثيات 3D بالمتر. الاتنين شكلهم `(frames, 2, 21, 3)`.
- بنرجّع list of sessions — ولاحظ إننا **لسه شايلين الـ session كوحدة واحدة**، وده مهم للتقسيم بعدين.

### 4) `build` — تحويل الداتا لـ features + الـ augmentation

```python
def build(sessions, rng):
    """Features for original, mirrored and jittered copies of every frame."""
    X, X_mirror, X_jitter, y, groups, persons = [], [], [], [], [], []
```

- `rng`: random number generator متثبت بـ seed، عشان الـ noise يطلع نفسه كل مرة.
- بنجهّز 6 ليستات:
  - `X`: features الـ frame الأصلي.
  - `X_mirror`: features النسخة المعكوسة.
  - `X_jitter`: features نسخة عليها noise صغير.
  - `y`: رقم الـ label.
  - `groups`: اسم الـ session (عشان التقسيم).
  - `persons`: اسم الشخص (عشان `--test-person`).
- مهم: الـ 3 نسخ **متخزنين في arrays منفصلة بنفس الترتيب**، مش متلزقين في array واحد. ده عشان نقدر بعدين نضيف الـ augmentation للـ training fold بس (هنشرح ليه).

```python
    for s in sessions:
        label = config.GESTURES.index(s["label"])
        for img, wld, pres in zip(s["image_lm"], s["world_lm"], s["present"]):
            X.append(extract(img, wld, pres, s["aspect"]))
```

- `config.GESTURES.index(...)`: بنحوّل الاسم لرقم (`idle`→0, `clone_seal`→1, ...). الموديلات بتتعامل مع أرقام.
- `zip(...)`: بنلف على الـ frames، frame frame، وناخد الـ 3 arrays بتوعه مع بعض.
- `extract(...)`: بيحوّل الـ frame لـ vector فيه 206 رقم. `s["aspect"]` (عرض/طول الصورة) محتاجينه عشان features المسافة بين الإيدين تتحسب بنسب حقيقية.

```python
            X_mirror.append(extract(*mirror(img, wld, pres), s["aspect"]))
```

- `mirror(...)` بيرجّع tuple فيها `(image_lm, world_lm, present)` معكوسين يمين/شمال، و `*` بيفردهم كـ arguments لـ `extract`.
- الفايدة: لو سجّلنا الـ gesture بالإيد اليمين بس، النسخة المعكوسة بتعلّم الموديل شكلها بالإيد الشمال. كأننا ضاعفنا الداتا ببلاش.

```python
            noise_img = rng.normal(0, 0.004, img.shape) * pres[:, None, None]
            noise_wld = rng.normal(0, 0.002, wld.shape) * pres[:, None, None]
            X_jitter.append(extract(img + noise_img, wld + noise_wld, pres, s["aspect"]))
```

- `rng.normal(0, 0.004, img.shape)`: noise عشوائي (Gaussian) متوسطه 0 وانحرافه 0.004 — يعني حوالي 0.4% من عرض الصورة. صغير جدًا، زي الرعشة الطبيعية في MediaPipe.
- للـ world coordinates الـ noise 0.002 متر = 2 ملّي.
- `* pres[:, None, None]`: `pres` شكله `(2,)`، و `[:, None, None]` بيخليه `(2, 1, 1)` عشان يتضرب في `(2, 21, 3)` (broadcasting). النتيجة: الإيد اللي مش موجودة (`pres=0`) الـ noise بتاعها بيبقى صفر، فتفضل أصفار زي ما هي. لو ماعملناش كده، الإيد الغايبة هتبقى أرقام عشوائية والموديل يتلخبط.
- الفايدة: الموديل يتعلم إن الرعشات الصغيرة مش بتغيّر الـ gesture → يبقى أكثر ثباتًا (robust) وقت التشغيل.

```python
            y.append(label)
            groups.append(s["session"])
            persons.append(s["person"])
```

- لكل frame بنسجّل: الـ label بتاعه، اسم الـ session اللي جه منها، واسم الشخص. الـ 3 نسخ (أصلي/معكوس/jitter) بيشتركوا في نفس الـ index، فمش محتاجين نكرر دول.

```python
    return (np.array(X), np.array(X_mirror), np.array(X_jitter), np.array(y),
            np.array(groups), np.array(persons))
```

- بنحوّل كل الليستات لـ NumPy arrays. `X` بقى شكله `(عدد الـ frames, 206)`.

### 5) `make_models` — الموديلين المرشحين

```python
def make_models():
    return {
        "random_forest": RandomForestClassifier(n_estimators=300, min_samples_leaf=2,
                                                class_weight="balanced", n_jobs=-1, random_state=0),
```

- الدالة بترجّع dict فيه موديلات **جديدة** كل مرة تتنده (مش متدربة). ده مهم: بنحتاج موديل "نضيف" للتدريب النهائي.
- `n_estimators=300`: 300 شجرة قرار. أكتر = أثبت، بس أبطأ. 300 رقم معقول.
- `min_samples_leaf=2`: كل ورقة في الشجرة لازم يكون فيها عينتين على الأقل. بيمنع الشجرة إنها تحفظ كل frame لوحده (يقلل الـ overfitting).
- `class_weight="balanced"`: لو gesture عنده frames أقل من التاني، بياخد وزن أكبر في التدريب، عشان الموديل مايتحيزش للـ class الكبير (غالبًا `idle`).
- `n_jobs=-1`: استخدم كل أنوية الـ CPU (الشجر بيتدرب بالتوازي).
- `random_state=0`: النتيجة تطلع نفسها كل مرة.

```python
        "mlp": make_pipeline(StandardScaler(),
                             MLPClassifier(hidden_layer_sizes=(128, 64), alpha=1e-3, max_iter=400,
                                           early_stopping=True, random_state=0)),
    }
```

- `make_pipeline(StandardScaler(), MLPClassifier(...))`: موديل مركّب. لما نعمل `fit`، الـ scaler بيتعلم المتوسط والانحراف من داتا التدريب ويطبّقهم، وبعدين الـ MLP يتدرب. ولما نعمل `predict`، نفس التحويل بيتطبّق أوتوماتيك. (ليه scaler؟ تحت في المفاهيم.)
- `hidden_layer_sizes=(128, 64)`: طبقتين مخفيتين، الأولى 128 neuron والتانية 64. الـ input 206 والـ output عدد الـ gestures.
- `alpha=1e-3`: قوة الـ L2 regularization (عقاب على الأوزان الكبيرة) — **مش** نفس `alpha` بتاعة الـ smoothing في الـ controller، مجرد تشابه أسماء.
- `max_iter=400`: أقصى عدد epochs.
- `early_stopping=True`: الـ MLP بياخد 10% من داتا التدريب كـ validation، ولو الـ score عليها مااتحسنش لفترة، بيوقف التدريب. بيمنع الـ overfitting ويوفر وقت.
- `random_state=0`: الأوزان الابتدائية ثابتة → نتايج قابلة للتكرار.

### 6) `augmented` — بناء training set مع الـ augmentation

```python
def augmented(idx, X, X_mirror, X_jitter, y):
    """Training set = originals + mirrored + jittered copies of the same frames."""
    return np.vstack([X[idx], X_mirror[idx], X_jitter[idx]]), np.concatenate([y[idx]] * 3)
```

- `idx`: أرقام الـ frames المسموح نتدرب عليها (الـ training fold).
- `np.vstack([...])`: بيرص الـ 3 نسخ فوق بعض، فلو `idx` فيه 1000 frame، الناتج 3000 صف.
- `np.concatenate([y[idx]] * 3)`: الـ labels متكررة 3 مرات بنفس الترتيب (المعكوس والـ jitter ليهم نفس label الأصلي).
- النقطة الجوهرية: الدالة دي **بتتنده على الـ training indices بس**، فالنسخ المعدّلة عمرها ما بتدخل الـ test.

### 7) `save_confusion` — رسم الـ confusion matrix

```python
def save_confusion(cm, names, title, path):
    fig, ax = plt.subplots(figsize=(6, 5))
    ax.imshow(cm, cmap="Blues")
```

- `cm`: الـ matrix (صفوف = الحقيقة، أعمدة = توقع الموديل). `names`: أسماء الـ gestures.
- `plt.subplots(figsize=(6, 5))`: figure بمقاس 6×5 بوصة.
- `imshow(cm, cmap="Blues")`: بيرسم الـ matrix كصورة، كل خانة لونها أغمق كل ما الرقم أكبر.

```python
    ax.set_xticks(range(len(names)), names, rotation=45, ha="right")
    ax.set_yticks(range(len(names)), names)
```

- بنكتب أسماء الـ gestures على المحورين. محور x مايل 45 درجة عشان الأسماء الطويلة ماتدخلش في بعض.

```python
    for i in range(len(names)):
        for j in range(len(names)):
            ax.text(j, i, cm[i, j], ha="center", va="center",
                    color="white" if cm[i, j] > cm.max() / 2 else "black")
```

- بنكتب الرقم جوه كل خانة. `ax.text(j, i, ...)`: x = العمود j، y = الصف i.
- لون الكتابة أبيض لو الخانة غامقة (الرقم أكبر من نص أكبر رقم)، وأسود لو فاتحة — عشان يتقرا.

```python
    ax.set_xlabel("predicted")
    ax.set_ylabel("true")
    ax.set_title(title)
    fig.tight_layout()
    fig.savefig(path, dpi=120)
    plt.close(fig)
```

- عناوين المحاور: الأفقي "predicted" والرأسي "true".
- `tight_layout()`: يظبط المسافات عشان مافيش حاجة تتقص.
- `savefig(path, dpi=120)`: يحفظ الصورة PNG.
- `plt.close(fig)`: يقفل الـ figure ويحرر الذاكرة (مهم لأننا بنرسم أكتر من واحدة).

### 8) `main` — الـ argparse options

```python
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", default=str(config.LANDMARKS_DIR))
    parser.add_argument("--out", default=str(config.GESTURE_MODEL_PATH))
```

- `--data`: فين الداتا. الافتراضي `data/landmarks`.
- `--out`: فين نحفظ الموديل. الافتراضي `models/gesture_model.joblib` — نفس المسار اللي `classifier.py` بيقرا منه، فمش محتاجين نغيّر حاجة.

```python
    parser.add_argument("--step", type=int, default=2, help="use every n-th frame")
    parser.add_argument("--test-person", default=None, help="hold this person out as the final test")
    args = parser.parse_args()
```

- `--step`: ناخد frame كل كام frame (الافتراضي 2 = نص الـ frames). `type=int` عشان يتحول لرقم.
- `--test-person`: اسم شخص نشيله **بالكامل** من التدريب والـ cross-validation ونختبر عليه في الآخر. الافتراضي `None` = مافيش.
- `parse_args()`: بيقرا الـ command line فعلًا. لاحظ إن `--test-person` بتبقى `args.test_person` (الشرطة بتتحول underscore).

```python
    rng = np.random.default_rng(0)
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
```

- `default_rng(0)`: random generator بـ seed ثابت → الـ jitter نفسه كل تشغيل.
- `out_path.parent.mkdir(...)`: يعمل فولدر `models/` لو مش موجود. `exist_ok=True` = مايعملش error لو موجود.

### 9) تحميل وبناء الداتا

```python
    sessions = load_sessions(args.data, args.step)
    if not sessions:
        raise SystemExit(f"No sessions found in {args.data}. Record data with collect_data.py first.")
    X, X_mirror, X_jitter, y, groups, persons = build(sessions, rng)
```

- بنحمّل الـ sessions. لو مافيش ولا واحدة، `SystemExit` بيقفل البرنامج برسالة واضحة بتقول نسجّل الأول (أحسن من error غامض).
- `build` بيرجّع كل الـ arrays.

```python
    present_labels = sorted(set(y))
    names = [config.GESTURES[i] for i in present_labels]
```

- `present_labels`: أرقام الـ gestures اللي **فعلًا** ليها داتا (ممكن ماسجلناش `chidori` مثلًا). `sorted` عشان الترتيب ثابت.
- `names`: أساميهم بنفس الترتيب، للتقارير والرسم.

```python
    if config.GESTURES.index("idle") not in present_labels:
        raise SystemExit("You must record the 'idle' gesture: it teaches the model what NOT to react to.")
```

- **`idle` إجباري.** لو ماسجّلناش `idle`، الموديل هيتعلم بس الـ gestures، وأي حركة إيد عادية (هرش، تلويح) هيضطر يصنّفها كواحد منهم → effects بتشتغل لوحدها. شرح أكتر تحت.

```python
    print(f"{len(sessions)} sessions, {len(y)} frames, {X.shape[1]} features")
    for i in present_labels:
        n_sess = len(set(groups[y == i]))
        print(f"  {config.GESTURES[i]:12s} {np.sum(y == i):6d} frames  {n_sess} sessions")
```

- ملخص للداتا: عدد الـ sessions والـ frames والـ features (المفروض 206).
- لكل gesture: `groups[y == i]` = أسماء الـ sessions بتاعة الـ frames اللي الـ label بتاعها `i`، و `set` بيشيل التكرار → عدد الـ sessions. `np.sum(y == i)` = عدد الـ frames.
- `:12s` و `:6d`: تنسيق عشان الأعمدة تبقى متساوية.
- فايدته: نشوف بسرعة لو فيه gesture داتا بتاعته قليلة.

### 10) الشخص المحجوز للاختبار

```python
    # Optional: completely unseen person = the most honest test.
    test_mask = persons == args.test_person if args.test_person else np.zeros(len(y), bool)
```

- لو فيه `--test-person`، `test_mask` بيبقى `True` لكل frame بتاع الشخص ده (`persons == ...` بيقارن كل عنصر في الـ array بالاسم). لو مافيش، array كله `False`.
- التعليق بيقول: شخص الموديل ماشافوش خالص = أصدق اختبار (إيد مختلفة، طريقة مختلفة، كاميرا يمكن مختلفة).

```python
    if args.test_person and not test_mask.any():
        print(f"WARNING: no sessions from person '{args.test_person}' - held-out test skipped. "
              f"Known people: {sorted(set(persons))}")
```

- لو كتبنا `--test-person` بس الاسم مش موجود في الداتا (مثلًا غلطة إملائية: `alli` بدل `ali`)، `test_mask` هيبقى كله `False`، والاختبار المحجوز مش هيتعمل.
- بدل ما ده يحصل في صمت ونفتكر إننا اختبرنا على شخص جديد، بنطبع **تحذير** واضح فيه أسماء الأشخاص الموجودين فعلًا (`sorted(set(persons))` = الأسماء من غير تكرار ومترتبة)، عشان نعرف الاسم الصح.
- ده تحذير مش error: التدريب بيكمّل عادي على كل الداتا.

```python
    dev = np.flatnonzero(~test_mask)
```

- `~test_mask`: عكس الـ mask (كل frame مش بتاع الشخص المحجوز).
- `dev` ("development set"): أرقام كل الـ frames **ماعدا** الشخص المحجوز. كل الـ cross-validation والتدريب النهائي بيحصلوا على `dev` بس.

```python
    min_sessions = min(len(set(groups[dev][y[dev] == i])) for i in present_labels)
    if min_sessions < 2:
        raise SystemExit("Need at least 2 sessions per gesture for a fair (session-split) evaluation.")
    cv = StratifiedGroupKFold(n_splits=min(5, min_sessions), shuffle=True, random_state=0)
```

- `min_sessions`: أقل عدد sessions عند أي gesture (جوه `dev`).
- لو أي gesture عنده session واحدة بس، مستحيل نختبره على session ماشافهاش → بنوقف.
- `n_splits=min(5, min_sessions)`: عدد الـ folds = 5، إلا لو أقل gesture عنده sessions أقل من 5. ليه؟ عشان كل gesture يقدر يظهر في الـ test بتاع كل fold بـ session مختلفة.
- `shuffle=True, random_state=0`: توزيع الـ sessions على الـ folds عشوائي بس ثابت.

### 11) الـ cross-validation لكل موديل

```python
    report_lines, results = [], {}
    for name, model in make_models().items():
        oof = np.zeros(len(dev), dtype=int)               # out-of-fold predictions
```

- `report_lines`: نصوص التقرير اللي هتتحفظ في ملف. `results`: macro-F1 لكل موديل.
- بنلف على الموديلين.
- `oof`: array فاضي بطول `dev` هنملاه بتوقعات الموديل. "out-of-fold" = كل frame هيتوقّع بموديل **ماشافهوش** في التدريب.

```python
        for tr, te in cv.split(X[dev], y[dev], groups[dev]):
            Xa, ya = augmented(dev[tr], X, X_mirror, X_jitter, y)
            model.fit(Xa, ya)
            oof[te] = model.predict(X[dev[te]])
```

- `cv.split(...)`: بيدّينا في كل لفة `tr` (indices التدريب) و `te` (indices الاختبار) — بشرط إن **كل session كاملة يا في tr يا في te**. الـ indices دي **جوه `dev`**، عشان كده بنعمل `dev[tr]` عشان نرجع للـ indices الحقيقية في `X`.
- `augmented(dev[tr], ...)`: training set = الأصلي + المعكوس + الـ jitter، **للـ training fold بس**.
- `model.fit(Xa, ya)`: تدريب من الأول (الـ `fit` بيمسح أي تدريب قديم).
- `oof[te] = model.predict(X[dev[te]])`: التوقع على frames الـ test **الأصلية بس** (من غير augmentation) — لأن ده اللي هيحصل في الحقيقة.
- بعد ما الـ folds تخلص، كل frame في `dev` بقى ليه توقع واحد جه من موديل ماشافش الـ session بتاعته.

```python
        f1 = f1_score(y[dev], oof, labels=present_labels, average="macro", zero_division=0)
        results[name] = f1
```

- بنقارن الحقيقة `y[dev]` بالتوقعات `oof` ونحسب **macro-F1** (متوسط F1 لكل الـ classes بالتساوي). ده الرقم اللي هنختار بيه الموديل الأحسن.
- `labels=present_labels`: المتوسط يتحسب على **نفس** الـ gestures اللي في التقرير والـ confusion matrix بالظبط، فكل الأرقام متسقة مع بعض.
- `zero_division=0`: لو gesture عمر الموديل ما توقّعه، الـ precision بتاعه = 0/0. بدل warning، بنعتبره 0 (وده عادل: الموديل فشل فيه فعلًا).

```python
        report = classification_report(y[dev], oof, labels=present_labels, target_names=names, digits=3,
                                       zero_division=0)
        cm = confusion_matrix(y[dev], oof, labels=present_labels)
```

- `classification_report`: جدول فيه precision و recall و F1 و support لكل gesture. `labels=present_labels` و `target_names=names` عشان الأسماء تظهر بدل الأرقام. `digits=3`: 3 أرقام عشرية. `zero_division=0`: نفس السبب اللي فوق (من غير warnings).
- `confusion_matrix`: الـ matrix بنفس ترتيب `present_labels`.

```python
        save_confusion(cm, names, f"{name} (session CV, macro-F1 {f1:.3f})",
                       out_path.parent / f"confusion_{name}.png")
```

- بنحفظ صورة لكل موديل: `models/confusion_random_forest.png` و `models/confusion_mlp.png`، والعنوان فيه الـ macro-F1.

```python
        block = f"=== {name}: macro-F1 {f1:.3f} (cross-validation by session)\n{report}\n{cm}\n"
        print(block)
        report_lines.append(block)
```

- بنجمع التقرير في نص واحد، نطبعه، ونضيفه للتقرير اللي هيتحفظ.

### 12) اختيار الأحسن وتدريبه على كل الداتا

```python
    best = max(results, key=results.get)
    print(f"best model: {best}")
    model = make_models()[best]
    Xa, ya = augmented(dev, X, X_mirror, X_jitter, y)
    model.fit(Xa, ya)
```

- `max(results, key=results.get)`: اسم الموديل اللي عنده أعلى macro-F1.
- `make_models()[best]`: نسخة **جديدة** من الموديل ده.
- `augmented(dev, ...)`: كل الـ `dev` (كل الداتا ماعدا الشخص المحجوز) + نسخها المعدّلة.
- `model.fit(...)`: ده الموديل النهائي اللي هيتحفظ. (ليه نعيد التدريب؟ تحت في المفاهيم.)

### 13) اختبار الشخص المحجوز

```python
    if test_mask.any():
        pred = model.predict(X[test_mask])
        f1 = f1_score(y[test_mask], pred, labels=present_labels, average="macro", zero_division=0)
```

- لو فيه شخص محجوز، الموديل النهائي (اللي ماشافهوش) بيتوقع على كل الـ frames بتاعته، ونحسب macro-F1.
- `labels=present_labels` و `zero_division=0`: نفس طريقة حساب الـ CV بالظبط، عشان الرقمين يتقارنوا ببعض بشكل عادل.

```python
        block = (f"=== held-out person '{args.test_person}': macro-F1 {f1:.3f}\n"
                 + classification_report(y[test_mask], pred, labels=present_labels,
                                         target_names=names, digits=3, zero_division=0))
        print(block)
        report_lines.append(block)
```

- نفس شكل التقرير. `zero_division=0`: لو gesture ماتوقعش ولا مرة (فالـ precision قسمة على صفر)، نحط 0 بدل warning. ده محتمل هنا لأن الشخص ده ممكن مايكونش سجّل كل الـ gestures.

### 14) الحفظ

```python
    labels = [config.GESTURES[c] for c in model.classes_]
```

- `model.classes_`: الـ classes اللي الموديل اتعلمها **بالترتيب اللي بيطلع بيه الاحتمالات** في `predict_proba` (scikit-learn بيرتّبهم تصاعديًا). لو ماسجلناش `chidori` (رقم 3)، هتبقى `[0, 1, 2, 4]`، فالعمود رقم 3 في الـ output هو `fire` مش `chidori`! عشان كده بنحفظ الأسماء بالترتيب ده بالظبط.

```python
    joblib.dump({"model": model, "model_name": best, "labels": labels,
                 "feature_version": FEATURE_VERSION, "cv_macro_f1": results,
                 "created": datetime.now().isoformat(timespec="seconds")}, out_path)
```

- بنحفظ **bundle** (dict) مش الموديل لوحده:
  - `model`: الموديل المتدرب (لو MLP، الـ pipeline كله بالـ scaler).
  - `model_name`: `"random_forest"` أو `"mlp"` — للعرض.
  - `labels`: أسماء الـ outputs بالترتيب.
  - `feature_version`: نسخة الـ features اللي اتدرب عليها.
  - `cv_macro_f1`: نتايج الموديلين — للتوثيق.
  - `created`: وقت الإنشاء، مثلًا `2026-10-30T14:05:12`.

```python
    (out_path.parent / "training_report.txt").write_text("\n".join(report_lines), encoding="utf-8")
    print(f"saved {out_path}")
```

- بنحفظ التقرير النصي في `models/training_report.txt`. `encoding="utf-8"` عشان مايحصلش مشاكل encoding على Windows.

```python
if __name__ == "__main__":
    main()
```

- `main()` تشتغل بس لو شغّلنا الملف مباشرة (`python train.py`)، مش لو حد عمله import.

---

## الكود سطر بسطر — `shinobi/classifier.py`

```python
"""Loads the trained gesture model and turns a feature vector into probabilities."""

import joblib
import numpy as np

from shinobi import config
from shinobi.features import FEATURE_VERSION
```

- الـ docstring: وظيفته تحميل الموديل وتحويل feature vector لاحتمالات.
- `joblib`: لتحميل الـ bundle. `numpy`: للـ reshape والـ dtype.
- `config`: فيه المسار الافتراضي. `FEATURE_VERSION`: نسخة الـ features في الكود **الحالي**، عشان نقارنها بالمحفوظة.

```python
class GestureClassifier:
    def __init__(self, path=config.GESTURE_MODEL_PATH):
        bundle = joblib.load(path)
```

- الـ constructor بياخد مسار الموديل (الافتراضي `models/gesture_model.joblib`).
- `joblib.load(path)`: بيرجّع الـ dict اللي `train.py` حفظه بالظبط.

```python
        if bundle["feature_version"] != FEATURE_VERSION:
            raise RuntimeError(
                f"Model was trained with feature version {bundle['feature_version']}, "
                f"code uses {FEATURE_VERSION}. Re-run train.py."
            )
```

- **version check**: لو حد غيّر طريقة حساب الـ features في `features.py` (وزوّد `FEATURE_VERSION`) من غير ما يعيد التدريب، الموديل القديم هيستقبل أرقام معناها اختلف — وهيدّي توقعات غلط **من غير أي error** (أو يقع بسبب عدد features مختلف). بدل كده، بنوقف من الأول برسالة واضحة: "أعيد تشغيل train.py".

```python
        self.model = bundle["model"]
        self.labels = bundle["labels"]          # label names in the model's output order
        self.name = bundle.get("model_name", "?")
```

- بنطلّع الموديل والأسماء.
- `self.labels`: ترتيب الأسماء هو ترتيب أعمدة `predict_proba`. الـ controller بياخد الليستة دي (`ActionController(classifier.labels)`) عشان يعرف كل عمود يعني إيه.
- `bundle.get("model_name", "?")`: لو الملف قديم ومافيهوش الاسم، نستخدم `"?"` بدل ما نقع.

```python
    def predict(self, features):
        """Return a probability array aligned with self.labels."""
        return self.model.predict_proba(features.reshape(1, -1))[0].astype(np.float32)
```

- `features`: vector واحد شكله `(206,)`.
- `.reshape(1, -1)`: scikit-learn مستني **matrix** (عينات × features)، فبنحوله لـ `(1, 206)` = عينة واحدة. `-1` معناها "احسب الطول لوحدك".
- `predict_proba(...)`: بيرجّع `(1, عدد الـ classes)` — احتمال كل class، والمجموع = 1.
- `[0]`: ناخد الصف الوحيد → `(عدد الـ classes,)`.
- `.astype(np.float32)`: نوع أصغر ومتوافق مع باقي الكود (الـ controller بيستخدم float32).
- استخدمنا `predict_proba` مش `predict` لأن الـ controller محتاج **درجة الثقة**، مش بس الاسم.

```python
    @staticmethod
    def exists(path=config.GESTURE_MODEL_PATH):
        return path.exists()
```

- `@staticmethod`: دالة مش محتاجة object، بنناديها `GestureClassifier.exists()`.
- بترجّع هل ملف الموديل موجود. `main.py` بيستخدمها: لو مافيش موديل، البرنامج يشتغل من غير recognition (والـ effects تشتغل بالكيبورد) بدل ما يقع.

---

## مفاهيم مهمة

### 1) Data leakage وليه بنقسّم بالـ session

**Data leakage** = معلومة من الـ test "تسرّبت" للتدريب، فالتقييم يطلع أحسن من الحقيقة.

في مشروعنا: session واحدة = 20 ثانية × 30 fps = 600 frame لنفس الشخص بنفس الإضاءة بنفس الوضع. الـ frame رقم 100 والـ frame رقم 101 تقريبًا **نفس الصورة**. لو قسّمنا الـ frames عشوائيًا (80% train، 20% test):

```
session A:  f1 f2 f3 f4 f5 f6 f7 f8 ...
            tr te tr tr te tr tr te
```

الموديل هيتدرب على `f1` و `f3` ويتختبر على `f2` اللي بينهم — ده مش اختبار، ده تذكّر. هنشوف accuracy 99% وفي الحقيقة على session جديدة ممكن تبقى 70%.

الحل: الـ session كلها تروح ناحية واحدة:

```
fold 1:  train = sessions {A, B, D, E}   test = sessions {C, F}
fold 2:  train = sessions {C, F, D, E}   test = sessions {A, B}
...
```

كده الـ test دايمًا تسجيل **جديد** الموديل ماشافهوش، زي اللي هيحصل وقت التشغيل.

### 2) `StratifiedGroupKFold`

بيجمع حاجتين:
- **Group**: الـ session الواحدة ماتتقسمش بين train و test (`groups` = اسم الـ session).
- **Stratified**: يحاول نسبة كل gesture في كل fold تبقى قريبة من النسبة الكلية، عشان مايطلعش fold الـ test بتاعه مافيهوش `fire` خالص.
- **KFold**: الداتا بتتقسم K أجزاء؛ كل جزء بياخد دوره مرة واحدة كـ test.

### 3) Out-of-fold predictions

بدل ما نحسب score لكل fold ونعمل متوسط، بنجمّع التوقعات في `oof`. في الآخر كل frame ليه توقع واحد "أمين" (من موديل ماشافهوش). ميزته: نقدر نطلع **confusion matrix واحدة** و classification report واحد لكل الداتا، وده أوضح من متوسط 5 أرقام.

### 4) الـ augmentation جوه الـ training fold بس

عندنا نوعين:
- **Mirror**: نعكس يمين/شمال → الموديل يتعلم الإيدين.
- **Jitter**: noise صغير → الموديل مايتأثرش برعشة MediaPipe.

ليه **مانعملش** augmentation قبل التقسيم (يعني نعمل data أكبر 3 مرات وبعدين نقسّم)؟ لأن النسخة المعكوسة والـ jitter من frame معيّن هي تقريبًا نفس الـ frame. لو الأصلي في train ونسخته الـ jitter في test → leakage تاني بالظبط زي مشكلة الـ frames المتجاورة. عشان كده:
- الـ 3 نسخ متخزنين **منفصلين** بنفس الـ index.
- التقسيم بيتعمل على الـ indices.
- `augmented(dev[tr], ...)` بيضيف النسخ للـ train بس.
- الـ test دايمًا `X[dev[te]]` (الأصلي بس).

### 5) Random Forest مقابل MLP

**Random Forest** (بالبديهة): 300 شجرة قرار. كل شجرة بتسأل أسئلة زي "هل زاوية السبابة > 0.8؟ لو آه، هل المسافة بين الإبهام والسبابة < 0.3؟ ..." لحد ما توصل لإجابة. كل شجرة اتدربت على عينة عشوائية من الداتا ومجموعة عشوائية من الـ features، فكل واحدة بتغلط بطريقة مختلفة. في الآخر **بيصوّتوا**، ونسبة الأصوات = الاحتمال. مميزاته: مش محتاج scaling، صعب يعمل overfitting، سريع.

**MLP** (Multi-Layer Perceptron): شبكة عصبية. الـ 206 رقم بيدخلوا، كل neuron بياخد مجموع موزون ليهم + activation (ReLU)، وده بيتكرر في طبقتين (128 ثم 64)، والآخر softmax بيدّي احتمالات. الأوزان بتتعلم بالـ gradient descent. ممكن يتعلم علاقات أنعم وأعقد من الشجر، بس حساس للـ scaling والـ hyperparameters.

**ليه `StandardScaler` قبل الـ MLP؟** الـ features عندنا مقاييس مختلفة (flag 0/1، إحداثيات نسبية ممكن توصل 2، زوايا 0..1). الـ gradient descent بيتلخبط لو feature أرقامه كبيرة وفيه feature أرقامه صغيرة: الأوزان بتتحرك بسرعات مختلفة والتدريب يبطّأ أو مايستقرش. الـ scaler بيخلي كل feature متوسطه 0 وانحرافه 1. الشجر مش محتاجه لأن السؤال "هل x > 0.8؟" مش بيفرق معاه المقياس.

وحطّينا الـ scaler **جوه الـ pipeline** عشان يتعلم المتوسط والانحراف من الـ training fold بس كل مرة (لو اتعلمهم من كل الداتا ده leakage صغير)، وعشان يتحفظ مع الموديل ويتطبّق أوتوماتيك وقت التشغيل.

**`early_stopping`**: بيقتطع 10% من داتا التدريب كـ validation، ولو الـ score عليها مااتحسنش 10 epochs ورا بعض، بيوقف. كده مابيكملش يحفظ داتا التدريب (overfitting).

**`class_weight="balanced"`** (في الـ RF): وزن كل class = عكس عدد عيناته. لو `idle` عنده 3000 frame و `fire` 1000، غلطة في `fire` "تتحسب" أكتر، فالموديل مايهملش الـ class الصغير. (الـ `MLPClassifier` في scikit-learn مابيدعمش `class_weight`، عشان كده مش موجود عنده.)

### 6) Accuracy مقابل macro-F1 و Precision/Recall

- **Accuracy** = عدد الصح / الكل. المشكلة: لو 60% من الداتا `idle`، موديل بيقول `idle` على طول ياخد 60% وهو فاشل تمامًا.
- **Precision** لـ gesture معين = من كل المرات اللي الموديل قال فيها "rasengan"، كام مرة كان صح؟ (precision واطية = effects بتشتغل بالغلط).
- **Recall** = من كل الـ rasengan الحقيقية، كام واحدة الموديل لقاها؟ (recall واطي = نعمل الحركة ومايحصلش حاجة).
- **F1** = الوسط التوافقي `2·P·R / (P + R)` — بيبقى عالي بس لو الاتنين عاليين.
- **macro-F1** = متوسط F1 لكل الـ gestures **بالتساوي**، من غير ما ننظر لعدد العينات. فلو الموديل فاشل في gesture واحد، الرقم ده هيبيّن ده بوضوح. عشان كده بنختار بيه.

### 7) إزاي نقرا الـ confusion matrix

الصفوف = الحقيقة (`true`)، الأعمدة = توقع الموديل (`predicted`). مثال:

```
                predicted
              idle  clone  rasen  chid  fire
true  idle     950     5     20     10    15
      clone      8   480      0      2    10
      rasen     30     0    410     60     0
      chid      12     0     45    440     3
      fire      40     6      0      0   354
```

- **القطر** (950، 480، 410، ...) = التوقعات الصح. كل ما القطر أغمق والباقي فاتح، أحسن.
- الصف `rasen`: 60 frame من rasengan الموديل قال عليهم chidori → الاتنين بيتلخبطوا (منطقي: الاتنين إيد واحدة مفتوحة، الفرق في انحناء الصوابع). ده بيقول محتاجين داتا أكتر أو features أوضح للفرق ده.
- العمود `idle`: 40 frame من `fire` اتقال عليهم `idle` → ده "أمان" نسبيًا (أسوأ حاجة إن الـ effect مايشتغلش).
- الصف `idle`: أي رقم برا القطر = effect ممكن يشتغل بالغلط. دي أخطر الأخطاء في مشروعنا.
- **Recall** لـ rasengan = 410 / مجموع الصف. **Precision** لـ rasengan = 410 / مجموع العمود.

### 8) ليه بنعيد التدريب على كل الداتا في الآخر؟

الـ cross-validation هدفه **نقيس** ونختار، مش نطلع الموديل النهائي. كل موديل في الـ CV اتدرب على جزء بس (مثلًا 80%). بعد ما عرفنا مين أحسن، بندرّب نسخة جديدة على **كل** الـ `dev` — داتا أكتر = موديل أحسن غالبًا. والـ macro-F1 من الـ CV بيبقى تقدير (متحفظ شوية) لأداء الموديل النهائي ده.

### 9) اختبار الشخص المحجوز (`--test-person`)

الـ session-split بيختبر على تسجيل جديد، بس غالبًا لنفس الشخص اللي في الـ train. الإيد المختلفة (حجم، طريقة عمل الإشارة) تحدي أصعب. `--test-person ali` بيشيل كل sessions بتاعة `ali` من **كل حاجة** (الـ CV والتدريب النهائي)، ويختبر عليها في الآخر بس. الرقم ده هو أقرب حاجة لـ "إيه اللي هيحصل لو حد جديد جرّب البرنامج".

### 10) محتويات الـ bundle وليه

| المفتاح | ليه موجود |
|---|---|
| `model` | الموديل نفسه (بالـ scaler لو MLP) |
| `labels` | ترتيب أعمدة `predict_proba` بالأسماء. من غيره، لو gesture مش مسجّل، الأعمدة هتتزحلق وكل الأسماء تبقى غلط |
| `feature_version` | يمنع استخدام موديل قديم مع features اتغيرت طريقتها |
| `model_name` | نعرض نوع الموديل في الـ HUD/الـ console |
| `cv_macro_f1` | توثيق: الموديل ده كان أداؤه قد إيه |
| `created` | نعرف الموديل ده اتدرب امتى |

### 11) `--step` والـ subsampling

الـ frames المتجاورة شبه متطابقة، فأخد frame كل 2 بيقلل وقت التدريب للنص تقريبًا وتقريبًا مابيخسرش معلومة. لو `--step 1` = كل الـ frames (أبطأ، مكسب صغير). لو `--step 10` = 3 frames في الثانية بس (سريع جدًا، بس ممكن نخسر وضعيات انتقالية مهمة). ملاحظة: الـ subsampling ده **مش** بديل عن التقسيم بالـ session؛ حتى frame كل 10 لسه متشابهين جدًا جوه نفس الـ session.

### 12) ليه `idle` إجباري؟

الـ classifier دايمًا بيوزّع الاحتمال على الـ classes اللي يعرفها (المجموع = 1). لو مافيش `idle`، وأنا ماسك الموبايل أو بهرش، الموديل **لازم** يختار gesture، وهيدّيله احتمال عالي. `idle` بيمثّل "أي حاجة تانية" ويعلّم الموديل يقول "لأ، مش إشارة". وكمان الـ controller نفسه مبني على إن `idle` موجود (`self.labels.index("idle")`) — من غيره هيقع.

---

## لو غيّرنا ... هيحصل إيه؟

1. **لو قسّمنا بالـ frame بدل الـ session** (`KFold` عادي من غير groups): الـ macro-F1 هيطلع قريب من 0.99، بس البرنامج الحقيقي هيبقى أضعف بكتير من الرقم ده. التقييم بقى كذاب.
2. **لو عملنا augmentation قبل التقسيم**: نفس المشكلة بس أخف — نسخة jitter من frame في train تقريبًا هي هو في test → الأرقام أعلى من الحقيقة.
3. **لو `--step 1` بدل 2**: الوقت تقريبًا الضعف، والـ F1 غالبًا نفسه تقريبًا. **لو `--step 10`**: سريع جدًا، والـ F1 ممكن ينزل شوية لو الداتا قليلة.
4. **لو شلنا `StandardScaler` من الـ MLP**: التدريب غالبًا أبطأ والنتيجة أسوأ أو مش مستقرة، وممكن نشوف `ConvergenceWarning`.
5. **لو شلنا `class_weight="balanced"` والداتا مش متوازنة**: الـ RF هيميل لـ `idle` → recall الـ gestures الصغيرة ينزل (نعمل الإشارة ومايحصلش حاجة).
6. **لو غيّرنا `features.py` وزوّدنا `FEATURE_VERSION` من غير ما نعيد التدريب**: البرنامج هيرفض يحمّل الموديل برسالة "Re-run train.py" — ده الهدف بالظبط.

---

## أسئلة مراجعة

<details>
<summary>اضغط هنا لعرض الأسئلة والإجابات</summary>

1. **ليه مانقسّمش الـ frames عشوائيًا بين train و test؟**
   لأن frames الـ session الواحدة شبه متطابقة، فالـ test هيبقى نسخة من الـ train (data leakage) والـ accuracy هتطلع أعلى من الحقيقة. بنقسّم بالـ session بـ `StratifiedGroupKFold`.

2. **إيه هي الـ out-of-fold predictions؟**
   توقع لكل frame من موديل ماشافش الـ session بتاعته. بنجمعهم في `oof` ونحسب منهم F1 و confusion matrix واحدة.

3. **ليه الـ augmentation بيتعمل جوه الـ training fold بس؟**
   النسخة المعكوسة/الـ jitter شبه الأصلي؛ لو واحدة في train والتانية في test يبقى leakage. والـ test لازم يمثّل الداتا الحقيقية (من غير تعديل).

4. **ليه macro-F1 مش accuracy؟**
   الـ accuracy بتتأثر بالـ class الكبير (`idle`). الـ macro-F1 بيدّي كل gesture نفس الوزن وبيكشف لو الموديل فاشل في gesture واحد.

5. **ليه `StandardScaler` مع الـ MLP بس؟**
   الـ gradient descent حساس لاختلاف مقاييس الـ features، أما الشجر بيقارن بـ thresholds فمش بيفرق معاه المقياس.

6. **ليه بنحفظ `labels` في الـ bundle؟**
   لأن ترتيب أعمدة `predict_proba` = `model.classes_`، ولو gesture مش متسجل الأرقام بتتزحلق. الأسماء المحفوظة بتربط كل عمود باسمه الصح.

7. **إيه فايدة `FEATURE_VERSION`؟**
   لو طريقة حساب الـ features اتغيرت، الموديل القديم مايتحمّلش ويطلع error واضح بدل ما يدّي توقعات غلط في صمت.

8. **إيه الفرق بين نتيجة الـ CV ونتيجة `--test-person`؟**
   الـ CV بيختبر على sessions جديدة غالبًا لنفس الأشخاص؛ `--test-person` بيختبر على شخص ماظهرش خالص في أي تدريب — أصعب وأصدق.

</details>
