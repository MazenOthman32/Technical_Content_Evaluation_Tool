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

function escapeHtml(value?: string | null) {
  return String(value ?? "—")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function buildPrintHtml(row: ReviewRow) {
  const report = (row.report || {}) as ReportPayload;
  const findings = (report.findings || []) as Finding[];
  const counts = countBySeverity(findings);
  const tags = (row.tags || []).map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join(" ");
  const course = courseLabel(row.category);

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
        <p><strong>الدليل:</strong> ${escapeHtml(f.evidence?.quote)}</p>
        <p><strong>المتوقع:</strong> ${escapeHtml(f.expected)}</p>
        <p><strong>التصحيح:</strong> ${escapeHtml(f.correction)}</p>
      </article>`
    )
    .join("");

  return `
  <div id="pdf-root" dir="rtl" lang="ar" style="width:920px;padding:36px 40px;background:#fff;color:#0f172a;font-family:'IBM Plex Sans Arabic','Segoe UI',Tahoma,Arial,sans-serif;line-height:1.75;text-align:right;">
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap" />
    <header style="display:flex;justify-content:space-between;align-items:flex-start;gap:20px;border-bottom:1px solid #e2e8f0;padding-bottom:20px;margin-bottom:22px;">
      <div style="min-width:0;flex:1;">
        <img src="${typeof window !== "undefined" ? window.location.origin : ""}/brand/instant-plus-logo.png" alt="Instant Plus" crossorigin="anonymous" style="height:40px;width:auto;max-width:180px;object-fit:contain;display:block;margin-bottom:14px;" />
        <h1 style="margin:0;font-size:24px;letter-spacing:-.02em;font-weight:700;">تقرير تقييم محتوى تقني</h1>
        <p style="margin:8px 0 0;color:#64748b;font-size:14px;">${escapeHtml(row.video_name || row.id)}</p>
      </div>
      <div style="text-align:left;color:#64748b;font-size:12px;white-space:nowrap;">
        <div>${escapeHtml(new Date(row.created_at).toLocaleString("ar"))}</div>
        <div style="margin-top:6px;color:#3730a3;font-weight:600;">${escapeHtml(course)}</div>
      </div>
    </header>

    <section style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:22px;">
      <div class="kpi"><div class="k">الحالة</div><div class="v">${escapeHtml(statusLabel(row.status))}</div></div>
      <div class="kpi"><div class="k">الحكم</div><div class="v">${escapeHtml(verdictLabel(report.proposed_verdict || row.proposed_verdict))}</div></div>
      <div class="kpi"><div class="k">الجودة</div><div class="v">${escapeHtml(String(row.quality_score ?? "—"))}</div></div>
      <div class="kpi"><div class="k">الملاحظات</div><div class="v">${findings.length}</div></div>
    </section>

    <section class="panel">
      <h2>الملخص التنفيذي</h2>
      <p>الكورس: <strong>${escapeHtml(course)}</strong></p>
      <p>المزوّد / النموذج: <strong>${escapeHtml(row.provider || "—")} / ${escapeHtml(row.model || report.model || "—")}</strong></p>
      <p>توزيع الخطورة: حرج ${counts.critical} · متوسط ${counts.medium} · بسيط ${counts.minor} · غير مؤكد ${counts.unsure}</p>
      <div class="tags">${tags || '<span class="tag">بدون وحدات/وسوم</span>'}</div>
    </section>

    <section class="panel">
      <h2>تفاصيل الملاحظات</h2>
      ${findingCards || "<p>لا توجد ملاحظات مسجّلة في هذا التقرير.</p>"}
    </section>

    <footer style="margin-top:28px;padding-top:14px;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;">
      تقرير سري — Instant Plus. القرار النهائي للنشر يبقى للمراجع البشري المخوّل.
    </footer>

    <style>
      *{box-sizing:border-box}
      .kpi{background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;padding:14px 16px}
      .kpi .k{font-size:12px;color:#64748b;margin-bottom:6px}
      .kpi .v{font-size:17px;font-weight:700}
      .panel{border:1px solid #e2e8f0;border-radius:18px;padding:18px;margin-bottom:16px;background:#fff}
      .panel h2{margin:0 0 12px;font-size:17px;font-weight:700}
      .finding{border:1px solid #e2e8f0;border-radius:14px;padding:14px;margin:0 0 12px;background:#f8fafc;page-break-inside:avoid}
      .finding h3{margin:0 0 8px;font-size:15px;font-weight:600}
      .finding .meta{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px}
      .finding .meta span,.tag{background:#eef2ff;color:#3730a3;border-radius:999px;padding:4px 10px;font-size:11px;display:inline-block}
      .finding p{margin:6px 0;font-size:13px;word-break:break-word}
      .tags{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}
    </style>
  </div>`;
}

async function ensureArabicFont() {
  if (typeof document === "undefined") return;
  const href =
    "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap";
  if (![...document.styleSheets].some((s) => String(s.href || "").includes("IBM+Plex+Sans+Arabic"))) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  }
  if (document.fonts?.ready) {
    await document.fonts.ready.catch(() => undefined);
  }
}

async function renderPdfBlob(row: ReviewRow): Promise<Blob> {
  await ensureArabicFont();
  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "-10000px";
  host.style.top = "0";
  host.style.zIndex = "-1";
  host.innerHTML = buildPrintHtml(row);
  document.body.appendChild(host);

  try {
    const logo = host.querySelector("img");
    if (logo && !(logo as HTMLImageElement).complete) {
      await new Promise((resolve) => {
        logo.addEventListener("load", resolve, { once: true });
        logo.addEventListener("error", resolve, { once: true });
      });
    }
    if (document.fonts?.ready) {
      await document.fonts.ready.catch(() => undefined);
    }
    const target = host.querySelector("#pdf-root") as HTMLElement;
    const canvas = await html2canvas(target, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
      onclone: (doc) => {
        const root = doc.getElementById("pdf-root");
        if (root) {
          root.style.fontFamily = "'IBM Plex Sans Arabic','Segoe UI',Tahoma,Arial,sans-serif";
          root.setAttribute("dir", "rtl");
          root.setAttribute("lang", "ar");
        }
      },
    });
    const img = canvas.toDataURL("image/png");
    const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 28;
    const usableWidth = pageWidth - margin * 2;
    const imgWidth = usableWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    let heightLeft = imgHeight;
    let position = margin;
    pdf.addImage(img, "PNG", margin, position, imgWidth, imgHeight);
    heightLeft -= pageHeight - margin * 2;
    while (heightLeft > 0) {
      position = margin - (imgHeight - heightLeft);
      pdf.addPage();
      pdf.addImage(img, "PNG", margin, position, imgWidth, imgHeight);
      heightLeft -= pageHeight - margin * 2;
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
  a.download = `${(row.video_name || row.id).replace(/[^\w\u0600-\u06FF.-]+/g, "_")}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportReviewsZip(rows: ReviewRow[], zipName = "instant-plus-reports.zip") {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  for (const row of rows) {
    const blob = await renderPdfBlob(row);
    const safe = `${(row.video_name || row.id).replace(/[^\w\u0600-\u06FF.-]+/g, "_")}.pdf`;
    zip.file(safe, blob);
  }
  const content = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(content);
  const a = document.createElement("a");
  a.href = url;
  a.download = zipName;
  a.click();
  URL.revokeObjectURL(url);
}
