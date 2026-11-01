# مراجع حركات الإيد (Gesture References)

[⬅ فهرس الـ docs](../docs/00_index.md)

---

الفولدر ده فيه **الصور والشرح** اللي هنتعلم منهم نعمل الـ hand signs بتاعة كل jutsu قدام كاميرا اللابتوب.

- الصور **رسومات توضيحية (illustrations)**، **مش screenshots** من الأنمي أو المانجا.
- الصور دي **عشاننا إحنا**، عشان نتعلم الحركة. **الموديل مش بيتعلم منها.** الموديل بيتعلم من تسجيلاتنا بالكاميرا، والجزء ده لسه ماتعملش (شوف آخر قسم في الملف ده).

---

## 1. الـ 4 Jutsu

| Jutsu | Step 1 → Step 2 → Step 3 → Step 4 | الحالة | جاي منين؟ | الشرح |
|---|---|---|---|---|
| Fire Style: Great Fireball | Monkey → Boar → Horse → Tiger | **رسمي (Official)** | آخر 4 seals ورا بعض من التسلسل الرسمي (6 seals): Snake → Ram → **Monkey → Boar → Horse → Tiger**. أول ظهور: مانجا فصل 7، أنمي حلقة 5 | [fire_style](fire_style/instructions.md) |
| Chidori | Snake → Dog → Tiger → Monkey | **رسمي (Official)** | آخر 4 seals ورا بعض من نسخة الـ 9 seals: Monkey → Dragon → Rat → Bird → Ox → **Snake → Dog → Tiger → Monkey** (مرجعها أنمي حلقة 67) | [chidori](chidori/instructions.md) |
| Shadow Clone | Ram → Snake → Tiger → Clone seal | **مخصص (Custom)** | الـ jutsu ده رسمياً **seal واحد بس**. Steps 1-3 هما الـ seals الرسمية بتاعة Clone Technique العادي، و Step 4 هو الـ Clone seal الرسمي. **التجميعة نفسها بتاعتنا** | [shadow_clone](shadow_clone/instructions.md) |
| Rasengan | Clone seal → Dog → Horse → Rasengan palm | **مخصص (Custom)** | الـ Rasengan رسمياً **مالوش hand seals خالص**، فالتسلسل كله بتاعنا | [rasengan](rasengan/instructions.md) |

**كل jutsu بيبدأ بحركة مختلفة** (Monkey / Snake / Ram / Clone seal)، عشان مايحصلش لخبطة بين الـ jutsu من أول خطوة.

**الترتيب مهم:** فيه jutsu بيستخدموا نفس الحركات بترتيب مختلف. مثلاً Fire فيه Monkey في الأول و Tiger في الآخر، و Chidori فيه Tiger وبعده Monkey في الآخر. البرنامج لازم يفرّق بالترتيب، مش بالحركات بس.

---

## 2. يعني إيه Official و Custom؟

| الحالة | المعنى |
|---|---|
| **رسمي (Official)** | الـ seals وترتيبهم موجودين في المصدر، وعليهم مرجع لفصل مانجا أو حلقة أنمي. إحنا **ماغيّرناش** الترتيب |
| **مخصص (Custom)** | التسلسل ده **إحنا اللي عملناه** لـ SHINOBI AI، لأن المصدر مافيهوش 4 seals للـ jutsu ده. ممكن يكون مبني من seals رسمية، بس **التجميعة نفسها مش رسمية**، ومكتوب ده على كل صورة |

### القواعد اللي مشينا عليها

1. **عمرنا ما بنخترع seal ونقول إنه رسمي.**
2. لو المصدر فيه **4 seals أو أكتر ورا بعض**: بناخد 4 ورا بعض **بنفس ترتيبهم**.
3. لو المصدر فيه **أقل من 4**: بنعمل تسلسل custom، ونكتب عليه **Custom** بوضوح.
4. الأولوية: حركات **سهلة**، و**شكلها مختلف** عن بعض، و**تبان كويس** في كاميرا اللابتوب.

