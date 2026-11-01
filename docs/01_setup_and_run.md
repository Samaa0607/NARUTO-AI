# 01 — التشغيل والإعداد

[⬅ الفهرس](00_index.md)

---

## 1. الإعداد (اتعمل خلاص على اللابتوب ده)

لو هنشغّل المشروع على جهاز تاني، دي نفس الخطوات اللي اتعملت هنا:

```powershell
# 1) بيئة Python 3.12 منفصلة للمشروع
py -3.12 -m venv .venv

# 2) المكتبات
.venv\Scripts\python.exe -m pip install -r requirements.txt

# 3) ملفات موديلات MediaPipe (موجودة في models/)
curl -L -o models/hand_landmarker.task https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task
curl -L -o models/selfie_segmenter.tflite https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite
```

**ليه Python 3.12 بالذات؟** `numpy 2.5` محتاجة 3.12 أو أحدث، و 3.12 هي أكتر نسخة مستقرة مع باقي المكتبات.

**ليه `mediapipe==1.2.0` بالظبط؟** من أول 1.0، MediaPipe شالت الـ API القديم (`mp.solutions.hands`). معظم الـ tutorials على النت لسه بتستخدمه، وده مش هيشتغل. إحنا بنستخدم الـ **Tasks API** الجديد (`vision.HandLandmarker`). تثبيت النسخة بيضمن إن الكود مايتكسرش لو نزلت نسخة جديدة فيها تغييرات.

**تحذير مهم:** `mediapipe` بتسطّب `opencv-contrib-python` لوحدها. **ممنوع** نسطّب `opencv-python` جنبها، لأن الاتنين فيهم module اسمه `cv2` وهيبوّظوا بعض.

### ليه مافيش TensorFlow ولا Pygame ولا Pillow؟

| المكتبة | السبب |
|---|---|
| TensorFlow | مالهاش دعم GPU على Windows من بعد نسخة 2.10، وحجمها ضخم. الموديل بتاعنا صغير و scikit-learn كفاية |
| Pygame | OpenCV بيعمل الشباك والرسم. الـ effects بتترسم بـ NumPy و OpenCV |
| Pillow | مش محتاجينها، OpenCV بيغطي كل حاجة |

---

## 2. تشغيل البرنامج

```powershell
.venv\Scripts\python.exe -m shinobi.main
```

ليه `-m shinobi.main` ومش `python shinobi/main.py`؟ لأن `shinobi` package، والـ imports جواه مكتوبة بالشكل ده: `from shinobi import config`. الطريقة `-m` بتخلي Python يعرف الـ package صح.

### الأزرار

| الزرار | الوظيفة |
|---|---|
| `1` | Shadow Clone |
| `2` | Rasengan (محتاج إيد قدام الكاميرا) |
| `3` | Chidori (محتاج إيد) |
| `4` | Fire Style (محتاج إيد) |
| `0` | إيقاف الـ effect الحالي |
| `L` | إظهار وإخفاء نقط الإيد |
| `H` | إظهار وإخفاء الـ HUD |
| `F` | Fullscreen |
| `Q` أو `Esc` | خروج |

**قبل التدريب:** البرنامج بيشتغل في "keyboard mode"، والـ effects بتشتغل بالأزرار بس. ده مقصود، عشان نقدر نجرّب ونطوّر الـ effects من غير ما نستنى الموديل.

**بعد التدريب:** الـ gestures بتشغّل الـ effects لوحدها، والـ HUD بيعرض احتمال كل gesture في كل لحظة.

### ملاحظات عن الكاميرا على اللابتوب ده (اتقاست فعلاً)
- **الكاميرا رقم 0 هي Camo** (برنامج الموبايل)، ولما الموبايل مش متوصل بتبعت صورة سودا. الكاميرا الحقيقية (EasyCamera) رقم 1. الكود **بيدوّر لوحده** على أول كاميرا بتدي صورة مش سودا (`CAMERA_INDEX = None` في `config.py`).
- الـ backend الافتراضي MSMF بيدي **30 FPS على 720p**. الـ DirectShow كان بيدي 9.5 FPS بس.
- فتح الكاميرا كان بياخد 14 ثانية. إعداد واحد في `shinobi/__init__.py` نزّله لـ 0.6 ثانية.

