(() => {
  const form = document.getElementById("login-form");
  const err = document.getElementById("login-error");
  const btn = document.getElementById("login-btn");
  const toggle = document.getElementById("toggle-pass");
  const password = document.getElementById("password");

  async function redirectIfAuthed() {
    try {
      const res = await fetch("/api/me", { credentials: "same-origin" });
      const data = await res.json();
      if (data.authenticated) {
        window.location.replace("/app");
      }
    } catch (_) {}
  }

  toggle?.addEventListener("click", () => {
    const show = password.type === "password";
    password.type = show ? "text" : "password";
    toggle.textContent = show ? "إخفاء" : "عرض";
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    err.hidden = true;
    btn.disabled = true;
    const fd = new FormData(form);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: fd.get("username"),
          password: fd.get("password"),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail || "تعذر تسجيل الدخول");
      }
      window.location.replace("/app");
    } catch (ex) {
      err.hidden = false;
      err.textContent = ex.message || "تعذر تسجيل الدخول";
    } finally {
      btn.disabled = false;
    }
  });

  redirectIfAuthed();
})();
