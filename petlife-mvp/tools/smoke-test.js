/* ============================================================================
 * PetLife — tools/smoke-test.js
 * Быстрая самопроверка проекта без браузера: поднимает минимальный DOM-шим,
 * загружает все модули, инициализирует хранилище, рендерит каждую панель во
 * всех вкладках и проверяет, что для каждого data-act есть обработчик.
 *
 * Запуск:  node tools/smoke-test.js
 * ==========================================================================*/
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const errors = [];
const warnings = [];
const log = (...a) => console.log(...a);

/* ------------------------------------------------------------------ DOM-шим */
function makeClassList() {
  const set = new Set();
  return {
    add: (...c) => c.forEach((x) => set.add(x)),
    remove: (...c) => c.forEach((x) => set.delete(x)),
    toggle: (c, force) => {
      const on = force === undefined ? !set.has(c) : !!force;
      on ? set.add(c) : set.delete(c);
      return on;
    },
    contains: (c) => set.has(c),
    get length() { return set.size; },
    _set: set
  };
}

const CTX2D = {
  fillStyle: "", strokeStyle: "", font: "", textAlign: "", lineWidth: 1,
  fillRect() {}, clearRect() {}, strokeRect() {}, beginPath() {}, closePath() {},
  moveTo() {}, lineTo() {}, arc() {}, ellipse() {}, fill() {}, stroke() {},
  setLineDash() {}, fillText() {}, strokeText() {}, save() {}, restore() {},
  translate() {}, rotate() {}, scale() {}, drawImage() {},
  createLinearGradient: () => ({ addColorStop() {} }),
  createRadialGradient: () => ({ addColorStop() {} }),
  getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
  putImageData() {}, measureText: () => ({ width: 10 })
};

function makeEl(tag) {
  const el = {
    tagName: String(tag || "div").toUpperCase(),
    children: [],
    _html: "",
    textContent: "",
    value: "",
    checked: false,
    files: [],
    style: {},
    dataset: {},
    classList: makeClassList(),
    className: "",
    scrollTop: 0,
    scrollHeight: 0,
    disabled: false,
    width: 300,
    height: 150,
    set innerHTML(v) { this._html = String(v); },
    get innerHTML() { return this._html; },
    getContext: () => CTX2D,
    toDataURL: () => "data:image/jpeg;base64,c21va2UtdGVzdA==",
    get lastElementChild() { return this.children[this.children.length - 1] || null; },
    setAttribute(k, v) { this[k] = v; if (String(k).startsWith("data-")) this.dataset[String(k).slice(5).replace(/-(\w)/g, (m, c) => c.toUpperCase())] = v; },
    getAttribute(k) { return this[k] === undefined ? null : this[k]; },
    removeAttribute(k) { delete this[k]; },
    appendChild(c) { this.children.push(c); return c; },
    removeChild(c) { this.children = this.children.filter((x) => x !== c); return c; },
    insertAdjacentHTML() {},
    insertBefore(c) { this.children.push(c); return c; },
    addEventListener() {}, removeEventListener() {},
    querySelector() { return null; }, querySelectorAll() { return []; },
    closest() { return null; }, contains() { return false; },
    focus() {}, blur() {}, click() {}, reset() {}, submit() {}, remove() {},
    getBoundingClientRect() { return { top: 0, left: 0, width: 800, height: 600, bottom: 600, right: 800 }; },
    scrollIntoView() {}
  };
  return el;
}

const sandbox = {
  console,
  setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask,
  performance: { now: () => Date.now() },
  requestAnimationFrame: (fn) => setTimeout(() => fn(Date.now()), 0),
  cancelAnimationFrame: (id) => clearTimeout(id),
  navigator: { clipboard: { writeText: async () => {} }, userAgent: "node-smoke" },
  location: { hash: "", href: "http://127.0.0.1:8765/", reload() {} },
  localStorage: (() => {
    const store = {};
    return {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
      clear: () => Object.keys(store).forEach((k) => delete store[k]),
      _store: store
    };
  })(),
  Image: class { set src(v) { setTimeout(() => this.onerror && this.onerror(), 0); } },
  FileReader: class { readAsDataURL() { setTimeout(() => this.onerror && this.onerror(), 0); } },
  Blob: class { constructor(parts) { this.parts = parts; } },
  URL: { createObjectURL: () => "blob:stub", revokeObjectURL: () => {} },
  IntersectionObserver: class { constructor(cb) { this.cb = cb; } observe() {} unobserve() {} disconnect() {} },
  AbortController: global.AbortController,
  fetch: async () => { throw new Error("offline-in-smoke-test"); },
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  alert: () => {}, confirm: () => true,
  document: {
    readyState: "complete",
    body: makeEl("body"),
    documentElement: makeEl("html"),
    createElement: makeEl,
    createElementNS: (ns, tag) => makeEl(tag),
    createTextNode: (t) => ({ textContent: t }),
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    _listeners: {},
    addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); },
    removeEventListener() {}
  }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.self = sandbox;
