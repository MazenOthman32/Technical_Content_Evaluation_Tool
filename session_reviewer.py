#!/usr/bin/env python3
"""
Session Reviewer
================
بتاخد لينك Google Drive لتسجيل سيشن (أو فولدر سيشنات)، وبتفرّغ الكلام بتوقيتات،
وبتراجعه بـ Claude عشان تطلع الأخطاء التقنية اللي المحاضر قالها، في تقرير HTML مفصل.

الاستخدام:
    python session_reviewer.py "<drive link>" --topic "Session 5: Neural Networks"
    python session_reviewer.py "<drive folder link>" --topic "AI Course" --reference slides.pdf
    python session_reviewer.py path/to/local_video.mp4 --topic "..."
"""

from __future__ import annotations

import argparse
import datetime as dt
import difflib
import html
import json
import math
import os
import re
import subprocess
import sys
from pathlib import Path

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass

MEDIA_EXT = {".mp4", ".mkv", ".mov", ".webm", ".avi", ".m4v", ".m4a", ".mp3", ".wav", ".aac"}
GROQ_BASE_URL = "https://api.groq.com/openai/v1"
DEFAULT_MODELS = {
    "groq": "openai/gpt-oss-120b",      # مجاني على Groq
    "anthropic": "claude-sonnet-5-5",   # مدفوع، أدق
}
AUDIO_SEGMENT_SEC = 600  # 10 دقايق لكل جزء صوتي (تحت حد الـ 25MB)
CHUNK_WINDOW_SEC = 480   # كل جزء مراجعة = 8 دقايق (سياق أكبر = فهم أحسن للمعنى)
CHUNK_OVERLAP_SEC = 30

TRANSCRIBE_HINT = (
    "محاضرة في كورس ذكاء اصطناعي بالعامية المصرية مع مصطلحات تقنية بالإنجليزي، "
    "زي machine learning, deep learning, neural network, gradient descent, backpropagation, "
    "overfitting, loss function, transformer, attention, embeddings, LLM, fine-tuning, "
    "Python, NumPy, PyTorch, TensorFlow, scikit-learn."
)


# ----------------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------------

def log(msg: str) -> None:
    print(f"[{dt.datetime.now():%H:%M:%S}] {msg}", flush=True)


def fmt_ts(seconds: float) -> str:
    seconds = max(0, int(round(seconds)))
    return f"{seconds // 3600:02d}:{(seconds % 3600) // 60:02d}:{seconds % 60:02d}"


def ts_to_sec(ts: str) -> float:
    parts = [float(p) for p in str(ts).strip().split(":")]
    sec = 0.0
    for p in parts:
        sec = sec * 60 + p
    return sec


def run(cmd: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, check=True, capture_output=True, text=True)


def probe_duration(path: Path) -> float:
    out = run([
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", str(path),
    ]).stdout.strip()
    return float(out)


def extract_json(text: str) -> dict:
    """يطلع أول JSON object من رد النموذج حتى لو حوالينه كلام."""
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text)
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("No JSON object found in model response")
    return json.loads(text[start:end + 1])


# ----------------------------------------------------------------------------
# 1) Google Drive
# ----------------------------------------------------------------------------

def parse_drive_link(url: str) -> tuple[str, str]:
    m = re.search(r"/folders/([a-zA-Z0-9_-]+)", url)
    if m:
        return "folder", m.group(1)
    for pat in (r"/file/d/([a-zA-Z0-9_-]+)", r"[?&]id=([a-zA-Z0-9_-]+)", r"/d/([a-zA-Z0-9_-]+)"):
        m = re.search(pat, url)
        if m:
            return "file", m.group(1)
    raise ValueError(f"مش قادر أفهم لينك الـ Drive ده: {url}")


