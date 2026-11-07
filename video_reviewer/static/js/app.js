(() => {
  const STAGE_LABELS = {
    audio: "استخراج الصوت",
    transcribe: "التفريغ الصوتي",
    frames: "استخراج الإطارات",
    ocr: "OCR",
    segment: "تقسيم الدروس",
    review: "المراجعة التقنية",
    evidence: "تحقق الأدلة",
    verdict: "حساب الحكم",
    report: "توليد التقرير",
  };

  let currentReviewId = null;
  let currentFindings = [];
  let pollTimer = null;

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  function showPage(id) {
    $$(".page").forEach((p) => p.classList.remove("active"));
    $$(".nav-item").forEach((n) => n.classList.toggle("active", n.dataset.page === id));
    const page = document.getElementById(`page-${id}`);
    if (page) page.classList.add("active");
    if (id === "dashboard") loadDashboard();
    if (id === "history") loadHistory();
    if (id === "reports") loadReports();
    if (id === "eval") loadEval();
    if (id === "settings") loadSettings();
    if (id === "results" && currentReviewId) loadResults(currentReviewId);
  }

  async function api(path, opts) {
    const res = await fetch(path, opts);
    if (!res.ok) {
      let msg = res.statusText;
      try {
        const data = await res.json();
        msg = data.detail || JSON.stringify(data);
      } catch (_) {}
      throw new Error(msg);
    }
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) return res.json();
    return res;
  }

  function tsToSeconds(ts) {
    if (!ts) return 0;
    const parts = String(ts).split(":").map(Number);
    let s = 0;
    for (const p of parts) s = s * 60 + (p || 0);
    return s;
  }

  function renderEmpty(el, text, actionLabel, action) {
    el.innerHTML = `<div class="empty"><div>${text}</div>${
      actionLabel
        ? `<div style="margin-top:0.8rem"><button class="btn" type="button" id="empty-action">${actionLabel}</button></div>`
        : ""
    }</div>`;
    const btn = el.querySelector("#empty-action");
    if (btn && action) btn.onclick = action;
  }

  async function loadDashboard() {
    const data = await api("/api/dashboard");
    $("#dash-stats").innerHTML = [
      ["إجمالي المراجعات", data.total_reviews],
      ["مكتملة", data.completed_reviews],
      ["تحتاج انتباه", data.needs_attention],
      ["إجمالي الملاحظات", data.total_findings],
    ]
      .map(
        ([label, value]) =>
          `<div class="stat"><div class="label">${label}</div><div class="value">${value}</div></div>`
      )
      .join("");

    $("#dash-severity").innerHTML = Object.entries(data.severity || {})
      .map(([k, v]) => `<span class="pill ${k}">${k}: ${v}</span>`)
      .join("") || '<span class="panel-muted">لا توجد ملاحظات بعد</span>';

    const recent = data.recent || [];
    if (!recent.length) {
      renderEmpty($("#dash-recent"), "لا توجد مراجعات محفوظة بعد.", "بدء مراجعة جديدة", () =>
        showPage("new-review")
      );
      return;
    }
    $("#dash-recent").innerHTML = `
      <table class="table">
        <thead><tr><th>الفيديو</th><th>التاريخ</th><th>الحالة</th><th>الحكم</th><th>الملاحظات</th></tr></thead>
        <tbody>
          ${recent
            .map(
              (r) => `<tr class="clickable" data-id="${r.review_id}">
                <td>${r.video_name || r.review_id}</td>
                <td>${r.created_at || "—"}</td>
                <td><span class="pill ${r.processing_status === "completed" ? "completed" : r.processing_status === "failed" ? "failed" : "pending"}">${r.processing_status}</span></td>
                <td>${r.proposed_verdict || "—"}</td>
                <td>${r.findings_count ?? 0}</td>
              </tr>`
            )
            .join("")}
        </tbody>
      </table>`;
    $("#dash-recent").querySelectorAll("tr.clickable").forEach((tr) => {
      tr.onclick = () => openResults(tr.dataset.id);
    });
  }

  function renderStages(stages) {
    const order = Object.keys(STAGE_LABELS);
    const html = order
      .map((name) => {
        const st = (stages && (stages[name]?.status || stages[name])) || "pending";
        const status = typeof st === "string" ? st : st.status || "pending";
        return `<div class="stage"><div class="stage-name">${STAGE_LABELS[name]}</div><span class="pill ${status}">${status}</span></div>`;
      })
      .join("");
    $("#stages").innerHTML = html;
  }

  function startPolling(reviewId) {
    if (pollTimer) clearInterval(pollTimer);
    const tick = async () => {
      try {
        const job = await api(`/api/jobs/${reviewId}`);
        $("#job-status").textContent = `الحالة: ${job.status || "—"}`;
        renderStages(job.stages || {});
        if (job.status === "completed") {
          clearInterval(pollTimer);
          pollTimer = null;
          $("#open-results").hidden = false;
          $("#open-results").onclick = () => openResults(reviewId);
        }
        if (job.status === "failed") {
          clearInterval(pollTimer);
          pollTimer = null;
          $("#job-status").textContent = `فشلت المعالجة: ${job.error || ""}`;
          $("#open-results").hidden = false;
          $("#open-results").onclick = () => openResults(reviewId);
        }
      } catch (e) {
        $("#job-status").textContent = e.message;
      }
    };
    tick();
    pollTimer = setInterval(tick, 2000);
  }

  async function openResults(reviewId) {
    currentReviewId = reviewId;
    showPage("results");
    await loadResults(reviewId);
  }

  async function loadResults(reviewId) {
    const err = $("#results-error");
    err.hidden = true;
    try {
      const data = await api(`/api/reviews/${reviewId}`);
      const report = data.report || {};
      const meta = data.meta || {};
      const findings = report.findings || [];
      currentFindings = findings;

      $("#results-subtitle").textContent = `${meta.video_name || reviewId} · ${
        report.proposed_verdict || meta.proposed_verdict || "—"
      }`;

      $("#results-summary").innerHTML = `
        <div class="actions">
          <span class="pill ${(report.processing_status || meta.processing_status) === "completed" ? "completed" : "failed"}">
            ${report.processing_status || meta.processing_status || "unknown"}
          </span>
          <span class="pill">${report.proposed_verdict || meta.proposed_verdict || "—"}</span>
          <span class="pill">${findings.length} ملاحظة</span>
        </div>
        <p class="panel-muted" style="margin-top:0.75rem">
          القرار النهائي للمراجع البشري. التقرير النظيف لا يثبت صحة المحتوى.
        </p>`;

      const arts = data.artifacts || {};
      $("#results-downloads").innerHTML = [
        arts.markdown ? `<a class="btn secondary" href="/api/reviews/${reviewId}/download/markdown">Markdown</a>` : "",
        arts.json ? `<a class="btn secondary" href="/api/reviews/${reviewId}/download/json">JSON</a>` : "",
        arts.dropped ? `<a class="btn secondary" href="/api/reviews/${reviewId}/download/dropped">Dropped Issues</a>` : "",
      ].join("");

      const player = $("#player");
      if (data.has_video) {
        player.src = `/api/reviews/${reviewId}/video`;
      } else {
        player.removeAttribute("src");
      }

      renderFindings();
    } catch (e) {
      err.hidden = false;
      err.textContent = e.message;
    }
  }

  function renderFindings() {
    const sev = $("#filter-severity").value;
    const cat = $("#filter-category").value;
    const list = currentFindings.filter((f) => {
      if (sev && f.severity !== sev) return false;
      if (cat && f.category !== cat) return false;
      return true;
    });
    const el = $("#findings-list");
    if (!list.length) {
      renderEmpty(el, "لا توجد ملاحظات مطابقة للفلتر الحالي.");
      $("#finding-detail").innerHTML = "";
      return;
    }
    el.innerHTML = list
      .map(
        (f) => `<div class="finding-card" data-id="${f.id}">
          <strong>${f.id}</strong> — ${f.summary || ""}
          <div class="meta">
            <span class="pill ${f.severity}">${f.severity}</span>
            <span class="pill">${f.category}</span>
            <span class="pill">${f.t_start} → ${f.t_end}</span>
            <span class="pill">${f.confidence}</span>
          </div>
        </div>`
      )
      .join("");
    el.querySelectorAll(".finding-card").forEach((card) => {
      card.onclick = () => selectFinding(card.dataset.id);
    });
  }

  function selectFinding(id) {
    const f = currentFindings.find((x) => x.id === id);
    if (!f) return;
    $$(".finding-card").forEach((c) => c.classList.toggle("active", c.dataset.id === id));
    const player = $("#player");
    const t = tsToSeconds(f.t_start);
    if (player.src) {
      player.currentTime = t;
      player.play().catch(() => {});
    }
    $("#finding-detail").innerHTML = `
      <div class="panel" style="margin:0;box-shadow:none">
        <h2>تفاصيل ${f.id}</h2>
        <div class="evidence"><strong>الدليل:</strong> ${escapeHtml(f.evidence?.quote || "")}</div>
        ${f.evidence?.ocr_text ? `<div class="evidence"><strong>OCR:</strong> <code>${escapeHtml(f.evidence.ocr_text)}</code></div>` : ""}
        ${f.evidence?.frame ? `<div class="evidence"><strong>الإطار:</strong> ${escapeHtml(f.evidence.frame)}</div>` : ""}
        <div class="evidence"><strong>المتوقع:</strong> ${escapeHtml(f.expected || "")}</div>
        <div class="evidence"><strong>التصحيح:</strong> ${escapeHtml(f.correction || "")}</div>
        ${f.note ? `<div class="evidence"><strong>تنبيه:</strong> ${escapeHtml(f.note)}</div>` : ""}
        <p class="help">التحقق Phase 1: model_only — قبول/رفض بشري غير مفعّل بعد.</p>
      </div>`;
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  async function loadHistory() {
    const data = await api("/api/reviews");
    const reviews = data.reviews || [];
    const panel = $("#history-panel");
    if (!reviews.length) {
      renderEmpty(panel, "لا يوجد سجل مراجعات بعد.", "بدء مراجعة جديدة", () => showPage("new-review"));
      return;
    }
    panel.innerHTML = `
      <table class="table">
        <thead><tr><th>الفيديو</th><th>التاريخ</th><th>المسار</th><th>الحالة</th><th>الحكم</th><th>الملاحظات</th><th>التكلفة</th></tr></thead>
        <tbody>
          ${reviews
            .map(
              (r) => `<tr class="clickable" data-id="${r.review_id}">
                <td>${r.video_name || r.review_id}</td>
                <td>${r.created_at || "—"}</td>
                <td>${r.field || "—"}</td>
                <td>${r.processing_status}</td>
                <td>${r.proposed_verdict || "—"}</td>
                <td>${r.findings_count ?? 0}</td>
                <td>${r.cost != null ? Number(r.cost).toFixed(4) : "—"}</td>
              </tr>`
            )
            .join("")}
        </tbody>
      </table>`;
    panel.querySelectorAll("tr.clickable").forEach((tr) => {
      tr.onclick = () => openResults(tr.dataset.id);
    });
  }

  async function loadReports() {
    const data = await api("/api/reviews");
    const reviews = (data.reviews || []).filter((r) => r.processing_status === "completed" || r.findings_count);
    const panel = $("#reports-panel");
    if (!reviews.length) {
      renderEmpty(panel, "لا توجد تقارير جاهزة للتنزيل بعد.");
      return;
    }
    panel.innerHTML = reviews
      .map(
        (r) => `<div class="stage">
          <div>
            <div class="stage-name">${r.video_name || r.review_id}</div>
            <div class="help">${r.created_at || ""} · ${r.proposed_verdict || ""}</div>
          </div>
          <div class="actions">
            <a class="btn secondary" href="/api/reviews/${r.review_id}/download/markdown">MD</a>
            <a class="btn secondary" href="/api/reviews/${r.review_id}/download/json">JSON</a>
            <a class="btn secondary" href="/api/reviews/${r.review_id}/download/dropped">Dropped</a>
          </div>
        </div>`
      )
      .join("");
  }

  async function loadEval() {
    const data = await api("/api/eval");
    const panel = $("#eval-panel");
    if (!data.available) {
      renderEmpty(panel, data.message || "لا توجد نتائج تقييم.");
      return;
    }
    const s = data.summary;
    panel.innerHTML = `
      <div class="grid-stats">
        <div class="stat"><div class="label">الحالات</div><div class="value">${s.cases}</div></div>
        <div class="stat"><div class="label">Precision</div><div class="value">${(s.precision * 100).toFixed(1)}%</div></div>
        <div class="stat"><div class="label">Recall</div><div class="value">${(s.recall * 100).toFixed(1)}%</div></div>
        <div class="stat"><div class="label">Critical Recall</div><div class="value">${(s.critical_recall * 100).toFixed(1)}%</div></div>
      </div>
      <p class="panel-muted">متوسط خطأ الطابع الزمني: ${Number(s.avg_timestamp_error_sec || 0).toFixed(1)} ثانية</p>`;
  }

  async function loadSettings() {
    const data = await api("/api/settings");
    $("#settings-info").textContent = `API key مضبوط: ${data.api_key_set ? "نعم" : "لا"} · النموذج: ${data.model} · المنفذ: ${data.host}:${data.port}`;
    const costInput = $("#settings-form [name=max_cost]");
    if (data.max_cost != null) costInput.value = data.max_cost;
  }

  // Navigation
  $$("#nav .nav-item").forEach((btn) => {
    btn.addEventListener("click", () => showPage(btn.dataset.page));
  });
  $$("[data-goto]").forEach((btn) => {
    btn.addEventListener("click", () => showPage(btn.dataset.goto));
  });

  // Upload UX
  const dropzone = $("#dropzone");
  const videoInput = $("#video-input");
  $("#pick-file").onclick = () => videoInput.click();
  dropzone.addEventListener("click", (e) => {
    if (e.target.closest("button")) return;
    videoInput.click();
  });
  videoInput.addEventListener("change", () => {
    $("#file-name").textContent = videoInput.files[0]?.name || "لم يتم اختيار ملف";
  });
  ["dragenter", "dragover"].forEach((ev) =>
    dropzone.addEventListener(ev, (e) => {
      e.preventDefault();
      dropzone.classList.add("dragover");
    })
  );
  ["dragleave", "drop"].forEach((ev) =>
    dropzone.addEventListener(ev, (e) => {
      e.preventDefault();
      dropzone.classList.remove("dragover");
    })
  );
  dropzone.addEventListener("drop", (e) => {
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const dt = new DataTransfer();
    dt.items.add(file);
    videoInput.files = dt.files;
    $("#file-name").textContent = file.name;
  });

  $("#review-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("#form-error");
    err.hidden = true;
    if (!videoInput.files[0]) {
      err.hidden = false;
      err.textContent = "اختر ملف فيديو أولاً.";
      return;
    }
    const fd = new FormData(e.target);
    fd.set("video", videoInput.files[0]);
    $("#start-btn").disabled = true;
    try {
      const data = await api("/api/reviews", { method: "POST", body: fd });
      currentReviewId = data.review_id;
      $("#progress-panel").hidden = false;
      $("#open-results").hidden = true;
      renderStages({});
      startPolling(data.review_id);
    } catch (ex) {
      err.hidden = false;
      err.textContent = ex.message;
    } finally {
      $("#start-btn").disabled = false;
    }
  });

  $("#settings-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = {
      api_key: fd.get("api_key") || null,
      max_cost: fd.get("max_cost") ? Number(fd.get("max_cost")) : null,
    };
    await api("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const msg = $("#settings-msg");
    msg.hidden = false;
    msg.textContent = "تم حفظ إعدادات الجلسة.";
    loadSettings();
  });

  $("#filter-severity").addEventListener("change", renderFindings);
  $("#filter-category").addEventListener("change", renderFindings);

  showPage("dashboard");
})();
