/* ============================================================================
 * PetLife — app/panel-pets.js
 * Панели «Питомцы и семья» и «Данные и настройки»: профили, несколько
 * питомцев, семейный доступ, советы по породе и возрасту, экспорт и сброс.
 * ==========================================================================*/
(function () {
  "use strict";
  const { $, $$, esc, fmt, card, stat, badge, progress, empty, field, table, list, Charts, toast, modal, confirmDialog, promptDialog, Actions } = window.PL;
  const D = window.PL_DATA;
  const EMOJI = ["🐕", "🐶", "🦮", "🐩", "🐈", "🐱", "🐈‍⬛", "🐰", "🐹", "🦜", "🐢", "🐠", "🐾", "🐕‍🦺", "🐺"];

  function pet() { return window.Store.pet(); }

  /* =====================================================================
   * ПАНЕЛЬ «ПИТОМЦЫ И СЕМЬЯ»
   * ===================================================================*/
  function tabProfile(view) {
    const p = pet();
    const breed = window.Store.breed(p);
    const species = window.Store.pets().map((x) => x.breedId);
    view.innerHTML = `
      <div class="panel-grid cols-2" style="grid-template-columns:1.15fr 1fr">
        <section class="card">
          <header class="card-head"><h3><span class="card-ico">🐾</span> Профиль питомца</h3>${badge("сохраняется автоматически", "ok")}</header>
          <div class="card-body">
            <div class="row mb-2" style="gap:14px;align-items:center">
              <div class="thumb" style="width:84px;height:84px;font-size:2.6rem" id="petAvatar">${p.photo ? `<img src="${p.photo}" style="width:100%;height:100%;object-fit:cover;border-radius:12px">` : esc(p.emoji || "🐾")}</div>
              <div style="flex:1">
                <div class="emoji-picker mb-1">
                  ${EMOJI.map((e) => `<button class="emoji-opt ${p.emoji === e ? "active" : ""}" data-act="pets.emoji" data-emoji="${e}">${e}</button>`).join("")}
                </div>
                <div class="upload-mini">
                  <input type="file" id="petPhoto" accept="image/*" hidden>
                  <button class="btn btn-ghost btn-sm" data-act="pets.photo">📷 Загрузить фото</button>
                  ${p.photo ? `<button class="btn btn-ghost btn-sm" data-act="pets.photoclear">Убрать фото</button>` : ""}
                </div>
              </div>
            </div>
            <div class="form-grid">
              ${field({ label: "Кличка", id: "petName", value: p.name })}
              ${field({ label: "Вид", type: "select", id: "petSpecies", value: p.species, options: [{ value: "dog", label: "Собака" }, { value: "cat", label: "Кошка" }] })}
              ${field({ label: "Порода", type: "select", id: "petBreed", value: p.breedId, options: D.breeds.map((b) => ({ value: b.id, label: b.emoji + " " + b.name })) })}
              ${field({ label: "Размер", type: "select", id: "petSize", value: p.size, options: [
                { value: "small", label: "Мелкий" }, { value: "medium", label: "Средний" }, { value: "large", label: "Крупный" }] })}
              ${field({ label: "Дата рождения", type: "date", id: "petBirth", value: p.birth })}
              ${field({ label: "Вес, кг", type: "number", id: "petWeight", value: p.weight, attrs: 'step="0.1"' })}
              ${field({ label: "Пол", type: "select", id: "petSex", value: p.sex, options: [{ value: "мальчик", label: "Мальчик" }, { value: "девочка", label: "Девочка" }] })}
              ${field({ label: "Город", id: "petCity", value: p.city })}
            </div>
            ${field({ type: "checkbox", id: "petSterilized", checked: p.sterilized, checkLabel: "Стерилизован(а)" })}
            ${field({ label: "Заметка о характере", type: "textarea", id: "petNote", value: p.note, placeholder: "Любит плавать, боится салютов…" })}
            <button class="btn btn-primary btn-block" data-act="pets.save">💾 Сохранить профиль</button>
          </div>
        </section>

        <div class="stack">
          <section class="card">
            <header class="card-head"><h3><span class="card-ico">⚠️</span> Аллергии и хронические болезни</h3></header>
            <div class="card-body">
              <div class="bullets-title">Аллергии</div>
              <div class="chip-row mb-2">
                ${p.allergies.length ? p.allergies.map((a) => `<button class="tag active" data-act="pets.delallergy" data-value="${esc(a)}">${esc(a)} ✕</button>`).join("") : `<span class="muted small">не отмечены</span>`}
              </div>
              <div class="row mb-2">
                <input class="input" id="newAllergy" placeholder="Например, курица" style="flex:1">
                <button class="btn btn-soft btn-sm" data-act="pets.addallergy">Добавить</button>
              </div>
              <div class="bullets-title">Хронические болезни</div>
              <div class="chip-row mb-2">
                ${p.chronic.length ? p.chronic.map((a) => `<button class="tag active" data-act="pets.delchronic" data-value="${esc(a)}">${esc(a)} ✕</button>`).join("") : `<span class="muted small">не отмечены</span>`}
              </div>
              <div class="row">
                <input class="input" id="newChronic" placeholder="Например, артроз" style="flex:1">
                <button class="btn btn-soft btn-sm" data-act="pets.addchronic">Добавить</button>
              </div>
              <div class="hint-box mt-2">Аллергии автоматически исключаются при подборе корма, рецептов и товаров в маркетплейсе.</div>
            </div>
          </section>

          <section class="card">
            <header class="card-head"><h3><span class="card-ico">📊</span> Сводка по питомцу</h3></header>
            <div class="card-body">
              <div class="kv">
                <div class="kv-row"><span class="kv-k">Возраст</span><span class="kv-v">${esc(window.Store.ageLabel(p))}</span></div>
                <div class="kv-row"><span class="kv-k">Стадия</span><span class="kv-v">${esc(window.Store.ageStage(p).emoji + " " + window.Store.ageStage(p).name)}</span></div>
                <div class="kv-row"><span class="kv-k">Породная норма веса</span><span class="kv-v">${fmt.num(breed.weight, 1)} кг</span></div>
                <div class="kv-row"><span class="kv-k">Отклонение</span><span class="kv-v">${fmt.num(((p.weight - breed.weight) / breed.weight) * 100, 0)}%</span></div>
                <div class="kv-row"><span class="kv-k">Норма прогулки</span><span class="kv-v">${breed.walk} мин/день</span></div>
                <div class="kv-row"><span class="kv-k">Комфортная температура</span><span class="kv-v">${breed.tempMin}…${breed.tempMax} °C</span></div>
                <div class="kv-row"><span class="kv-k">Норма корма</span><span class="kv-v">${window.Store.portion(p).grams} г/день</span></div>
                <div class="kv-row"><span class="kv-k">Записей в медкарте</span><span class="kv-v">${(window.Store.state.medical[p.id] || []).length}</span></div>
                <div class="kv-row"><span class="kv-k">PetLife Index</span><span class="kv-v">${window.Store.index(p).score}/100</span></div>
              </div>
              <div class="row mt-2">
                <button class="btn btn-ghost btn-sm" data-act="hub.open" data-panel="health" data-tab="report">🖨 Отчёт ветеринару</button>
                <button class="btn btn-ghost btn-sm" data-act="pets.export">📤 Экспорт профиля</button>
              </div>
            </div>
          </section>

          <section class="card">
            <header class="card-head"><h3><span class="card-ico">🗑</span> Управление</h3></header>
            <div class="card-body row">
              <button class="btn btn-ghost btn-sm" data-act="pets.duplicate">⧉ Дублировать профиль</button>
              <button class="btn btn-danger btn-sm" data-act="pets.delete">Удалить питомца</button>
            </div>
          </section>
        </div>
      </div>`;
    setTimeout(() => {
      const f = $("#petPhoto");
      if (f) f.addEventListener("change", () => {
        const file = f.files && f.files[0];
        if (!file) return;
        if (!/^image\//.test(file.type)) { toast("Загрузите изображение", "error"); return; }
        if (file.size > 4 * 1024 * 1024) { toast("Файл слишком большой (макс. 4 МБ)", "error"); return; }
        const r = new FileReader();
        r.onload = () => {
          window.Store.update((s) => { window.Store.pet().photo = r.result; }, "pet");
          toast("Фото обновлено", "ok");
        };
        r.readAsDataURL(file);
      });
    }, 60);
  }

  function tabPets(view) {
    const S = window.Store.state;
    view.innerHTML = `
      <div class="row-between mb-2">
        <div class="hint-box" style="flex:1">Поддерживается неограниченное число питомцев: у каждого свой профиль, медкарта, трекеры и нормы. Активный питомец переключается в левом меню кабинета.</div>
        <button class="btn btn-primary" data-act="pets.add">＋ Добавить питомца</button>
      </div>
      <div class="prod-grid">
        ${S.pets.map((p) => {
          const breed = window.Store.breed(p);
          const idx = window.Store.index(p);
          const active = p.id === S.activePetId;
          return `<div class="prod-card">
            <div class="prod-emoji" style="font-size:2.6rem">${p.photo ? `<img src="${p.photo}" style="width:64px;height:64px;object-fit:cover;border-radius:14px">` : esc(p.emoji || "🐾")}</div>
            <div class="prod-name">${esc(p.name)} ${active ? badge("активный", "ok") : ""}</div>
            <div class="tiny muted">${esc(breed.name)} · ${esc(window.Store.ageLabel(p))} · ${fmt.num(p.weight, 1)} кг</div>
            <div class="row" style="gap:6px">${badge("Индекс " + idx.score, idx.score >= 75 ? "ok" : idx.score >= 50 ? "warn" : "danger")}${p.allergies.length ? badge(p.allergies.length + " аллергии", "danger") : badge("без аллергий", "ok")}</div>
            <div class="row mt-2" style="gap:6px">
              ${active ? "" : `<button class="btn btn-soft btn-sm" data-act="hub.pet" data-id="${p.id}">Сделать активным</button>`}
              <button class="btn btn-ghost btn-sm" data-act="pets.edit" data-id="${p.id}">Профиль</button>
              <button class="btn btn-ghost btn-sm" data-act="pets.medcard" data-id="${p.id}">Медкарта</button>
            </div>
          </div>`;
        }).join("")}
      </div>
      <section class="card mt-2">
        <header class="card-head"><h3><span class="card-ico">📊</span> Сравнение питомцев</h3></header>
        <div class="card-body">
          ${table(["Питомец", "Порода", "Возраст", "Вес", "Норма корма", "Прогулка/день", "Индекс", "Действие"],
            S.pets.map((p) => [esc(p.emoji + " " + p.name), esc(window.Store.breed(p).name), esc(window.Store.ageLabel(p)),
              fmt.num(p.weight, 1) + " кг", window.Store.portion(p).grams + " г", window.Store.breed(p).walk + " мин",
              badge(window.Store.index(p).score + "/100", window.Store.index(p).score >= 75 ? "ok" : "warn"),
              `<button class="btn btn-xs btn-soft" data-act="hub.pet" data-id="${p.id}">Открыть</button>`]))}
        </div>
      </section>`;
  }

  function tabFamily(view) {
    const S = window.Store.state;
    const owner = S.owner;
    const roles = ["Владелец", "Семья", "Ситтер", "Ветеринар"];
    view.innerHTML = `
      <div class="panel-grid cols-2">
        <section class="card">
          <header class="card-head"><h3><span class="card-ico">👨‍👩‍👧</span> Семейный доступ</h3>${badge((owner.members || []).length + " участника", "info")}</header>
          <div class="card-body">
            <div class="stack" style="gap:10px">
              ${(owner.members || []).map((m) => `<div class="friend-card">
                <span class="avatar">${m.role === "Владелец" ? "👑" : m.role === "Ветеринар" ? "🩺" : m.role === "Ситтер" ? "🤝" : "👤"}</span>
                <span style="flex:1"><b class="small">${esc(m.name)}</b><div class="tiny muted">${esc(m.role)} · полный доступ к профилю ${esc(pet().name)}</div></span>
                ${m.role === "Владелец" ? badge("главный", "ok") : `<button class="btn btn-xs btn-ghost" data-act="pets.delfamily" data-id="${m.id}">Удалить</button>`}
              </div>`).join("")}
            </div>
            <button class="btn btn-soft btn-block mt-2" data-act="pets.addfamily">＋ Пригласить участника</button>
            <div class="hint-box mt-2">
              <b>Код семьи:</b> <code id="familyCode">${esc(owner.familyCode)}</code>
              <button class="btn btn-xs btn-ghost" data-act="pets.copycode">Скопировать</button>
              <div class="tiny muted mt-1">Передайте код близким — они увидят профиль, смогут отмечать прогулки, лекарства и симптомы.</div>
            </div>
          </div>
        </section>
        <div class="stack">
          <section class="card">
            <header class="card-head"><h3><span class="card-ico">🔐</span> Кто что может</h3></header>
            <div class="card-body">
              ${table(["Роль", "Доступ"], [
                ["👑 Владелец", "всё: профиль, платежи, удаление данных"],
                ["👤 Семья", "прогулки, кормления, симптомы, трекеры"],
                ["🤝 Ситтер", "расписание, кормление, заметки, без платежей"],
                ["🩺 Ветеринар", "медкарта, отчёты, назначения"]
              ])}
            </div>
          </section>
          <section class="card">
            <header class="card-head"><h3><span class="card-ico">🕓</span> Последние действия семьи</h3></header>
            <div class="card-body">
              <div class="timeline">
                ${(() => {
                  const S2 = window.Store.state;
                  const p = pet();
                  const rows = [
                    { icon: "🚶", t: "Прогулка " + ((S2.walks || []).find((w) => w.petId === p.id) ? "сохранена" : "запланирована"), who: S2.owner.name, when: "сегодня" },
                    { icon: "💊", t: "Отмечен приём лекарства", who: "Ирина", when: "вчера" },
                    { icon: "⚖️", t: "Добавлено взвешивание", who: S2.owner.name, when: "3 дня назад" },
                    { icon: "📷", t: "Загружено фото для ИИ-анализа", who: "Ирина", when: "5 дней назад" }
                  ];
                  return rows.map((r) => `<div class="tl-item"><div class="tl-rail"><div class="tl-dot">${r.icon}</div><div class="tl-line"></div></div>
                    <div class="tl-body"><div class="tl-title">${esc(r.t)}</div><div class="tl-time">${esc(r.who)} · ${esc(r.when)}</div></div></div>`).join("");
                })()}
              </div>
            </div>
          </section>
        </div>
      </div>`;
  }

  function tabBreed(view) {
    const p = pet();
    const breed = window.Store.breed(p);
    const same = D.breeds.filter((b) => b.species === breed.species && b.id !== breed.id && Math.abs(b.weight - breed.weight) < 8).slice(0, 4);
    view.innerHTML = `
      <div class="kpi-row mb-2">
        ${stat({ icon: breed.emoji, value: breed.name, label: "порода", hint: esc(pet().name) })}
        ${stat({ icon: "⚖️", value: breed.weight + " кг", label: "средний вес породы" })}
        ${stat({ icon: "⏳", value: breed.life + " лет", label: "продолжительность жизни" })}
        ${stat({ icon: "🚶", value: breed.walk + " мин", label: "норма прогулки", kind: "ok" })}
      </div>
      <div class="panel-grid cols-3">
        <section class="card">
          <header class="card-head"><h3><span class="card-ico">💡</span> Советы по породе</h3></header>
          <div class="card-body">${list(breed.tips, "tick")}</div>
        </section>
        <section class="card">
          <header class="card-head"><h3><span class="card-ico">🩺</span> Породные риски</h3>${badge(breed.risks.length + " риска", "warn")}</header>
          <div class="card-body">
            ${list(breed.risks, "dot")}
            <div class="hint-box mt-2">Профилактика: осмотр у ветеринара ${esc(window.Store.ageStage(p).checkups)}, контроль веса и ранняя диагностика.</div>
            <button class="btn btn-soft btn-block mt-2" data-act="hub.open" data-panel="health" data-tab="medcard">📋 Вести медкарту</button>
          </div>
        </section>
        <section class="card">
          <header class="card-head"><h3><span class="card-ico">✂️</span> Уход и комфорт</h3></header>
          <div class="card-body">
            <div class="kv">
              <div class="kv-row"><span class="kv-k">Груминг</span><span class="kv-v">${esc(breed.grooming)}</span></div>
              <div class="kv-row"><span class="kv-k">Активность</span><span class="kv-v">${esc(breed.activity)}</span></div>
              <div class="kv-row"><span class="kv-k">Размер</span><span class="kv-v">${breed.size === "small" ? "мелкий" : breed.size === "medium" ? "средний" : "крупный"}</span></div>
              <div class="kv-row"><span class="kv-k">Комфорт, °C</span><span class="kv-v">${breed.tempMin}…${breed.tempMax}</span></div>
            </div>
            <button class="btn btn-soft btn-block mt-2" data-act="hub.open" data-panel="services" data-tab="grooming">Записаться к грумеру</button>
          </div>
        </section>
      </div>
      <div class="panel-grid cols-2 mt-2">
        <section class="card">
          <header class="card-head"><h3><span class="card-ico">🐕‍🦺</span> Похожие породы</h3><span class="muted small">по весу и виду</span></header>
          <div class="card-body stack" style="gap:10px">
            ${same.map((b) => `<div class="map-item" data-act="pets.setbreed" data-id="${b.id}">
              <span class="mi-ico">${b.emoji}</span>
              <span><span class="mi-name">${esc(b.name)}</span><span class="mi-sub">${b.weight} кг · ${b.walk} мин · ${esc(b.activity)} активность</span></span>
              <span class="spacer"></span>${badge("выбрать", "info")}
            </div>`).join("")}
          </div>
        </section>
        <section class="card">
          <header class="card-head"><h3><span class="card-ico">📐</span> Персональные ориентиры</h3></header>
          <div class="card-body">
            <div class="kv">
              <div class="kv-row"><span class="kv-k">Вес питомца / породы</span><span class="kv-v">${fmt.num(p.weight, 1)} / ${breed.weight} кг</span></div>
              <div class="kv-row"><span class="kv-k">Корм в день</span><span class="kv-v">${window.Store.portion(p).grams} г</span></div>
              <div class="kv-row"><span class="kv-k">Прогулка в день</span><span class="kv-v">${breed.walk} мин</span></div>
              <div class="kv-row"><span class="kv-k">Груминг</span><span class="kv-v">${esc(breed.grooming)}</span></div>
              <div class="kv-row"><span class="kv-k">Совет №1</span><span class="kv-v">${esc(breed.tips[0])}</span></div>
            </div>
            <button class="btn btn-ghost btn-block mt-2" data-act="hub.open" data-panel="ai">🤖 Спросить ИИ про породу</button>
          </div>
        </section>
      </div>`;
  }

  function tabAge(view) {
    const p = pet();
    const years = window.Store.age(p);
    const current = window.Store.ageStage(p);
    const birth = new Date(p.birth);
    const humanAge = p.species === "dog"
      ? (years <= 1 ? 15 * years : years <= 2 ? 15 + (years - 1) * 9 : 24 + (years - 2) * (p.size === "small" ? 4 : p.size === "medium" ? 5 : 6))
      : (years <= 1 ? 15 * years : years <= 2 ? 15 + (years - 1) * 9 : 24 + (years - 2) * 4);
    view.innerHTML = `
      <div class="kpi-row mb-2">
        ${stat({ icon: "🎂", value: window.Store.ageLabel(p), label: "возраст", hint: p.birth ? "родился " + fmt.date(p.birth) : "укажите дату рождения" })}
        ${stat({ icon: "🧑", value: "≈" + Math.round(humanAge) + " лет", label: "по-человечески", hint: "пересчёт по виду и размеру" })}
        ${stat({ icon: current.emoji, value: current.name, label: "стадия жизни", kind: "ok" })}
        ${stat({ icon: "🩺", value: current.checkups, label: "частота осмотров", hint: esc(current.focus) })}
      </div>
      <section class="card mb-2">
        <header class="card-head"><h3><span class="card-ico">🛤</span> Путь жизни</h3><span class="muted small">вы здесь: ${esc(current.name)}</span></header>
        <div class="card-body">
          <div class="timeline">
            ${D.ageStages.map((s) => {
              const active = s.id === current.id;
              const passed = years >= s.range[1];
              return `<div class="tl-item">
                <div class="tl-rail"><div class="tl-dot" style="${active ? "background:#E8F6EA;border-color:#4CAF50" : passed ? "opacity:.6" : "opacity:.35"}">${s.emoji}</div>${s.id !== "geriatric" ? '<div class="tl-line"></div>' : ""}</div>
                <div class="tl-body" style="${active ? "" : "opacity:" + (passed ? ".75" : ".5")}">
                  <div class="row-between"><span class="tl-title">${esc(s.name)} · ${s.range[0]}–${s.range[1] === 30 ? "∞" : s.range[1]} лет</span>${active ? badge("текущая стадия", "ok") : ""}</div>
                  <div class="tiny muted mb-1">Осмотры: ${esc(s.checkups)} · Фокус: ${esc(s.focus)}</div>
                  ${active ? `<ul class="list tick">${s.tips.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}
                </div>
              </div>`;
            }).join("")}
          </div>
        </div>
      </section>
      <div class="panel-grid cols-2">
        <section class="card">
          <header class="card-head"><h3><span class="card-ico">📅</span> Что делать в этом возрасте</h3></header>
          <div class="card-body">
            ${list(current.tips, "tick")}
            <div class="hint-box mt-2">Фокус профилактики: ${esc(current.focus)}. Плановая частота осмотров — ${esc(current.checkups)}.</div>
            <button class="btn btn-soft btn-block mt-2" data-act="hub.open" data-panel="health" data-tab="vaccines">💉 Календарь вакцинации</button>
          </div>
        </section>
        <section class="card">
          <header class="card-head"><h3><span class="card-ico">🧮</span> Калькулятор возраста</h3></header>
          <div class="card-body">
            ${field({ label: "Дата рождения", type: "date", id: "ageBirth", value: p.birth })}
            <button class="btn btn-primary btn-block" data-act="pets.calcage">Пересчитать</button>
            <div id="ageResult" class="hint-box mt-2">
              <b>${esc(p.name)}</b>: ${esc(window.Store.ageLabel(p))} — это примерно ${Math.round(humanAge)} человеческих лет.
              <div class="tiny muted mt-1">Формула учитывает вид и размер: мелкие породы стареют медленнее крупных.</div>
            </div>
          </div>
        </section>
      </div>`;
  }

  function renderPets(view, ctx) {
    const tab = ctx.tab || "profile";
    const tabs = [
      { id: "profile", title: "Профиль", icon: "🐾" }, { id: "pets", title: "Мои питомцы", icon: "🐕‍🦺" },
      { id: "family", title: "Семейный доступ", icon: "👨‍👩‍👧" }, { id: "breed", title: "Советы по породе", icon: "📚" },
      { id: "age", title: "Советы по возрасту", icon: "⏳" }
    ];
    view.innerHTML = `
      <div class="panel">
        <div class="panel-head">
          <div><h2>🐾 Питомцы и семья</h2><p>Профиль, несколько питомцев, семейный доступ и персональные советы</p></div>
          <div class="panel-tools">
            <button class="btn btn-ghost btn-sm" data-act="pets.add">＋ Питомец</button>
            <button class="btn btn-soft btn-sm" data-act="hub.open" data-panel="data">⚙️ Данные</button>
          </div>
        </div>
        <div class="chip-row mb-2">
          ${tabs.map((t) => `<button class="tag ${tab === t.id ? "active" : ""}" data-act="hub.open" data-panel="pets" data-tab="${t.id}">${t.icon} ${t.title}</button>`).join("")}
        </div>
      </div>`;
    const body = document.createElement("div");
    view.appendChild(body);
    if (tab === "pets") tabPets(body);
    else if (tab === "family") tabFamily(body);
    else if (tab === "breed") tabBreed(body);
    else if (tab === "age") tabAge(body);
    else tabProfile(body);
  }

  /* =====================================================================
   * ПАНЕЛЬ «ДАННЫЕ И НАСТРОЙКИ»
   * ===================================================================*/
  function renderData(view) {
    const S = window.Store.state;
    const json = window.Store.export();
    const sizeKb = Math.round((json.length / 1024) * 10) / 10;
    const counts = [
      ["Питомцы", S.pets.length, "🐾"], ["Записи медкарты", Object.values(S.medical).reduce((s, a) => s + a.length, 0), "📋"],
      ["Прививки", Object.values(S.vaccinations).reduce((s, a) => s + a.length, 0), "💉"],
      ["Лекарства", Object.values(S.meds).reduce((s, a) => s + a.length, 0), "💊"],
      ["Прогулки", (S.walks || []).length, "🚶"], ["Взвешивания", Object.values(S.weights).reduce((s, a) => s + a.length, 0), "⚖️"],
      ["Расходы", (S.expenses || []).length, "🧾"], ["Записи к врачу", (S.appointments || []).length, "🏥"],
      ["Темы форума", (S.posts || []).length, "💬"], ["Заказы", (S.orders || []).length, "🛒"],
      ["Под опекой", (S.adoptions || []).length, "❤️"], ["Заявки на доступ", (window.LeadForm.leads() || []).length, "📨"]
    ];
    view.innerHTML = `
      <div class="panel">
        <div class="panel-head">
          <div><h2>⚙️ Данные и настройки</h2><p>Всё хранится локально в браузере. Можно выгрузить, импортировать или вернуть демо-данные.</p></div>
          <div class="panel-tools">
            <button class="btn btn-primary btn-sm" data-act="hub.export">📤 Экспорт JSON</button>
            <button class="btn btn-ghost btn-sm" data-act="hub.import">📥 Импорт</button>
          </div>
        </div>
        <div class="kpi-row mb-2">
          ${stat({ icon: "🗂", value: counts.reduce((s, c) => s + c[1], 0), label: "записей всего" })}
          ${stat({ icon: "💾", value: sizeKb + " КБ", label: "объём данных" })}
          ${stat({ icon: "🗓", value: fmt.date(S.createdAt), label: "профиль создан" })}
          ${stat({ icon: "🧩", value: D.features.length, label: "функций доступно", kind: "ok" })}
        </div>
        <div class="panel-grid cols-2">
          <section class="card">
            <header class="card-head"><h3><span class="card-ico">📊</span> Что накопилось</h3></header>
            <div class="card-body">${table(["Раздел", "Записей"], counts.map((c) => [c[2] + " " + c[0], String(c[1])]))}</div>
          </section>
          <div class="stack">
            <section class="card">
              <header class="card-head"><h3><span class="card-ico">🔑</span> Ключи API и режимы</h3></header>
              <div class="card-body">
                <div class="kv">
                  <div class="kv-row"><span class="kv-k">Погода</span><span class="kv-v">${window.PETLIFE_CONFIG.OPENWEATHER_API_KEY ? "OpenWeather (ключ указан)" : "Open-Meteo (без ключа)"}</span></div>
                  <div class="kv-row"><span class="kv-k">ИИ-анализ фото</span><span class="kv-v">${window.PETLIFE_CONFIG.OPENROUTER_API_KEY ? "OpenRouter vision" : "локальный анализатор"}</span></div>
                  <div class="kv-row"><span class="kv-k">ИИ-ассистент</span><span class="kv-v">${window.PETLIFE_CONFIG.OPENROUTER_API_KEY ? "LLM + локальная база" : "локальная база знаний"}</span></div>
                  <div class="kv-row"><span class="kv-k">Сборка</span><span class="kv-v">${esc(window.PETLIFE_CONFIG.BUILD)}</span></div>
                </div>
                <div class="hint-box mt-2">Чтобы включить настоящий vision-ИИ и OpenWeather, откройте <code>js/config.js</code> и вставьте ключи. Всё остальное работает и без них.</div>
                <button class="btn btn-soft btn-block mt-2" data-act="data.test">🔌 Проверить связь с сервером</button>
              </div>
            </section>
            <section class="card">
              <header class="card-head"><h3><span class="card-ico">🧪</span> Демо-режим</h3></header>
              <div class="card-body">
                <p class="small muted">В сборке уже заполнены данные двух питомцев (Барон и Мурка) — чтобы на защите всё выглядело живым.</p>
                <div class="row">
                  <button class="btn btn-soft btn-sm" data-act="hub.reset">♻️ Вернуть демо-данные</button>
                  <button class="btn btn-ghost btn-sm" data-act="hub.empty">🧹 Начать с чистого листа</button>
                </div>
              </div>
            </section>
            <section class="card">
              <header class="card-head"><h3><span class="card-ico">⚠️</span> Опасная зона</h3></header>
              <div class="card-body">
                <p class="small muted">Удаление данных необратимо: профили, медкарты, трекеры, заказы и форум будут очищены.</p>
                <button class="btn btn-danger btn-sm" data-act="data.wipe">🗑 Удалить все данные</button>
              </div>
            </section>
          </div>
        </div>
        <section class="card mt-2">
          <header class="card-head"><h3><span class="card-ico">ℹ️</span> О проекте</h3></header>
          <div class="card-body">
            <div class="panel-grid cols-3">
              <div>${list(["Единая экосистема заботы о питомце", "Работает без ключей API в демо-режиме", "Данные не уходят на сторонние серверы", "42 функции в одном интерфейсе"], "tick")}</div>
              <div>${list(["Чистый HTML + CSS + JS, без фреймворков", "Python-сервер на стандартной библиотеке", "Open-Meteo: погода, AQI, UV, пыльца", "OpenRouter: vision-ИИ и ассистент"], "dot")}</div>
              <div>${list(["5% дохода — в приюты для животных", "Виртуальное усыновление и волонтёрство", "Просвещение ответственного владения", "Цель 2026: 20 000 спасённых питомцев"], "dot")}</div>
            </div>
          </div>
        </section>
      </div>`;
  }

  window.Panels.register("pets", { render: renderPets });
  window.Panels.register("data", { render: renderData });

  /* =====================================================================
   * ДЕЙСТВИЯ
   * ===================================================================*/
  function currentPet(id) { return id ? window.Store.pet(id) : pet(); }

  Actions.registerAll({
    /* ---- профиль ---- */
    "pets.save": () => {
      const p = pet();
      window.Store.update((s) => {
        const x = currentPet(p.id);
        x.name = $("#petName").value.trim() || "Питомец";
        x.species = $("#petSpecies").value;
        x.breedId = $("#petBreed").value;
        x.size = $("#petSize").value;
        x.birth = $("#petBirth").value;
        x.weight = +$("#petWeight").value || x.weight;
        x.sex = $("#petSex").value;
        x.city = $("#petCity").value.trim();
        x.sterilized = $("#petSterilized").checked;
        x.note = $("#petNote").value.trim();
      }, "pet");
      toast("Профиль " + pet().name + " сохранён", "ok");
    },
    "pets.emoji": (ds) => {
      window.Store.update((s) => { window.Store.pet().emoji = ds.emoji; }, "pet");
      toast("Аватар обновлён", "ok");
    },
    "pets.photo": () => { const f = $("#petPhoto"); if (f) f.click(); },
    "pets.photoclear": () => { window.Store.update((s) => { window.Store.pet().photo = ""; }, "pet"); toast("Фото удалено", "ok"); },
    "pets.addallergy": () => {
      const v = ($("#newAllergy").value || "").trim();
      if (!v) { toast("Введите аллерген", "warn"); return; }
      window.Store.update((s) => { const p = window.Store.pet(); if (!p.allergies.includes(v)) p.allergies.push(v); }, "pet");
      toast("Аллерген добавлен: " + v, "ok");
    },
    "pets.delallergy": (ds) => { window.Store.update((s) => { const p = window.Store.pet(); p.allergies = p.allergies.filter((a) => a !== ds.value); }, "pet"); },
    "pets.addchronic": () => {
      const v = ($("#newChronic").value || "").trim();
      if (!v) { toast("Введите заболевание", "warn"); return; }
      window.Store.update((s) => { const p = window.Store.pet(); if (!p.chronic.includes(v)) p.chronic.push(v); }, "pet");
      toast("Добавлено в хронические: " + v, "ok");
    },
    "pets.delchronic": (ds) => { window.Store.update((s) => { const p = window.Store.pet(); p.chronic = p.chronic.filter((a) => a !== ds.value); }, "pet"); },
    "pets.setbreed": (ds) => {
      const b = D.breeds.find((x) => x.id === ds.id);
      if (!b) return;
      window.Store.update((s) => {
        const p = window.Store.pet();
        p.breedId = b.id; p.species = b.species; p.size = b.size === "large" ? "large" : b.size === "small" ? "small" : "medium";
      }, "pet");
      toast("Порода изменена на " + b.name, "ok");
    },
    "pets.calcage": () => {
      const v = $("#ageBirth").value;
      if (!v) { toast("Укажите дату рождения", "warn"); return; }
      window.Store.update((s) => { window.Store.pet().birth = v; }, "pet");
      const p = pet();
      const years = window.Store.age(p);
      const human = p.species === "dog"
        ? (years <= 1 ? 15 * years : years <= 2 ? 15 + (years - 1) * 9 : 24 + (years - 2) * (p.size === "small" ? 4 : p.size === "medium" ? 5 : 6))
        : (years <= 1 ? 15 * years : years <= 2 ? 15 + (years - 1) * 9 : 24 + (years - 2) * 4);
      const res = $("#ageResult");
      if (res) res.innerHTML = `<b>${esc(p.name)}</b>: ${esc(window.Store.ageLabel(p))} — это примерно ${Math.round(human)} человеческих лет.
        <div class="tiny muted mt-1">Стадия: ${esc(window.Store.ageStage(p).name)}. Осмотры: ${esc(window.Store.ageStage(p).checkups)}.</div>`;
      toast("Возраст пересчитан", "ok");
    },
    "pets.duplicate": () => {
      const p = pet();
      const copy = JSON.parse(JSON.stringify(p));
      copy.id = window.Store.uid("pet");
      copy.name = p.name + "-2";
      window.Store.update((s) => {
        s.pets.push(copy);
        ["medical", "symptoms", "meds", "vaccinations", "weights", "activity", "sleep", "moods", "meals", "behavior"].forEach((b) => { s[b][copy.id] = JSON.parse(JSON.stringify(s[b][p.id] || [])); });
        s.training[copy.id] = JSON.parse(JSON.stringify(s.training[p.id] || { done: [], xp: 0, streak: 0, games: [] }));
        s.activePetId = copy.id;
      }, "pet");
      toast("Профиль скопирован", "ok");
    },
    "pets.delete": async () => {
      const p = pet();
      if (window.Store.pets().length === 1) { toast("Нельзя удалить единственного питомца", "warn"); return; }
      const ok = await confirmDialog("Удалить профиль «" + p.name + "» вместе со всей историей?", { ok: "Удалить", danger: true, icon: "🗑" });
      if (!ok) return;
      window.Store.update((s) => {
        s.pets = s.pets.filter((x) => x.id !== p.id);
        ["medical", "symptoms", "meds", "vaccinations", "weights", "activity", "sleep", "moods", "meals", "behavior"].forEach((b) => { delete s[b][p.id]; });
        delete s.training[p.id];
        s.walks = (s.walks || []).filter((w) => w.petId !== p.id);
        s.appointments = (s.appointments || []).filter((a) => a.petId !== p.id);
        s.expenses = (s.expenses || []).filter((e) => e.petId !== p.id);
        s.bookings = (s.bookings || []).filter((b) => b.petId !== p.id);
        s.activePetId = s.pets[0].id;
      }, "pet");
      toast("Профиль удалён", "ok");
      window.Hub.open("pets", "pets");
    },
    "pets.add": () => {
      const body = `<div class="form-grid">
        ${field({ label: "Кличка", id: "npName", placeholder: "Например, Рекс" })}
        ${field({ label: "Вид", type: "select", id: "npSpecies", options: [{ value: "dog", label: "Собака" }, { value: "cat", label: "Кошка" }] })}
        ${field({ label: "Порода", type: "select", id: "npBreed", options: D.breeds.map((b) => ({ value: b.id, label: b.emoji + " " + b.name })) })}
        ${field({ label: "Дата рождения", type: "date", id: "npBirth", value: fmt.today() })}
        ${field({ label: "Вес, кг", type: "number", id: "npWeight", value: 5, attrs: 'step="0.1"' })}
        ${field({ label: "Город", id: "npCity", value: window.Store.state.owner.city || "Москва" })}
      </div>`;
      modal({
        title: "Новый питомец", icon: "🐾", body, wide: true,
        actions: [{ label: "Отмена" }, {
          label: "Создать профиль", kind: "primary", onClick: (wrap) => {
            const name = $("#npName", wrap).value.trim();
            if (name.length < 1) { toast("Введите кличку", "warn"); return false; }
            const breedId = $("#npBreed", wrap).value;
            const breed = D.breedById(breedId);
            const id = window.Store.uid("pet");
            window.Store.update((s) => {
              s.pets.push({
                id, name, emoji: breed.species === "cat" ? "🐈" : "🐕", species: $("#npSpecies", wrap).value, breedId,
                size: breed.size, sex: "мальчик", birth: $("#npBirth", wrap).value, weight: +$("#npWeight", wrap).value || 5,
                sterilized: false, photo: "", allergies: [], chronic: [], city: $("#npCity", wrap).value.trim() || "Москва", note: ""
              });
              ["medical", "symptoms", "meds", "vaccinations", "weights", "activity", "sleep", "moods", "meals", "behavior"].forEach((b) => { s[b][id] = []; });
              s.training[id] = { done: [], xp: 0, streak: 0, games: [], lastLesson: null };
              s.activePetId = id;
            }, "pet");
            toast("Профиль " + name + " создан 🐾", "ok");
            return true;
          }
        }]
      });
    },
    "pets.edit": (ds) => { window.Store.setActivePet(ds.id); window.Hub.open("pets", "profile"); },
    "pets.medcard": (ds) => { window.Store.setActivePet(ds.id); window.Hub.open("health", "medcard"); },
    "pets.export": () => {
      const p = pet();
      window.PL.download("petlife-" + p.name + ".json", JSON.stringify(p, null, 2));
      toast("Профиль выгружен", "ok");
    },
    /* ---- семья ---- */
    "pets.addfamily": () => {
      const body = `<div class="form-grid">
        ${field({ label: "Имя", id: "fmName", placeholder: "Ирина" })}
        ${field({ label: "Роль", type: "select", id: "fmRole", options: [{ value: "Семья", label: "Семья" }, { value: "Ситтер", label: "Ситтер" }, { value: "Ветеринар", label: "Ветеринар" }] })}
      </div>
      <div class="hint-box">Участник получит доступ к профилю по коду семьи. В демо-версии приглашение создаётся сразу.</div>`;
      modal({
        title: "Пригласить в семью", icon: "👨‍👩‍👧", body,
        actions: [{ label: "Отмена" }, {
          label: "Пригласить", kind: "primary", onClick: (wrap) => {
            const name = $("#fmName", wrap).value.trim();
            if (name.length < 2) { toast("Введите имя", "warn"); return false; }
            const role = $("#fmRole", wrap).value;
            window.Store.update((s) => { s.owner.members.push({ id: window.Store.uid("m"), name, role }); }, "owner");
            toast(name + " приглашён(а) как " + role, "ok");
            return true;
          }
        }]
      });
    },
    "pets.delfamily": async (ds) => {
      const ok = await confirmDialog("Удалить участника из семьи?", { ok: "Удалить", danger: true });
      if (!ok) return;
      window.Store.update((s) => { s.owner.members = s.owner.members.filter((m) => m.id !== ds.id); }, "owner");
    },
    "pets.copycode": async () => {
      const code = window.Store.state.owner.familyCode;
      try { await navigator.clipboard.writeText(code); toast("Код " + code + " скопирован", "ok"); }
      catch (e) { toast("Код семьи: " + code, "info"); }
    },
    /* ---- данные ---- */
    "data.test": async () => {
      toast("Проверяем сервер…", "info");
      try {
        const res = await fetch("/api/health");
        const data = await res.json();
        modal({
          title: "Связь с локальным сервером", icon: "🔌",
          body: `<div class="ok-box">✅ Сервер отвечает.</div>
            <div class="kv mt-2">
              <div class="kv-row"><span class="kv-k">Версия сервера</span><span class="kv-v">${esc(data.version || "—")}</span></div>
              <div class="kv-row"><span class="kv-k">OpenWeather</span><span class="kv-v">${data.openweather ? "ключ найден" : "не задан (используется Open-Meteo)"}</span></div>
              <div class="kv-row"><span class="kv-k">OpenRouter</span><span class="kv-v">${data.openrouter ? "ключ найден" : "не задан (локальный ИИ)"}</span></div>
              <div class="kv-row"><span class="kv-k">Заявок сохранено</span><span class="kv-v">${data.signups != null ? data.signups : "—"}</span></div>
            </div>`
        });
      } catch (err) {
        modal({
          title: "Связь с локальным сервером", icon: "🔌",
          body: `<div class="danger-box">⛔ Сервер не отвечает. Откройте проект через <code>python server.py</code> (или <code>start.bat</code>) — тогда заработают прокси погоды, ИИ и сохранение заявок.</div>
            <p class="muted small mt-2">Сайт при этом продолжает работать: погода запрашивается напрямую у Open-Meteo.</p>`
        });
      }
    },
    "data.wipe": async () => {
      const ok = await confirmDialog("Удалить ВСЕ данные без возможности восстановления?", { ok: "Удалить всё", danger: true, icon: "🗑" });
      if (!ok) return;
      localStorage.removeItem("petlife.state.v2");
      localStorage.removeItem("petlife.hub.v2");
      toast("Данные удалены. Перезагружаем…", "ok");
      setTimeout(() => window.location.reload(), 700);
    }
  });
})();