def download_from_drive(url: str, out_dir: Path) -> list[Path]:
    import gdown

    kind, fid = parse_drive_link(url)
    out_dir.mkdir(parents=True, exist_ok=True)
    share_hint = (
        "اتأكد إن الملف/الفولدر متشير 'Anyone with the link can view' "
        "(أو نزّله يدوي وادّي الأداة مسار الملف)."
    )
    if kind == "file":
        log(f"تنزيل الملف من Drive ({fid}) ...")
        path = gdown.download(id=fid, output=str(out_dir) + os.sep, quiet=False)
        if not path:
            raise RuntimeError("فشل التنزيل. " + share_hint)
        return [Path(path)]

    log(f"تنزيل الفولدر من Drive ({fid}) ...")
    paths = gdown.download_folder(id=fid, output=str(out_dir), quiet=False)
    if not paths:
        raise RuntimeError("فشل تنزيل الفولدر. " + share_hint)
    media = sorted(Path(p) for p in paths if Path(p).suffix.lower() in MEDIA_EXT)
    if not media:
        raise RuntimeError("الفولدر مفيهوش ملفات فيديو أو صوت.")
    return media


# ----------------------------------------------------------------------------
# 2) Audio + Transcription
# ----------------------------------------------------------------------------

def extract_audio(media: Path, out: Path) -> Path:
    log("استخراج الصوت من الفيديو ...")
    run(["ffmpeg", "-y", "-i", str(media), "-vn", "-ac", "1", "-ar", "16000",
         "-b:a", "32k", str(out)])
    return out


def transcribe_api(audio: Path, work: Path, prompt: str, language: str | None,
                   backend: str = "groq") -> list[dict]:
    from openai import OpenAI

    if backend == "groq":
        client = OpenAI(api_key=os.getenv("GROQ_API_KEY"), base_url=GROQ_BASE_URL, max_retries=10)
        stt_model = "whisper-large-v3"
    else:
        client = OpenAI(max_retries=5)
        stt_model = "whisper-1"
    total = probe_duration(audio)
    n = max(1, math.ceil(total / AUDIO_SEGMENT_SEC))
    segments: list[dict] = []
    for i in range(n):
        offset = i * AUDIO_SEGMENT_SEC
        part = work / f"part_{i:03d}.mp3"
        run(["ffmpeg", "-y", "-ss", str(offset), "-t", str(AUDIO_SEGMENT_SEC),
             "-i", str(audio), "-c", "copy", str(part)])
        log(f"تفريغ الجزء {i + 1}/{n} ...")
        kwargs = dict(model=stt_model, response_format="verbose_json",
                      timestamp_granularities=["segment"], prompt=prompt)
        if language:
            kwargs["language"] = language
        with open(part, "rb") as f:
            res = client.audio.transcriptions.create(file=f, **kwargs)
        for s in getattr(res, "segments", None) or []:
            get = (lambda k: s[k]) if isinstance(s, dict) else (lambda k: getattr(s, k))
            text = get("text").strip()
            if text:
                segments.append({"start": get("start") + offset, "end": get("end") + offset, "text": text})
    return segments


def transcribe_local(audio: Path, prompt: str, language: str | None, model_size: str) -> list[dict]:
    from faster_whisper import WhisperModel

    log(f"تحميل موديل Whisper المحلي ({model_size}) ...")
    model = WhisperModel(model_size, device="auto", compute_type="default")
    log("التفريغ المحلي شغال (ممكن ياخد وقت على CPU) ...")
    segs, _info = model.transcribe(str(audio), initial_prompt=prompt, vad_filter=True,
                                   language=language)
    return [{"start": s.start, "end": s.end, "text": s.text.strip()} for s in segs if s.text.strip()]


def transcript_lines(segments: list[dict]) -> str:
    return "\n".join(f"[{fmt_ts(s['start'])}] {s['text']}" for s in segments)


# ----------------------------------------------------------------------------
# 3) Review with Claude
# ----------------------------------------------------------------------------