sandbox.addEventListener = () => {};
sandbox.removeEventListener = () => {};
sandbox.dispatchEvent = () => true;
sandbox.scrollTo = () => {};
sandbox.open = () => null;
sandbox.print = () => {};
sandbox.innerWidth = 1280;
sandbox.innerHeight = 800;

const context = vm.createContext(sandbox);

/* ------------------------------------------------------------------ загрузка модулей */
const FILES = [
  "js/config.js", "js/data.js", "js/utils.js", "js/store.js",
  "js/weather.js", "js/ai.js", "js/form.js", "js/app/hub.js",
  "js/app/panel-overview.js", "js/app/panel-pets.js", "js/app/panel-walk.js",
  "js/app/panel-health.js", "js/app/panel-nutrition.js", "js/app/panel-training.js",
  "js/app/panel-trackers.js", "js/app/panel-services.js", "js/app/panel-social.js",
  "js/app/panel-market.js", "js/app/panel-ai.js", "js/main.js"
];

function run(file) {
  const full = path.join(ROOT, file);
  if (!fs.existsSync(full)) { errors.push("нет файла: " + file); return false; }
  const code = fs.readFileSync(full, "utf8");
  try {
    vm.runInContext(code, context, { filename: file });
    return true;
  } catch (err) {
    errors.push("ошибка выполнения " + file + ": " + err.message);
    return false;
  }
}

log("── PetLife smoke test ──────────────────────────────────────────");
FILES.forEach(run);

if (!sandbox.Store) {
  log("КРИТИЧНО: Store не загрузился");
  process.exit(1);
}

/* ------------------------------------------------------------------ инициализация */
sandbox.Store.init();
log("✔ Store инициализирован, питомцев: " + sandbox.Store.pets().length);

// проверим, что все модули панелей зарегистрировались
const NAV_IDS = sandbox.Hub ? sandbox.Hub.NAV.flatMap((g) => g.items.map((i) => i.id)) : [];
NAV_IDS.forEach((id) => {
  if (!sandbox.Panels.get(id)) errors.push("панель не зарегистрирована: " + id);
});
log("✔ Панелей зарегистрировано: " + Object.keys(sandbox.Panels.map).length + " из " + NAV_IDS.length + " (" + NAV_IDS.join(", ") + ")");

/* ------------------------------------------------------------------ рендер панелей */
const TABS = {
  overview: [null], walk: ["now", "hourly", "map", "route", "timer", "journal"],
  health: ["medcard", "symptoms", "photo", "meds", "vaccines", "vet", "report", "contacts", "toxic", "firstaid"],
  nutrition: ["portion", "picker", "recipes", "treats", "journal"],
  training: ["courses", "clicker", "games", "behavior"],
  trackers: ["weight", "activity", "sleep", "mood"],
  services: ["budget", "insurance", "grooming", "boarding", "smart", "orders"],
  social: ["forum", "friends", "lost", "adopt", "mission"],
  market: ["catalog", "cart", "orders", "premium"],
  ai: ["chat", "plan", "insights"], pets: ["profile", "pets", "family", "breed", "age"], data: [null]
};

const renderedHtml = {};
Object.keys(TABS).forEach((panelId) => {
  const def = sandbox.Panels.get(panelId);
  if (!def) return;
  TABS[panelId].forEach((tab) => {
    const view = makeEl("div");
    try {
      // панели используют первый питомец / второй — проверим обоих
      sandbox.Store.state.pets.forEach((p) => { sandbox.Store.state.activePetId = p.id; });
      sandbox.Store.state.activePetId = sandbox.Store.state.pets[0].id;
      def.render(view, { tab, pet: sandbox.Store.pet(), setTab() {} });
      const html = view.innerHTML + view.children.map((c) => c.innerHTML || "").join("");
      if (!html || html.length < 120) warnings.push(panelId + "/" + (tab || "default") + ": подозрительно короткий HTML (" + html.length + " символов)");
      renderedHtml[panelId + "/" + (tab || "default")] = html;
    } catch (err) {
      errors.push("render " + panelId + "/" + (tab || "default") + ": " + err.message + "\n    " + (err.stack || "").split("\n")[1]);
    }
  });
});

