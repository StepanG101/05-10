/* ============================================================================
 * PetLife — app/hub.js
 * Каркас рабочего кабинета: реестр панелей, навигация, переключатель питомцев,
 * командная палитра (Ctrl+K), сохранение вкладок, экспорт/импорт данных.
 * ==========================================================================*/
(function () {
  "use strict";
  const { $, $$, esc, fmt, toast, modal, confirmDialog, Actions } = window.PL;
  const D = window.PL_DATA;
  const KEY = "petlife.hub.v2";

  /* ---------------------------------------------------------------- панели */
  const Panels = {
    map: {},
    register(id, def) { this.map[id] = Object.assign({ id }, def); },
    get(id) { return this.map[id]; }
  };

  const NAV = [
    { group: "Сегодня", items: [
      { id: "overview", title: "Обзор", icon: "🏠", desc: "Сводка по питомцу, индекс благополучия и рекомендации" }
    ] },
    { group: "Забота", items: [
      { id: "walk", title: "Прогулка и погода", icon: "🌤", desc: "Асфальт, AQI, маршрут и таймер прогулки" },
      { id: "health", title: "Здоровье", icon: "🩺", desc: "Медкарта, симптомы, вакцины, ИИ-анализ фото, первая помощь" },
      { id: "nutrition", title: "Питание", icon: "🍽", desc: "Порции, подбор корма, рецепты и лакомства" }
    ] },
    { group: "Развитие", items: [
      { id: "training", title: "Дрессировка", icon: "🎓", desc: "Курсы, прогресс, игры для ума и анализ поведения" },
      { id: "trackers", title: "Трекеры", icon: "📈", desc: "Вес, активность, сон и настроение" }
    ] },
    { group: "Экосистема", items: [
      { id: "social", title: "Сообщество и форум", icon: "💬", desc: "Форум, друзья для прогулок, потеряшки, усыновление" },
      { id: "market", title: "Маркетплейс", icon: "🛒", desc: "Корма, игрушки, услуги и заказы" },
      { id: "services", title: "Сервисы и бюджет", icon: "🧾", desc: "Бюджет, страховки, груминг, передержка, умный дом" }
    ] },
    { group: "Интеллект", items: [
      { id: "ai", title: "ИИ-ассистент", icon: "🤖", desc: "Чат по вашим данным, план заботы и прогнозы" },
      { id: "pets", title: "Питомцы и семья", icon: "🐾", desc: "Профили, советы по породе и возрасту, семейный доступ" },
      { id: "data", title: "Данные и настройки", icon: "⚙️", desc: "Экспорт, импорт, демо-данные, сброс" }
    ] }
  ];

  const Hub = {
    Panels,
    NAV,
    panel: "overview",
    tab: null,
    query: "",
    _queued: false,

    init() {
      try {
        const saved = JSON.parse(localStorage.getItem(KEY) || "{}");
        if (saved.panel && Panels.get(saved.panel)) this.panel = saved.panel;
      } catch (e) { /* ignore */ }
      this.render();
    },

    persist() { try { localStorage.setItem(KEY, JSON.stringify({ panel: this.panel })); } catch (e) {} },

    open(panel, tab) {
      if (Panels.get(panel)) this.panel = panel;
      this.tab = tab || null;
      this.persist();
      this.render();
      const shell = $("#hubRoot");
      if (shell && shell.getBoundingClientRect().top < 0) window.PL.scrollToEl(shell, 90);
    },

    refresh() {
      if (this._queued) return;
      this._queued = true;
      requestAnimationFrame(() => { this._queued = false; this.render(); });
    },

    /* ------------------------------------------------------------ разметка */
    render() {
      const root = $("#hubRoot");
      if (!root) return;
      const S = window.Store.state;
      const pet = window.Store.pet();
      const breed = window.Store.breed(pet);
      const def = Panels.get(this.panel) || Panels.get("overview");
      const counts = this.counts();

      const petsHtml = S.pets.map((p) => {
        const b = window.Store.breed(p);
        return `<button class="pet-chip ${p.id === pet.id ? "active" : ""}" data-act="hub.pet" data-id="${p.id}">
          <span class="pc-emoji">${esc(p.emoji || "🐾")}</span>
          <span class="pc-meta">
            <span class="pc-name">${esc(p.name)}</span>
            <span class="pc-sub">${esc(b.name)} · ${esc(window.Store.ageLabel(p))}</span>
          </span>
        </button>`;
      }).join("");

      const navHtml = NAV.map((group) => {
        const items = group.items.filter((it) => !this.query || (Panels.get(it.id) || it).title.toLowerCase().includes(this.query.toLowerCase()));
        if (!items.length) return "";
        return `<div class="hub-nav-group">${esc(group.group)}</div>` + items.map((it) => {
          const badge = counts[it.id];
          return `<button class="nav-item ${this.panel === it.id ? "active" : ""}" data-act="hub.open" data-panel="${it.id}" title="${esc(it.desc || "")}">
            <span class="ni-ico">${it.icon}</span><span>${esc(it.title)}</span>
            ${badge ? `<span class="ni-badge">${badge}</span>` : ""}
          </button>`;
        }).join("");
      }).join("");

      const mobileNav = NAV.flatMap((g) => g.items).map((it) =>
        `<button class="tag ${this.panel === it.id ? "active" : ""}" data-act="hub.open" data-panel="${it.id}">${it.icon} ${esc(it.title)}</button>`
      ).join("");

      root.innerHTML = `
        <div class="hub-shell">
          <aside class="hub-side">
            <div class="hub-brand">
              <span class="logo-mark">🐾</span>
              <span>PetLife Hub<small>${esc(S.owner.name || "Владелец")}${S.owner.premium ? " · Premium ❤️" : ""}</small></span>
            </div>
            <div class="hub-pets">
              <div class="hub-pets-title">Мои питомцы (${S.pets.length})</div>
              ${petsHtml}
              <button class="pet-chip add" data-act="pets.add">＋ Добавить питомца</button>
            </div>
            <nav class="hub-nav">${navHtml}</nav>
            <div class="hub-side-foot">
              <button class="btn btn-sm btn-block" data-act="hub.palette">🔍 Поиск функции (Ctrl+K)</button>
              <div>Сборка ${esc((window.PETLIFE_CONFIG || {}).BUILD || "2.0")} · данные локальные</div>
            </div>
          </aside>
          <div class="hub-main">
            <div class="hub-top">
              <div>
                <h2>${def && def.icon ? def.icon + " " : ""}${esc((def && def.title) || "Обзор")}</h2>
                <div class="hub-sub">${esc((def && def.desc) || "")}</div>
              </div>
              <div class="hub-top-actions">
                <span class="hub-live"><span class="dot"></span> ${esc(pet.name)} · ${esc(breed.name)} · ${esc(window.Store.ageLabel(pet))} · ${fmt.num(pet.weight, 1)} кг</span>
                <button class="btn btn-ghost btn-sm" data-act="hub.quicklog" title="Быстрая запись">⚡ Быстрая запись</button>
                <button class="btn btn-primary btn-sm" data-act="hub.askai">🤖 Спросить ИИ</button>
              </div>
            </div>
            <div class="hub-mobile-nav">${mobileNav}</div>
            <div class="hub-view" id="hubView"></div>
          </div>
        </div>`;

      const view = $("#hubView");
      if (def && typeof def.render === "function") {
        try {
          def.render(view, { tab: this.tab, pet, setTab: (t) => { this.tab = t; this.refresh(); } });
        } catch (err) {
          console.error("PetLife: ошибка панели " + this.panel, err);
          view.innerHTML = window.PL.empty("🛠", "Модуль не загрузился", "Обновите страницу — данные в безопасности.", `<button class="btn btn-primary" data-act="hub.reload">Обновить страницу</button>`);
        }
      } else {
        view.innerHTML = window.PL.empty("🚧", "Модуль ещё не подключён", "Файл панели " + this.panel + ".js не загружен.");
      }
      window.PL.revealInit();
    },

    counts() {
      const S = window.Store.state, pet = window.Store.pet();
      const dueMeds = (S.meds[pet.id] || []).filter((m) => {
        const d = window.Store.daysUntil(window.Store.nextDose(m).toISOString());
        return d !== null && d <= 1;
      }).length;
      const vacs = (S.vaccinations[pet.id] || []).filter((v) => v.next && window.Store.daysUntil(v.next) < 30).length;
      return {
        health: dueMeds + vacs || 0,
        walk: (S.walks || []).filter((w) => w.petId === pet.id && w.date === fmt.today()).length ? 0 : "!",
        social: (S.lostAlerts || []).filter((l) => l.status === "ищут").length,
        market: (S.cart || []).length || 0,
        services: (S.bookings || []).filter((b) => window.Store.daysUntil(b.date) >= 0).length || 0,
        trackers: (S.moods[pet.id] || []).some((m) => m.date === fmt.today()) ? 0 : "!"
      };
    },

    /* ------------------------------------------------------------ командная палитра */
    palette() {
      const all = NAV.flatMap((g) => g.items.map((i) => Object.assign({ group: g.group }, i)));
      const feats = D.features.map((f) => ({ title: f.title, icon: f.icon, group: "Функция №" + f.n, id: f.panel }));
      const body = `
        <input class="input" id="paletteInput" placeholder="Например: асфальт, прививки, форум, корм…" autocomplete="off" style="margin-bottom:12px">
        <div id="paletteList" class="stack" style="gap:8px;max-height:52vh;overflow:auto"></div>`;
      const m = modal({ title: "Поиск по экосистеме", icon: "🔍", body, wide: true });
      const list = (q) => {
        const query = (q || "").trim().toLowerCase();
        const items = [...all, ...feats].filter((i) => !query || i.title.toLowerCase().includes(query) || (i.desc || "").toLowerCase().includes(query) || i.group.toLowerCase().includes(query));
        const uniq = [];
        const seen = new Set();
        items.forEach((i) => { const k = i.title; if (!seen.has(k)) { seen.add(k); uniq.push(i); } });
        return uniq.slice(0, 40);
      };
      const paint = (q) => {
        const items = list(q);
        $("#paletteList", m.node).innerHTML = items.length ? items.map((i) =>
          `<button class="map-item" data-act="hub.goto" data-panel="${i.id}" style="width:100%;text-align:left">
            <span class="mi-ico">${i.icon}</span>
            <span><span class="mi-name">${esc(i.title)}</span><span class="mi-sub">${esc(i.group)}${i.desc ? " · " + esc(i.desc) : ""}</span></span>
          </button>`).join("") : `<div class="muted small">Ничего не найдено. Попробуйте «корм», «прививки», «форум».</div>`;
      };
      paint("");
      const input = $("#paletteInput", m.node);
      input.addEventListener("input", () => paint(input.value));
    },

    quickLog() {
      const pet = window.Store.pet();
      const body = `
        <div class="chip-row mb-2">
          ${D.moods.map((mo) => `<button class="tag" data-ql="mood" data-value="${mo.id}">${mo.emoji} ${mo.label}</button>`).join("")}
        </div>
        <div class="kv">
          <div class="kv-row"><span class="kv-k">Питомец</span><span class="kv-v">${esc(pet.name)}</span></div>
          <div class="kv-row"><span class="kv-k">Дата</span><span class="kv-v">${esc(fmt.date(new Date()))}</span></div>
        </div>
        <p class="muted small mt-2">Одна кнопка — и запись уходит в трекеры, а ИИ обновит рекомендации.</p>`;
      modal({
        title: "Быстрая запись состояния", icon: "⚡", body,
        actions: [{ label: "Закрыть" }]
      });
    }
  };

  /* ---------------------------------------------------------------- действия */
  Actions.registerAll({
    "hub.open": (ds) => Hub.open(ds.panel, ds.tab),
    "hub.focus": () => Hub.open(Hub.panel),
    "hub.pet": (ds) => { window.Store.setActivePet(ds.id); Hub.render(); },
    "hub.palette": () => Hub.palette(),
    "hub.goto": (ds, e, el) => { Hub.open(ds.panel); const x = el.closest(".modal-wrap"); $(".modal-x", x) && $(".modal-x", x).click(); },
    "hub.askai": () => Hub.open("ai"),
    "hub.reload": () => window.location.reload(),
    "hub.quicklog": () => Hub.quickLog(),
    "hub.dataset": (ds) => {
      const pet = window.Store.pet();
      const body = `<div class="kv">
        <div class="kv-row"><span class="kv-k">Питомцы</span><span class="kv-v">${window.Store.state.pets.length}</span></div>
        <div class="kv-row"><span class="kv-k">Записей в медкарте</span><span class="kv-v">${(window.Store.state.medical[pet.id] || []).length}</span></div>
        <div class="kv-row"><span class="kv-k">Прогулок</span><span class="kv-v">${(window.Store.state.walks || []).filter((w) => w.petId === pet.id).length}</span></div>
        <div class="kv-row"><span class="kv-k">Сообщений в форуме</span><span class="kv-v">${(window.Store.state.posts || []).length}</span></div>
      </div>`;
      modal({ title: "Данные демо", icon: "🗂", body });
    },
    "hub.export": () => {
      window.PL.download("petlife-data.json", window.Store.export());
      toast("Данные выгружены в petlife-data.json", "ok");
    },
    "hub.import": () => {
      const body = `<label class="field"><span class="field-label">Вставьте JSON или выберите файл</span>
        <textarea class="input input-area" id="importArea" rows="6" placeholder='{"pets":[...]}'></textarea></label>
        <input type="file" id="importFile" accept=".json">`;
      modal({
        title: "Импорт данных", icon: "📥", body, wide: true,
        actions: [{ label: "Отмена" }, {
          label: "Импортировать", kind: "primary", onClick: (wrap) => {
            const text = $("#importArea", wrap).value;
            if (!text.trim()) { toast("Вставьте JSON", "warn"); return false; }
            try { window.Store.import(text); toast("Данные импортированы", "ok"); Hub.render(); }
            catch (e) { toast("Не получилось прочитать файл. Нужен JSON из PetLife.", "error"); return false; }
            return true;
          }
        }],
        onClose: () => {}
      });
      setTimeout(() => {
        const f = $("#importFile");
        if (f) f.addEventListener("change", () => {
          const file = f.files[0]; if (!file) return;
          const r = new FileReader();
          r.onload = () => { $("#importArea").value = r.result; };
          r.readAsText(file);
        });
      }, 80);
    },
    "hub.reset": async () => {
      const ok = await confirmDialog("Сбросить всё и вернуть демо-данные? Текущие записи будут удалены.", { ok: "Сбросить", danger: true, icon: "♻️" });
      if (!ok) return;
      window.Store.reset(true);
      toast("Демо-данные восстановлены", "ok");
      Hub.open("overview");
    },
    "hub.empty": async () => {
      const ok = await confirmDialog("Начать с чистого листа? Останется один пустой профиль питомца.", { ok: "Начать заново", danger: true, icon: "🧹" });
      if (!ok) return;
      window.Store.reset(false);
      toast("Готово! Добавьте своего питомца 🐾", "ok");
      Hub.open("pets");
    }
  });

  /* горячие клавиши */
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); Hub.palette(); }
  });

  window.Store.subscribe(() => Hub.refresh());
  window.Hub = Hub;
  window.Panels = Panels;
})();