REVIEW_SYSTEM = """You are a senior AI/ML engineer and an experienced instructor, reviewing a recorded lecture from an AI course for technical accuracy.

You receive a time-stamped, AUTOMATICALLY transcribed excerpt. The lecturer speaks Egyptian Arabic mixed with English technical terms, so the transcript has transcription noise (misheard words, English terms written in Arabic letters, broken sentences).

## Judge the MEANING, not the wording
Spoken teaching is messy. Lecturers rephrase, go around in circles, restart sentences, use loose or informal phrasing, and sometimes swap a word and keep going. None of that is a mistake.

For every idea the lecturer explains, ask yourself:
"After hearing this WHOLE explanation (all the related sentences, the example, the numbers), what would an attentive student understand? Is THAT understanding technically wrong?"
Flag only when the answer is clearly yes.

How to work:
1. Read the whole excerpt first and list (to yourself) the ideas being taught.
2. For each idea, reconstruct the message the lecturer actually conveyed across all the related sentences, never from one sentence in isolation.
3. Flag it only if that conveyed message is wrong, or a wrong claim is clearly stated as a teaching point and not fixed anywhere in the excerpt.

## Do NOT flag
- Slips of the tongue or swapped words when the surrounding explanation, example or numbers show the lecturer understands it correctly (e.g. he says "true negative" once, but his example and the rest of the explanation clearly describe a false negative correctly).
- Roundabout, repetitive, informal or imprecise phrasing whose intended meaning is correct.
- Loose wording an expert would recognise as an informal way of saying something correct, unless it would genuinely leave students with a wrong idea.
- Deliberate simplifications, analogies and intuition-building.
- Statements that only make sense with what is on screen ("this one here", "this column"), which you cannot see, unless the spoken explanation is itself contradictory.
- Transcription errors, language, style, pacing, teaching method.
- Anything corrected or clarified elsewhere in the excerpt.

If you are unsure whether it is a real misunderstanding or just messy speech, do NOT flag it. Few, high-value findings are the goal; an empty list is a perfectly good answer.

Respond with ONLY a JSON object:
{"findings": [{
  "timestamp": "HH:MM:SS",          // transcript line where the wrong idea is taught
  "meaning": "...",                  // the idea the lecturer conveyed, paraphrased in 1-2 sentences (Egyptian Arabic, English terms)
  "quote": "...",                    // one short key quote from the transcript
  "issue": "...",                    // why that conveyed idea is wrong — Egyptian Arabic, English technical terms
  "correction": "...",               // the correct idea — same style
  "category": "concept|math|code|tooling|terminology|other",
  "severity": "minor|moderate|major",// major = core concept taught wrong
  "confidence": 0.0                  // 0-1, how sure you are students would leave with a wrong understanding
}]}
Return {"findings": []} if there are no real mistakes."""

VERIFY_SYSTEM = """You are the second, senior reviewer in a technical-accuracy audit of an AI course lecture (Egyptian Arabic mixed with English, auto-transcribed, so wording is noisy).

A first reviewer saw only short excerpts and may have been too literal: flagging a slip of the tongue, a messy or roundabout explanation, or loose wording, even though the lecturer's overall meaning was correct. Your job is to filter those out.

For each candidate, read the surrounding minutes of the transcript and judge the MEANING the lecturer conveyed as a whole: what would an attentive student watching this part understand?

Verdicts:
- "keep": a student would come away with a technically wrong understanding, and it is not fixed later.
- "corrected": it was a real wrong idea, but the lecturer clearly corrects or clarifies it later (put the timestamp of the correction in the note).
- "drop": the overall meaning is correct or acceptable (slip of the tongue, messy phrasing, informal wording, simplification, depends on the screen, transcription noise), or the first reviewer is wrong.
- "duplicate": same issue as another candidate (put that id in the note).

When in doubt between "keep" and "drop", choose "drop".
You may rewrite meaning/issue/correction to be clearer and more accurate.

Respond with ONLY a JSON object:
{"verdicts": [{"id": 1, "verdict": "keep|corrected|drop|duplicate", "note": "short reason in Egyptian Arabic", "meaning": "optional", "issue": "optional", "correction": "optional"}]}"""


