# 13 — سيرفر الويب (`server.py` · `engine.py` · `events.py` · `catalog.py`)

[⬅ الفهرس](00_index.md)

---

## مقدمة: ليه سيرفر أصلاً؟

لحد دلوقتي البرنامج كان شباك OpenCV واحد (`python -m shinobi.main`): الكاميرا والـ AI والـ effects والـ HUD كلهم في process واحدة على اللابتوب.

النسخة النهائية من SHINOBI AI **web app**: واجهة React في المتصفح (فولدر `frontend/`). بس المتصفح مايقدرش يشغّل MediaPipe بتاعتنا و YOLOX و الـ `ActionController` و الـ effects اللي كتبناها بـ Python. فالحل:

```
المتصفح (React)                                   Python (shinobi/server.py)
──────────────                                   ─────────────────────────
الكاميرا ── JPEG ──────── WebSocket ────────►  decode ► mirror ► Engine ► events
الشاشة   ◄── JPEG + FrameState (JSON) ───────  encode ◄── الـ frame بالـ effect مرسوم عليه
الأصوات و الـ UI بيتحركوا على الـ events اللي جاية من Python بس
```

**القاعدة الأهم:** المتصفح **عمره ما بيقرر** إن فيه sign اتعمل أو jutsu اشتغل. كل ده جاي من نفس الـ pipeline الحقيقي بتاع Python (MediaPipe + YOLOX + `SignFusion` + `ActionController`). مفيش demo mode ولا نتايج متزيفة في أي حتة.

العقد (الـ contract) بين الناحيتين مكتوب في [web_protocol.md](web_protocol.md). أي حاجة الواجهة والسيرفر بيتكلموا بيها موجودة هناك، والملف ده بيشرح **الناحية بتاعة Python**.

| الملف | دوره |
|---|---|
| `shinobi/engine.py` | الـ pipeline بتاع frame واحد، من غير شباك ولا كيبورد ولا HUD. `main.py` والسيرفر الاتنين بيستخدموه |
| `shinobi/events.py` | بيحوّل حالة الـ controller والـ effect من frame للتاني لـ **events** (sign, step, jutsu, ...) |
| `shinobi/catalog.py` | النصوص (أسماء الحركات، الشرح، الـ jutsu، الـ credits) نسخة واحدة للكروت وللويب |
| `shinobi/server.py` | FastAPI: الـ REST والـ WebSocket والـ sessions |

---

## 1. التشغيل

### أول مرة

```powershell
.venv\Scripts\python.exe -m pip install -r requirements.txt     # fastapi, uvicorn, websockets, httpx
cd frontend
npm install
npm run build          # بيعمل frontend\dist اللي السيرفر بيعرضه
cd ..
```

### كل مرة

```powershell
.venv\Scripts\python.exe -m shinobi.server
```

وبعدين نفتح **http://localhost:8000** في المتصفح. لو `frontend\dist` مش موجود، الصفحة الرئيسية بتقول بالظبط نعمل إيه (`cd frontend; npm install; npm run build`)، والـ API شغال عادي.

| الـ option | الـ default | معناه |
|---|---|---|
| `--host` | `127.0.0.1` | مين يقدر يوصل. `0.0.0.0` = أي جهاز على نفس الشبكة (موبايل مثلاً) |
| `--port` | `8000` | البورت |
| `--max-sessions` | `2` | كام browser tab/جهاز في نفس الوقت. كل session بتشغّل الموديلات بتاعتها، فكل واحدة زيادة بتاكل CPU |
| `--ssl-certfile` / `--ssl-keyfile` | مفيش | HTTPS (لازم للموبايل، شوف آخر قسم). الاتنين مع بعض |

### وقت التطوير (الواجهة بتتغير كتير)

```powershell
.venv\Scripts\python.exe -m shinobi.server          # الـ backend على 8000
cd frontend; npm run dev                             # Vite على 5173، بيحوّل /api و /ws و /references و /audio للـ 8000
```

ونفتح http://localhost:5173. كده أي تعديل في الـ React بيظهر على طول من غير build.

> **ملحوظة:** `main.py` لسه شغال زي ما هو بالظبط (نفس الزراير 1-4، 0، L، H، F، Q/Esc، نفس الـ HUD). الفرق إن الـ pipeline اللي كان مكتوب جواه اتنقل لـ `engine.py`، فالشرح السطر بسطر للـ pipeline في [الملف 11](11_main_config_hud.md) بقى مكانه دلوقتي `Engine.process()`.

