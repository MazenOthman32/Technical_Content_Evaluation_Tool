# Golden Dataset

ضع كل حالة اختبار في مجلد فرعي يحتوي:

- `expected.json` — الملاحظات المرجعية
- `detected.json` أو `report.json` — مخرجات الأداة (للتقييم دون إعادة تشغيل كاملة)
- اختيارياً: الفيديو و`course.yaml` لتشغيل مراجعة حقيقية لاحقاً

تشغيل التقييم:

```powershell
video-reviewer eval --golden golden/ --out results/
```
