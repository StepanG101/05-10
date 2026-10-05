/* ============================================================================
 * PetLife — app/panel-ai.js
 * ИИ-ассистент: чат по данным питомца, персональный план заботы на неделю
 * и аналитика (инсайты) по накопленным данным. Работает и без ключа API.
 * ==========================================================================*/
(function () {
  "use strict";
  const { $, $$, esc, fmt, card, stat, badge, progress, empty, field, table, list, bullets, Charts, toast, modal, confirmDialog, Actions, typewriter } = window.PL;
  const D = window.PL_DATA;

  function pet() { return window.Store.pet(); }

  /* ------------------------------------------------------------------ чат */
  function chatHtml() {
    const S = window.Store.state;
    const msgs = S.chat || [];
    return `
      <div class="chat">
        <div class="chat-log" id="chatLog">
          ${msgs.map((m) => `<div class="msg ${m.role === "user" ? "msg-user" : "msg-ai"}">
            <span class="msg-avatar">${m.role === "user" ? "👤" : "🤖"}</span>
            <div>
              <div class="msg-bubble">${esc(m.text)}</div>
              <div class="msg-time">${m.role === "user" ? "вы" : "PetLife AI"} · ${esc(m.at ? fmt.ago(m.at) : "сейчас")}${m.source === "local" ? " · локальная база знаний" : m.source === "openrouter" ? " · LLM" : ""}</div>
            </div>
          </div>`).join("")}
        </div>
        <div class="quick-q">
          ${D.aiPrompts.slice(0, 6).map((q) => `<button class="btn btn-ghost btn-xs" data-act="ai.ask" data-q="${esc(q)}">${esc(q)}</button>`).join("")}
        </div>
        <div class="chat-input">
          <textarea class="input input-area" id="aiInput" rows="1" placeholder="Спросите про кормление, прогулку, симптом, дрессировку…"></textarea>
          <button class="btn btn-primary" data-act="ai.send">Отправить</button>
        </div>
      </div>`;
  }

  function scrollChat() {
    const log = $("#chatLog");
    if (log) log.scrollTop = log.scrollHeight;
  }

  async function send(question) {
    const q = (question || "").trim();
    if (!q) { toast("Введите вопрос", "warn"); return; }
    const S = window.Store.state;
    S.chat = S.chat || [];
    S.chat.push({ role: "user", text: q, at: new Date().toISOString() });
    window.Store.update(() => {}, "chat");
    const log = $("#chatLog");
    if (log) {
      log.insertAdjacentHTML("beforeend", `<div class="msg msg-user"><span class="msg-avatar">👤</span><div><div class="msg-bubble">${esc(q)}</div></div></div>`);
      log.insertAdjacentHTML("beforeend", `<div class="msg msg-ai" id="aiTyping"><span class="msg-avatar">🤖</span><div class="msg-bubble"><span class="typing-dots"><span></span><span></span><span></span></span></div></div>`);
      scrollChat();
    }
    const input = $("#aiInput");
    if (input) input.value = "";
    try {
      const res = await window.AI.chat(q);
      const typing = $("#aiTyping");
      if (typing) typing.remove();
      window.Store.update((s) => { s.chat.push({ role: "assistant", text: res.text, at: new Date().toISOString(), source: res.source }); }, "chat");
      if (log) {
        log.insertAdjacentHTML("beforeend", `<div class="msg msg-ai"><span class="msg-avatar">🤖</span><div><div class="msg-bubble" id="aiLastBubble"></div>
          <div class="msg-time">PetLife AI · ${res.source === "openrouter" ? "LLM" : "локальная база знаний"}</div></div></div>`);
        const bubble = $("#aiLastBubble");
        if (bubble) { bubble.removeAttribute("id"); await typewriter(bubble, res.text, 8); }
        else if (log.lastElementChild) log.lastElementChild.querySelector(".msg-bubble").textContent = res.text;
        scrollChat();
      }
    } catch (err) {
      const typing = $("#aiTyping");
      if (typing) typing.innerHTML = `<span class="msg-avatar">🤖</span><div class="msg-bubble">Что-то пошло не так. Попробуйте ещё раз.</div>`;
      toast("Не удалось получить ответ ИИ", "error");
    }
  }

  /* ------------------------------------------------------------------ план */
  function planHtml() {
    const p = pet();
    const plan = window.AI.plan(p);
    const lines = plan.split("\n");
    const header = lines[0];
    const days = [];
    let current = null;
    lines.slice(2).forEach((l) => {
      if (l.startsWith("📅")) { current = { day: l.replace("📅", "").trim(), items: [] }; days.push(current); }
      else if (l.trim().startsWith("•") && current) current.items.push(l.trim().replace("•", "").trim());
    });
    const breed = window.Store.breed(p);
    const portion = window.Store.portion(p);
    return `
      <div class="hint-box mb-2"><b>${esc(header)}</b><div class="tiny muted mt-1">План собран по вашим данным: порода, возраст, вес, аллергии, прививки, лекарства и текущая погода.</div></div>
      <div class="kpi-row mb-2">
        ${stat({ icon: "🍽", value: portion.grams + " г", label: "корм в день", hint: portion.meals + " кормления" })}
        ${stat({ icon: "🚶", value: breed.walk + " мин", label: "прогулки в день", kind: "ok" })}
        ${stat({ icon: "🩺", value: window.Store.ageStage(p).checkups, label: "профилактика" })}
        ${stat({ icon: "🎓", value: "2 сессии", label: "дрессировка", hint: "по 5–7 минут" })}
      </div>
      <div class="panel-grid cols-3">
        ${days.map((d) => `<section class="card">
          <header class="card-head"><h3><span class="card-ico">📅</span> ${esc(d.day)}</h3></header>
          <div class="card-body">${list(d.items.map(esc), "tick")}</div>
        </section>`).join("")}
      </div>
      <section class="card mt-2">
        <header class="card-head"><h3><span class="card-ico">🧠</span> Почему так</h3></header>
        <div class="card-body panel-grid cols-3">
          <div>${bullets("Питание", [
            "Норма " + portion.grams + " г/день рассчитана по формуле RER × коэффициент активности",
            portion.stage.id === "puppy" ? "Щенкам/котятам — 4 кормления в день" : "Взрослым — 2 кормления с интервалом 10–12 часов",
            p.allergies.length ? "Исключены аллергены: " + esc(p.allergies.join(", ")) : "Аллергий нет — можно ротацию вкусов"
          ])}</div>
          <div>${bullets("Активность", [
            "Норма породы: " + breed.walk + " мин в день",
            "Умственные игры утомляют так же, как физическая нагрузка",
            window.Store.ageStage(p).id === "senior" ? "Пожилым — короткие прогулки 3–4 раза в день" : "Добавьте 10 минут быстрого шага для кардио"
          ])}</div>
          <div>${bullets("Здоровье", [
            "Осмотры: " + esc(window.Store.ageStage(p).checkups),
            (window.Store.state.vaccinations[p.id] || []).filter((v) => v.next && window.Store.daysUntil(v.next) < 45).length ? "Есть прививки, требующие внимания в ближайший месяц" : "Все прививки по графику",
            (window.Store.state.meds[p.id] || []).length ? "Лекарства: " + esc((window.Store.state.meds[p.id] || []).map((m) => m.name).join(", ")) : "Постоянных препаратов нет"
          ])}</div>
        </div>
        <footer class="card-foot">
          <button class="btn btn-primary btn-sm" data-act="ai.plan-save">💾 Сохранить в заметки</button>
          <button class="btn btn-ghost btn-sm" data-act="ai.plan-copy">📋 Скопировать план</button>
          <button class="btn btn-ghost btn-sm" data-act="ai.plan-download">📤 Скачать TXT</button>
        </footer>
      </section>`;
  }

  /* ------------------------------------------------------------------ инсайты */
  function insightsHtml() {
    const S = window.Store.state;
    const p = pet();
    const breed = window.Store.breed(p);
    const walks = (S.walks || []).filter((w) => w.petId === p.id);
    const moods = S.moods[p.id] || [];
    const symptoms = S.symptoms[p.id] || [];
    const weights = (S.weights[p.id] || []).slice().sort((a, b) => a.date.localeCompare(b.date));
    const activity = S.activity[p.id] || [];
    const sleep = S.sleep[p.id] || [];

    /* связь прогулок и настроения */
    const moodByWalk = { withWalk: [], withoutWalk: [] };
    const last14 = Array.from({ length: 14 }, (_, i) => window.Store.iso(13 - i));
    last14.forEach((d) => {
      const m = moods.find((x) => x.date === d);
      if (!m) return;
      const score = (D.moods.find((x) => x.id === m.mood) || { score: 3 }).score;
      const has = walks.some((w) => w.date === d);
      (has ? moodByWalk.withWalk : moodByWalk.withoutWalk).push(score);
    });
    const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
    const moodWith = avg(moodByWalk.withWalk), moodWithout = avg(moodByWalk.withoutWalk);

    /* симптомы по категориям */
    const byCat = {};
    symptoms.forEach((s) => { byCat[s.type] = (byCat[s.type] || 0) + 1; });
    const catParts = Object.keys(byCat).map((k, i) => ({ label: k, value: byCat[k], color: Charts.palette[i % Charts.palette.length] }));

    /* вес */
    const wSeries = weights.slice(-12).map((w) => ({ label: w.date, value: w.kg }));
    const weightDelta = weights.length > 1 ? +(weights[weights.length - 1].kg - weights[0].kg).toFixed(2) : 0;

    /* сон */
    const sleepSeries = sleep.slice(-14).map((s) => ({ label: s.date, short: fmt.short(s.date), value: s.hours }));
    const avgSleep = avg(sleep.map((s) => s.hours));
    const normSleep = p.species === "cat" ? 14 : 12;

    /* расходы */
    const expByCat = {};
    (S.expenses || []).filter((e) => e.petId === p.id).forEach((e) => { expByCat[e.category] = (expByCat[e.category] || 0) + (+e.amount || 0); });
    const expParts = Object.keys(expByCat).map((k, i) => ({
      label: (D.expenseCategories.find((c) => c.id === k) || { name: k }).name, value: expByCat[k], color: Charts.palette[i % Charts.palette.length]
    }));

    const idx = window.Store.index(p);
    const insights = [];
    if (moodByWalk.withWalk.length && moodByWalk.withoutWalk.length) {
      const diff = moodWith - moodWithout;
      insights.push({
        icon: diff > 0.3 ? "✅" : "⚠️",
        title: "Прогулки и настроение",
        text: diff > 0.3
          ? "В дни с прогулкой настроение " + esc(p.name) + " выше на " + fmt.num(diff, 1) + " балла (" + fmt.num(moodWith, 1) + " против " + fmt.num(moodWithout, 1) + "). Регулярные прогулки — самый быстрый способ поднять индекс."
          : "Заметной связи между прогулками и настроением пока нет — возможно, дело в другом факторе (сон, здоровье, погода). Продолжайте отмечать данные."
      });
    } else {
      insights.push({ icon: "📝", title: "Мало данных для корреляций", text: "Отмечайте настроение и прогулки 7–10 дней — и я покажу, что именно влияет на состояние " + esc(p.name) + "." });
    }
    if (weights.length > 1) {
      insights.push({
        icon: Math.abs(weightDelta) < 0.4 ? "✅" : "⚠️",
        title: "Динамика веса",
        text: Math.abs(weightDelta) < 0.4
          ? "Вес стабилен: изменение " + fmt.num(weightDelta, 2) + " кг за период наблюдения. Это хороший показатель."
          : (weightDelta > 0 ? "Вес вырос на " + fmt.num(weightDelta, 2) + " кг. " : "Вес снизился на " + fmt.num(Math.abs(weightDelta), 2) + " кг. ") + "Проверьте порцию: сейчас " + window.Store.portion(p).grams + " г/день."
      });
    }
    if (symptoms.length) {
      const top = Object.keys(byCat).sort((a, b) => byCat[b] - byCat[a])[0];
      insights.push({ icon: "🩺", title: "Частые жалобы: " + esc(top), text: "Зафиксировано " + byCat[top] + " " + fmt.plural(byCat[top], "запись", "записи", "записей") + " по категории «" + esc(top) + "». Обсудите это с ветеринаром на следующем приёме — отчёт формируется автоматически." });
    }
    if (sleep.length) {
      insights.push({
        icon: Math.abs(avgSleep - normSleep) < 1.5 ? "✅" : "⚠️",
        title: "Сон",
        text: "Средний сон " + fmt.num(avgSleep, 1) + " ч при норме около " + normSleep + " ч. " + (avgSleep < normSleep - 1.5 ? "Недосып может объяснять вялость — проверьте активность вечером." : "Режим сна в порядке.")
      });
    }
    if (activity.length) {
      const steps7 = activity.slice(-7).reduce((s, a) => s + a.steps, 0);
      insights.push({ icon: "🏃", title: "Активность за неделю", text: fmt.int(steps7) + " шагов за 7 дней (" + fmt.int(steps7 / 7) + " в среднем). Цель — 8 000 шагов в день, то есть " + fmt.int(56000) + " в неделю." });
    }
    if (expByCat.food) {
      insights.push({ icon: "💰", title: "Расходы", text: "Больше всего уходит на «Корм» — " + fmt.money(expByCat.food) + ". Подписка на корм и подбор без аллергенов могут снизить расходы на 10–15%." });
    }
    const vacOverdue = (S.vaccinations[p.id] || []).filter((v) => v.next && window.Store.daysUntil(v.next) < 0);
    if (vacOverdue.length) insights.push({ icon: "💉", title: "Просроченные прививки", text: "Просрочено: " + esc(vacOverdue.map((v) => v.name).join(", ")) + ". Это критично для иммунитета — запишитесь к ветеринару." });
    insights.push({ icon: "⭐", title: "PetLife Index: " + idx.score + "/100", text: idx.details.map((d) => d.label + " — " + d.value + "%").join(" · ") + "." });

    return `
      <div class="kpi-row mb-2">
        ${stat({ icon: "⭐", value: idx.score + "/100", label: "PetLife Index", kind: idx.score >= 80 ? "ok" : "warn" })}
        ${stat({ icon: "📔", value: symptoms.length, label: "записей о симптомах" })}
        ${stat({ icon: "🚶", value: walks.length, label: "прогулок записано" })}
        ${stat({ icon: "🧾", value: fmt.money(Object.values(expByCat).reduce((a, b) => a + b, 0)), label: "расходы на питомца" })}
      </div>
      <div class="panel-grid cols-2">
        <section class="card">
          <header class="card-head"><h3><span class="card-ico">🧠</span> Выводы ИИ по вашим данным</h3>${badge("аналитика на устройстве", "violet")}</header>
          <div class="card-body stack" style="gap:10px">
            ${insights.map((i) => `<div class="hint-box"><b>${i.icon} ${esc(i.title)}</b><div class="small mt-1">${i.text}</div></div>`).join("")}
          </div>
        </section>
        <div class="stack">
          <section class="card">
            <header class="card-head"><h3><span class="card-ico">⚖️</span> Вес</h3></header>
            <div class="card-body">${wSeries.length > 1 ? Charts.line(wSeries, { color: "#2C5F8D", unit: " кг", target: breed.weight }) : `<div class="muted small center">Недостаточно данных</div>`}</div>
          </section>
          <section class="card">
            <header class="card-head"><h3><span class="card-ico">🌙</span> Сон</h3></header>
            <div class="card-body">${sleepSeries.length ? Charts.bars(sleepSeries, { color: "#8E44AD", unit: " ч", target: normSleep }) : `<div class="muted small center">Недостаточно данных</div>`}</div>
          </section>
          <section class="card">
            <header class="card-head"><h3><span class="card-ico">🩺</span> Симптомы по категориям</h3></header>
            <div class="card-body">${catParts.length ? Charts.donut(catParts, { center: String(symptoms.length), centerSub: "записей" }) : `<div class="muted small center">Жалоб не зафиксировано 🎉</div>`}</div>
          </section>
          <section class="card">
            <header class="card-head"><h3><span class="card-ico">💰</span> Структура расходов</h3></header>
            <div class="card-body">${expParts.length ? Charts.donut(expParts, { center: fmt.money(Object.values(expByCat).reduce((a, b) => a + b, 0)).replace(" ₽", ""), centerSub: "всего ₽" }) : `<div class="muted small center">Расходов пока нет</div>`}</div>
          </section>
        </div>
      </div>`;
  }

  /* ------------------------------------------------------------------ рендер */
  function render(view, ctx) {
    const tab = ctx.tab || "chat";
    const p = pet();
    const tabs = [
      { id: "chat", title: "ИИ-чат", icon: "💬" },
      { id: "plan", title: "План на неделю", icon: "🗓" },
      { id: "insights", title: "Аналитика", icon: "📊" }
    ];
    view.innerHTML = `
      <div class="panel">
        <div class="panel-head">
          <div><h2>🤖 ИИ-ассистент</h2><p>Знает профиль ${esc(p.name)}: породу, возраст, вес, аллергии, прививки, лекарства, историю и даже погоду за окном</p></div>
          <div class="panel-tools">
            <button class="btn btn-ghost btn-sm" data-act="ai.clear">🧹 Очистить чат</button>
            <button class="btn btn-soft btn-sm" data-act="ai.plan-copy">📋 Скопировать план</button>
          </div>
        </div>
        <div class="chip-row mb-2">
          ${tabs.map((t) => `<button class="tag ${tab === t.id ? "active" : ""}" data-act="hub.open" data-panel="ai" data-tab="${t.id}">${t.icon} ${t.title}</button>`).join("")}
        </div>
        <div class="panel-grid cols-2" style="grid-template-columns:1fr 340px">
          <section class="card">
            <header class="card-head"><h3><span class="card-ico">${tab === "chat" ? "💬" : tab === "plan" ? "🗓" : "📊"}</span> ${tab === "chat" ? "Диалог" : tab === "plan" ? "Персональный план заботы" : "Аналитика данных"}</h3>
              ${badge(window.PETLIFE_CONFIG.OPENROUTER_API_KEY ? "LLM подключён" : "локальный ИИ", "violet")}</header>
            <div class="card-body">
              ${tab === "plan" ? planHtml() : tab === "insights" ? insightsHtml() : chatHtml()}
            </div>
          </section>
          <div class="stack">
            <section class="card">
              <header class="card-head"><h3><span class="card-ico">📎</span> Контекст, который видит ИИ</h3></header>
              <div class="card-body">
                <div class="kv">
                  <div class="kv-row"><span class="kv-k">Питомец</span><span class="kv-v">${esc(p.name)} · ${esc(window.Store.breed(p).name)}</span></div>
                  <div class="kv-row"><span class="kv-k">Возраст</span><span class="kv-v">${esc(window.Store.ageLabel(p))}</span></div>
                  <div class="kv-row"><span class="kv-k">Вес</span><span class="kv-v">${fmt.num(p.weight, 1)} кг</span></div>
                  <div class="kv-row"><span class="kv-k">Аллергии</span><span class="kv-v">${p.allergies.length ? esc(p.allergies.join(", ")) : "нет"}</span></div>
                  <div class="kv-row"><span class="kv-k">Прививок в карте</span><span class="kv-v">${(window.Store.state.vaccinations[p.id] || []).length}</span></div>
                  <div class="kv-row"><span class="kv-k">Лекарств</span><span class="kv-v">${(window.Store.state.meds[p.id] || []).length}</span></div>
                  <div class="kv-row"><span class="kv-k">Погода</span><span class="kv-v">${window.Store.state.lastWeather ? esc(window.Store.state.lastWeather.cityName) + " · " + fmt.temp(window.Store.state.lastWeather.temp) : "не загружена"}</span></div>
                </div>
                <div class="hint-box mt-2">ИИ не заменяет ветеринара: при серьёзных симптомах обращайтесь к специалисту. Все выводы строятся на ваших данных и открытых справочниках.</div>
              </div>
            </section>
            <section class="card">
              <header class="card-head"><h3><span class="card-ico">⚡</span> Быстрые задачи</h3></header>
              <div class="card-body stack" style="gap:8px">
                <button class="btn btn-soft btn-block" data-act="ai.ask" data-q="Составь план заботы на неделю">🗓 План заботы на неделю</button>
                <button class="btn btn-soft btn-block" data-act="ai.ask" data-q="Сколько корма давать моему питомцу?">🍽 Сколько корма давать</button>
                <button class="btn btn-soft btn-block" data-act="ai.ask" data-q="Безопасно ли гулять сегодня?">🌤 Безопасно ли гулять</button>
                <button class="btn btn-soft btn-block" data-act="ai.ask" data-q="Что делать, если питомец чешется?">🩺 Питомец чешется</button>
                <button class="btn btn-soft btn-block" data-act="ai.ask" data-q="Как понять, что пора к ветеринару?">🚑 Когда к ветеринару</button>
                <button class="btn btn-soft btn-block" data-act="ai.ask" data-q="Чем занять питомца, пока я на работе?">🧩 Чем занять дома</button>
              </div>
            </section>
            <section class="card">
              <header class="card-head"><h3><span class="card-ico">📷</span> ИИ-анализ фото</h3></header>
              <div class="card-body">
                <p class="small muted">Загрузите фото кожи, глаз, ушей или зубов — vision-модель посмотрит и подскажет, что делать.</p>
                <button class="btn btn-primary btn-block" data-act="hub.open" data-panel="health" data-tab="photo">Перейти к анализу фото</button>
              </div>
            </section>
          </div>
        </div>
      </div>`;
    if (tab === "chat") {
      scrollChat();
      const input = $("#aiInput");
      if (input) {
        input.addEventListener("keydown", (e) => {
          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input.value); }
        });
        input.focus();
      }
    }
  }

  window.Panels.register("ai", { render });

  Actions.registerAll({
    "ai.send": () => { const i = $("#aiInput"); send(i ? i.value : ""); },
    "ai.ask": (ds) => {
      const go = async () => {
        if (window.Hub.panel !== "ai" || window.Hub.tab !== "chat") {
          window.Hub.open("ai", "chat");
          await new Promise((r) => setTimeout(r, 60));
        }
        send(ds.q);
      };
      go();
    },
    "ai.clear": async () => {
      const ok = await confirmDialog("Очистить историю диалога?", { ok: "Очистить", danger: true });
      if (!ok) return;
      window.Store.update((s) => { s.chat = [{ role: "assistant", text: "История очищена. Спрашивайте снова — я помню профиль " + window.Store.pet().name + ".", at: new Date().toISOString() }]; }, "chat");
      toast("Чат очищен", "ok");
    },
    "ai.plan-save": () => {
      const plan = window.AI.plan(pet());
      window.Store.update((s) => {
        const p = window.Store.pet();
        s.medical[p.id].unshift({
          id: window.Store.uid("m"), date: fmt.today(), type: "Другое",
          title: "ИИ-план заботы на неделю", vet: "PetLife AI", notes: plan.slice(0, 1200)
        });
      }, "medical");
      toast("План сохранён в медкарту", "ok");
    },
    "ai.plan-copy": async () => {
      const plan = window.AI.plan(pet());
      try { await navigator.clipboard.writeText(plan); toast("План скопирован в буфер обмена", "ok"); }
      catch (e) { toast("Не удалось скопировать: браузер запретил доступ", "warn"); }
    },
    "ai.plan-download": () => {
      const p = pet();
      const plan = window.AI.plan(p) + "\n\nСформировано в PetLife для " + p.name + " (" + window.Store.breed(p).name + ")";
      window.PL.download("petlife-plan-" + p.name + ".txt", plan, "text/plain;charset=utf-8");
      toast("План выгружен", "ok");
    }
  });
})();