---

## 2. الـ Engine (`shinobi/engine.py`)

### ليه فصلناه؟

الـ loop في `main.py` كان بيعمل حاجتين مع بعض: (1) **الـ pipeline** (YOLOX، segmentation، تتبع الإيد، classifier، fusion، controller، effects) و (2) **الشباك** (كاميرا، كيبورد، HUD، `imshow`). السيرفر محتاج (1) من غير (2)، ومحتاج **نسخة منه لكل مستخدم**. فطلّعنا (1) في class اسمه `Engine`، و`main.py` بقى غلاف صغير حواليه.

**بنفس الترتيب ونفس الـ threads ونفس الأرقام** اللي كانت في `main.py`: YOLOX بياخد أحدث frame في الـ thread بتاعه ومحدش بيستناه، الـ segmentation بتشتغل على worker thread (بس لما الـ effect محتاجها، يعني Shadow Clone)، والـ timings dict بنفس المفاتيح (`hands`, `model`, `yolox`, `seg`, `fx`). الـ test `test_main_runs_headless_and_key_1_starts_the_shadow_clone` بيشغّل `main.py` نفسه من غير شباك عشان يتأكد إن ده لسه صح.

### الـ API

| الدالة | بتعمل إيه |
|---|---|
| `Engine(classifier=AUTO, yolox=True, jutsu=None, draw_landmarks=False)` | بيجهّز كل الموديلات. `AUTO` = يحمّل `gesture_model.joblib` لو موجود. السيرفر بيحمّله **مرة واحدة** ويدّي نفس الـ object لكل الـ engines (بيتقري بس، مابيتغيرش) |
| `process(frame, now)` → `EngineResult` | frame واحد في الـ pipeline كله. أي مقاس (640x480، 1280x720، portrait 720x1280 ...) |
| `start_effect(name, now)` / `stop_effect(now)` | زراير 1-4 و 0 في `main.py` |
| `set_jutsu(dict)` | مين من الـ jutsu يقدر يشتغل: `config.JUTSU` (الكل، free mode) أو `{id: config.JUTSU[id]}` (practice). بيعمل `ActionController` جديد = تسلسل جديد من الصفر |
| `reset_sequence()` | ينسى الحركات اللي اتعملت (زرار Retry). الـ effect الشغال والـ cooldown بيفضلوا |
| `close()` | يقفل الـ threads والموديلات. ينفع يتنادى مرتين |
| `draw_landmarks` | attribute: نرسم نقط MediaPipe على الصورة ولا لأ (زرار L) |

الـ `EngineResult` فيه كل اللي الـ HUD والسيرفر محتاجينه: الصورة الخارجة، `hands`، `fused` (قرار الـ fusion)، `state` (الـ `ControllerState`)، `stabilizer`، `timings`، `fps`، `status` (نص الـ HUD)، `history` و `progress` و `time_left` و `cooldown`، والـ `effect` الشغال ومين شغّله (`effect_jutsu`) ورقم التشغيلة (`effect_id`: كل تشغيلة جديدة رقم جديد، حتى لو نفس الـ effect).

**مهم:** الـ `Engine` **مش thread-safe**. كل الدوال لازم تتنادى من thread واحد. وده بالظبط اللي السيرفر بيعمله (thread لكل session)، فالـ objects بتاعة MediaPipe عمرها ما بتتلمس من اتنين threads في نفس اللحظة.

### الصورة غيّرت مقاسها في النص؟

في الموبايل ممكن المستخدم يلف التليفون (landscape ↔ portrait) أو يغيّر الكاميرا. لقينا في التجربة إن ده بيوقّع Shadow Clone: الـ worker بتاعه بيبني طبقة الـ clones **متأخرة frame** (عشان السرعة، شوف [الملف 09](09_shadow_clone.md))، فأول frame بالمقاس الجديد بيحاول يدمج طبقة بالمقاس القديم → `cv2.error: Sizes of input arguments do not match`.