---

## 3. جمع الداتا (الجزء اللي محتاج حد قدام الكاميرا)

```powershell
.venv\Scripts\python.exe collect_data.py --person sara --lighting day
```

- `--person`: اسم اللي بيسجّل. **مهم** لأن التقييم بيفصل الناس عن بعض.
- `--lighting`: وصف الإضاءة (`day`، `night`، `lamp`...).
- `--seconds`: مدة كل تسجيل (الافتراضي 20 ثانية).

### الأزرار جوه أداة التسجيل
- `0`-`4`: اختيار الـ gesture (القايمة ظاهرة فوق، ومعاها عدد الـ sessions اللي اتسجلت لكل واحد).
- `SPACE`: عد تنازلي 3 ثواني، وبعده تسجيل 20 ثانية.
- `Q`: خروج.

### الـ Gestures المقترحة

اخترناهم بحيث MediaPipe يشوفهم كويس. الـ seals الأصلية من الأنمي فيها صوابع متشابكة، و MediaPipe بيتلخبط فيها.

| الرقم | الاسم | الحركة |
|---|---|---|
| 0 | `idle` | **أي حاجة تانية**: إيد تحت، تلويح، لمس الوش، ماسك موبايل، حركات عشوائية |
| 1 | `clone_seal` | الإيدين: السبابة والوسطى مرفوعين ومتقاطعين علامة + |
| 2 | `rasengan` | إيد واحدة: كف مفتوح للكاميرا والصوابع مفرودة |
| 3 | `chidori` | إيد واحدة: مخلب (كل الصوابع نص مثنية ومفرودة) |
| 4 | `fire` | إيد واحدة: دايرة OK (الإبهام والسبابة) قدام البق |

### البروتوكول (حوالي ساعة)

1. **لكل gesture: 4 sessions على الأقل**، كل واحدة 20 ثانية.
2. **أثناء التسجيل:** نحرّك الإيد، ونلفها شوية، ونقرّب ونبعد، ونبدّل بين الإيد اليمين والشمال.
3. **نغيّر الظروف بين الـ sessions:** نور الأوضة، ونور الشباك، والمسافة (قريب، ونص متر، ومتر).
4. **`idle` أهم class:** محتاج sessions أكتر (6 أو أكتر)، وفيها كل الحاجات اللي **ماينفعش** تشغّل jutsu، وكمان حركات قريبة من الـ gestures (كف نص مفتوح، صوابع مثنية من غير قصد).
5. **لو فيه شخص تاني متاح:** يسجّل ولو session واحدة لكل gesture بـ `--person` مختلف. ده بيدينا اختبار حقيقي على حد الموديل ماشافوش قبل كده.

الداتا بتتحفظ في `data/landmarks/<gesture>/` كنقط الإيد الخام (مش features)، ومعاها فيديو صغير في `data/videos/` للمراجعة.

---

## 4. التدريب

```powershell
.venv\Scripts\python.exe train.py
# أو مع اختبار على شخص الموديل ماشافوش:
.venv\Scripts\python.exe train.py --test-person ali
```

الـ script بيدرّب موديلين (Random Forest و MLP)، ويقيّمهم بـ **cross-validation مقسوم بالـ session**، ويختار الأحسن، ويحفظ:

| الملف | المحتوى |
|---|---|
| `models/gesture_model.joblib` | الموديل + أسماء الـ labels + نسخة الـ features |
| `models/training_report.txt` | precision و recall و F1 لكل gesture |
| `models/confusion_random_forest.png` و `models/confusion_mlp.png` | الـ confusion matrix |

### نقرأ النتيجة إزاي؟
- **macro-F1 أعلى من 0.90**: ممتاز.
- **أقل من 0.80**: نبص على الـ confusion matrix ونشوف أنهي gestures بتتلخبط في بعض، وبعدين نسجّل sessions أكتر ليهم أو نغيّر شكل واحد منهم.
- **لو `idle` بيتلخبط مع gesture معين**: ده معناه false activations. نسجّل idle فيه حركات قريبة من الـ gesture ده.