def make_chunks(segments: list[dict], window: int = CHUNK_WINDOW_SEC,
                overlap: int = CHUNK_OVERLAP_SEC) -> list[list[dict]]:
    if not segments:
        return []
    chunks, t, end = [], 0.0, segments[-1]["end"]
    step = max(1, window - overlap)
    while t == 0 or t < end - overlap:  # آخر جزء مايبقاش مجرد تكرار للتداخل
        part = [s for s in segments if s["end"] > t and s["start"] < t + window]
        if part:
            chunks.append(part)
        t += step
    return chunks


def session_context(topic: str, reference: str | None) -> str:
    ctx = f"Session topic: {topic}\n"
    if reference:
        ctx += ("\nOfficial reference material for this session (slides/curriculum). "
                "Use it to understand what is being taught; the reference itself can also contain errors.\n"
                f"<reference>\n{reference}\n</reference>\n")
    return ctx


class LLM:
    """واجهة موحدة: Groq (مجاني) أو Anthropic Claude (مدفوع)."""

    def __init__(self, provider: str, model: str):
        self.provider, self.model = provider, model
        if provider == "anthropic":
            import anthropic

            self.client = anthropic.Anthropic(max_retries=5)
        else:
            from openai import OpenAI

            # max_retries عالي عشان حدود الدقيقة في الـ free tier — المكتبة بتستنى وتعيد لوحدها
            self.client = OpenAI(api_key=os.getenv("GROQ_API_KEY"), base_url=GROQ_BASE_URL, max_retries=12)

    def _text(self, system: str, user: str, max_tokens: int) -> str:
        if self.provider == "anthropic":
            resp = self.client.messages.create(model=self.model, max_tokens=max_tokens, system=system,
                                               messages=[{"role": "user", "content": user}])
            return "".join(b.text for b in resp.content if getattr(b, "type", "") == "text")
        kwargs = {}
        if "gpt-oss" in self.model:
            kwargs["reasoning_effort"] = "medium"
        resp = self.client.chat.completions.create(
            model=self.model, max_tokens=max_tokens,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            **kwargs)
        return resp.choices[0].message.content or ""

    def json(self, system: str, user: str, max_tokens: int) -> dict:
        last_err = None
        for _ in range(3):
            try:
                return extract_json(self._text(system, user, max_tokens))
            except (ValueError, json.JSONDecodeError) as e:
                last_err = e
            except Exception as e:
                if "rate" in str(e).lower() and ("day" in str(e).lower() or "TPD" in str(e)):
                    raise RuntimeError("خلصت الحصة المجانية بتاعة النهارده على Groq — كمّل بكرة "
                                       "(التفريغ بيتحفظ فمش هيتعاد).") from e
                raise
        raise RuntimeError(f"النموذج مارجعش JSON سليم: {last_err}")


def review_chunks(llm: LLM, chunks: list[list[dict]], ctx: str) -> list[dict]:
    findings = []
    for i, chunk in enumerate(chunks, 1):
        log(f"مراجعة الجزء {i}/{len(chunks)} ({fmt_ts(chunk[0]['start'])} → {fmt_ts(chunk[-1]['end'])}) ...")
        user = f"{ctx}\n<transcript_excerpt>\n{transcript_lines(chunk)}\n</transcript_excerpt>"
        data = llm.json(REVIEW_SYSTEM, user, max_tokens=3000)
        for f in data.get("findings", []):
            if f.get("timestamp") and f.get("issue"):
                findings.append(f)
    return findings


def dedupe(findings: list[dict]) -> list[dict]:
    """يشيل التكرار الناتج عن التداخل بين الأجزاء."""
    findings = sorted(findings, key=lambda f: ts_to_sec(f["timestamp"]))
    kept: list[dict] = []
    for f in findings:
        dup = None
        for k in kept:
            near = abs(ts_to_sec(k["timestamp"]) - ts_to_sec(f["timestamp"])) <= 45
            similar = difflib.SequenceMatcher(None, k.get("quote", ""), f.get("quote", "")).ratio() > 0.55
            if near and similar:
                dup = k
                break
        if dup is None:
            kept.append(f)
        elif float(f.get("confidence", 0)) > float(dup.get("confidence", 0)):
            kept[kept.index(dup)] = f
    return kept