الحل في `Engine._new_frame_size()`: لو المقاس اتغير، الـ Shadow Clone اللي **اترسم** بالمقاس القديم بيخلص (الواجهة بتاخد `effect_end`)، والـ segmenter والـ anchor tracker بيبدأوا من جديد (مكان الإيد بالـ pixels مالوش معنى في مقاس تاني). الـ effects التانية (Rasengan، Chidori، Fire) بتكمّل عادي. `main.py` مابيتأثرش: الكاميرا مقاسها ثابت.

---

## 3. الـ Sessions

**كل WebSocket connection = session لوحدها.** كل session ليها `Engine` خاص بيها: hand tracker، YOLOX (detector + thread)، segmenter، fusion، تسلسل، effects، cooldown. يعني لو اتنين فاتحين في نفس الوقت، الحركات بتاعة واحد **مستحيل** تكمّل تسلسل التاني.

```
connect ─► فيه مكان؟ ── لأ ──► {"type":"error","code":"busy","fatal":true} + close(1013)
              │
              أه
              ▼
      Engine جديد (في thread الـ session)  ─►  hello  ─►  frames ...  ─►  disconnect
                                                                              │
                         engine.close() في نفس الـ thread ◄────────────────────┘
                         وبعدها بس المكان بيفضى (slot)
```

- **العدد:** `--max-sessions` (default 2). كل session بتاكل CPU لوحدها (MediaPipe + YOLOX)، فعلى لابتوب واحد اتنين كفاية.
- **thread لكل session:** الـ frames بتتعالج في `ThreadPoolExecutor(max_workers=1)` خاص بالـ session. ليه مش على الـ event loop؟ لأن frame واحد بياخد ~80-120 ms CPU؛ لو اتعمل على الـ event loop، كل الـ sessions التانية والـ REST هيقفوا. وليه thread **واحد**؟ عشان الـ frames تتعالج **بالترتيب**، وعشان MediaPipe مايتلمسش من اتنين threads.
- **الـ classifier مشترك:** لو فيه `gesture_model.joblib`، بيتحمّل مرة واحدة والكل بيقرا منه.
- **التنضيف:** لما الـ socket يتقفل (أو الـ session تقع)، `engine.close()` بيتنفذ في نفس thread الـ session (بعد الـ frame اللي شغال لو فيه)، وبعد ما يخلص **بس** المكان بيفضى. كودها في الـ `finally` ومن غير `await`، عشان حتى لو السيرفر عمل cancel للـ task، التنضيف بيحصل برضه. ولما السيرفر نفسه بيقفل، بيستنى الـ sessions تقفل موديلاتها قبل ما Python تخرج (اكتشفنا إن MediaPipe مابيعرفش يقفل نفسه وهو Python بيقفل).

---

## 4. رحلة frame واحد

### من المتصفح

الـ message binary:

```
[ uint32 big-endian N ][ N bytes: JSON header ][ JPEG ]
        4 bytes            {"t": 53211.4}
```

- `t` = وقت المتصفح (`performance.now()`)، السيرفر بيرجّعه زي ما هو (`client_t`) عشان الواجهة تحسب الـ latency.
- الصورة **مش معكوسة** (زي ما الكاميرا بتطلّعها)، وأكبر حاجة 1280x1280، JPEG quality 0.8.
- الواجهة بتبعت أقصى **2 frames** من غير رد (`max_in_flight`)، وتبعت الجديد لما رد يوصل.

### في السيرفر (thread الـ session)

| # | المرحلة | التفاصيل |
|---|---|---|
| 1 | **فحص** | الطول ≤ 4 MiB، الـ header JSON سليم، والصورة بتبدأ بالـ JPEG signature (`FF D8 FF`). غير كده = `bad_frame` |
| 2 | **decode** | `cv2.imdecode`. لو أكبر من 1280x1280 بتتصغّر (بنفس النسبة، `INTER_AREA`). أصغر من 32 px = `bad_frame` |
| 3 | **mirror** | `cv2.flip(frame, 1)` لأن `config.MIRROR = True`: نفس اللي `camera.py` بيعمله في الـ desktop app. كده YOLOX والـ landmarks بيشوفوا الصورة **بالظبط** زي في `main.py` |
| 4 | **`engine.process`** | YOLOX submit ← segmentation (لو Shadow Clone) ← hands ← classifier ← fusion ← controller ← effects ← landmarks (لو `options.landmarks`) |
| 5 | **events** | `EventTracker.update()` بيقارن الحالة دي باللي قبلها (القسم الجاي) |
| 6 | **encode** | `cv2.imencode(".jpg", quality 80)` للصورة الخارجة (معكوسة، والـ effect مرسوم عليها، **من غير HUD**) |
| 7 | **رد** | `[N][FrameState JSON][JPEG]` |

