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
  let currentUser = null;
  let modelsCatalog = {
    anthropic: [{ id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5" }],
    groq: [{ id: "openai/gpt-oss-120b", label: "GPT-OSS 120B (Groq)" }],
  };
  let settingsCache = {};
  let sourceMode = "drive";

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  function fillModels(selectEl, provider, preferred) {
    if (!selectEl) return;
    const list = modelsCatalog[provider] || [];
    const pref = preferred || list[0]?.id;
    selectEl.innerHTML = list
      .map((m) => `<option value="${m.id}" ${m.id === pref ? "selected" : ""}>${m.label}</option>`)
      .join("");
  }

  async function prepareReviewForm() {
    try {
      const data = await api("/api/settings");
      settingsCache = data;
      if (data.providers) modelsCatalog = data.providers;
      const providerSelect = $("#provider-select");
      if (providerSelect) providerSelect.value = data.llm_provider || "groq";
      fillModels($("#model-select"), providerSelect?.value || "groq", data.llm_model);
    } catch (_) {
      fillModels($("#model-select"), $("#provider-select")?.value || "groq");
    }
  }

  function setSourceMode(mode) {
    sourceMode = mode;
    $$(".source-tab").forEach((t) => t.classList.toggle("active", t.dataset.source === mode));
    const drive = $("#source-drive");
    const file = $("#source-file");
    if (drive) drive.hidden = mode !== "drive";
    if (file) file.hidden = mode !== "file";
  }

  function applyRoleUI() {
    $("#user-chip").textContent = `${currentUser?.name || currentUser?.username || ""} · ${currentUser?.role || ""}`;
  }

  function closeMobileNav() {
    $("#sidebar")?.classList.remove("open");
    const backdrop = $("#sidebar-backdrop");
    if (backdrop) backdrop.hidden = true;
  }

  function showPage(id) {
    $$(".page").forEach((p) => p.classList.remove("active"));
    $$(".nav-item").forEach((n) => n.classList.toggle("active", n.dataset.page === id));
    const page = document.getElementById(`page-${id}`);
    if (page) page.classList.add("active");
    closeMobileNav();
    if (id === "new-review") prepareReviewForm();
    if (id === "history") loadHistory();
    if (id === "reports") loadReports();
    if (id === "settings") loadSettings();
    if (id === "results" && currentReviewId) loadResults(currentReviewId);
  }

  async function api(path, opts = {}) {
    const res = await fetch(path, { credentials: "same-origin", ...opts });
    if (res.status === 401) {
      window.location.replace("/");
      throw new Error("يلزم تسجيل الدخول");
    }
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

  function renderStages(stages) {
    const order = Object.keys(STAGE_LABELS);
    $("#stages").innerHTML = order
      .map((name) => {
        const st = (stages && (stages[name]?.status || stages[name])) || "pending";
        const status = typeof st === "string" ? st : st.status || "pending";
        return `<div class="stage"><div class="stage-name">${STAGE_LABELS[name]}</div><span class="pill ${status}">${status}</span></div>`;
      })
      .join("");
  }

  function startPolling(reviewId) {
    if (pollTimer) clearInterval(pollTimer);
    const tick = async () => {
      try {
        const job = await api(`/api/jobs/${reviewId}`);
        $("#job-status").textContent = `الحالة: ${job.status || "—"}`;
        renderStages(job.stages || {});
        if (job.status === "completed" || job.status === "failed") {
          clearInterval(pollTimer);
          pollTimer = null;
          if (job.status === "failed") {
            $("#job-status").textContent = `فشلت المعالجة: ${job.error || ""}`;
          }
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
        </div>`;

      const arts = data.artifacts || {};
      $("#results-downloads").innerHTML = [
        arts.markdown ? `<a class="btn secondary" href="/api/reviews/${reviewId}/download/markdown">Markdown</a>` : "",
        arts.json ? `<a class="btn secondary" href="/api/reviews/${reviewId}/download/json">JSON</a>` : "",
        arts.dropped ? `<a class="btn secondary" href="/api/reviews/${reviewId}/download/dropped">Dropped</a>` : "",
      ].join("");

      const player = $("#player");
      if (data.has_video) player.src = `/api/reviews/${reviewId}/video`;
      else player.removeAttribute("src");

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
      renderEmpty(el, "لا توجد ملاحظات.");
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
    if (player.src) {
      player.currentTime = tsToSeconds(f.t_start);
      player.play().catch(() => {});
    }
    $("#finding-detail").innerHTML = `
      <div class="panel" style="margin:0;box-shadow:none">
        <h2>${f.id}</h2>
        <div class="evidence"><strong>الدليل:</strong> ${escapeHtml(f.evidence?.quote || "")}</div>
        ${f.evidence?.ocr_text ? `<div class="evidence"><strong>OCR:</strong> <code>${escapeHtml(f.evidence.ocr_text)}</code></div>` : ""}
        ${f.evidence?.frame ? `<div class="evidence"><strong>الإطار:</strong> ${escapeHtml(f.evidence.frame)}</div>` : ""}
        <div class="evidence"><strong>المتوقع:</strong> ${escapeHtml(f.expected || "")}</div>
        <div class="evidence"><strong>التصحيح:</strong> ${escapeHtml(f.correction || "")}</div>
        ${f.note ? `<div class="evidence"><strong>تنبيه:</strong> ${escapeHtml(f.note)}</div>` : ""}
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
      renderEmpty(panel, "لا يوجد سجل.", "مراجعة جديدة", () => showPage("new-review"));
      return;
    }
    panel.innerHTML = `
      <table class="table">
        <thead><tr><th>الفيديو</th><th>التاريخ</th><th>الحالة</th><th>الحكم</th><th>الملاحظات</th><th>التكلفة</th></tr></thead>
        <tbody>
          ${reviews
            .map(
              (r) => `<tr class="clickable" data-id="${r.review_id}">
                <td>${r.video_name || r.review_id}</td>
                <td>${r.created_at || "—"}</td>
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
    const reviews = data.reviews || [];
    const panel = $("#reports-panel");
    if (!reviews.length) {
      renderEmpty(panel, "لا توجد تقارير.");
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

  async function loadSettings() {
    const data = await api("/api/settings");
    settingsCache = data;
    if (data.providers) modelsCatalog = data.providers;
    const anthropicStatus = $("#anthropic-status");
    const groqStatus = $("#groq-status");
    if (anthropicStatus) {
      anthropicStatus.textContent = data.has_personal_anthropic
        ? "مفتاح محفوظ لهذا الحساب"
        : data.anthropic_api_key_set
          ? "يستخدم مفتاح البيئة مؤقتاً — يفضّل حفظ مفتاحك هنا"
          : "غير مضبوط";
    }
    if (groqStatus) {
      groqStatus.textContent = data.has_personal_groq
        ? "مفتاح محفوظ لهذا الحساب"
        : data.groq_api_key_set
          ? "يستخدم مفتاح البيئة مؤقتاً — يفضّل حفظ مفتاحك هنا"
          : "غير مضبوط";
    }
    const costInput = $("#settings-form [name=max_cost]");
    if (costInput) costInput.value = data.max_cost != null ? data.max_cost : "";
    const whisper = $("#settings-form [name=whisper_model]");
    if (whisper) whisper.value = data.whisper_model || "auto";
    const provider = $("#settings-provider");
    if (provider) provider.value = data.llm_provider || "groq";
    fillModels($("#settings-model"), provider?.value || "groq", data.llm_model);
  }

  async function bootstrap() {
    try {
      const me = await api("/api/me");
      if (!me.authenticated) {
        window.location.replace("/");
        return;
      }
      currentUser = me.user;
      applyRoleUI();
      showPage("new-review");
    } catch (_) {
      window.location.replace("/");
    }
  }

  $("#menu-toggle")?.addEventListener("click", () => {
    $("#sidebar")?.classList.toggle("open");
    const backdrop = $("#sidebar-backdrop");
    if (backdrop) backdrop.hidden = !$("#sidebar")?.classList.contains("open");
  });
  $("#sidebar-backdrop")?.addEventListener("click", closeMobileNav);

  $$("#nav .nav-item").forEach((btn) => {
    btn.addEventListener("click", () => showPage(btn.dataset.page));
  });
  $$("[data-goto]").forEach((btn) => {
    btn.addEventListener("click", () => showPage(btn.dataset.goto));
  });

  $$(".source-tab").forEach((tab) => {
    tab.addEventListener("click", () => setSourceMode(tab.dataset.source));
  });
  setSourceMode("drive");

  $("#provider-select")?.addEventListener("change", (e) => {
    fillModels($("#model-select"), e.target.value, settingsCache.llm_model);
  });
  $("#settings-provider")?.addEventListener("change", (e) => {
    fillModels($("#settings-model"), e.target.value);
  });

  const dropzone = $("#dropzone");
  const videoInput = $("#video-input");
  if ($("#pick-file")) $("#pick-file").onclick = () => videoInput.click();
  if (dropzone) {
    dropzone.addEventListener("click", (e) => {
      if (e.target.closest("button")) return;
      videoInput.click();
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
  }
  if (videoInput) {
    videoInput.addEventListener("change", () => {
      $("#file-name").textContent = videoInput.files[0]?.name || "لم يتم اختيار ملف";
    });
  }

  $("#login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("#login-error");
    err.hidden = true;
    const fd = new FormData(e.target);
    try {
      const data = await api("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: fd.get("username"),
          password: fd.get("password"),
        }),
      });
      currentUser = data.user;
      showApp();
    } catch (ex) {
      err.hidden = false;
      err.textContent = ex.message;
    }
  });

  $("#logout-btn").addEventListener("click", async () => {
    try {
      await fetch("/api/logout", { method: "POST", credentials: "same-origin" });
    } catch (_) {}
    window.location.replace("/");
  });

  $("#review-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("#form-error");
    err.hidden = true;
    const driveUrl = ($("#drive-url")?.value || "").trim();
    if (sourceMode === "drive" && !driveUrl) {
      err.hidden = false;
      err.textContent = "الصق لينك Google Drive.";
      return;
    }
    if (sourceMode === "file" && !videoInput?.files?.[0]) {
      err.hidden = false;
      err.textContent = "اختر ملف فيديو.";
      return;
    }
    const fd = new FormData(e.target);
    if (sourceMode === "file") {
      fd.set("video", videoInput.files[0]);
      fd.set("drive_url", "");
    } else {
      fd.delete("video");
      fd.set("drive_url", driveUrl);
    }
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
      anthropic_api_key: fd.get("anthropic_api_key") || null,
      groq_api_key: fd.get("groq_api_key") || null,
      max_cost: fd.get("max_cost") ? Number(fd.get("max_cost")) : null,
      llm_provider: fd.get("llm_provider") || null,
      llm_model: fd.get("llm_model") || null,
      whisper_model: fd.get("whisper_model") || null,
    };
    try {
      await api("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const msg = $("#settings-msg");
      msg.className = "success-banner";
      msg.hidden = false;
      msg.textContent = "تم حفظ إعدادات حسابك.";
      e.target.querySelector('[name="anthropic_api_key"]').value = "";
      e.target.querySelector('[name="groq_api_key"]').value = "";
      await loadSettings();
      await prepareReviewForm();
    } catch (ex) {
      const msg = $("#settings-msg");
      msg.className = "error-banner";
      msg.hidden = false;
      msg.textContent = ex.message;
    }
  });

  $("#filter-severity").addEventListener("change", renderFindings);
  $("#filter-category").addEventListener("change", renderFindings);

  bootstrap();
})();