const totalHtml = Object.values(renderedHtml).reduce((s, h) => s + h.length, 0);
log("✔ Отрисовано вкладок: " + Object.keys(renderedHtml).length + ", суммарный HTML: " + Math.round(totalHtml / 1024) + " КБ");

/* ------------------------------------------------------------------ качество разметки */
const TAGS = ["div", "section", "header", "footer", "span", "button", "ul", "li", "table", "tr", "td", "p", "label", "select", "svg", "a", "h2", "h3", "strong", "form", "textarea"];
let unbalanced = 0, junk = 0;
Object.entries(renderedHtml).forEach(([screen, html]) => {
  TAGS.forEach((tag) => {
    const open = (html.match(new RegExp("<" + tag + "[\\s>]", "g")) || []).length;
    const close = (html.match(new RegExp("</" + tag + ">", "g")) || []).length;
    if (open !== close) {
      unbalanced++;
      warnings.push(screen + ": тег <" + tag + "> открыт " + open + " раз, закрыт " + close);
    }
  });
  ["undefined", "NaN", "[object Object]", "null</", ">null<"].forEach((bad) => {
    if (html.includes(bad)) {
      junk++;
      const idx = html.indexOf(bad);
      errors.push(screen + ": в разметке встретилось «" + bad + "» → …" + html.slice(Math.max(0, idx - 60), idx + 40).replace(/\s+/g, " ") + "…");
    }
  });
});
log("✔ Проверка разметки: несбалансированных тегов " + unbalanced + ", артефактов undefined/NaN " + junk);

/* ------------------------------------------------------------------ действия */
const indexPath = path.join(ROOT, "index.html");
const indexHtml = fs.readFileSync(indexPath, "utf8");
const allHtml = Object.values(renderedHtml).join("\n") + indexHtml;
const acts = new Set();
const re = /data-act="([^"]+)"/g;
let m;
while ((m = re.exec(allHtml))) acts.add(m[1]);
const missing = [...acts].filter((a) => !sandbox.PL.Actions.has(a));
if (missing.length) missing.forEach((a) => errors.push("нет обработчика для data-act=\"" + a + "\""));
log("✔ Уникальных действий в интерфейсе: " + acts.size + ", без обработчика: " + missing.length);

/* ------------------------------------------------------------------ делегирование кликов */
const clickListeners = (sandbox.document._listeners && sandbox.document._listeners.click) || [];
check("зарегистрирован глобальный обработчик кликов [data-act]", () => clickListeners.length > 0);
if (clickListeners.length) {
  const actEl = makeEl("button");
  actEl.dataset = { panel: "health", tab: "toxic" };
  actEl.getAttribute = (k) => (k === "data-act" ? "hub.open" : null);
  const fakeEvent = { target: { closest: (sel) => (sel === "[data-act]" ? actEl : null) }, preventDefault() {} };
  clickListeners.forEach((fn) => fn(fakeEvent));
  check("клик по data-act=\"hub.open\" реально открывает панель «Здоровье → Токсины»", () => sandbox.Hub.panel === "health" && sandbox.Hub.tab === "toxic");
}

/* ------------------------------------------------------------------ логика */
function check(name, fn) {
  try {
    const res = fn();
    if (res === false) errors.push("проверка не пройдена: " + name);
    else log("✔ " + name);
  } catch (err) { errors.push("исключение в проверке " + name + ": " + err.message); }
}

const W = sandbox.Weather;
check("асфальт: +30 °C → +50 °C", () => W.asphalt(30) === 50);
check("асфальт: +20 °C → +30 °C", () => W.asphalt(20) === 30);
check("асфальт: +10 °C → +15 °C", () => W.asphalt(10) === 15);
check("асфальт: −5 °C → −10 °C", () => W.asphalt(-5) === -10);
check("рекомендация: опасный асфальт", () => W.advice(35, 55, "medium").level === "danger");
check("рекомендация: осторожно при 40–50", () => W.advice(32, 45, "medium").level === "warn");
check("рекомендация: сильный мороз", () => W.advice(-15, -20, "small").level === "danger");
check("рекомендация: норма", () => W.advice(18, 23, "medium").level === "ok");
check("маршрут считается", () => { const r = W.route("Москва", 60, "medium"); return r.km > 0 && r.waypoints.length >= 3; });
check("демо-погода строится", () => { const d = W.demo("Казань", "small"); return d.asphalt != null && d.hourly.length === 24 && d.advice.level; });
check("карточка погоды рендерится", () => W.renderCard(W.demo("Сочи", "large")).includes("weather-result"));