الـ `FrameState` فيه كل اللي الواجهة محتاجاه عشان ترسم: `sign` (قرار الـ fusion في الـ frame ده)، `candidate` و `hold` (الحركة اللي بتتثبّت دلوقتي وقربت قد إيه)، `latched`، `history`، `progress` لكل jutsu، `time_left`، `cooldown`، `mode`، `effect` (وفيه `clones` = عدد الـ clones الظاهرة في الصورة دي بالظبط، و `crowded` = `true` لو مفيش مكان كفاية حوالين المستخدم للـ 10 clones من غير ما يدخلوا في بعض، فالواجهة تقول "ارجع لورا" أو "لف الموبايل"؛ نفس الرسالة بتظهر في الـ HUD بتاع `main.py`)، و `timings` بالـ ms لكل مرحلة. التفاصيل كلها في [web_protocol.md §3.5](web_protocol.md).

### الترتيب والـ `skipped`

السيرفر **بيرد على كل frame وبالترتيب**. لو client بعت أكتر من المسموح (أكتر من 2 frames مستنيين)، أقدم واحد مستني بيترد عليه بـ `{"type": "skipped", "client_t": t}` بدل ما يتعالج، وبرضه في مكانه في الترتيب. كده:

- الـ client عدّاده (in-flight) بيفضل صح.
- الـ latency مابتكبرش: مفيش طابور frames قديمة بيتعالج وهي خلاص مالهاش لازمة.

والـ messages النصية `mode` و `reset` و `options` بتدخل **نفس الطابور**: أي frame اتبعت قبل `mode` بيترد عليه بالـ mode القديم، وأي frame بعد تأكيد الـ mode بالـ mode الجديد. ماعدا `ping`: بيترد عليه على طول (عشان يقيس الشبكة، مش طابور المعالجة).

---

## 5. الـ Events (`shinobi/events.py`)

الواجهة بتشغّل الأصوات والأنيميشن على **events** جاية مع كل frame. الـ `ActionController` نفسه بيقول بس "الـ sign ده اتأكد" و "الـ jutsu ده اشتغل"، فـ `EventTracker` بيبص على الفرق بين الـ frame ده واللي قبله ويطلّع الباقي. ملف **pure logic**: مفيش موديلات ولا صور، فبيتجرب بحالات صناعية بسرعة (`tests/test_events.py`).

| الـ event | إمتى |
|---|---|
| `sign` | الـ stabilizer أكّد حركة (مرة واحدة لكل حركة متثبتة). لو نفس الحركة اتأكدت تاني وهي لسه ممسوكة (YOLOX فوّت frame)، ده **تكرار**: بياخد `sign` بس، من غير `step` ولا `wrong_sign` |
| `step` | الحركة دي قدّمت تسلسل jutsu (`step` = عدد الخطوات اللي خلصت). event لكل jutsu اتقدم. **مش** للخطوة الأخيرة |
| `wrong_sign` | الحركة مش الخطوة الجاية في التسلسل. **مفيش حاجة بتتمسح**: الخطوات اللي خلصت بتفضل خلصانة، والمستخدم يعيد نفس الخطوة لحد ما تصح. **Free mode:** بنقولها بس للـ jutsu اللي واصل لأبعد خطوة (≥ 1)، عشان مانزعجش المستخدم بـ 4 أخطاء مرة واحدة. **Practice:** للـ jutsu اللي بنتمرن عليه، في أي غلطة، حتى في الخطوة 0 |
| `sequence_failed` / `timeout` | **Free mode بس:** عدّى أكتر من `SEQUENCE_MAX_GAP` (7 ثواني) من آخر خطوة اتأكدت للـ jutsu ده، فرجع للخطوة 0. الحركات الغلط مابتمدّش الوقت. **الـ Practice مافيهوش وقت خالص**، فمفيش timeout هناك |
| `jutsu` | التسلسل كامل، والـ effect بيبدأ في الـ frame ده |
| `effect_stopping` | الـ effect بدأ يختفي (وقته خلص، أو الإيد خرجت من الصورة) |
| `effect_end` | الـ effect خلص خالص (أو jutsu جديد خد مكانه) |
| `clones` | Shadow Clone: clones أكتر من أي وقت فات في التشغيلة دي بقت ظاهرة (عشان صوت الـ poof) |

