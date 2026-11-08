import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { courseLabel } from "@/lib/categories";
import {
  Finding,
  ReportPayload,
  ReviewRow,
  countBySeverity,
  severityLabel,
  statusLabel,
  verdictLabel,
} from "@/lib/reports";

const FONT_STACK = "'IBM Plex Sans Arabic','Noto Naskh Arabic','Segoe UI',Tahoma,Arial,sans-serif";

function escapeHtml(value?: string | null) {
  return String(value ?? "—")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function loadLogoDataUrl() {
  try {
    const res = await fetch("/brand/instant-plus-logo.png", { cache: "force-cache" });
    if (!res.ok) return "";
    const blob = await res.blob();
    return await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => resolve("");
      reader.readAsDataURL(blob);
    });
  } catch {
    return "";
  }
}

async function ensureArabicFonts() {
  const href =
    "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap";
  if (!document.querySelector(`link[href="${href}"]`)) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  }
  if (document.fonts?.load) {
    await Promise.all([
      document.fonts.load(`400 14px ${FONT_STACK}`),
      document.fonts.load(`600 18px ${FONT_STACK}`),
      document.fonts.load(`700 24px ${FONT_STACK}`),
    ]).catch(() => undefined);
  }
  if (document.fonts?.ready) {
    await document.fonts.ready.catch(() => undefined);
  }
}

function buildPrintHtml(row: ReviewRow, logoDataUrl: string) {
  const report = (row.report || {}) as ReportPayload;
  const findings = (report.findings || []) as Finding[];
  const counts = countBySeverity(findings);
  const tags = (row.tags || []).map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join(" ");
  const course = courseLabel(row.category);
  const logo = logoDataUrl
    ? `<img src="${logoDataUrl}" alt="Instant Plus" style="height:42px;width:auto;max-width:190px;object-fit:contain;display:block;margin-bottom:14px;" />`
    : `<div style="font-weight:800;font-size:22px;color:#001F82;margin-bottom:14px;">Instant<span style="position:relative;">+</span></div>`;

  const findingCards = findings
    .map(
      (f) => `
      <article class="finding">
        <h3>${escapeHtml(f.id)} — ${escapeHtml(f.summary)}</h3>
        <div class="meta">
          <span>${escapeHtml(severityLabel(f.severity))}</span>
          <span>${escapeHtml(f.category)}</span>
          <span>${escapeHtml(f.t_start)} → ${escapeHtml(f.t_end)}</span>
        </div>
        <p><strong>الدليل:</strong> <span class="ar">${escapeHtml(f.evidence?.quote)}</span></p>
        <p><strong>المتوقع:</strong> <span class="ar">${escapeHtml(f.expected)}</span></p>
        <p><strong>التصحيح:</strong> <span class="ar">${escapeHtml(f.correction)}</span></p>
      </article>`
    )
    .join("");

  return `
  <div id="pdf-root" dir="rtl" lang="ar" style="width:900px;padding:34px 38px;background:#ffffff;color:#0f172a;font-family:${FONT_STACK};line-height:1.8;text-align:right;unicode-bidi:isolate;-webkit-font-smoothing:antialiased;">
    <header style="display:flex;justify-content:space-between;align-items:flex-start;gap:18px;border-bottom:1px solid #e2e8f0;padding-bottom:18px;margin-bottom:20px;">
      <div style="min-width:0;flex:1;">
        ${logo}
        <h1 class="ar" style="margin:0;font-size:24px;letter-spacing:0;font-weight:700;">تقرير تقييم محتوى تقني</h1>
        <p class="ar" style="margin:8px 0 0;color:#64748b;font-size:14px;">${escapeHtml(row.video_name || row.id)}</p>
      </div>
      <div style="text-align:left;color:#64748b;font-size:12px;white-space:nowrap;">
        <div>${escapeHtml(new Date(row.created_at).toLocaleString("ar-EG"))}</div>
        <div class="ar" style="margin-top:6px;color:#001F82;font-weight:700;">${escapeHtml(course)}</div>
      </div>
    </header>

    <section style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:20px;">
      <div class="kpi"><div class="k">الحالة</div><div class="v ar">${escapeHtml(statusLabel(row.status))}</div></div>
      <div class="kpi"><div class="k">الحكم</div><div class="v ar">${escapeHtml(verdictLabel(report.proposed_verdict || row.proposed_verdict))}</div></div>
      <div class="kpi"><div class="k">الجودة</div><div class="v">${escapeHtml(String(row.quality_score ?? "—"))}</div></div>
      <div class="kpi"><div class="k">الملاحظات</div><div class="v">${findings.length}</div></div>
    </section>

    <section class="panel">
      <h2 class="ar">الملخص التنفيذي</h2>
      <p class="ar">الكورس: <strong>${escapeHtml(course)}</strong></p>
      <p class="ar">المزوّد / النموذج: <strong>${escapeHtml(row.provider || "—")} / ${escapeHtml(row.model || report.model || "—")}</strong></p>
      <p class="ar">توزيع الخطورة: حرج ${counts.critical} · متوسط ${counts.medium} · بسيط ${counts.minor} · غير مؤكد ${counts.unsure}</p>
      <div class="tags">${tags || '<span class="tag">بدون وحدات أو وسوم</span>'}</div>
    </section>

    <section class="panel">
      <h2 class="ar">تفاصيل الملاحظات</h2>
      ${findingCards || '<p class="ar">لا توجد ملاحظات مسجّلة في هذا التقرير.</p>'}
    </section>

    <footer class="ar" style="margin-top:26px;padding-top:12px;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;">
      تقرير سري — Instant Plus. القرار النهائي للنشر يبقى للمراجع البشري المخوّل.
    </footer>

    <style>
      *{box-sizing:border-box}
      .ar{font-family:${FONT_STACK};unicode-bidi:isolate;direction:rtl;letter-spacing:0;word-spacing:normal}
      .kpi{background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;padding:13px 14px}
      .kpi .k{font-size:12px;color:#64748b;margin-bottom:6px}
      .kpi .v{font-size:16px;font-weight:700}
      .panel{border:1px solid #e2e8f0;border-radius:18px;padding:16px;margin-bottom:14px;background:#fff}
      .panel h2{margin:0 0 10px;font-size:17px;font-weight:700}
      .finding{border:1px solid #e2e8f0;border-radius:14px;padding:13px;margin:0 0 10px;background:#f8fafc}
      .finding h3{margin:0 0 8px;font-size:14px;font-weight:700}
      .finding .meta{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px}
      .finding .meta span,.tag{background:#eef2ff;color:#3730a3;border-radius:999px;padding:4px 10px;font-size:11px;display:inline-block}
      .finding p{margin:6px 0;font-size:13px;word-break:break-word}
      .tags{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}
    </style>
  </div>`;
}