def verify(llm: LLM, findings: list[dict], segments: list[dict], ctx: str) -> list[dict]:
    if not findings:
        return []
    numbered = [{"id": i + 1, **f} for i, f in enumerate(findings)]
    by_id: dict = {}

    if llm.provider == "anthropic" and len(transcript_lines(segments)) < 600_000:
        # Claude: نبعت السيشن كاملة مرة واحدة
        log(f"مرحلة التحقق على السيشن كاملة ({len(findings)} ملاحظة مبدئية) ...")
        user = (f"{ctx}\n<full_transcript>\n{transcript_lines(segments)}\n</full_transcript>\n\n"
                f"<candidates>\n{json.dumps(numbered, ensure_ascii=False, indent=1)}\n</candidates>")
        data = llm.json(VERIFY_SYSTEM, user, max_tokens=8000)
        by_id = {v.get("id"): v for v in data.get("verdicts", [])}
    else:
        # الـ free tier ليه حد صغير للـ tokens في الدقيقة، فبنتحقق من كل ملاحظة لوحدها
        # بالكلام اللي قبلها بدقيقة واللي بعدها بـ 8 دقايق (عشان نمسك لو المحاضر صحح نفسه)
        for item in numbered:
            t = ts_to_sec(item["timestamp"])
            window = [s for s in segments if t - 240 <= s["start"] <= t + 480]
            log(f"تحقق من الملاحظة {item['id']}/{len(numbered)} ({item['timestamp']}) ...")
            user = (f"{ctx}\n<transcript>\n{transcript_lines(window)}\n</transcript>\n\n"
                    f"<candidates>\n{json.dumps([item], ensure_ascii=False, indent=1)}\n</candidates>")
            data = llm.json(VERIFY_SYSTEM, user, max_tokens=1500)
            for v in data.get("verdicts", []):
                by_id[item["id"]] = v

    out = []
    for item in numbered:
        v = by_id.get(item["id"], {"verdict": "keep"})
        item["verdict"] = v.get("verdict", "keep")
        item["verify_note"] = v.get("note", "")
        for key in ("meaning", "issue", "correction"):
            if v.get(key):
                item[key] = v[key]
        out.append(item)
    return out


# ----------------------------------------------------------------------------
# 4) Report
# ----------------------------------------------------------------------------

SEV_LABEL = {"major": "جوهري", "moderate": "متوسط", "minor": "بسيط"}
SEV_ORDER = {"major": 0, "moderate": 1, "minor": 2}


