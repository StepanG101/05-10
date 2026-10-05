/* ============================================================================
 * PetLife — utils.js
 * Мини-фреймворк проекта (без библиотек): DOM-хелперы, тосты, модальные окна,
 * SVG-графики, форматирование, реестр действий для data-act атрибутов.
 * ==========================================================================*/
(function () {
  "use strict";

  /* ------------------------------------------------------------------ DOM */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function html(strings, ...values) {
    return strings.reduce((acc, part, i) => acc + part + (i < values.length ? (values[i] == null ? "" : values[i]) : ""), "");
  }

  /* ------------------------------------------------------------------ формат */
  const fmt = {
    num(n, digits) {
      if (n == null || isNaN(n)) return "—";
      const d = digits == null ? (Number.isInteger(+n) ? 0 : 1) : digits;
      return (+n).toFixed(d).replace(".", ",");
    },
    int(n) { return n == null || isNaN(n) ? "—" : Math.round(+n).toLocaleString("ru-RU"); },
    money(n) { return n == null || isNaN(n) ? "—" : Math.round(+n).toLocaleString("ru-RU") + " ₽"; },
    temp(n) { return n == null || isNaN(n) ? "—" : (n > 0 ? "+" : "") + Math.round(+n) + "°C"; },
    date(iso) {
      if (!iso) return "—";
      const d = iso instanceof Date ? iso : new Date(iso);
      if (isNaN(d)) return iso;
      return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric" });
    },
    short(iso) {
      if (!iso) return "—";
      const d = iso instanceof Date ? iso : new Date(iso);
      if (isNaN(d)) return iso;
      return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
    },
    time(iso) {
      const d = iso instanceof Date ? iso : new Date(iso);
      return isNaN(d) ? "—" : d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
    },
    today() { return new Date().toISOString().slice(0, 10); },
    ago(iso) {
      const d = new Date(iso);
      if (isNaN(d)) return "—";
      const diff = (Date.now() - d.getTime()) / 1000;
      if (diff < 60) return "только что";
      if (diff < 3600) return Math.floor(diff / 60) + " мин назад";
      if (diff < 86400) return Math.floor(diff / 3600) + " ч назад";
      const days = Math.floor(diff / 86400);
      if (days === 1) return "вчера";
      if (days < 30) return days + " дн назад";
      return fmt.date(d);
    },
    plural(n, one, few, many) {
      const mod10 = Math.abs(n) % 10, mod100 = Math.abs(n) % 100;
      if (mod10 === 1 && mod100 !== 11) return one;
      if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
      return many;
    },
    days(n) { return n + " " + fmt.plural(n, "день", "дня", "дней"); },
    hours(n) { return fmt.num(n, 1) + " ч"; }
  };

  /* ------------------------------------------------------------------ тосты */
  function toastHost() {
    let host = $("#toast-host");
    if (!host) {
      host = document.createElement("div");
      host.id = "toast-host";
      host.className = "toast-host";
      document.body.appendChild(host);
    }
    return host;
  }

  function toast(text, kind = "info", ms = 3200) {
    const icons = { info: "ℹ️", ok: "✅", warn: "⚠️", error: "⛔", ai: "🤖" };
    const node = document.createElement("div");
    node.className = "toast toast-" + kind;
    node.innerHTML = `<span class="toast-ico">${icons[kind] || "ℹ️"}</span><span>${esc(text)}</span>`;
    toastHost().appendChild(node);
    requestAnimationFrame(() => node.classList.add("toast-in"));
    setTimeout(() => {
      node.classList.remove("toast-in");
      setTimeout(() => node.remove(), 320);
    }, ms);
    return node;
  }

  /* ------------------------------------------------------------------ модалки */
  let modalStack = [];

  function modal(opts) {
    const o = Object.assign({ title: "", body: "", actions: [], wide: false, icon: "" }, opts || {});
    const wrap = document.createElement("div");
    wrap.className = "modal-wrap";
    const actionsHtml = o.actions.map((a, i) =>
      `<button class="btn ${a.kind === "primary" ? "btn-primary" : a.kind === "danger" ? "btn-danger" : "btn-ghost"}" data-mact="${i}">${esc(a.label)}</button>`
    ).join("");
    wrap.innerHTML = `
      <div class="modal-back" data-mclose="1"></div>
      <div class="modal ${o.wide ? "modal-wide" : ""}" role="dialog" aria-modal="true">
        <div class="modal-head">
          <h3>${o.icon ? `<span class="modal-ico">${o.icon}</span>` : ""}${esc(o.title)}</h3>
          <button class="modal-x" data-mclose="1" aria-label="Закрыть">✕</button>
        </div>
        <div class="modal-body">${o.body}</div>
        ${actionsHtml ? `<div class="modal-foot">${actionsHtml}</div>` : ""}
      </div>`;
    document.body.appendChild(wrap);
    document.body.classList.add("no-scroll");
    modalStack.push(wrap);
    requestAnimationFrame(() => wrap.classList.add("open"));

    const close = (result) => {
      wrap.classList.remove("open");
      setTimeout(() => {
        wrap.remove();
        modalStack = modalStack.filter((m) => m !== wrap);
        if (!modalStack.length) document.body.classList.remove("no-scroll");
      }, 220);
      if (typeof o.onClose === "function") o.onClose(result);
    };

    wrap.addEventListener("click", (e) => {
      const closeBtn = e.target.closest("[data-mclose]");
      if (closeBtn) { close(null); return; }
      const actBtn = e.target.closest("[data-mact]");
      if (actBtn) {
        const action = o.actions[+actBtn.dataset.mact];
        if (!action) return;
        if (action.keepOpen) { action.onClick && action.onClick(wrap, close); return; }
        const res = action.onClick ? action.onClick(wrap) : true;
        if (res !== false) close(action.value === undefined ? true : action.value);
      }
    });
    document.addEventListener("keydown", function onKey(e) {
      if (e.key === "Escape" && modalStack.includes(wrap)) {
        close(null);
        document.removeEventListener("keydown", onKey);
      }
    });
    // фокус на первый интерактивный элемент
    setTimeout(() => { const f = wrap.querySelector("input,select,textarea,button.btn-primary"); f && f.focus(); }, 60);
    return { node: wrap, close };
  }

  function confirmDialog(text, opts) {
    const o = Object.assign({ title: "Подтвердите действие", ok: "Да", cancel: "Отмена", danger: false, icon: "❓" }, opts || {});
    return new Promise((resolve) => {
      modal({
        title: o.title, icon: o.icon,
        body: `<p class="modal-text">${esc(text)}</p>`,
        actions: [
          { label: o.cancel, kind: "ghost" },
          { label: o.ok, kind: o.danger ? "danger" : "primary", value: true }
        ],
        onClose: (res) => resolve(res === true)
      });
    });
  }

  function promptDialog(title, opts) {
    const o = Object.assign({ label: "", value: "", placeholder: "", type: "text", icon: "✍️", hint: "" }, opts || {});
    return new Promise((resolve) => {
      let value = null;
      const id = "pr-" + Math.random().toString(36).slice(2, 7);
      modal({
        title, icon: o.icon,
        body: `<label class="field"><span class="field-label">${esc(o.label)}</span>
               <input class="input" id="${id}" type="${o.type}" value="${esc(o.value)}" placeholder="${esc(o.placeholder)}"></label>
               ${o.hint ? `<p class="muted small">${esc(o.hint)}</p>` : ""}`,
        actions: [
          { label: "Отмена" },
          { label: "Сохранить", kind: "primary", onClick: (wrap) => { value = wrap.querySelector("#" + id).value.trim(); return true; } }
        ],
        onClose: (res) => resolve(res === true ? value : null)
      });
    });
  }

  /* ------------------------------------------------------------------ сборка блоков */
  function card(o) {
    return `<section class="card ${o.className || ""}">
      ${o.title ? `<header class="card-head">
        <h3>${o.icon ? `<span class="card-ico">${o.icon}</span>` : ""}${esc(o.title)}</h3>
        ${o.tools || ""}
      </header>` : ""}
      <div class="card-body">${o.body || ""}</div>
      ${o.foot ? `<footer class="card-foot">${o.foot}</footer>` : ""}
    </section>`;
  }

  function stat(o) {
    return `<div class="stat ${o.kind || ""}">
      ${o.icon ? `<div class="stat-ico">${o.icon}</div>` : ""}
      <div class="stat-main">
        <div class="stat-value">${o.value}</div>
        <div class="stat-label">${esc(o.label)}</div>
        ${o.hint ? `<div class="stat-hint">${o.hint}</div>` : ""}
      </div>
    </div>`;
  }

  function badge(text, kind = "info") { return `<span class="badge badge-${kind}">${esc(text)}</span>`; }

  function progress(pct, kind) {
    return `<div class="progress ${kind ? "progress-" + kind : ""}" role="progressbar"><span style="width:${Math.max(0, Math.min(100, pct))}%"></span></div>`;
  }

  function empty(icon, title, text, action) {
    return `<div class="empty">
      <div class="empty-ico">${icon}</div>
      <div class="empty-title">${esc(title)}</div>
      <div class="empty-text">${esc(text || "")}</div>
      ${action || ""}
    </div>`;
  }

  function field(o) {
    const id = "f-" + Math.random().toString(36).slice(2, 8);
    o.id = o.id || id;
    let control;
    if (o.type === "select") {
      control = `<select class="input" id="${o.id}" ${o.attrs || ""}>${(o.options || []).map((op) =>
        `<option value="${esc(op.value)}" ${String(op.value) === String(o.value) ? "selected" : ""}>${esc(op.label)}</option>`).join("")}</select>`;
    } else if (o.type === "textarea") {
      control = `<textarea class="input input-area" id="${o.id}" rows="${o.rows || 3}" placeholder="${esc(o.placeholder || "")}" ${o.attrs || ""}>${esc(o.value || "")}</textarea>`;
    } else if (o.type === "checkbox") {
      control = `<label class="check"><input type="checkbox" id="${o.id}" ${o.checked ? "checked" : ""} ${o.attrs || ""}><span>${esc(o.checkLabel || "")}</span></label>`;
    } else {
      control = `<input class="input" id="${o.id}" type="${o.type || "text"}" value="${esc(o.value == null ? "" : o.value)}"
        placeholder="${esc(o.placeholder || "")}" ${o.attrs || ""}>`;
    }
    return `<label class="field ${o.className || ""}">
      ${o.label ? `<span class="field-label">${esc(o.label)}</span>` : ""}
      ${control}
      ${o.hint ? `<span class="field-hint">${esc(o.hint)}</span>` : ""}
    </label>`;
  }

  function table(head, rows, opts) {
    const o = opts || {};
    return `<div class="table-wrap"><table class="table ${o.className || ""}">
      <thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
      <tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody>
    </table></div>`;
  }

  function list(items, className) {
    if (!items.length) return "";
    return `<ul class="list ${className || ""}">${items.map((i) => `<li>${i}</li>`).join("")}</ul>`;
  }

  function bullets(title, items) {
    return `<div class="bullets"><div class="bullets-title">${title}</div><ul>${items.map((i) => `<li>${i}</li>`).join("")}</ul></div>`;
  }

  /* ------------------------------------------------------------------ графики (SVG) */
  const Charts = {
    palette: ["#2C5F8D", "#4CAF50", "#FF9800", "#8E44AD", "#00ACC1", "#E53935"],

    line(data, opts) {
      const o = Object.assign({ height: 150, width: 520, color: "#2C5F8D", fill: true, unit: "", target: null, min: null, max: null }, opts || {});
      if (!data.length) return `<div class="chart-empty">Нет данных для графика</div>`;
      const pad = { l: 34, r: 12, t: 14, b: 24 };
      const w = o.width, h = o.height;
      const values = data.map((d) => +d.value);
      let min = o.min != null ? o.min : Math.min(...values);
      let max = o.max != null ? o.max : Math.max(...values);
      if (min === max) { min -= 1; max += 1; }
      const span = max - min;
      const px = (i) => pad.l + (i * (w - pad.l - pad.r)) / Math.max(1, data.length - 1);
      const py = (v) => pad.t + (1 - (v - min) / span) * (h - pad.t - pad.b);
      const pts = data.map((d, i) => [px(i), py(+d.value)]);
      const path = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
      const area = `${path} L ${pts[pts.length - 1][0].toFixed(1)} ${h - pad.b} L ${pts[0][0].toFixed(1)} ${h - pad.b} Z`;
      const gridLines = [0, 0.25, 0.5, 0.75, 1].map((t) => {
        const y = pad.t + t * (h - pad.t - pad.b);
        const val = max - t * span;
        return `<line x1="${pad.l}" y1="${y.toFixed(1)}" x2="${w - pad.r}" y2="${y.toFixed(1)}" class="c-grid"/>
                <text x="${pad.l - 5}" y="${(y + 3).toFixed(1)}" class="c-axis" text-anchor="end">${fmt.num(val, span < 6 ? 1 : 0)}</text>`;
      }).join("");
      const targetLine = o.target != null && o.target >= min && o.target <= max
        ? `<line x1="${pad.l}" y1="${py(o.target).toFixed(1)}" x2="${w - pad.r}" y2="${py(o.target).toFixed(1)}" class="c-target"/>
           <text x="${w - pad.r}" y="${(py(o.target) - 4).toFixed(1)}" class="c-target-label" text-anchor="end">цель ${fmt.num(o.target, 1)}${o.unit}</text>` : "";
      const dots = pts.map((p, i) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.4" class="c-dot"><title>${esc(fmt.short(data[i].label))}: ${fmt.num(data[i].value, 1)}${o.unit}</title></circle>`).join("");
      const labels = data.length > 1 ? data.map((d, i) => (i % Math.ceil(data.length / 6) === 0 || i === data.length - 1)
        ? `<text x="${px(i).toFixed(1)}" y="${h - 6}" class="c-axis" text-anchor="middle">${esc(fmt.short(d.label))}</text>` : "").join("") : "";
      return `<svg class="chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img">
        ${gridLines}${targetLine}
        ${o.fill ? `<path d="${area}" fill="url(#grad-${o.color.replace("#", "")})" opacity="0.18"/>` : ""}
        <defs><linearGradient id="grad-${o.color.replace("#", "")}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${o.color}"/><stop offset="100%" stop-color="${o.color}" stop-opacity="0"/>
        </linearGradient></defs>
        <path d="${path}" fill="none" stroke="${o.color}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>
        ${dots}${labels}
      </svg>`;
    },

    bars(data, opts) {
      const o = Object.assign({ height: 150, width: 520, color: "#4CAF50", unit: "", target: null, min: 0 }, opts || {});
      if (!data.length) return `<div class="chart-empty">Нет данных для графика</div>`;
      const pad = { l: 34, r: 12, t: 14, b: 24 };
      const w = o.width, h = o.height;
      const values = data.map((d) => +d.value);
      const max = Math.max(o.target || 0, ...values) * 1.15 || 1;
      const min = o.min;
      const py = (v) => pad.t + (1 - (v - min) / (max - min)) * (h - pad.t - pad.b);
      const slot = (w - pad.l - pad.r) / data.length;
      const bw = Math.min(38, slot * 0.62);
      const gridLines = [0, 0.5, 1].map((t) => {
        const y = pad.t + t * (h - pad.t - pad.b);
        return `<line x1="${pad.l}" y1="${y.toFixed(1)}" x2="${w - pad.r}" y2="${y.toFixed(1)}" class="c-grid"/>
                <text x="${pad.l - 5}" y="${(y + 3).toFixed(1)}" class="c-axis" text-anchor="end">${fmt.num(max - t * (max - min), 0)}</text>`;
      }).join("");
      const bars = data.map((d, i) => {
        const x = pad.l + i * slot + (slot - bw) / 2;
        const y = py(+d.value);
        const hh = h - pad.b - y;
        return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1, hh).toFixed(1)}" rx="5" fill="${d.color || o.color}" class="c-bar">
          <title>${esc(d.label)}: ${fmt.num(d.value, 1)}${o.unit}</title></rect>
          <text x="${(x + bw / 2).toFixed(1)}" y="${h - 6}" class="c-axis" text-anchor="middle">${esc(d.short || fmt.short(d.label))}</text>`;
      }).join("");
      const targetLine = o.target ? `<line x1="${pad.l}" y1="${py(o.target).toFixed(1)}" x2="${w - pad.r}" y2="${py(o.target).toFixed(1)}" class="c-target"/>` : "";
      return `<svg class="chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img">${gridLines}${targetLine}${bars}</svg>`;
    },

    donut(parts, opts) {
      const o = Object.assign({ size: 160, thickness: 22, center: "", centerSub: "" }, opts || {});
      const total = parts.reduce((s, p) => s + (+p.value || 0), 0);
      if (!total) return `<div class="chart-empty">Нет данных</div>`;
      const r = o.size / 2 - o.thickness / 2;
      const c = 2 * Math.PI * r;
      let offset = 0;
      const arcs = parts.map((p, i) => {
        const frac = (+p.value || 0) / total;
        const seg = `<circle class="c-arc" cx="${o.size / 2}" cy="${o.size / 2}" r="${r}" fill="none"
          stroke="${p.color || Charts.palette[i % Charts.palette.length]}" stroke-width="${o.thickness}"
          stroke-dasharray="${(frac * c).toFixed(2)} ${(c - frac * c).toFixed(2)}"
          stroke-dashoffset="${(-offset * c).toFixed(2)}" transform="rotate(-90 ${o.size / 2} ${o.size / 2})">
          <title>${esc(p.label)}: ${fmt.money(p.value)} (${Math.round(frac * 100)}%)</title></circle>`;
        offset += frac;
        return seg;
      }).join("");
      return `<div class="donut-wrap"><svg class="donut" viewBox="0 0 ${o.size} ${o.size}" width="${o.size}" height="${o.size}">
        <circle cx="${o.size / 2}" cy="${o.size / 2}" r="${r}" fill="none" stroke="#EEF1F5" stroke-width="${o.thickness}"/>
        ${arcs}
        <text x="50%" y="${o.centerSub ? "46%" : "52%"}" class="donut-value" text-anchor="middle">${esc(o.center)}</text>
        ${o.centerSub ? `<text x="50%" y="62%" class="donut-sub" text-anchor="middle">${esc(o.centerSub)}</text>` : ""}
      </svg></div>`;
    },

    gauge(value, opts) {
      const o = Object.assign({ size: 190, label: "PetLife Index", max: 100 }, opts || {});
      const v = Math.max(0, Math.min(o.max, value));
      const frac = v / o.max;
      const r = o.size / 2 - 18;
      const c = Math.PI * r; // полукруг
      const color = frac > 0.8 ? "#43A047" : frac > 0.6 ? "#4CAF50" : frac > 0.4 ? "#FB8C00" : "#E53935";
      return `<svg class="gauge" viewBox="0 0 ${o.size} ${o.size * 0.66}" width="${o.size}" height="${o.size * 0.66}">
        <path d="M 18 ${o.size * 0.55} A ${r} ${r} 0 0 1 ${o.size - 18} ${o.size * 0.55}" fill="none" stroke="#EEF1F5" stroke-width="16" stroke-linecap="round"/>
        <path d="M 18 ${o.size * 0.55} A ${r} ${r} 0 0 1 ${o.size - 18} ${o.size * 0.55}" fill="none" stroke="${color}" stroke-width="16"
          stroke-linecap="round" stroke-dasharray="${(frac * c).toFixed(1)} ${c.toFixed(1)}"/>
        <text x="50%" y="${o.size * 0.45}" class="gauge-value" text-anchor="middle" fill="${color}">${Math.round(v)}</text>
        <text x="50%" y="${o.size * 0.56}" class="gauge-label" text-anchor="middle">${esc(o.label)}</text>
      </svg>`;
    },

    sparkline(values, opts) {
      const o = Object.assign({ width: 120, height: 32, color: "#2C5F8D" }, opts || {});
      if (!values || values.length < 2) return "";
      const min = Math.min(...values), max = Math.max(...values);
      const span = max - min || 1;
      const pts = values.map((v, i) => [
        (i * o.width) / (values.length - 1),
        o.height - 4 - ((v - min) / span) * (o.height - 8)
      ]);
      const d = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
      return `<svg class="spark" viewBox="0 0 ${o.width} ${o.height}" width="${o.width}" height="${o.height}">
        <path d="${d}" fill="none" stroke="${o.color}" stroke-width="2" stroke-linecap="round"/></svg>`;
    }
  };

  /* ------------------------------------------------------------------ реестр действий */
  const Actions = {
    map: {},
    register(name, handler) { this.map[name] = handler; },
    registerAll(obj) { Object.assign(this.map, obj); },
    has(name) { return typeof this.map[name] === "function"; },
    run(name, dataset, event, el) {
      const fn = this.map[name];
      if (!fn) { console.warn("PetLife: неизвестное действие", name); return; }
      try { return fn(dataset || {}, event, el); }
      catch (err) { console.error("PetLife: ошибка действия " + name, err); toast("Что-то пошло не так. Попробуйте позже.", "error"); }
    }
  };

  /* ------------------------------------------------------------------ прочее */
  function scrollToEl(target, offset = 76) {
    const node = typeof target === "string" ? $(target) : target;
    if (!node) return;
    const y = node.getBoundingClientRect().top + window.pageYOffset - offset;
    window.scrollTo({ top: y, behavior: "smooth" });
  }

  function revealInit() {
    const items = $$(".reveal");
    if (!("IntersectionObserver" in window)) { items.forEach((i) => i.classList.add("in")); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    items.forEach((i) => io.observe(i));
  }

  function observeOnce(node, cb, threshold) {
    if (!node) return;
    if (!("IntersectionObserver" in window)) { cb(); return; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { cb(); io.disconnect(); }
    }, { threshold: threshold || 0.3 });
    io.observe(node);
  }

  function animateNumber(node, to, opts) {
    const o = Object.assign({ duration: 2000, suffix: "", prefix: "" }, opts || {});
    const start = performance.now();
    const from = 0;
    function frame(now) {
      const t = Math.min(1, (now - start) / o.duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const value = Math.round(from + (to - from) * eased);
      node.textContent = o.prefix + value.toLocaleString("ru-RU") + o.suffix;
      if (t < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function typewriter(node, text, speed = 12) {
    return new Promise((resolve) => {
      let i = 0;
      node.textContent = "";
      node.classList.add("typing");
      const timer = setInterval(() => {
        i += Math.max(1, Math.round(text.length / 220));
        node.textContent = text.slice(0, i);
        if (i >= text.length) { clearInterval(timer); node.classList.remove("typing"); resolve(); }
      }, speed);
    });
  }

  function debounce(fn, ms) {
    let t;
    return function () { clearTimeout(t); const args = arguments; t = setTimeout(() => fn.apply(null, args), ms || 250); };
  }

  function debounceImmediate(fn) { let busy = false; return function (...a) { if (busy) return; busy = true; Promise.resolve(fn(...a)).finally(() => { busy = false; }); }; }

  function download(filename, content, type) {
    const blob = new Blob([content], { type: type || "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function pick(options) {
    return options[Math.floor(Math.random() * options.length)];
  }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  window.PL = { $, $$, esc, html, fmt, toast, modal, confirmDialog, promptDialog, card, stat, badge, progress, empty, field, table, list, bullets, Charts, Actions, scrollToEl, revealInit, observeOnce, animateNumber, typewriter, debounce, debounceImmediate, download, pick, clamp };
  window.UI = window.PL; // короткий алиас
})();