### حدود البحث

- المصدر الأساسي هو [Narutopedia](https://naruto.fandom.com/wiki/Hand_Seal). ده wiki بيكتبه المعجبين، بس كل تسلسل استخدمناه عليه مرجع لفصل مانجا أو حلقة أنمي، ومكتوب جنبه في ملفات الشرح.
- **إحنا ماشفناش الحلقات والفصول دي بنفسنا.** اعتمدنا على المراجع اللي في Narutopedia، وقارنّاها بجدول [jutsu.csv](https://github.com/Kazuhito00/NARUTO-HandSignDetection/blob/main/setting/jutsu.csv) في مشروع NARUTO-HandSignDetection لما كان الـ jutsu موجود فيه.
- تسلسلات الـ Chidori الاتنين مرجعهم **حلقات أنمي** (67 و 134)، مش المانجا.

---

## 3. الحركات المستخدمة (9 حركات)

| الحركة | الاسم الياباني | الإيدين | بتتستخدم في | الرسمة الأصلية على Commons |
|---|---|---|---|---|
| Ram | Hitsuji · 未 | الاتنين | Shadow Clone (Step 1) | [Mudra-Naruto-Chevre.svg](https://commons.wikimedia.org/wiki/File:Mudra-Naruto-Chevre.svg) |
| Snake | Mi · 巳 | الاتنين | Chidori (Step 1)، Shadow Clone (Step 2) | [Mudra-Naruto-Serpent.svg](https://commons.wikimedia.org/wiki/File:Mudra-Naruto-Serpent.svg) |
| Tiger | Tora · 寅 | الاتنين | Fire (Step 4)، Chidori (Step 3)، Shadow Clone (Step 3) | [Mudra-Naruto-Tigre.svg](https://commons.wikimedia.org/wiki/File:Mudra-Naruto-Tigre.svg) |
| Dog | Inu · 戌 | الاتنين | Chidori (Step 2)، Rasengan (Step 2) | [Mudra-Naruto-Chien.svg](https://commons.wikimedia.org/wiki/File:Mudra-Naruto-Chien.svg) |
| Monkey | Saru · 申 | الاتنين | Fire (Step 1)، Chidori (Step 4) | [Mudra-Naruto-Singe.svg](https://commons.wikimedia.org/wiki/File:Mudra-Naruto-Singe.svg) |
| Boar | I · 亥 | الاتنين | Fire (Step 2) | [Mudra-Naruto-Cochon.svg](https://commons.wikimedia.org/wiki/File:Mudra-Naruto-Cochon.svg) |
| Horse | Uma · 午 | الاتنين | Fire (Step 3)، Rasengan (Step 3) | [Mudra-Naruto-Cheval.svg](https://commons.wikimedia.org/wiki/File:Mudra-Naruto-Cheval.svg) |
| Clone seal | Kage Bunshin · 影分身 | الاتنين | Shadow Clone (Step 4)، Rasengan (Step 1) | [Mudra-Naruto-KageBunshin.svg](https://commons.wikimedia.org/wiki/File:Mudra-Naruto-KageBunshin.svg) |
| Rasengan palm | (pose مخصص، مش seal) | واحدة | Rasengan (Step 4) | رسمة بتاعتنا (شوف قسم الترخيص) |

أسماء الملفات على Commons بالفرنساوي: Chevre = ماعز (Ram)، Serpent = Snake، Tigre = Tiger، Chien = Dog، Singe = Monkey، Cochon = خنزير (Boar)، Cheval = Horse.

**مهم:** نعمل كل حركة **بنفس الشكل كل مرة**: نفس الإيد فوق، ونفس الإيد قدام، ونفس الإيد اللي بتقف. الموديل هيتعلم الشكل اللي هنسجّله، فلو غيّرناه بعدين ممكن مايعرفوش.

---

## 4. ترتيب الفولدر

```
gesture_references/
├── README.md                  ← الملف ده
├── fire_style/
│   ├── step_1.png ... step_4.png   ← صورة لكل خطوة
│   ├── sequence_reference.png      ← الأربع خطوات في صورة واحدة بالترتيب
│   └── instructions.md             ← الشرح خطوة خطوة
├── chidori/          (نفس الملفات)
├── shadow_clone/     (نفس الملفات)
├── rasengan/         (نفس الملفات)
└── _sources/signs/   ← الرسومات الأصلية من Wikimedia Commons كـ PNG (ملف لكل حركة)
```

كل الصور بيعملها الـ script ده من الأول: [tools/build_gesture_references.py](../tools/build_gesture_references.py)

```powershell
.venv\Scripts\python.exe tools\build_gesture_references.py
```

---

## 5. الترخيص وحقوق الصور

- **رسومات الـ 8 seals** (Ram, Snake, Tiger, Dog, Monkey, Boar, Horse, Clone seal): رسمها **Schlum** على Wikimedia Commons، ومعمولة من صور فوتوغرافية (vectorized from photographs). الترخيص [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
- **إحنا عدّلناها:** قصّيناها وحطيناها على كروت فيها أرقام الخطوات والأسماء والشرح. عشان كده الصور الناتجة (`step_*.png` و `sequence_reference.png`) برضه **CC BY-SA 4.0**، ولو حد نشرها لازم يذكر المصدر ويحافظ على نفس الترخيص.
- **رسمة الـ Rasengan palm بتاعتنا:** اتعملت من frame واحد من تسجيل الإيد بتاعتنا (نقط MediaPipe) في `data/landmarks/rasengan/me_day_20261030_174647.npz`.
- **مافيش أي screenshot من الأنمي أو المانجا** في الفولدر ده.

سطر الـ attribution اللي بنستخدمه:

> Hand-seal illustrations: Schlum, Wikimedia Commons, [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), vectorized from photographs. Cropped and placed on labelled cards for SHINOBI AI.

---

## 6. لسه ماخلصش

لازم نبقى واضحين في الحتة دي:

- **التعرّف على الـ seals دي لسه مش متعمل ولا متدرّب.** البرنامج الحالي (`shinobi.main`) لسه شغال بالحركات القديمة (كف مفتوح، مخلب، علامة OK، علامة +) وبالكيبورد.
- **مافيش ولا تسجيل** لأي seal من الـ 7 seals الرسمية اللي هنا (Ram, Snake, Tiger, Dog, Monkey, Boar, Horse).
- **التوقيتات** المكتوبة في ملفات الشرح (مدة التثبيت، الوقت بين الحركات، الـ reset، الـ cooldown) **مخططة بس**، ولسه هتتنفذ وتتظبط وتتجرب.

### الداتا الموجودة هتتستخدم إزاي؟

وقت كتابة الملف ده (30 أكتوبر 2026). **مفيش أي داتا اتمسحت.**

| الفولدر | الحركة | عدد الـ sessions | في التصميم الجديد |
|---|---|---|---|
| `data/landmarks/rasengan/` | كف مفتوح | 4 | **هتتستخدم** كـ `rasengan_palm` (Step 4 في Rasengan) |
| `data/landmarks/clone_seal/` | علامة + بالإيدين | 0 | أي sessions تتسجل بأداة التسجيل القديمة **هتفضل صالحة** لـ `clone_seal` |
| `data/landmarks/chidori/` | مخلب | 4 | **محفوظة**، بس التسلسلات الجديدة مش بتستخدمها |
| `data/landmarks/fire/` | علامة OK | 4 | **محفوظة**، بس التسلسلات الجديدة مش بتستخدمها |
| `data/landmarks/idle/` | مفيش حركة | 0 (الفولدر لسه مااتعملش) | لسه محتاجين نسجّله. ده أهم class ضد التشغيل بالغلط |
| `data/_discarded/` | كف مفتوح بالإيدين | 2 | اتسجلوا تحت اسم غلط (`clone_seal`)، فنقلناهم برّه داتا التدريب من غير ما نمسحهم |
