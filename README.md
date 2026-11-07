# Instant Plus Video Reviewer

أداة ضمان جودة تقنية بمساعدة الذكاء الاصطناعي لمراجعة فيديوهات المحتوى التعليمي قبل النشر على Instant Plus.

**المبدأ:** مراجعة مساعدة بالذكاء الاصطناعي، واعتماد بشري نهائي. التقرير النظيف لا يعني أن المحتوى صحيح 100%.

## المتطلبات

- Python 3.11+
- FFmpeg و FFprobe
- Tesseract OCR مع حزم اللغات `ara` و `eng`
- مفتاح Anthropic API

### Windows (مثال)

```powershell
winget install ffmpeg
winget install UB-Mannheim.TesseractOCR
```

تأكد أن مسارات FFmpeg و Tesseract في `PATH`.

## التثبيت

```powershell
cd "c:\Users\omaze\OneDrive\Desktop\Final Evaluation Tool"
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
pip install -e .
copy .env.example .env
# ضع ANTHROPIC_API_KEY في .env
```

## الاستخدام

### CLI — مراجعة فيديو

```powershell
video-reviewer review .\lesson.mp4 --course course.example.yaml --config config.example.yaml --max-cost 4
```

### CLI — الواجهة المحلية

```powershell
video-reviewer ui
```

ثم افتح: http://127.0.0.1:8765

### CLI — تقييم Golden Dataset

```powershell
video-reviewer eval --golden golden/ --out results/
```

### الاختبارات

```powershell
pytest -q
```

## مخرجات المراجعة

لكل مراجعة في `data/reviews/<review_id>/`:

| الملف | المحتوى |
|---|---|
| `report.md` | تقرير عربي منسّق |
| `report.json` | التقرير الكامل وفق المخطط |
| `dropped_issues.json` | ملاحظات أُسقطت لعدم تحقق الأدلة |
| `transcript.json` / `frames/` / `ocr.json` | قطع وسيطة قابلة للاستئناف |
| `meta.json` | حالة المعالجة والبيانات الوصفية |

## مسار المعالجة

1. استخراج الصوت  
2. التفريغ (faster-whisper)  
3. استخراج الإطارات  
4. OCR  
5. تقسيم الدروس  
6. المراجعة التقنية  
7. تحقق الأدلة (rapidfuzz)  
8. حكم حتمي  
9. توليد التقارير  

## ملاحظات Phase 1

- لا يوجد اعتماد/رفض تلقائي للنشر.
- لا يوجد قبول/رفض بشري دائم للملاحظات الفردية بعد.
- Google Drive من الأداة القديمة خارج النطاق.
- الملف [`session_reviewer.py`](session_reviewer.py) مرجع legacy مؤقت.

## الهوية البصرية

الشعار الرسمي Instant+ موجود في:

`video_reviewer/static/brand/instant-plus-logo.png`
