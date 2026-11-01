# SHINOBI AI — دليل المذاكرة

الفولدر ده فيه شرح المشروع كله بالعربي، ملف ملف وسطر سطر. الكود نفسه مكتوب بالإنجليزي (ودي الطريقة المعتادة في أي مشروع)، والشرح هنا بيقول كل سطر بيعمل إيه **وليه** اتكتب بالشكل ده.

---

## ترتيب المذاكرة المقترح

| # | الملف | بيشرح | ليه بالترتيب ده |
|---|---|---|---|
| 01 | [التشغيل والإعداد](01_setup_and_run.md) | تسطيب، تشغيل، جمع الداتا، التدريب، المشاكل الشائعة | لازم المشروع يشتغل قدامنا الأول |
| 02 | [الكاميرا وتتبع الإيد](02_camera_and_hands.md) | `camera.py`، `hands.py` | أول خطوة في الـ pipeline |
| 03 | [الـ Features](03_features.md) | `features.py` | إزاي نحوّل الإيد لأرقام يفهمها الموديل |
| 04 | [جمع الداتا](04_collect_data.md) | `collect_data.py` | إزاي بنبني الـ dataset |
| 05 | [التدريب والـ Classifier](05_training.md) | `train.py`، `classifier.py` | الجزء الخاص بالـ AI |
| 06 | [الـ Controller](06_controller.md) | `controller.py` | إزاي نمنع التفعيل بالغلط، ونتعرف على التسلسلات |
| 07 | [التتبع والفلاتر](07_tracking_and_filters.md) | `filters.py`، `tracking.py` | إزاي الـ effect يفضل لازق في الإيد من غير رعشة |
| 08 | [أساسيات الـ Effects](08_effects_basics.md) | `effects/base.py`، `effects/fx.py` | الأدوات اللي كل الـ effects بتستخدمها |
| 09 | [Shadow Clone](09_shadow_clone.md) | `segmentation.py`، `effects/shadow_clone.py` | أصعب effect في المشروع |
| 10 | [Rasengan و Chidori و Fire](10_rasengan_chidori_fire.md) | `effects/rasengan.py`، `chidori.py`، `fire.py` | الرياضيات ورا كل effect |
| 11 | [البرنامج الرئيسي والإعدادات](11_main_config_hud.md) | `main.py`، `config.py`، `hud.py` | إزاي كل الأجزاء بتتجمع مع بعض |
| 12 | [الـ Tests](12_tests.md) | `tests/test_core.py` | إزاي نتأكد إن الكود صح |

### الحاجات الجديدة (الـ 4-step sequences)

| الملف | فيه إيه |
|---|---|
| [gesture_references/README.md](../gesture_references/README.md) | الـ 4 jutsu، كل حركة رسمي ولا custom وليه، والمصادر. وفولدر لكل jutsu فيه صورة لكل خطوة وصورة للتسلسل كله وشرح خطوة خطوة |
| [assets/audio/SOURCES.md](../assets/audio/SOURCES.md) | الأصوات (19 ملف)، ومصدر وترخيص كل صوت، والـ credits المطلوبة |
| `record_sequences.py` | تسجيل التسلسل كامل بالترتيب، مع حدود كل خطوة والانتقالات والأمثلة الغلط |
| `tests/test_sequences.py` | tests التسلسلات: الترتيب، والناقص، والـ timeout، وإن الـ jutsu مايشتغلش مرتين |
| `shinobi/seal_detector.py` | موديل YOLOX الجاهز للـ 7 seals الرسمية، شغال في thread لوحده (أقصى حاجة 10 مرات في الثانية) |
| `shinobi/fusion.py` | بيدمج YOLOX والـ landmark classifier في قرار واحد لكل frame: حدود الثقة، وقراءتين ورا بعض، والـ box لازم يبقى على الإيد، والتعارض |
| [models/THIRD_PARTY_YOLOX.md](../models/THIRD_PARTY_YOLOX.md) | مصدر موديل YOLOX، وترخيص الكود والأوزان وبيانات التدريب كل واحد لوحده. **مش للنشر قبل ما نراجعه** |
| `tests/test_fusion.py` | tests الموديل والدمج، و jutsu كامل من الموديلين |

> ملفات الشرح من 01 لـ 12 اتكتبت قبل التسلسلات الجديدة. الكود دلوقتي فيه 10 حركات (مش 5) والـ jutsu كل واحد 4 خطوات، والتفاصيل في `shinobi/config.py`.

---

## الصورة الكبيرة: البيانات بتمشي إزاي؟