### حاجات دقيقة اتظبطت

- **الترتيب جوه الـ frame:** `timeout`، `sign`، `wrong_sign`، `step`، `effect_end` (القديم)، `jutsu`، `effect_stopping`، `clones`. ليه `effect_end` قبل `jutsu`؟ لو Fire اشتغل وهو أصلاً شغال، الواجهة لو خدت `jutsu: fire` وبعدها `effect_end: fire` كانت هتوقف صوت النار **الجديدة**.
- **كل jutsu ليه عدّاده (2026-10-31):** كل jutsu بيحفظ عدد خطواته ووقت آخر خطوة اتأكدت. الحركة بتقدّم كل jutsu هي الخطوة الجاية بتاعته، والحركة الغلط **مابتمسحش** حاجة. لما jutsu يكمل بيشتغل، وكل التسلسلات ترجع 0.
- **حركة غلط لـ jutsu ممكن تقدّم jutsu تاني:** مثلاً في free mode Fire مستني Horse وعملنا **Snake**: ده `wrong_sign` لـ Fire (خطواته بتفضل زي ما هي) وبعده `step 1` لـ Chidori.
- **الـ timeout بييجي من الـ matcher نفسه** (`SequenceMatcher.expire`، قاعدة `>` مش `>=`)، والـ test `test_with_the_real_controller_...` بيتأكد إنه طالع في أول frame بعد الـ 7 ثواني.
- `reset` أو تغيير الـ mode بينسوا التسلسل **من غير** `timeout`.
- `effect_stopping` دايماً قبل `effect_end` لنفس التشغيلة، حتى لو الاختفاء حصل بين frameين.
- `clones`: بنقارن بأكبر عدد شفناه في **التشغيلة دي**، مش بالـ frame اللي فات. لو clone اختفى frame ورجع (الشخص مااتلقاش في frame قديم من الـ buffer)، مش هيتعمل poof تاني.

---

## 6. الـ REST والملفات

| URL | فيه إيه |
|---|---|
| `GET /api/info` | السيرفر يقدر يعمل إيه دلوقتي: YOLOX شغال؟ فيه landmark model؟ الحركات اللي بيتعرف عليها، والـ jutsu المتاحة، والـ sessions، وإعدادات الـ frames |
| `GET /api/jutsu` | الكتالوج: كل حركة (اسم، ياباني، إزاي تتعمل، صورتها، مين بيتعرف عليها) وكل jutsu (الخطوات **بترتيب `config.JUTSU`**، official ولا custom، الكروت، الوصف، متاح ولا ناقصه إيه) |
| `GET /api/credits` | الـ credits: رسومات Schlum (CC BY-SA 4.0)، الأصوات (3 محتاجين attribution، الباقي CC0)، موديل YOLOX (الكود MIT، الـ weights مش واضح ترخيصها → استخدام شخصي/تعليمي بس)، وdisclaimer |
| `/references/...` | فولدر `gesture_references/` (قراية بس) |
| `/audio/...` | فولدر `assets/audio/` (قراية بس) |
| `/` وأي path تاني | الواجهة المبنية من `frontend/dist`، وأي path مش ملف بيرجّع `index.html` (عشان React Router). `/api/...` غلط = 404 |

من غير `models/gesture_model.joblib`: **Fire Style و Chidori متاحين** (كل حركاتهم YOLOX)، و **Shadow Clone و Rasengan لأ** (محتاجين `clone_seal` و `rasengan_palm` من الـ landmark classifier). من يوم 2026-10-31 الموديل موجود على الجهاز ده (بس مش في git)، فالأربعة متاحين. الأرقام والتحذيرات في [14 القسم 9](14_evaluation.md). الواجهة بتعرض الحالة بأمانة من `/api/info`. والسيرفرات اللي كانت شغالة قبل ما الموديل يتحط لازم تتقفل وتتفتح تاني عشان تشوفه.

**ملحوظة Windows:** Python بياخد الـ MIME types من الـ registry، وساعات `.js` بيبقى `text/plain`، والمتصفح بيرفض يشغّل الـ modules. فالسيرفر بيظبط `.js` و `.css` و `.svg` و `.wasm` بنفسه.

