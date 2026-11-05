# Session Reviewer — مراجعة تقنية لسيشنات كورس الـ AI

أداة بتاخد لينك Google Drive لتسجيل سيشن (أو فولدر فيه كذا سيشن)، وبتطلعلك تقرير بالأخطاء التقنية اللي المحاضر قالها، بالتوقيت بالظبط، والصح إيه، ودرجة الخطورة.

## بتشتغل إزاي

1. **تنزيل** الفيديو من Drive
2. **استخراج الصوت** وتقسيمه لأجزاء كل واحد 10 دقايق
3. **التفريغ بتوقيتات** بـ Whisper، مع hint إن الكلام عامية مصرية مخلوطة بمصطلحات إنجليزي
4. **مراجعة أولى**: Claude يراجع كل 4 دقايق لوحدهم (مع تداخل 30 ثانية) ويطلع الأخطاء المحتملة
5. **مراجعة تانية (تحقق)**: Claude يشوف السيشن كاملة ويقرر لكل ملاحظة: خطأ فعلي / المحاضر صححه بعد كده / مش خطأ / مكرر
6. **تقرير HTML** مرتب بالوقت، مع فلتر حسب درجة الخطورة

## التجهيز (مرة واحدة)

محتاج Python 3.10+ و **ffmpeg** على الجهاز:

- Windows: `winget install ffmpeg`
- Mac: `brew install ffmpeg`
- Linux: `sudo apt install ffmpeg`

```bash
pip install -r requirements.txt
cp .env.example .env      # وحط فيه الـ API keys
```

- `ANTHROPIC_API_KEY` للمراجعة (من console.anthropic.com)
- `OPENAI_API_KEY` للتفريغ (من platform.openai.com) — أو استخدم التفريغ المحلي المجاني (تحت)

## الاستخدام

**مهم:** الملف أو الفولدر على Drive لازم يكون متشير **"Anyone with the link can view"**.

```bash
# سيشن واحدة
python session_reviewer.py "https://drive.google.com/file/d/XXXX/view" --topic "Session 5: Neural Networks"

# فولدر كامل (لحد 50 ملف)
python session_reviewer.py "https://drive.google.com/drive/folders/XXXX" --topic "AI Course - Module 2"

# مع الـ slides كمرجع (بيرفع الدقة جداً)
python session_reviewer.py "<link>" --topic "CNNs" --reference slides/session5.pdf

# ملف على جهازك
python session_reviewer.py videos/session5.mp4 --topic "CNNs"
```

النتايج بتتحفظ في `reports/<اسم السيشن>/`:

| الملف | فيه إيه |
|---|---|
| `report.html` | التقرير النهائي، افتحه في المتصفح |
| `findings.json` | نفس الملاحظات بصيغة JSON (لو عايز تعمل Dashboard أو تحطها في شيت) |
| `transcript.txt` | التفريغ الكامل بالتوقيتات |

## خيارات مفيدة

| الخيار | استخدامه |
|---|---|
| `--glossary "LangChain, RAG, LoRA, Hugging Face"` | مصطلحات خاصة بالسيشن عشان التفريغ يكتبها صح |
| `--backend local` | تفريغ مجاني على جهازك بـ faster-whisper (`pip install faster-whisper`). أبطأ، ويفضل GPU |
| `--min-confidence 0.8` | يظهر بس الملاحظات اللي النموذج متأكد منها جداً (الافتراضي 0.6) |
| `--model ...` | تغيير موديل Claude المستخدم في المراجعة |
| `--no-verify` | تخطي مرحلة التحقق (أسرع وأرخص، بس ملاحظات غلط أكتر) |
| `--retranscribe` | إعادة التفريغ (التفريغ بيتحفظ، فإعادة المراجعة مش بتدفع تفريغ تاني) |

## نصايح عشان النتايج تبقى أدق

- **ادّيها الـ slides أو المنهج** بـ `--reference`، ده أكبر فرق في الدقة.
- **سيب `--language` فاضي** للميكس. لو حطيت `ar` ممكن المصطلحات الإنجليزي تتكتب بحروف عربي.
- **جرّب على سيشن واحدة الأول** وبص على `transcript.txt`: لو التفريغ ضعيف، ضيف مصطلحات في `--glossary`.
- **راجع التقرير قبل ما يوصل للمحاضر**: التفريغ الأوتوماتيك ممكن يغلط، والنموذج ممكن يعتبر تبسيط مقصود خطأ.

## الحدود الحالية

- بيعتمد على **الصوت بس**: لو فيه كود أو معادلة غلط مكتوبة على الشاشة ومتقالتش بالصوت، مش هيشوفها (تطوير قادم: تحليل frames من الفيديو).
- الفولدرات بتنزل لحد 50 ملف في المرة (حد من gdown).
- الملفات الخاصة (مش متشيرة بلينك) محتاجة تتنزل يدوي، أو نضيف ربط بـ Google Drive API بـ service account.