function safeFileName(row: ReviewRow) {
  return `${(row.video_name || row.id).replace(/[^\w\u0600-\u06FF.-]+/g, "_").slice(0, 80)}.pdf`;
}

async function renderPdfBlob(row: ReviewRow): Promise<Blob> {
  await ensureArabicFonts();
  const logoDataUrl = await loadLogoDataUrl();
  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "-12000px";
  host.style.top = "0";
  host.style.zIndex = "-1";
  host.style.pointerEvents = "none";
  host.innerHTML = buildPrintHtml(row, logoDataUrl);
  document.body.appendChild(host);

  try {
    if (document.fonts?.ready) {
      await document.fonts.ready.catch(() => undefined);
    }
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    const target = host.querySelector("#pdf-root") as HTMLElement;
    const canvas = await html2canvas(target, {
      scale: 2.2,
      useCORS: true,
      allowTaint: false,
      backgroundColor: "#ffffff",
      logging: false,
      foreignObjectRendering: false,
      onclone: (doc) => {
        const root = doc.getElementById("pdf-root");
        if (!root) return;
        root.setAttribute("dir", "rtl");
        root.setAttribute("lang", "ar");
        root.style.fontFamily = FONT_STACK;
        root.querySelectorAll(".ar,h1,h2,h3,p,span,div").forEach((el) => {
          const node = el as HTMLElement;
          node.style.fontFamily = FONT_STACK;
          node.style.letterSpacing = "0";
        });
      },
    });

    const img = canvas.toDataURL("image/png", 1);
    const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait", compress: true });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 24;
    const usableWidth = pageWidth - margin * 2;
    const usableHeight = pageHeight - margin * 2;
    const imgWidth = usableWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    let remaining = imgHeight;
    let offsetY = 0;
    let page = 0;
    while (remaining > 0) {
      if (page > 0) pdf.addPage();
      pdf.addImage(img, "PNG", margin, margin - offsetY, imgWidth, imgHeight, undefined, "FAST");
      offsetY += usableHeight;
      remaining -= usableHeight;
      page += 1;
      if (page > 40) break;
    }
    return pdf.output("blob");
  } finally {
    host.remove();
  }
}

export async function exportReviewPdf(row: ReviewRow) {
  const blob = await renderPdfBlob(row);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = safeFileName(row);
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportReviewsZip(rows: ReviewRow[], zipName = "instant-plus-reports.zip") {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  for (const row of rows) {
    const blob = await renderPdfBlob(row);
    zip.file(safeFileName(row), blob);
  }
  const content = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(content);
  const a = document.createElement("a");
  a.href = url;
  a.download = zipName;
  a.click();
  URL.revokeObjectURL(url);
}