def render_report(title: str, topic: str, source: str, duration: float, findings: list[dict],
                  model: str, out: Path) -> Path:
    e = html.escape
    active = [f for f in findings if f.get("verdict", "keep") == "keep"]
    corrected = [f for f in findings if f.get("verdict") == "corrected"]
    active.sort(key=lambda f: ts_to_sec(f["timestamp"]))
    counts = {s: sum(1 for f in active if f.get("severity") == s) for s in SEV_LABEL}

    def card(f: dict, extra_class: str = "") -> str:
        sev = f.get("severity", "minor")
        conf = float(f.get("confidence", 0))
        note = f.get("verify_note", "")
        return f"""
        <article class="card {e(sev)} {extra_class}" data-sev="{e(sev)}">
          <header>
            <span class="ts" dir="ltr">{e(f['timestamp'])}</span>
            <span class="badge {e(sev)}">{e(SEV_LABEL.get(sev, sev))}</span>
            <span class="cat" dir="ltr">{e(f.get('category', ''))}</span>
            <span class="conf" title="درجة ثقة المراجعة">ثقة {conf:.0%}</span>
          </header>
          {f'<div class="row meaning"><b>الفكرة اللي وصلت للطلاب:</b> <span dir="auto">{e(f["meaning"])}</span></div>' if f.get("meaning") else ''}
          <blockquote dir="auto">“{e(f.get('quote', ''))}”</blockquote>
          <div class="row"><b>المشكلة:</b> <span dir="auto">{e(f.get('issue', ''))}</span></div>
          <div class="row ok"><b>الصح:</b> <span dir="auto">{e(f.get('correction', ''))}</span></div>
          {f'<div class="row note"><b>ملاحظة التحقق:</b> {e(note)}</div>' if note else ''}
        </article>"""

    cards = "\n".join(card(f) for f in active) or '<p class="empty">مفيش أخطاء تقنية متأكدين منها في السيشن دي 👌</p>'
    corrected_html = ""
    if corrected:
        corrected_html = ('<h2>أخطاء المحاضر صححها بنفسه بعد كده</h2>'
                          '<p class="muted">مش محتاجة تدخل، بس ممكن تتظبط في التسجيل أو الشرح الجاي.</p>'
                          + "\n".join(card(f, "faded") for f in sorted(corrected, key=lambda f: ts_to_sec(f["timestamp"]))))

    page = f"""<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{e(title)} — مراجعة تقنية</title>
<style>
:root {{ --bg:#f7f7f5; --fg:#1d1d1b; --muted:#6b6b66; --card:#fff; --line:#e4e4df;
        --major:#c0392b; --moderate:#d68910; --minor:#2e86c1; --ok:#1e8449; }}
@media (prefers-color-scheme: dark) {{ :root {{ --bg:#161615; --fg:#ececea; --muted:#9a9a94; --card:#1f1f1d; --line:#33332f; }} }}
* {{ box-sizing:border-box }}
body {{ margin:0; background:var(--bg); color:var(--fg); font:16px/1.7 system-ui,"Segoe UI",Tahoma,sans-serif; }}
main {{ max-width:900px; margin:0 auto; padding:24px 16px 60px; }}
h1 {{ margin:0 0 4px; font-size:1.6rem }} h2 {{ margin-top:40px; font-size:1.2rem }}
.muted {{ color:var(--muted) }}
.meta {{ color:var(--muted); font-size:.9rem; margin-bottom:20px }}
.summary {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(120px,1fr)); gap:10px; margin:20px 0 }}
.stat {{ background:var(--card); border:1px solid var(--line); border-radius:10px; padding:12px; text-align:center; cursor:pointer }}
.stat b {{ display:block; font-size:1.6rem }} .stat.active {{ outline:2px solid var(--fg) }}
.card {{ background:var(--card); border:1px solid var(--line); border-inline-start:5px solid var(--minor);
        border-radius:10px; padding:14px 16px; margin:12px 0 }}
.card.major {{ border-inline-start-color:var(--major) }} .card.moderate {{ border-inline-start-color:var(--moderate) }}
.card.faded {{ opacity:.7 }}
header {{ display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin-bottom:8px }}
.ts {{ font:600 1rem ui-monospace,Consolas,monospace; background:var(--bg); padding:2px 8px; border-radius:6px }}
.badge {{ color:#fff; font-size:.8rem; padding:2px 10px; border-radius:20px; background:var(--minor) }}
.badge.major {{ background:var(--major) }} .badge.moderate {{ background:var(--moderate) }}
.cat,.conf {{ font-size:.8rem; color:var(--muted) }}
blockquote {{ margin:6px 0 10px; padding:8px 12px; background:var(--bg); border-radius:8px; }}
.row {{ margin:4px 0 }} .row.meaning {{ font-weight:500 }} .row.ok b {{ color:var(--ok) }} .row.note {{ font-size:.9rem; color:var(--muted) }}
.empty {{ padding:30px; text-align:center; background:var(--card); border-radius:10px }}
footer {{ margin-top:40px; font-size:.85rem; color:var(--muted) }}
</style>
</head>
<body><main>
  <h1>{e(title)}</h1>
  <div class="meta">الموضوع: {e(topic)} · مدة السيشن: <span dir="ltr">{fmt_ts(duration)}</span> ·
    المصدر: <a href="{e(source)}" dir="ltr">{e(source if len(source) < 70 else source[:67] + '...')}</a></div>

  <div class="summary">
    <div class="stat active" data-filter="all"><b>{len(active)}</b>كل الأخطاء</div>
    <div class="stat" data-filter="major"><b style="color:var(--major)">{counts['major']}</b>جوهري</div>
    <div class="stat" data-filter="moderate"><b style="color:var(--moderate)">{counts['moderate']}</b>متوسط</div>
    <div class="stat" data-filter="minor"><b style="color:var(--minor)">{counts['minor']}</b>بسيط</div>
  </div>

  <h2>الأخطاء التقنية بالترتيب الزمني</h2>
  <section id="active">{cards}</section>
  {corrected_html}

  <footer>اتعمل التقرير ده أوتوماتيك بـ {e(model)} يوم {dt.date.today():%Y-%m-%d}.
  التفريغ الصوتي أوتوماتيك وممكن يكون فيه أخطاء، فراجع كل ملاحظة على التسجيل قبل ما تبعتها للمحاضر.</footer>
</main>
<script>
document.querySelectorAll('.stat').forEach(s => s.addEventListener('click', () => {{
  document.querySelectorAll('.stat').forEach(x => x.classList.remove('active'));
  s.classList.add('active');
  const f = s.dataset.filter;
  document.querySelectorAll('#active .card').forEach(c => c.style.display = (f === 'all' || c.dataset.sev === f) ? '' : 'none');
}}));
</script>
</body></html>"""
    out.write_text(page, encoding="utf-8")
    return out