### `shinobi/catalog.py`: نسخة واحدة من النصوص

أسماء الحركات والـ cues والـ tags وسطر المصدر كانوا مكتوبين جوه `tools/build_gesture_references.py` (اللي بيرسم الكروت). دلوقتي في `catalog.py` (data بس، من غير PIL)، والـ tool والسيرفر الاتنين بيقروا منه. يعني اللي مكتوب على الكارت = اللي الويب بيعرضه. اتأكدنا إن الـ tool لسه بيطلّع **نفس الصور بالـ byte** (بيرسم في فولدر مؤقت ويقارن، `tests/test_catalog.py`). وفيه زيادة للويب: الاسم (`Great Fireball Technique`)، الكانجي (من أول سطر في `instructions.md`)، ووصف قصير بكلامنا للـ effect.

---

## 7. الأخطاء

| الكود | إمتى | fatal؟ |
|---|---|---|
| `busy` | الـ sessions مليانة | أه، close 1013 |
| `bad_frame` | frame بايظ (مش JPEG، كبير، header غلط، صغير أوي). بعده `skipped` لنفس الـ `t` | لأ، الـ session بتكمّل |
| `bad_message` | message نصية مش مفهومة (مش JSON، نوع مش معروف، jutsu مش موجود) | لأ |
| `internal` | حاجة وقعت جوه الـ session | أه، close 1011، والمكان بيفضى، والـ sessions التانية مابتتأثرش |

---

## 8. الاختبارات

```powershell
.venv\Scripts\python.exe -m pytest -q                         # كله
.venv\Scripts\python.exe -m pytest -q tests\test_events.py    # الـ events بس (ثواني)
.venv\Scripts\python.exe -m pytest -q tests\test_server.py    # السيرفر + الـ E2E (دقايق)
```

| الملف | بيختبر |
|---|---|
| `tests/test_engine.py` | أي مقاس (1280x720، 640x480، portrait 720x1280، 852x480) والـ 10 clones، تغيير المقاس وسط Shadow Clone، practice/reset، الـ landmarks. و**`main.py` نفسه من غير شباك**: كاميرا وهمية بتلف على تسجيل idle حقيقي، والـ window functions بتاعة OpenCV متبدلة، والزرار `1` في frame 10 و `q` في frame 60، وبنتأكد إن الـ Shadow Clone اشتغل والـ clones اترسمت والـ HUD اترسم وكل حاجة اتقفلت |
| `tests/test_events.py` | كل قواعد الـ events بحالات صناعية، وكمان مع الـ `ActionController` الحقيقي |
| `tests/test_catalog.py` | الكروت byte-identical، الكانجي، شكل الـ credits |
| `tests/test_server.py` | الـ REST (كل صورة وكل صوت بيرجع 200)، hello/mode/options/reset/ping، الـ framing، المرايا، التصغير، `skipped` بالترتيب، الـ frames البايظة، `busy`، الـ crash، رسم الـ Shadow Clone عبر session (`clones` و `crowded`)، والـ E2E |

### الـ E2E: تسجيلاتنا الحقيقية عبر الـ WebSocket

دي أهم tests: بتبعت **فيديوهاتنا** (`data/videos/<sign>/me_night_*.mp4`، قراية بس) للسيرفر زي ما المتصفح بيعمل بالظبط، ومفيش أي mock في الـ pipeline:

- **Fire Style** (Monkey → Boar → Horse → Tiger) في free mode، و **Chidori** (Snake → Dog → Tiger → Monkey) في practice mode: لازم ييجي `sign` و `step 1, 2, 3` بالترتيب، و `jutsu` **مرة واحدة**، ومفيش `sequence_failed`، وبعد ما الإيد تنزل `effect_stopping` و `effect_end`.
- **ترتيب غلط** (Boar → Monkey → Horse → Tiger): ولا jutsu، و `wrong_sign` (Fire في الخطوة 1، مستني Boar، جاله Horse)، والـ Monkey بتفضل محسوبة.
- **Practice وغلطة في الخطوة 3** (Monkey → Boar → **Snake** → Horse → Tiger): `wrong_sign` واحد (مستني Horse)، والخطوتين الأولانيين مابيتمسحوش، وبعد الـ Horse والـ Tiger الـ jutsu بيشتغل. ومفيش `time_left` في الـ practice.
- **2 sessions مع بعض:** واحدة بتعمل Fire Style والتانية بتبعت idle (إيدين ظاهرين من غير seal): الـ jutsu بيوصل للأولى بس.