كل frame من الكاميرا بيعدّي على المراحل دي بالترتيب، حوالي 20 لـ 30 مرة في الثانية:

```
┌──────────┐   frame    ┌──────────────┐  21 نقطة لكل إيد  ┌─────────────┐
│ camera   │──────────►│ hands        │──────────────────►│ features    │
│ (thread) │           │ (MediaPipe)  │                   │ 206 رقم     │
└──────────┘           └──────┬───────┘                   └──────┬──────┘
                              │                                  │
                              │ مكان الإيد                       ▼
                              ▼                           ┌─────────────┐
                       ┌──────────────┐                   │ classifier  │
                       │ tracking     │                   │ (MLP / RF)  │
                       │ (One Euro)   │                   └──────┬──────┘
                       └──────┬───────┘                          │ احتمال كل gesture
                              │                                  ▼
                              │                           ┌─────────────┐
                              │                           │ controller  │
                              │                           │ smoothing + │
                              │                           │ hold +      │
                              │                           │ sequence +  │
                              │                           │ cooldown    │
                              │                           └──────┬──────┘
                              │                                  │ "شغّل rasengan"
                              ▼                                  ▼
                       ┌──────────────────────────────────────────────┐
                       │ effects  (shadow_clone / rasengan / ...)     │
                       │ + segmentation لو الـ effect محتاجها         │
                       └──────────────────────┬───────────────────────┘
                                              ▼
                                        الشاشة + HUD
```

### الفكرة الأساسية في التصميم

1. **الـ AI منفصل عن الرسم.** الـ classifier مايعرفش أي حاجة عن الـ effects، والـ effects ماتعرفش أي حاجة عن الموديل. الاتنين بيتكلموا بس عن طريق اسم الـ effect ومكان الإيد. يعني نقدر نغيّر الموديل من غير ما نلمس الـ effects، والعكس.
2. **الموديل بيشتغل على frame واحد، والوقت بيتعامل معاه الـ controller.** بدل LSTM معقد، عندنا classifier بسيط على كل frame، وفوقه قواعد واضحة: لازم الـ gesture يفضل ثابت لمدة معينة، وتسلسل الـ seals بيتقارن بالترتيب. ده أسهل في الـ debugging، ومحتاج داتا أقل بكتير، وإضافة jutsu جديد بقت سطر واحد في `config.py`.
3. **كل الإعدادات في مكان واحد** (`config.py`): الـ thresholds، والأوقات، وتعريف الـ jutsu. أي تجربة بتبقى تعديل رقم في ملف واحد.
4. **الأداء اتقاس مش اتخمّن.** كل تحسين في الكود (زي ROI والتشغيل بالتوازي وتصغير الـ blur) جه بعد قياس فعلي على اللابتوب ده (i7-8550U)، والأرقام مكتوبة في الشرح.

---

## خريطة الملفات

```
SHINOBI-AI/
├── shinobi/                  ← الكود الأساسي (package)
│   ├── __init__.py           إعداد الكاميرا على Windows
│   ├── config.py             كل الإعدادات
│   ├── camera.py             قراءة الكاميرا في thread
│   ├── hands.py              MediaPipe Hand Landmarker
│   ├── features.py           landmarks → vector
│   ├── classifier.py         تحميل الموديل والتوقع
│   ├── controller.py         تأكيد الـ gesture + التسلسلات + cooldown
│   ├── filters.py            One Euro filter
│   ├── tracking.py           الإيد اللي الـ effect ماشي وراها
│   ├── segmentation.py       فصل الشخص عن الخلفية
│   ├── hud.py                المعلومات على الشاشة
│   ├── main.py               البرنامج الرئيسي
│   └── effects/
│       ├── base.py           الكلاس الأساسي + المدير
│       ├── fx.py             glow + particles
│       ├── shadow_clone.py
│       ├── rasengan.py
│       ├── chidori.py
│       └── fire.py
├── collect_data.py           تسجيل الداتا (حركة واحدة في كل session)
├── record_sequences.py       تسجيل تسلسلات كاملة (صح وغلط)
├── train.py                  التدريب والتقييم
├── tools/build_gesture_references.py   بيعمل صور الـ gesture_references
├── tests/                    test_core / sequences / shadow_clone / fusion (59 test)
├── gesture_references/       صور وشرح الحركات لكل jutsu
├── assets/audio/             الأصوات + مصادرها وترخيصها
├── models/                   ملفات MediaPipe + الموديل المتدرب
├── data/                     الداتا المسجلة (مش بتترفع على git)
└── docs/                     الشرح ده
```