# ----------------------------------------------------------------------------
# Main
# ----------------------------------------------------------------------------

def load_reference(path: str | None) -> str | None:
    if not path:
        return None
    p = Path(path)
    if p.suffix.lower() == ".pdf":
        from pypdf import PdfReader
        text = "\n".join((pg.extract_text() or "") for pg in PdfReader(str(p)).pages)
    else:
        text = p.read_text(encoding="utf-8", errors="ignore")
    return text[:120_000]


def safe_name(name: str) -> str:
    return re.sub(r"[^\w\-. ]+", "_", name).strip()[:80] or "session"


def process_media(media: Path, args, llm: LLM, reference: str | None) -> Path:
    name = safe_name(media.stem)
    work = Path(args.out) / name
    work.mkdir(parents=True, exist_ok=True)
    tr_path = work / "transcript.json"

    audio = work / "audio.mp3"
    if not audio.exists():
        extract_audio(media, audio)
    duration = probe_duration(audio)

    if tr_path.exists() and not args.retranscribe:
        log("فيه تفريغ محفوظ قبل كده، هستخدمه (استخدم --retranscribe لإعادة التفريغ).")
        segments = json.loads(tr_path.read_text(encoding="utf-8"))
    else:
        prompt = TRANSCRIBE_HINT + (f" {args.glossary}" if args.glossary else "")
        if args.backend == "local":
            segments = transcribe_local(audio, prompt, args.language, args.local_model)
        else:
            segments = transcribe_api(audio, work, prompt, args.language, args.backend)
        tr_path.write_text(json.dumps(segments, ensure_ascii=False, indent=1), encoding="utf-8")
        (work / "transcript.txt").write_text(transcript_lines(segments), encoding="utf-8")

    if not segments:
        raise RuntimeError("التفريغ طلع فاضي — اتأكد إن الفيديو فيه صوت.")

    topic = args.topic or media.stem
    ctx = session_context(topic, reference)
    chunks = make_chunks(segments)
    raw = review_chunks(llm, chunks, ctx)
    findings = dedupe(raw)
    if not args.no_verify:
        findings = verify(llm, findings, segments, ctx)
    findings = [f for f in findings if float(f.get("confidence", 1)) >= args.min_confidence]

    (work / "findings.json").write_text(json.dumps(findings, ensure_ascii=False, indent=1), encoding="utf-8")
    report = render_report(media.stem, topic, args.source, duration, findings, args.model, work / "report.html")
    kept = sum(1 for f in findings if f.get("verdict", "keep") == "keep")
    log(f"✅ خلصت: {kept} خطأ تقني — التقرير: {report}")
    return report