ليه بنعمل كده بالشكل ده:

1. **بنقلب الصورة قبل ما نبعتها** (`cv2.flip(frame, 1)`): التسجيلات اتحفظت **معكوسة** (لأن `camera.py` بيعكس)، والسيرفر بيعكس اللي جاي، فلازم نرجّعها زي ما الكاميرا بتطلّعها، زي المتصفح بالظبط.
2. **real time:** كل حركة 2.4 ثانية من التسجيل، والـ client بيبعت **الـ frame بتاع اللحظة دي** (≤ 15 fps، ≤ 2 من غير رد)، مش كل frame. لأن الـ hold (0.3 ث)، وتأكيد YOLOX (نتيجتين ورا بعض، ≤ 10 في الثانية)، والـ 3.5 ثانية بين الحركات كلها **وقت حقيقي**. لو بعتنا كل الـ frames والسيرفر بطيء، الحركة الواحدة هتاخد 7 ثواني والتسلسل هيعمل timeout.
3. **Shadow Clone و Rasengan في الـ E2E لو الموديل موجود** (غير كده skip). الـ clone_seal فيهم من التسجيل الوحيد اللي عندنا، وهو نفسه اللي الموديل اتدرب عليه، فالـ test ده بيثبت إن السلسلة كلها شغالة، مش إن clone_seal بيتعرف على تسجيلات جديدة. الـ palm من تسجيل الـ validation. ورسم الـ Shadow Clone لسه متجرب كمان من `Engine.start_effect` مباشرة، من غير ما يعتمد على التعرف.

### مشكلة حقيقية لقيناها بالـ E2E (واتصلحت)

أول تشغيل عدّى، والتاني (الـ CPU كان فاضي أكتر، ~15 fps) **Chidori فشل**: الـ Tiger اتأكد **مرتين**. السبب، بالتحليل frame بـ frame للتسجيلات:

- YOLOX بيلاقي الـ seal في 98-100% من الـ frames، بس فيه **misses مفردة** (Tiger: frame 84، Snake: 61، 62، 71، 72).
- miss واحد بيرجّع الـ streak في `SignFusion` لصفر، فلازم نتيجتين جداد (~0.2 ث) قبل ما يتأكد تاني. في الوقت ده 2-3 frames بيبقوا idle.
- الـ stabilizer (EMA 0.4) بعد 2 frames idle بيوصل 0.36 < `CONF_OFF` (0.45)، فبيفك الـ latch، ولما الـ seal يرجع **بيتأكد تاني** ← `history = [snake, dog, tiger, tiger]` ← التسلسل كان بيبوظ.

ده كان بيحصل في `main.py` كمان (نفس الـ pipeline)، وagent التقييم قاسه على مسكات 20 ثانية (ram اتأكدت 3 مرات، snake 4، tiger 2).

**الحل** (في `SequenceMatcher.push`، [الملف 06](06_controller.md)): نفس الإشارة تاني = **تكرار (repeat)**، مش خطوة (إلا لو هي الخطوة الجاية لـ jutsu، يعني بدأ من الأول بعد timeout أو Retry). بنحدّث وقت الـ jutsu اللي آخر خطوة ليه هي الإشارة دي (فمسك الإشارة كمان بيمنع الـ timeout)، و `ControllerState.repeat = True`، و `events.py` بيبعت `sign` بس من غير `step` ولا `wrong_sign`. وأي jutsu فيه نفس الإشارة مرتين ورا بعض بيترفض في الإعدادات.

- الـ E2E رجعت تستخدم **نفس الأجزاء الطبيعية من التسجيلات (من frame 60)، بالـ misses الحقيقية اللي فيها**، والـ jutsu بيشتغل مرة واحدة.
- `test_one_missed_yolox_result_in_a_held_seal_is_a_neutral_repeat`: Chidori بالـ `SignFusion` و `ActionController` الحقيقيين مع **نتيجة YOLOX واحدة ناقصة** وسط Dog: الـ Dog بياخد `sign` مرتين، والـ jutsu بيشتغل مرة واحدة. وفي `tests/test_sequences.py` tests للتكرار بعد dropout، وتكرار أول/آخر إشارة، وتجديد الـ timer، ورفض الإعدادات اللي فيها إشارة مكررة.

