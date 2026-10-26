/* ==========================================================================
   1section studio — shared UI helpers
   Everything hangs off the global `UI` namespace so page scripts can define
   their own locals (esc, fmt, ...) without collisions.
   ========================================================================== */
(function () {
  const UI = (window.UI = {});

  /* ---------- formatting ---------- */
  UI.esc = function (value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  };

  const nfCompact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
  const nfFull = new Intl.NumberFormat("en");

  UI.fmt = function (n) {
    const v = Number(n);
    if (n == null || !Number.isFinite(v)) return "—";
    return Math.abs(v) >= 10000 ? nfCompact.format(v) : nfFull.format(v);
  };

  UI.fmtExact = function (n) {
    const v = Number(n);
    if (n == null || !Number.isFinite(v)) return "—";
    return nfFull.format(v);
  };

  UI.bytes = function (bytes) {
    const b = Number(bytes) || 0;
    if (b >= 1073741824) return (b / 1073741824).toFixed(2) + " GB";
    if (b >= 1048576) return (b / 1048576).toFixed(1) + " MB";
    if (b >= 1024) return Math.round(b / 1024) + " KB";
    return b + " B";
  };

  UI.duration = function (seconds) {
    if (seconds == null || !Number.isFinite(Number(seconds))) return "—";
    const s = Math.max(0, Number(seconds));
    const m = Math.floor(s / 60);
    return m + ":" + String(Math.round(s % 60)).padStart(2, "0");
  };

  // SQLite stores `datetime('now')` as "YYYY-MM-DD HH:MM:SS" in UTC.
  function toDate(value) {
    if (!value) return null;
    let v = String(value);
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(v)) v = v.replace(" ", "T") + "Z";
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  UI.relTime = function (value) {
    const d = toDate(value);
    if (!d) return "—";
    const diff = Date.now() - d.getTime();
    const m = Math.round(diff / 60000);
    if (m < 1) return "just now";
    if (m < 60) return m + "m ago";
    const h = Math.round(m / 60);
    if (h < 24) return h + "h ago";
    const days = Math.round(h / 24);
    if (days < 30) return days + "d ago";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  UI.dateTime = function (value) {
    const d = toDate(value);
    if (!d) return "—";
    return d.toLocaleString("en-US", {
      month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  };

  UI.date = function (value) {
    const d = toDate(value);
    if (!d) return "—";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  UI.initials = function (name) {
    const s = String(name || "?").replace(/^@/, "").replace(/[^a-zA-Z0-9]/g, "");
    return (s.slice(0, 2) || "?").toUpperCase();
  };

  UI.serviceLabel = function (service) {
    return String(service || "").replace(/^./, (c) => c.toUpperCase());
  };

  /* ---------- http ---------- */
  UI.api = async function (path, opts) {
    const options = Object.assign({}, opts);
    options.headers = Object.assign(
      { Accept: "application/json" },
      options.body ? { "Content-Type": "application/json" } : {},
      opts && opts.headers ? opts.headers : {}
    );

    const res = await fetch(path, options);
    let data = null;
    try { data = await res.json(); } catch { /* empty body */ }

    if (res.status === 401) {
      UI.toast("Session expired — reload the page to sign in again.", "err");
      throw new Error("Unauthorized");
    }
    if (!res.ok) throw new Error((data && data.error) || res.statusText || "Request failed");
    return data;
  };

  UI.post = (path, body) => UI.api(path, { method: "POST", body: JSON.stringify(body || {}) });
  UI.put = (path, body) => UI.api(path, { method: "PUT", body: JSON.stringify(body || {}) });
  UI.del = (path) => UI.api(path, { method: "DELETE" });

  /* ---------- toast ---------- */
  function toastStack() {
    let stack = document.querySelector(".toast-stack");
    if (!stack) {
      stack = document.createElement("div");
      stack.className = "toast-stack";
      document.body.appendChild(stack);
    }
    return stack;
  }

  UI.toast = function (message, type) {
    const el = document.createElement("div");
    el.className = "toast" + (type === "err" || type === true ? " err" : type === "ok" ? " ok" : "");
    el.textContent = message;
    toastStack().appendChild(el);
    requestAnimationFrame(() => el.classList.add("show"));
    setTimeout(() => {
      el.classList.remove("show");
      setTimeout(() => el.remove(), 250);
    }, 3600);
  };

  /* ---------- modals ---------- */
  UI.openModal = function (id) {
    const el = typeof id === "string" ? document.getElementById(id) : id;
    if (el) el.classList.add("open");
    return el;
  };

  UI.closeModal = function (id) {
    const el = typeof id === "string" ? document.getElementById(id) : id;
    if (el) el.classList.remove("open");
  };

  // Backdrop click + Escape close every open modal.
  document.addEventListener("click", (e) => {
    if (e.target.classList && e.target.classList.contains("modal-backdrop")) {
      e.target.classList.remove("open");
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    document.querySelectorAll(".modal-backdrop.open").forEach((el) => el.classList.remove("open"));
  });

  /* ---------- confirm dialog ---------- */
  UI.confirm = function ({ title = "Are you sure?", body = "", confirmLabel = "Confirm", cancelLabel = "Cancel", danger = false } = {}) {
    return new Promise((resolve) => {
      const backdrop = document.createElement("div");
      backdrop.className = "modal-backdrop open";
      backdrop.innerHTML = `
        <div class="modal" role="dialog" aria-modal="true">
          <div class="modal-head"><h3>${UI.esc(title)}</h3>${body ? `<p>${UI.esc(body)}</p>` : ""}</div>
          <div class="modal-foot">
            <button class="btn" data-act="cancel">${UI.esc(cancelLabel)}</button>
            <button class="btn ${danger ? "btn-danger" : "btn-primary"}" data-act="ok">${UI.esc(confirmLabel)}</button>
          </div>
        </div>`;
      document.body.appendChild(backdrop);

      const done = (value) => {
        document.removeEventListener("keydown", onKey);
        backdrop.remove();
        resolve(value);
      };

      function onKey(e) {
        if (e.key === "Escape") done(false);
      }
      document.addEventListener("keydown", onKey);

      backdrop.addEventListener("click", (e) => {
        if (e.target === backdrop) return done(false);
        const act = e.target.closest("[data-act]");
        if (!act) return;
        done(act.dataset.act === "ok");
      });

      backdrop.querySelector('[data-act="ok"]').focus();
    });
  };

  /* ---------- generate (long-running pipeline call) ---------- */
  UI.generateNow = async function (btn, opts = {}) {
    const original = btn.innerHTML;
    btn.disabled = true;
    btn.classList.add("is-busy");
    btn.innerHTML = `<span class="spinner"></span> ${UI.esc(opts.label || "Generating…")}`;

    try {
      const res = await UI.api("/api/generate", { method: "POST" });
      const video = res.video;

      if (video && video.status === "success") {
        UI.toast(`Video #${video.id} generated and posted`, "ok");
      } else if (video && video.status === "failed") {
        UI.toast(`Rendered but upload failed: ${(video.last_error || "unknown error").slice(0, 160)}`, "err");
      } else if (res.result && res.result.error) {
        UI.toast(res.result.error, "err");
      } else if (res.result && res.result.skipped) {
        UI.toast("Duplicate content — slot skipped", "err");
      } else {
        UI.toast("Generation finished");
      }

      if (opts.redirect) {
        location.href = opts.redirect;
        return;
      }
      if (opts.reload !== false) setTimeout(() => location.reload(), 1000);
    } catch (err) {
      UI.toast(err.message, "err");
      btn.disabled = false;
      btn.classList.remove("is-busy");
      btn.innerHTML = original;
    }
  };

  /* ---------- small nav niceties ---------- */
  function hydrateTimes(root) {
    (root || document).querySelectorAll("[data-rel]").forEach((el) => {
      el.textContent = UI.relTime(el.getAttribute("data-rel"));
    });
    (root || document).querySelectorAll("[data-date]").forEach((el) => {
      el.textContent = UI.dateTime(el.getAttribute("data-date"));
    });
  }

  UI.hydrateTimes = hydrateTimes;

  window.addEventListener("DOMContentLoaded", () => {
    hydrateTimes(document);

    const active = document.querySelector(".nav-link.active");
    if (active && window.matchMedia("(max-width: 900px)").matches) {
      active.scrollIntoView({ block: "nearest", inline: "center" });
    }
  });
})();
