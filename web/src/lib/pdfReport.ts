import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { categoryLabel } from "@/lib/categories";
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
  return String(value || "—")
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
  <div id="pdf-root" dir="rtl" style="width:900px;padding:36px;background:#fff;color:#0f172a;font-family:'Segoe UI',Tahoma,Arial,sans-serif;">
    <header style="background:linear-gradient(135deg,#4338ca,#0f766e);color:#fff;border-radius:18px;padding:28px 30px;margin-bottom:22px;">
      <div style="opacity:.85;font-size:13px;margin-bottom:8px;">Instant Plus · Technical Content Evaluation</div>
      <h1 style="margin:0;font-size:28px;letter-spacing:-.02em;">تقرير تقييم المحتوى التقني</h1>
      <p style="margin:10px 0 0;opacity:.92;font-size:14px;">${escapeHtml(row.video_name || row.id)}</p>
    </header>

    <section style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:22px;">
      <div class="kpi"><div class="k">الحالة</div><div class="v">${escapeHtml(statusLabel(row.status))}</div></div>
      <div class="kpi"><div class="k">الحكم</div><div class="v">${escapeHtml(verdictLabel(report.proposed_verdict || row.proposed_verdict))}</div></div>
      <div class="kpi"><div class="k">الجودة</div><div class="v">${escapeHtml(String(row.quality_score ?? "—"))}</div></div>
      <div class="kpi"><div class="k">الملاحظات</div><div class="v">${findings.length}</div></div>
    </section>

    <section class="panel">
      <h2>الملخص التنفيذي</h2>
      <p>التصنيف: <strong>${escapeHtml(categoryLabel(row.category))}</strong></p>
      <p>المزوّد / النموذج: <strong>${escapeHtml(row.provider || "—")} / ${escapeHtml(row.model || report.model || "—")}</strong></p>
      <p>التاريخ: <strong>${escapeHtml(new Date(row.created_at).toLocaleString("ar"))}</strong></p>
      <p>توزيع الخطورة: حرج ${counts.critical} · متوسط ${counts.medium} · بسيط ${counts.minor} · غير مؤكد ${counts.unsure}</p>
      <div class="tags">${tags || '<span class="tag">بدون وسوم</span>'}</div>
    </section>

    <section class="panel">
      <h2>تفاصيل الملاحظات</h2>
      ${findingCards || "<p>لا توجد ملاحظات مسجّلة في هذا التقرير.</p>"}
    </section>

    <footer style="margin-top:24px;padding-top:14px;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;line-height:1.6;">
      تقرير سري — أداة مساعدة Instant Plus. القرار النهائي للنشر يبقى للمراجع البشري المخوّل.
    </footer>

    <style>
      .kpi{background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:14px}
      .kpi .k{font-size:12px;color:#64748b;margin-bottom:6px}
      .kpi .v{font-size:18px;font-weight:700}
      .panel{border:1px solid #e2e8f0;border-radius:16px;padding:18px;margin-bottom:16px;background:#fff}
      .panel h2{margin:0 0 12px;font-size:18px}
      .finding{border:1px solid #e2e8f0;border-radius:12px;padding:14px;margin:0 0 12px;background:#f8fafc}
      .finding h3{margin:0 0 8px;font-size:15px}
      .finding .meta{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px}
      .finding .meta span,.tag{background:#eef2ff;color:#3730a3;border-radius:999px;padding:3px 10px;font-size:11px}
      .finding p{margin:6px 0;line-height:1.6;font-size:13px}
      .tags{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}
    </style>
  </div>`;
}

export async function exportReviewPdf(row: ReviewRow) {
  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "-10000px";
  host.style.top = "0";
  host.style.zIndex = "-1";
  host.innerHTML = buildPrintHtml(row);
  document.body.appendChild(host);

  try {
    const target = host.querySelector("#pdf-root") as HTMLElement;
    const canvas = await html2canvas(target, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
    });
    const img = canvas.toDataURL("image/png");
    const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    let heightLeft = imgHeight;
    let position = 0;

    pdf.addImage(img, "PNG", 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
    while (heightLeft > 0) {
      position -= pageHeight;
      pdf.addPage();
      pdf.addImage(img, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }
    pdf.save(`${row.id}.pdf`);
  } finally {
    host.remove();
  }
}
