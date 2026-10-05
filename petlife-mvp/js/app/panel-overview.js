/* ============================================================================
 * PetLife — app/panel-overview.js
 * Дашборд владельца: PetLife Index, совет дня от ИИ, план на сегодня,
 * быстрые действия по всем 42 функциям, мини-погода, миссия и форум.
 * ==========================================================================*/
(function () {
  "use strict";
  const { $, esc, fmt, card, stat, badge, progress, empty, Charts, toast, modal, Actions } = window.PL;
  const D = window.PL_DATA;

  /* ------------------------------------------------------------------ helpers */
  function pet() { return window.Store.pet(); }

  function todayItems(p) {
    const S = window.Store.state;
    const items = [];
    (S.meds[p.id] || []).forEach((m) => {
      const next = window.Store.nextDose(m);
      const days = window.Store.daysUntil(next.toISOString());
      items.push({
        icon: "💊", title: m.name + " — " + m.dose,
        time: days <= 0 ? "нужно дать сегодня" : "через " + fmt.days(days),
        kind: days < 0 ? "danger" : days <= 0 ? "warn" : "info",
        action: `<button class="btn btn-xs btn-soft" data-act="overview.med" data-id="${m.id}">Отметить приём</button>`
      });
    });
    (S.appointments || []).filter((a) => a.petId === p.id && window.Store.daysUntil(a.date) >= 0).slice(0, 3).forEach((a) => {
      items.push({
        icon: "🏥", title: a.reason + " · " + a.clinic,
        time: fmt.date(a.date) + " в " + a.time + " · " + a.doctor,
        kind: "info",
        action: `<button class="btn btn-xs btn-ghost" data-act="hub.open" data-panel="health" data-tab="vet">Подробнее</button>`
      });
    });
    (S.vaccinations[p.id] || []).filter((v) => v.next && window.Store.daysUntil(v.next) < 45).forEach((v) => {
      const d = window.Store.daysUntil(v.next);
      items.push({
        icon: "💉", title: "Прививка: " + v.name,
        time: d < 0 ? "просрочена на " + fmt.days(-d) : "через " + fmt.days(d),
        kind: d < 0 ? "danger" : "warn",
        action: `<button class="btn btn-xs btn-soft" data-act="hub.open" data-panel="health" data-tab="vaccines">Календарь</button>`
      });
    });
    const walksToday = (S.walks || []).filter((w) => w.petId === p.id && w.date === fmt.today());
    const minutes = walksToday.reduce((s, w) => s + w.minutes, 0);
    const need = window.Store.breed(p).walk;
    items.push({
      icon: "🚶", title: "Прогулка: " + minutes + " из " + need + " мин",
      time: minutes >= need ? "норма выполнена ✅" : "осталось " + (need - minutes) + " мин",
      kind: minutes >= need ? "ok" : "info",
      action: `<button class="btn btn-xs btn-soft" data-act="hub.open" data-panel="walk" data-tab="timer">Таймер</button>`
    });
    const moodToday = (S.moods[p.id] || []).find((m) => m.date === fmt.today());
    items.push({
      icon: moodToday ? (D.moods.find((m) => m.id === moodToday.mood) || {}).emoji || "🙂" : "🙂",
      title: moodToday ? "Настроение: " + (D.moods.find((m) => m.id === moodToday.mood) || {}).label : "Настроение не отмечено",
      time: moodToday ? "записано сегодня" : "отметьте в трекерах",
      kind: "info",
      action: `<button class="btn btn-xs btn-soft" data-act="hub.open" data-panel="trackers" data-tab="mood">${moodToday ? "Изменить" : "Отметить"}</button>`
    });
    return items;
  }

  function achievements(p) {
    const S = window.Store.state;
    const idx = window.Store.index(p);
    const walks = (S.walks || []).filter((w) => w.petId === p.id);
    const totalMin = walks.reduce((s, w) => s + w.minutes, 0);
    const xp = (S.training[p.id] || {}).xp || 0;
    return [
      { icon: "🏅", title: "Первый шаг", done: walks.length > 0, hint: "Записать прогулку" },
      { icon: "🔥", title: "10 часов на улице", done: totalMin >= 600, hint: fmt.int(totalMin) + "/600 мин" },
      { icon: "🎓", title: "Ученик", done: xp >= 100, hint: xp + "/100 XP" },
      { icon: "💉", title: "Прививочный щит", done: (S.vaccinations[p.id] || []).length >= 3, hint: (S.vaccinations[p.id] || []).length + "/3 прививки" },
      { icon: "📷", title: "Внимательный хозяин", done: (S.symptoms[p.id] || []).length > 0, hint: "Вести дневник симптомов" },
      { icon: "❤️", title: "Доброе сердце", done: (S.adoptions || []).length > 0, hint: "Взять шефство в приюте" },
      { icon: "⭐", title: "Индекс 80+", done: idx.score >= 80, hint: "Текущий: " + idx.score },
      { icon: "📊", title: "Спортсмен", done: (S.activity[p.id] || []).some((a) => a.steps >= 10000), hint: "10 000 шагов за день" }
    ];
  }

  /* ------------------------------------------------------------------ render */
  function render(view, ctx) {
    const p = pet();
    const S = window.Store.state;
    const breed = window.Store.breed(p);
    const stage = window.Store.ageStage(p);
    const idx = window.Store.index(p);
    const portion = window.Store.portion(p);
    const tips = window.AI.dailyTip(p);
    const items = todayItems(p);
    const ach = achievements(p);
    const walks = (S.walks || []).filter((w) => w.petId === p.id);
    const minutes7 = Array.from({ length: 7 }, (_, i) => {
      const d = window.Store.iso(6 - i);
      return { label: d, short: fmt.short(d), value: walks.filter((w) => w.date === d).reduce((s, w) => s + w.minutes, 0), color: "#2C5F8D" };
    });
    const weights = (S.weights[p.id] || []).slice(-10).map((w) => ({ label: w.date, value: w.kg }));
    const monthExpenses = (S.expenses || []).filter((e) => (Date.now() - new Date(e.date).getTime()) / 86400000 < 30)
      .reduce((s, e) => s + (+e.amount || 0), 0);
    const nextVac = (S.vaccinations[p.id] || []).filter((v) => v.next).sort((a, b) => a.next.localeCompare(b.next))[0];
    const quick = [
      { icon: "🌤", title: "Проверить прогулку", panel: "walk", tab: "now", hint: "асфальт и AQI" },
      { icon: "📷", title: "ИИ-анализ фото", panel: "health", tab: "photo", hint: "посмотреть симптом" },
      { icon: "🍽", title: "Норма корма", panel: "nutrition", tab: "portion", hint: portion.grams + " г/день" },
      { icon: "💊", title: "Лекарства", panel: "health", tab: "meds", hint: (S.meds[p.id] || []).length + " препарата" },
      { icon: "🎓", title: "Дрессировка", panel: "training", tab: "courses", hint: "XP " + ((S.training[p.id] || {}).xp || 0) },
      { icon: "📈", title: "Трекеры", panel: "trackers", tab: "weight", hint: "вес и активность" },
      { icon: "🗺", title: "Карта района", panel: "walk", tab: "map", hint: "клиники и площадки" },
      { icon: "💬", title: "Форум владельцев", panel: "social", tab: "forum", hint: (S.posts || []).length + " тем" },
      { icon: "🛒", title: "Маркетплейс", panel: "market", tab: "catalog", hint: (S.cart || []).length + " в корзине" },
      { icon: "🤖", title: "ИИ-ассистент", panel: "ai", tab: null, hint: "план на неделю" },
      { icon: "🧾", title: "Бюджет", panel: "services", tab: "budget", hint: fmt.money(monthExpenses) + " / мес" },
      { icon: "❤️", title: "Приюты", panel: "social", tab: "adopt", hint: (S.adoptions || []).length + " под опекой" }
    ];
    const latestPosts = (S.posts || []).slice(0, 2);
    const weather = S.lastWeather;

    view.innerHTML = `
      <div class="panel">
        <div class="panel-head">
          <div>
            <h2>🏠 Обзор</h2>
            <p>Добрый день, ${esc(S.owner.name || "владелец")}! ${esc(p.name)} — ${esc(breed.name)}, ${esc(window.Store.ageLabel(p))}, ${fmt.num(p.weight, 1)} кг. ${esc(p.note || "")}</p>
          </div>
          <div class="panel-tools">
            <button class="btn btn-ghost btn-sm" data-act="overview.pets">🐾 Сменить питомца</button>
            <button class="btn btn-primary btn-sm" data-act="hub.open" data-panel="ai">🤖 План на неделю</button>
          </div>
        </div>

        <div class="kpi-row mb-2">
          ${stat({ icon: "⭐", value: idx.score + "/100", label: "PetLife Index", hint: idx.score >= 80 ? "отличное состояние" : idx.score >= 60 ? "хорошо, есть точки роста" : "нужно внимание", kind: idx.score >= 80 ? "ok" : idx.score >= 60 ? "" : "warn" })}
          ${stat({ icon: "🚶", value: (() => { const t = walks.filter((w) => w.date === fmt.today()).reduce((s, w) => s + w.minutes, 0); return t + " мин"; })(), label: "прогулка сегодня", hint: "норма " + breed.walk + " мин", kind: "ok" })}
          ${stat({ icon: "💉", value: nextVac ? fmt.days(Math.max(0, window.Store.daysUntil(nextVac.next))) : "—", label: "до следующей прививки", hint: nextVac ? esc(nextVac.name) : "нет данных", kind: nextVac && window.Store.daysUntil(nextVac.next) < 0 ? "danger" : "" })}
          ${stat({ icon: "🧾", value: fmt.money(monthExpenses), label: "расходы за 30 дней", hint: "лимит " + fmt.money(S.budgetLimit), kind: monthExpenses > S.budgetLimit ? "danger" : "warn" })}
        </div>

        <div class="panel-grid cols-3 mb-2">
          <section class="card">
            <header class="card-head"><h3><span class="card-ico">⭐</span> Индекс благополучия</h3>
              ${badge(idx.score >= 80 ? "отлично" : idx.score >= 60 ? "хорошо" : "нужно внимание", idx.score >= 80 ? "ok" : idx.score >= 60 ? "warn" : "danger")}</header>
            <div class="card-body center">
              ${Charts.gauge(idx.score, { label: "PetLife Index" })}
              <div class="stack mt-2" style="gap:8px;text-align:left">
                ${idx.details.map((d) => `<div>
                  <div class="row-between"><span class="small muted">${esc(d.label)}</span><span class="small"><b>${d.value}%</b></span></div>
                  ${progress(d.value, d.value >= 75 ? "green" : d.value >= 45 ? "orange" : "red")}
                  <div class="tiny muted">${esc(d.hint)}</div>
                </div>`).join("")}
              </div>
              <button class="btn btn-soft btn-block mt-2" data-act="overview.explain-index">Как улучшить индекс?</button>
            </div>
          </section>

          <section class="card">
            <header class="card-head"><h3><span class="card-ico">🤖</span> Совет дня от ИИ</h3>${badge("персонализировано", "violet")}</header>
            <div class="card-body">
              <div class="ai-answer">${tips.map((t) => esc(t)).join("\n")}</div>
              <button class="btn btn-ghost btn-block mt-2" data-act="overview.refresh-tip">🔄 Обновить совет</button>
            </div>
          </section>

          <section class="card">
            <header class="card-head"><h3><span class="card-ico">✅</span> План на сегодня</h3>${badge(items.length + " пунктов", "info")}</header>
            <div class="card-body">
              <div class="timeline">
                ${items.map((i) => `<div class="tl-item">
                  <div class="tl-rail"><div class="tl-dot">${i.icon}</div><div class="tl-line"></div></div>
                  <div class="tl-body">
                    <div class="tl-title">${esc(i.title)}</div>
                    <div class="tl-time">${esc(i.time)}</div>
                    <div class="mt-1">${i.action}</div>
                  </div>
                </div>`).join("")}
              </div>
            </div>
          </section>
        </div>

        <section class="card mb-2">
          <header class="card-head"><h3><span class="card-ico">⚡</span> Быстрые действия — вся экосистема</h3>
            <span class="muted small">${D.features.length} функций внутри</span></header>
          <div class="card-body">
            <div class="prod-grid">
              ${quick.map((q) => `<button class="prod-card" style="text-align:left" data-act="hub.open" data-panel="${q.panel}" ${q.tab ? `data-tab="${q.tab}"` : ""}>
                <div class="prod-emoji" style="padding:10px 0;font-size:1.8rem">${q.icon}</div>
                <div class="prod-name">${esc(q.title)}</div>
                <div class="tiny muted">${esc(q.hint)}</div>
              </button>`).join("")}
            </div>
          </div>
        </section>

        <div class="panel-grid cols-3">
          <section class="card">
            <header class="card-head"><h3><span class="card-ico">🌤</span> Погода для прогулки</h3>
              <button class="btn btn-xs btn-ghost" data-act="hub.open" data-panel="walk">Открыть</button></header>
            <div class="card-body">
              ${weather ? `
                <div class="weather-hero" style="padding:12px">
                  <div><div class="weather-city">${esc(weather.cityName)}</div>
                    <div class="weather-temp" style="font-size:2rem">${fmt.temp(weather.temp)}</div>
                    <div class="weather-desc">${esc(weather.description || "")}</div></div>
                  <div class="weather-big-emoji" style="font-size:2rem">${window.Weather.iconFor(weather)}</div>
                </div>
                <div class="kv mt-2">
                  <div class="kv-row"><span class="kv-k">🔥 Асфальт</span><span class="kv-v" style="color:${weather.asphalt >= 40 ? "#E53935" : "#43A047"}">${fmt.temp(weather.asphalt)}</span></div>
                  <div class="kv-row"><span class="kv-k">💧 Влажность</span><span class="kv-v">${fmt.num(weather.humidity, 0)}%</span></div>
                  <div class="kv-row"><span class="kv-k">🌬 Ветер</span><span class="kv-v">${fmt.num(weather.wind, 1)} м/с</span></div>
                </div>
                <div class="advice ${(weather.advice || {}).level || "ok"}" style="margin-top:12px">${esc((weather.advice || {}).text || "")}</div>`
                : empty("🌤", "Погода не загружена", "Проверьте безопасность прогулки — это займёт 2 секунды.", `<button class="btn btn-primary btn-sm" data-act="hub.open" data-panel="walk" data-tab="now">Проверить погоду</button>`)}
            </div>
          </section>

          <section class="card">
            <header class="card-head"><h3><span class="card-ico">📊</span> Активность и вес</h3>
              <button class="btn btn-xs btn-ghost" data-act="hub.open" data-panel="trackers">Трекеры</button></header>
            <div class="card-body">
              ${Charts.bars(minutes7, { color: "#4CAF50", unit: " мин", target: breed.walk })}
              <div class="muted small center mb-2">минуты прогулок за 7 дней</div>
              ${weights.length > 1 ? Charts.line(weights, { color: "#2C5F8D", unit: " кг", target: breed.weight, height: 120 }) : `<div class="muted small center">Добавьте минимум два взвешивания, чтобы увидеть динамику</div>`}
            </div>
          </section>

          <section class="card">
            <header class="card-head"><h3><span class="card-ico">🏅</span> Достижения</h3>
              <span class="muted small">${ach.filter((a) => a.done).length}/${ach.length}</span></header>
            <div class="card-body stack" style="gap:8px">
              ${ach.map((a) => `<div class="row-between" style="padding:6px 0;border-bottom:1px dashed var(--line)">
                <span class="row" style="gap:8px"><span style="font-size:1.2rem;${a.done ? "" : "filter:grayscale(1);opacity:.45"}">${a.icon}</span>
                <span><b class="small">${esc(a.title)}</b><div class="tiny muted">${esc(a.hint)}</div></span></span>
                ${a.done ? badge("получено", "ok") : badge("в процессе", "muted")}
              </div>`).join("")}
            </div>
          </section>
        </div>

        <div class="panel-grid cols-3 mt-2">
          <section class="card">
            <header class="card-head"><h3><span class="card-ico">🐾</span> Профиль питомца</h3>
              <button class="btn btn-xs btn-ghost" data-act="hub.open" data-panel="pets">Изменить</button></header>
            <div class="card-body">
              <div class="row" style="gap:14px;align-items:center">
                <div class="thumb" style="width:72px;height:72px;font-size:2.2rem">${p.photo ? `<img src="${p.photo}" style="width:100%;height:100%;object-fit:cover;border-radius:12px">` : esc(p.emoji || "🐾")}</div>
                <div>
                  <div style="font-weight:800;font-size:1.1rem">${esc(p.name)}</div>
                  <div class="muted small">${esc(breed.name)} · ${esc(p.sex || "")} · ${esc(window.Store.ageLabel(p))}</div>
                  <div class="chip-row mt-1">${badge(stage.emoji + " " + stage.name, "info")}${p.sterilized ? badge("стерилизован", "ok") : ""}</div>
                </div>
              </div>
              <div class="kv mt-2">
                <div class="kv-row"><span class="kv-k">Вес</span><span class="kv-v">${fmt.num(p.weight, 1)} кг (норма ${breed.weight} кг)</span></div>
                <div class="kv-row"><span class="kv-k">Аллергии</span><span class="kv-v">${p.allergies.length ? esc(p.allergies.join(", ")) : "нет"}</span></div>
                <div class="kv-row"><span class="kv-k">Хронические</span><span class="kv-v">${p.chronic.length ? esc(p.chronic.join(", ")) : "нет"}</span></div>
                <div class="kv-row"><span class="kv-k">Норма корма</span><span class="kv-v">${portion.grams} г/день</span></div>
                <div class="kv-row"><span class="kv-k">Профилактика</span><span class="kv-v">${esc(stage.checkups)}</span></div>
              </div>
            </div>
          </section>

          <section class="card">
            <header class="card-head"><h3><span class="card-ico">💬</span> В сообществе</h3>
              <button class="btn btn-xs btn-ghost" data-act="hub.open" data-panel="social" data-tab="forum">Форум</button></header>
            <div class="card-body stack" style="gap:10px">
              ${latestPosts.map((post) => `<div class="post">
                <div class="post-head"><span class="avatar">${post.emoji}</span>
                  <span><b class="small">${esc(post.author)}</b><div class="tiny muted">${esc(post.pet)} · ${esc(post.ago)}</div></span></div>
                <div class="post-text">${esc(post.text)}</div>
                <div class="post-actions"><span>❤️ ${post.likes}</span><span>💬 ${post.comments}</span></div>
              </div>`).join("")}
              <button class="btn btn-soft btn-block" data-act="social.newPost">✍️ Создать тему</button>
            </div>
          </section>

          <section class="card mission-mini">
            <h3>❤️ Наша миссия</h3>
            <div class="mm-value">${fmt.int(S.mission.helped)}</div>
            <div class="small" style="color:rgba(255,255,255,.85)">питомцев получили помощь</div>
            <div class="progress progress-green mt-2" style="background:rgba(255,255,255,.2)"><span style="width:${Math.min(100, Math.round(S.mission.helped / 20000 * 100))}%"></span></div>
            <div class="kv mt-2" style="color:#fff">
              <div class="kv-row" style="border-color:rgba(255,255,255,.2)"><span class="kv-k" style="color:rgba(255,255,255,.8)">Ваша помощь</span><span class="kv-v" style="color:#fff">${fmt.money(S.donated)}</span></div>
              <div class="kv-row" style="border-color:rgba(255,255,255,.2)"><span class="kv-k" style="color:rgba(255,255,255,.8)">Под опекой</span><span class="kv-v" style="color:#fff">${(S.adoptions || []).length} ${window.PL.fmt.plural((S.adoptions || []).length, "питомец", "питомца", "питомцев")}</span></div>
              <div class="kv-row" style="border-color:rgba(255,255,255,.2)"><span class="kv-k" style="color:rgba(255,255,255,.8)">Premium</span><span class="kv-v" style="color:#fff">${S.owner.premium ? "активен · 5% в приюты" : "не активен"}</span></div>
            </div>
            <button class="btn btn-green btn-block mt-2" data-act="hub.open" data-panel="social" data-tab="adopt">Взять шефство</button>
          </section>
        </div>
      </div>`;
  }

  window.Panels.register("overview", { render });

  /* ------------------------------------------------------------------ действия */
  Actions.registerAll({
    "overview.pets": () => window.Hub.open("pets"),
    "overview.explain-index": () => modal({
      title: "Как работает PetLife Index", icon: "⭐", wide: true,
      body: `<p>Индекс — это сводная оценка благополучия питомца от 0 до 100. Он считается по вашим данным, а не «на глаз»:</p>
        ${window.PL.table(["Показатель", "Что учитывается", "Вес"], [
          ["⚖️ Вес", "отклонение от породной нормы и динамика за период", "22 балла"],
          ["🚶 Прогулки", "средняя длительность за неделю против нормы породы", "18 баллов"],
          ["🙂 Настроение", "средняя оценка за последние 7 записей", "14 баллов"],
          ["💉 Вакцинация", "просроченные прививки", "12 баллов"],
          ["🌙 Сон", "отклонение от видовой нормы", "12 баллов"],
          ["💊 Лекарства", "своевременность приёма", "8 баллов"],
          ["📔 Симптомы", "записи о недомоганиях за 14 дней", "8 баллов"]
        ])}
        <div class="hint-box mt-2">Как поднять индекс: гулять по норме породы, взвешиваться раз в 2 недели, отмечать настроение, не пропускать прививки и лекарства.</div>`
    }),
    "overview.med": (ds) => {
      const p = pet();
      const med = (window.Store.state.meds[p.id] || []).find((m) => m.id === ds.id);
      if (!med) return;
      window.Store.update((s) => {
        const m = s.meds[p.id].find((x) => x.id === ds.id);
        m.last = fmt.today();
        s.medical[p.id].unshift({
          id: window.Store.uid("m"), date: fmt.today(), type: "Лечение",
          title: "Приём препарата: " + m.name, vet: "Владелец", notes: m.dose + ". Отмечено через PetLife."
        });
      }, "meds");
      toast("Приём «" + med.name + "» отмечен", "ok");
    },
    "overview.refresh-tip": () => {
      const tips = window.AI.dailyTip(pet());
      const node = $(".ai-answer");
      if (node) node.textContent = tips.map((t) => t).join("\n");
      toast("Совет обновлён с учётом свежих данных", "ai");
    }
  });
})();