بعد التدريب نشغّل `python -m shinobi.main` تاني، والـ gestures هتشتغل لوحدها.

---

## 5. الـ Tests

```powershell
.venv\Scripts\python.exe -m pytest -q
```

النتيجة المتوقعة: `14 passed`. الـ tests بتتأكد من الـ features، والـ controller، والتسلسلات، والـ cooldown، وإن كل effect بيترسم من غير crash، وإن التدريب شغال من أوله لآخره على داتا صناعية.

---

## 6. ضبط الحساسية (`shinobi/config.py`)

| المشكلة | الإعداد | الاتجاه |
|---|---|---|
| الـ jutsu بيشتغل لوحده بالغلط | `CONF_ON` | نزوّده (0.75 → 0.85) |
| | `HOLD_SECONDS` | نزوّده (0.3 → 0.5) |
| | `MIN_MARGIN` | نزوّده |
| الـ jutsu صعب يشتغل | نفس الإعدادات | نقللها |
| الـ effect بيترعش مع الإيد | `FILTER_MIN_CUTOFF` | نقلله |
| الـ effect متأخر ورا الإيد | `FILTER_BETA` | نزوّده |
| الـ clones قريبة من بعض | `CLONE_OFFSETS` | نوسّعها (ونقعد في نص الصورة، لأن الجنب الضيق بيقرّب النسخ من بعض) |
| عايزين clone زيادة | `CLONE_COUNT` + `CLONE_OFFSETS` و `CLONE_SCALES` و `CLONE_LIFTS` و `CLONE_DELAYS` | نزوّد العدد، ونضيف قيمة في **الأربع** lists |

### تحويل jutsu لتسلسل seals (Dynamic)

في `config.py`:
```python
"fire_style": {"sequence": ["chidori", "fire"], "effect": "fire"},
```
كده Fire Style محتاج **chidori وبعده fire** في خلال 1.5 ثانية (`SEQUENCE_MAX_GAP`).

**قاعدة مهمة:** gesture بيشغّل jutsu لوحده ماينفعش يبقى أول خطوة في تسلسل تاني. في المثال ده، لازم نشيل jutsu الـ `chidori` لوحده، أو نغيّر التسلسل.

---

## 7. الأداء المقاس على اللابتوب ده (i7-8550U، 8GB، من غير كارت شاشة NVIDIA)

| المرحلة | الوقت لكل frame |
|---|---|
| تتبع الإيد (MediaPipe) | 16-32ms |
| Segmentation (للـ Shadow Clone بس) | حوالي 25ms، بتشتغل **بالتوازي** مع تتبع الإيد |
| Rasengan | حوالي 7ms |
| Chidori | حوالي 10ms |
| Fire | حوالي 8-12ms |
| Shadow Clone | حوالي 15ms |

**النتيجة:** حوالي 18-21 FPS مع Rasengan و Chidori والنار، وحوالي 17 FPS مع Shadow Clone. على الـ i7-14700HX المفروض الأرقام دي تتضاعف تقريباً.

---

## 8. مشاكل شائعة

| المشكلة | الحل |
|---|---|
| `No working camera found` | الكاميرا مقفولة من زرار في الكيبورد أو من إعدادات الخصوصية في Windows، أو برنامج تاني ماسكها (Zoom أو Teams) |
| الصورة سودا | `CAMERA_INDEX = None` في `config.py` عشان الكود يدوّر لوحده |
| `No trained model yet` | طبيعي قبل التدريب. نشغّل `train.py` بعد جمع الداتا |
| `Need at least 2 sessions per gesture` | نسجّل sessions أكتر للـ gesture اللي ناقص |
| `Model was trained with feature version...` | الكود في `features.py` اتغيّر بعد التدريب. نشغّل `train.py` تاني |
| Shadow Clone الـ clones مقصوصة أو مش باينة | نرجع لورا. محتاجين نص الجسم الفوقاني يبان كامل، ومساحة على الجنبين |
| FPS قليل | نقفل البرامج التانية، أو نخلّي `CAMERA_WIDTH/HEIGHT` يبقى 960x540 |