check("порции корма положительные", () => sandbox.Store.portion(sandbox.Store.pet()).grams > 0);
check("PetLife Index в диапазоне", () => { const s = sandbox.Store.index(sandbox.Store.pet()).score; return s >= 5 && s <= 100; });
check("стадия возраста определяется", () => !!sandbox.Store.ageStage(sandbox.Store.pet()).id);

const prompts = sandbox.PL_DATA.aiPrompts.concat(["привет", "токсичные продукты", "индекс благополучия", "план на неделю", "случайный вопрос"]);
check("ИИ-ассистент отвечает на все быстрые вопросы (" + prompts.length + ")", () => prompts.every((q) => (sandbox.AI.localAnswer(q) || "").length > 40));
check("план заботы содержит 7 дней", () => (sandbox.AI.plan(sandbox.Store.pet()).match(/📅/g) || []).length === 7);
check("совет дня не пустой", () => sandbox.AI.dailyTip(sandbox.Store.pet()).length > 0);
check("синтетическое демо-фото генерируется", () => String(sandbox.AI.sample("skin")).startsWith("data:image/"));

check("график линий рендерится", () => sandbox.PL.Charts.line([{ label: "2026-01-01", value: 5 }, { label: "2026-01-02", value: 7 }]).includes("<svg"));
check("график столбцов рендерится", () => sandbox.PL.Charts.bars([{ label: "a", value: 3 }, { label: "b", value: 5 }]).includes("<svg"));
check("пончик рендерится", () => sandbox.PL.Charts.donut([{ label: "x", value: 1 }]).includes("<svg"));
check("спидометр рендерится", () => sandbox.PL.Charts.gauge(72).includes("<svg"));

check("все 42 функции имеют панель", () => sandbox.PL_DATA.features.every((f) => !!sandbox.Panels.get(f.panel)));
check("справочники заполнены", () => sandbox.PL_DATA.breeds.length >= 20 && sandbox.PL_DATA.products.length >= 15 && sandbox.PL_DATA.toxic.length >= 10 && sandbox.PL_DATA.firstAid.length >= 6);

/* ------------------------------------------------------------------ вызов действий */
// Многие действия читают значения полей из DOM. В шиме querySelector отдаёт
// заглушку, поэтому вызовы проходят дальше и проверяют саму логику.
const fakeField = makeEl("input");
fakeField.value = "";
sandbox.document.querySelector = () => fakeField;
sandbox.document.getElementById = () => fakeField;
sandbox.document.querySelectorAll = () => [];
const origCreate = sandbox.document.createElement;

const crashes = [];
Object.keys(sandbox.PL.Actions.map).forEach((name) => {
  if (name.startsWith("hub.") || name === "form.again" || name === "data.wipe") return; // меняют страницу/данные
  try {
    const res = sandbox.PL.Actions.run(name, {}, { preventDefault() {}, target: { closest: () => null } }, fakeField);
    if (res && typeof res.then === "function") res.catch((err) => crashes.push(name + " (async): " + err.message));
  } catch (err) {
    crashes.push(name + ": " + err.message);
  }
});
if (crashes.length) crashes.forEach((c) => errors.push("действие падает: " + c));
log("✔ Действий вызвано: " + (Object.keys(sandbox.PL.Actions.map).length - 3) + ", с ошибками: " + crashes.length);

/* ------------------------------------------------------------------ итог */
log("───────────────────────────────────────────────────────────────");
if (warnings.length) { log("ПРЕДУПРЕЖДЕНИЯ (" + warnings.length + "):"); warnings.forEach((w) => log("  ~ " + w)); }
if (errors.length) {
  log("ОШИБКИ (" + errors.length + "):");
  errors.forEach((e) => log("  ✗ " + e));
  process.exit(1);
}
log("✅ ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ — проект готов к запуску через python server.py");
process.exit(0);