def main() -> None:
    ap = argparse.ArgumentParser(description="مراجعة تقنية لتسجيلات سيشنات كورس الـ AI")
    ap.add_argument("source", help="لينك Google Drive (ملف أو فولدر) أو مسار فيديو على جهازك")
    ap.add_argument("--topic", help="موضوع السيشن، بيساعد المراجعة تبقى أدق")
    ap.add_argument("--reference", help="ملف المنهج أو الـ slides (pdf/txt/md) كمرجع")
    ap.add_argument("--glossary", help="مصطلحات إضافية بتتقال في السيشن عشان التفريغ يكتبها صح")
    ap.add_argument("--provider", choices=["groq", "anthropic"], default=None,
                    help="المراجعة: anthropic = Claude (أدق)، groq = مجاني. الافتراضي: Claude لو مفتاحه موجود")
    ap.add_argument("--backend", choices=["groq", "openai", "local"], default=None,
                    help="التفريغ: openai، groq (مجاني)، local (على جهازك). الافتراضي: OpenAI لو مفتاحه موجود")
    ap.add_argument("--local-model", default="large-v3", help="حجم موديل Whisper المحلي")
    ap.add_argument("--language", default=None,
                    help="سيبها فاضية للميكس (Auto). 'ar' بتجبر العربي وممكن تكتب المصطلحات الإنجليزي بحروف عربي")
    ap.add_argument("--model", default=None, help="موديل المراجعة (الافتراضي حسب الـ provider)")
    ap.add_argument("--min-confidence", type=float, default=0.75, help="أقل درجة ثقة تظهر في التقرير")
    ap.add_argument("--no-verify", action="store_true", help="تخطي مرحلة التحقق على السيشن كاملة")
    ap.add_argument("--retranscribe", action="store_true", help="إعادة التفريغ حتى لو فيه نسخة محفوظة")
    ap.add_argument("--out", default="reports", help="فولدر النتايج")
    args = ap.parse_args()

    # اختيار تلقائي حسب المفاتيح الموجودة في .env
    args.provider = args.provider or ("anthropic" if os.getenv("ANTHROPIC_API_KEY") else "groq")
    args.backend = args.backend or ("openai" if os.getenv("OPENAI_API_KEY") else "groq")
    log(f"المراجعة: {args.provider} · التفريغ: {args.backend}")

    needs = set()
    if args.provider == "groq" or args.backend == "groq":
        needs.add("GROQ_API_KEY")
    if args.provider == "anthropic":
        needs.add("ANTHROPIC_API_KEY")
    if args.backend == "openai":
        needs.add("OPENAI_API_KEY")
    missing = [k for k in sorted(needs) if not os.getenv(k)]
    if missing:
        sys.exit(f"محتاج {', '.join(missing)} في ملف .env (شوف README).")

    args.model = args.model or os.getenv("REVIEW_MODEL") or DEFAULT_MODELS[args.provider]
    llm = LLM(args.provider, args.model)
    reference = load_reference(args.reference)
    if reference and args.provider == "groq":
        reference = reference[:6000]  # حد الـ tokens في الـ free tier صغير

    if Path(args.source).exists():
        media_files = [Path(args.source)]
    else:
        media_files = download_from_drive(args.source, Path(args.out) / "_downloads")

    reports, failed = [], []
    for m in media_files:
        log(f"===== {m.name} =====")
        try:
            reports.append(process_media(m, args, llm, reference))
        except Exception as ex:  # نكمل باقي السيشنات لو واحدة فشلت
            log(f"❌ فشل في {m.name}: {ex}")
            failed.append(m.name)

    log(f"خلصت {len(reports)} سيشن" + (f"، وفشل {len(failed)}: {', '.join(failed)}" if failed else ""))


if __name__ == "__main__":
    main()