---

## 9. السرعة (قياس، مش رقم نهائي)

اتقاس على اللابتوب ده **وفيه agents تانية شغالة على نفس الـ CPU**، فالأرقام دي أسوأ من الحقيقة:

| المرحلة | ms لكل frame (median، session واحدة، 852x480) |
|---|---|
| decode | ~6 |
| hands (MediaPipe) | ~75 (وصل 120 لما الجهاز كان مشغول) |
| model (fusion + controller) | < 1 |
| yolox (في الـ thread بتاعه، مابيأخرش الـ frame) | ~58 |
| encode | ~4 |
| **total** | **~85** → حوالي 12-15 frame في الثانية |

إنشاء الـ session (الموديلات) أخد من 0.5 لـ 5 ثواني حسب ضغط الجهاز. مع Shadow Clone الـ segmentation بتشتغل بالتوازي مع الـ hands، والـ fx بياخد ~30-80 ms زيادة.

---

## 10. HTTPS للموبايل والتابلت

المتصفحات **مابتدّيش الكاميرا** غير على `localhost` أو **HTTPS**. على اللابتوب نفسه `http://localhost:8000` كفاية. للموبايل على نفس الـ Wi-Fi:

1. **IP اللابتوب:** `ipconfig` في PowerShell ← `IPv4 Address` (مثلاً `192.168.1.10`).
2. **شهادة self-signed** (الـ `openssl` موجود في Git Bash):

   ```bash
   MSYS_NO_PATHCONV=1 openssl req -x509 -newkey rsa:2048 -nodes -days 365 -keyout key.pem -out cert.pem \
     -subj "/CN=SHINOBI AI" -addext "subjectAltName=IP:192.168.1.10,DNS:localhost"
   ```

   (حط الـ IP بتاعك. الملفين دول **سريين**، ماتشيّرهمش ولا تحطهم في git.)
   `MSYS_NO_PATHCONV=1` مهم في Git Bash: من غيره بيفتكر `/CN=...` مسار ملف ويحوّله لـ `C:/Program Files/Git/CN=...` والأمر يفشل.

   جرّبنا ده فعلاً: السيرفر على `https://127.0.0.1:8765` بشهادة زي دي، و client حقيقي بـ `wss://` (مكتبة `websockets`) بعت 30 frame من تسجيل الـ Horse، والـ Horse اتعرف، والـ round trip كان ~94 ms.

3. **التشغيل:**

   ```powershell
   .venv\Scripts\python.exe -m shinobi.server --host 0.0.0.0 --ssl-certfile cert.pem --ssl-keyfile key.pem
   ```

4. Windows Firewall هيسأل: نسمح لـ Python على **Private networks** بس.
5. على الموبايل: `https://192.168.1.10:8000` ← المتصفح هيقول الشهادة مش موثوقة (طبيعي، إحنا اللي عاملينها) ← Advanced ← Continue. الـ WebSocket بيبقى `wss://` لوحده لأنه نفس الـ origin.

**تحذير:** `--host 0.0.0.0` معناه أي حد على نفس الشبكة يقدر يفتح الصفحة ويبعت صور. استخدمه على شبكة البيت بس.

---

## 11. مشاكل شائعة

| المشكلة | السبب والحل |
|---|---|
| الصفحة بتقول "web app is not built yet" | `cd frontend; npm install; npm run build`، أو استخدم `npm run dev` على 5173 |
| `busy` | فيه sessions تانية مفتوحة (tab تاني؟). اقفلها، أو `--max-sessions 3` (CPU أكتر) |
| الكاميرا مابتشتغلش على الموبايل | لازم HTTPS (قسم 10) |
| Shadow Clone / Rasengan مش متاحين | محتاجين الـ landmark model: سجّل `clone_seal` و `rasengan_palm` ودرّب (`train.py`) |
| port 8000 مشغول | `--port 8765` مثلاً (ولو بتستخدم `npm run dev` غيّر `SHINOBI_BACKEND` كمان) |
| نفس الحركة بتظهر مرتين في الـ events | طبيعي: YOLOX فوّت frame والـ stabilizer أكدها تاني. ده **تكرار** ومابيبوظش التسلسل (قسم 8) |
