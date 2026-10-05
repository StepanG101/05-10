/* ============================================================================
 * PetLife — app/panel-training.js
 * Панель «Дрессировка»: ТЗ 17–18 — курсы, уроки, XP, уровень и стрик;
 * ТЗ 19 — клик-тренажёр «окно награды» и игры для умственной стимуляции;
 * ТЗ 20 — анализ поведения по опроснику с разбором проблемных зон.
 * Только DOM + requestAnimationFrame/setTimeout, без canvas и внешних ресурсов.
 * ==========================================================================*/
(function () {
  "use strict";

  const { $, esc, fmt, card, stat, badge, progress, empty, Charts, toast, modal,
          confirmDialog, Actions } = window.PL;
  const D = window.PL_DATA;
  const S = () => window.Store.state;

  const LESSON_XP = 40;
  const GAME_XP = 15;
  const CLICKER_ROUND = 5;
  const CLICKER_PERFECT_XP = 12;
  const CLICKER_MISS_XP = 2;
  const CLICKER_WINDOW_MS = 900;
  const CLICKER_MIN_MS = 1400;
  const CLICKER_MAX_MS = 2600;

  const TABS = [
    { id: "courses", label: "🎓 Курсы" },
    { id: "clicker", label: "🎯 Клик-тренажёр" },
    { id: "games", label: "🧩 Игры для ума" },
    { id: "behavior", label: "🧠 Поведение" }
  ];

  /* ================================================================ утилиты */
  function tabsBar(active) {
    return `<div class="chip-row mb-2">${TABS.map((t) =>
      `<button class="tag ${t.id === active ? "active" : ""}" data-act="hub.open" data-panel="training" data-tab="${t.id}">${t.label}</button>`
    ).join("")}</div>`;
  }

  function train(petId) {
    const st = S().training || (S().training = {});
    if (!st[petId]) st[petId] = { done: [], xp: 0, streak: 0, games: [], lastLesson: null };
    const t = st[petId];
    if (!Array.isArray(t.done)) t.done = [];
    if (!Array.isArray(t.games)) t.games = [];
    if (typeof t.xp !== "number" || isNaN(t.xp)) t.xp = 0;
    if (typeof t.streak !== "number" || isNaN(t.streak)) t.streak = 0;
    if (!t.lastLesson) t.lastLesson = null;
    return t;
  }

  function allLessons() {
    return D.courses.reduce((acc, c) => acc.concat(c.lessons.map((l) =>
      Object.assign({ courseId: c.id, courseTitle: c.title }, l))), []);
  }

  function findLesson(lessonId) {
    return allLessons().filter((l) => l.id === lessonId)[0] || null;
  }

  function lessonDone(petId, lessonId) {
    return train(petId).done.indexOf(lessonId) >= 0;
  }

  function levelName(pct) {
    return pct >= 67 ? "продвинутый" : pct >= 34 ? "средний" : "новичок";
  }

  function levelKind(pct) {
    return pct >= 67 ? "violet" : pct >= 34 ? "warn" : "ok";
  }

  function lessonCourse(lessonId) {
    const l = findLesson(lessonId);
    return l ? l.courseId : null;
  }

  function alive(node) {
    return !!node && document.body.contains(node);
  }

  /* отметка урока: XP, стрик по дням, lastLesson */
  function toggleLesson(petId, lessonId) {
    const t = train(petId);
    const wasDone = t.done.indexOf(lessonId) >= 0;
    const today = fmt.today();
    const yesterday = window.Store.iso(1);
    let streakUp = false;
    window.Store.update(() => {
      const x = train(petId);
      if (wasDone) {
        x.done = x.done.filter((id) => id !== lessonId);
        x.xp = Math.max(0, (x.xp || 0) - LESSON_XP);
      } else {
        x.done = x.done.concat([lessonId]);
        x.xp = (x.xp || 0) + LESSON_XP;
        if (x.lastLesson !== today) {
          x.streak = x.lastLesson === yesterday ? (x.streak || 0) + 1 : 1;
          x.lastLesson = today;
          streakUp = true;
        }
      }
    }, "training");
    const lesson = findLesson(lessonId);
    const title = lesson ? lesson.title : "урок";
    if (wasDone) toast("Отметка снята: " + title + " (−" + LESSON_XP + " XP)", "info");
    else toast("Молодец! " + title + " — +" + LESSON_XP + " XP" + (streakUp ? " · стрик продлён 🔥" : ""), "ok");
  }

  /* ================================================================ КУРСЫ */
  function lessonRow(petId, courseId, lesson, done) {
    return `<div class="lesson ${done ? "done" : ""}">
      <button class="lesson-check ${done ? "done" : ""}" data-act="training.lesson" data-id="${esc(lesson.id)}"
        title="${done ? "Снять отметку" : "Отметить выполненным"}" aria-label="Отметить урок">${done ? "✓" : ""}</button>
      <div style="flex:1;min-width:0">
        <div class="lesson-title">${esc(lesson.title)}</div>
        <div class="lesson-how">${esc(lesson.how)}</div>
        <div class="muted tiny mt-1">🎁 Награда: ${esc(lesson.reward)} · +${LESSON_XP} XP</div>
      </div>
      <button class="btn btn-xs btn-ghost" data-act="training.how" data-id="${esc(lesson.id)}">Инструкция</button>
    </div>`;
  }

  function courseCard(petId, course) {
    const done = train(petId).done;
    const total = course.lessons.length;
    const doneCount = course.lessons.filter((l) => done.indexOf(l.id) >= 0).length;
    const pct = total ? Math.round((doneCount / total) * 100) : 0;
    const lvl = pct === 100 ? "продвинутый" : levelName(pct);
    return `<div class="course-card" id="course-${esc(course.id)}">
      <div class="course-head">
        <span class="course-ico">${course.emoji}</span>
        <div style="flex:1;min-width:0">
          <div class="row-between">
            <b>${esc(course.title)}</b>
            <span class="row">${badge("уровень: " + course.level, course.level === "новичок" ? "info" : course.level === "средний" ? "warn" : "violet")}
            ${pct === 100 ? badge("курс пройден", "ok") : ""}</span>
          </div>
          <div class="muted small">${esc(course.desc)}</div>
        </div>
      </div>
      <div style="padding:12px 17px 4px">
        ${progress(pct, pct === 100 ? "green" : "orange")}
        <div class="row-between mt-1">
          <span class="muted small">${doneCount} из ${total} уроков · ${pct}%</span>
          ${badge("питомец: " + lvl, levelKind(pct))}
        </div>
      </div>
      ${course.lessons.map((l) => lessonRow(petId, course.id, l, done.indexOf(l.id) >= 0)).join("")}
      <div class="card-foot row">
        <button class="btn btn-sm btn-primary" data-act="training.next" data-id="${esc(course.id)}">▶ Следующий урок</button>
        <button class="btn btn-sm btn-ghost" data-act="training.reset" data-id="${esc(course.id)}">↺ Сбросить прогресс</button>
      </div>
    </div>`;
  }

  function coursesTab(pet) {
    const t = train(pet.id);
    const lessons = allLessons();
    const totalDone = lessons.filter((l) => t.done.indexOf(l.id) >= 0).length;
    const overall = lessons.length ? Math.round((totalDone / lessons.length) * 100) : 0;
    const xp = t.xp || 0;
    const lvl = Math.floor(xp / 100) + 1;
    const inLevel = xp % 100;
    const streak = t.streak || 0;
    const todayDone = t.lastLesson === fmt.today();

    const hero = card({
      title: "Прогресс дрессировки", icon: "🏆",
      tools: `<button class="btn btn-xs btn-ghost" data-act="training.reset" data-id="all">↺ Сбросить всё</button>`,
      body: `
        <div class="xp-bar">
          <div class="xp-level" title="Уровень дрессировки">${lvl}</div>
          <div style="flex:1;min-width:0">
            <div class="row-between mb-1"><b>Уровень ${lvl}</b><span class="muted small">${fmt.int(xp)} XP всего</span></div>
            ${progress(inLevel, inLevel >= 60 ? "green" : "orange")}
            <div class="muted small mt-1">До уровня ${lvl + 1} осталось <b>${100 - inLevel} XP</b> · ${overall}% всех уроков</div>
          </div>
        </div>
        <div class="tracker-tiles mt-2">
          ${stat({ icon: "🔥", value: streak + " " + fmt.plural(streak, "день", "дня", "дней"), label: "Стрик занятий", hint: todayDone ? "Сегодня занятие засчитано" : "Сегодня ещё нет отметки", kind: streak >= 3 ? "ok" : "" })}
          ${stat({ icon: "📚", value: totalDone + " / " + lessons.length, label: "Уроков пройдено" })}
          ${stat({ icon: "🎯", value: (t.games || []).length, label: "Игр и тренажёров" })}
          ${stat({ icon: "🕒", value: t.lastLesson ? fmt.short(t.lastLesson) : "—", label: "Последнее занятие" })}
        </div>
        <p class="muted small mt-2">${todayDone
          ? "✅ Стрик в безопасности: занятие на сегодня уже отмечено."
          : "Отметьте хотя бы один урок сегодня — и стрик вырастет на день."}</p>
      `
    });

    const list_ = D.courses.map((c) => courseCard(pet.id, c)).join("");
    return `<div class="stack">${hero}<div class="stack">${list_}</div></div>`;
  }

  function openLessonModal(lesson, petId) {
    if (!lesson) { toast("Все уроки этого курса уже пройдены 🎉", "ok"); return; }
    const done = lessonDone(petId, lesson.id);
    const course = D.courses.filter((c) => c.id === lesson.courseId)[0];
    modal({
      title: "Урок: " + lesson.title, icon: course ? course.emoji : "🎓", wide: true,
      body: `
        <div class="kv mb-2">
          <div class="kv-row"><span class="kv-k">Курс</span><span class="kv-v">${esc(course ? course.title : "—")}</span></div>
          <div class="kv-row"><span class="kv-k">Награда</span><span class="kv-v">${esc(lesson.reward)}</span></div>
          <div class="kv-row"><span class="kv-k">Опыт</span><span class="kv-v">+${LESSON_XP} XP</span></div>
        </div>
        <div class="hint-box"><b>Как отрабатывать.</b><br>${esc(lesson.how)}</div>
        <p class="muted small mt-2">Занимайтесь короткими подходами по 3–5 минут, заканчивайте на успехе и всегда награждайте в течение секунды после правильного действия.</p>`,
      actions: [
        { label: "Закрыть" },
        { label: done ? "Снять отметку" : "Отметить выполненным", kind: done ? "ghost" : "primary",
          onClick: () => { toggleLesson(petId, lesson.id); } }
      ]
    });
  }

  /* ======================================================= КЛИК-ТРЕНАЖЁР */
  const clicker = {
    host: null,
    rafId: 0,
    timers: [],
    running: false,
    waiting: false,
    grace: false,
    answered: false,
    attempt: 0,
    perfect: 0,
    series: 0,
    bestSeries: 0,
    score: 0,
    clicks: [],
    duration: 0,
    winMs: CLICKER_WINDOW_MS,
    attemptStart: 0,
    windowOpen: 0,
    windowClose: 0,
    roundStart: 0,
    history: []
  };

  function clickerBest() {
    const st = S().settings || {};
    const b = st.clickerBest;
    return b && typeof b.accuracy === "number" ? b : null;
  }

  function ckAbort() {
    clicker.running = false;
    clicker.waiting = false;
    clicker.grace = false;
    clicker.answered = false;
    if (clicker.rafId) { cancelAnimationFrame(clicker.rafId); clicker.rafId = 0; }
    clicker.timers.forEach((id) => clearTimeout(id));
    clicker.timers = [];
  }

  function ckSet(host, sel, text) {
    const el = $(sel, host);
    if (el) el.textContent = text;
  }

  function ckAccuracy() {
    return clicker.attempt ? Math.round((clicker.perfect / clicker.attempt) * 100) : 0;
  }

  function ckPaint(host) {
    if (!host) return;
    ckSet(host, "#ck-score", clicker.score + " XP");
    ckSet(host, "#ck-series", String(clicker.series));
    ckSet(host, "#ck-acc", ckAccuracy() + "%");
    ckSet(host, "#ck-attempt", clicker.running
      ? "Попытка " + Math.min(clicker.attempt + 1, CLICKER_ROUND) + " из " + CLICKER_ROUND
      : "Раунд не начат");
  }

  function ckButtons(host, playing) {
    const start = $("#ck-start", host);
    const hit = $("#ck-hit", host);
    if (start) start.classList.toggle("hidden", playing);
    if (hit) hit.classList.toggle("hidden", !playing);
  }

  function ckStage() {
    const best = clickerBest();
    const hist = clicker.history.length
      ? `<div class="stack" style="gap:8px">${clicker.history.map((h) =>
          `<div class="row-between" style="border-bottom:1px dashed #E7ECF2;padding:6px 2px">
            <span class="muted small">${esc(fmt.short(h.date))} · серия ${h.series || 0}</span>
            <span>${badge(h.accuracy + "%", h.accuracy >= 80 ? "ok" : h.accuracy >= 40 ? "warn" : "danger")}
            <span class="muted small">${h.xp} XP${h.delay != null ? " · " + h.delay + " мс" : ""}</span></span>
          </div>`).join("")}</div>`
      : `<div class="muted small">Раундов пока не было — сыграйте первый и результат появится здесь.</div>`;

    return `
      <div class="tracker-tiles mb-2">
        ${stat({ icon: "⭐", value: `<span id="ck-score">0 XP</span>`, label: "Счёт раунда" })}
        ${stat({ icon: "🔥", value: `<span id="ck-series">0</span>`, label: "Серия идеальных" })}
        ${stat({ icon: "🎯", value: `<span id="ck-acc">0%</span>`, label: "Точность" })}
        ${stat({ icon: "🏅", value: best ? best.accuracy + "%" : "—", label: "Лучший результат", hint: best ? fmt.short(best.date) + " · " + best.xp + " XP" : "Ещё нет рекорда" })}
      </div>
      <div class="row-between mb-1">
        <span class="muted small" id="ck-attempt">Раунд не начат</span>
        <span class="muted small" id="ck-hint">Нажмите «Начать раунд»</span>
      </div>
      <div id="ck-track" style="position:relative;height:22px;border-radius:11px;background:#EEF1F5;overflow:hidden;border:1px solid #E3E9F0">
        <i id="ck-fill" style="position:absolute;left:0;top:0;bottom:0;width:0%;background:linear-gradient(90deg,#2C5F8D,#4A8CC0)"></i>
        <i id="ck-win" style="position:absolute;top:0;bottom:0;right:0;width:34%;background:rgba(67,160,71,.45)"></i>
      </div>
      <div class="muted tiny mt-1 mb-2">🟩 Зелёная зона справа — «окно награды» (последние ${CLICKER_WINDOW_MS} мс). Клик внутри неё — идеальный.</div>
      <button class="btn btn-primary btn-lg btn-block" id="ck-start" data-act="training.clickerStart">▶ Начать раунд (${CLICKER_ROUND} попыток)</button>
      <button class="btn btn-green btn-lg btn-block hidden" id="ck-hit" data-act="training.clickerHit">КЛИК!</button>
      <div class="mt-2" id="ck-msg"></div>
      <div class="mt-3">
        <div class="row-between mb-1"><b>История раундов</b><span class="muted small">последние 5</span></div>
        ${hist}
      </div>`;
  }

  function mountClicker(view) {
    ckAbort();
    const host = $("#ck-live", view);
    clicker.host = host || null;
    if (!host) return;
    clicker.attempt = 0;
    clicker.perfect = 0;
    clicker.series = 0;
    clicker.bestSeries = 0;
    clicker.score = 0;
    clicker.clicks = [];
    ckButtons(host, false);
    ckPaint(host);
    ckSet(host, "#ck-hint", "Жмите «КЛИК!» ровно в зелёном окне");
  }

  function ckStart() {
    const host = document.getElementById("ck-live");
    if (!alive(host)) { toast("Откройте подраздел «Клик-тренажёр»", "info"); return; }
    ckAbort();
    clicker.host = host;
    clicker.running = true;
    clicker.attempt = 0;
    clicker.perfect = 0;
    clicker.series = 0;
    clicker.bestSeries = 0;
    clicker.score = 0;
    clicker.clicks = [];
    clicker.roundStart = performance.now();
    ckButtons(host, true);
    ckPaint(host);
    ckNextAttempt();
    toast("Раунд начался: " + CLICKER_ROUND + " попыток", "info");
  }

  function ckNextAttempt() {
    const host = clicker.host;
    if (!clicker.running) return;
    if (!alive(host)) { ckAbort(); return; }
    if (clicker.attempt >= CLICKER_ROUND) { ckFinish(); return; }
    const duration = CLICKER_MIN_MS + Math.random() * (CLICKER_MAX_MS - CLICKER_MIN_MS);
    const win = Math.min(CLICKER_WINDOW_MS, Math.round(duration * 0.5));
    clicker.duration = duration;
    clicker.winMs = win;
    clicker.attemptStart = performance.now();
    clicker.windowOpen = clicker.attemptStart + duration - win;
    clicker.windowClose = clicker.attemptStart + duration;
    clicker.waiting = true;
    clicker.grace = false;
    clicker.answered = false;
    const winEl = $("#ck-win", host);
    if (winEl) winEl.style.width = ((win / duration) * 100).toFixed(1) + "%";
    const fill = $("#ck-fill", host);
    if (fill) fill.style.width = "0%";
    const hit = $("#ck-hit", host);
    if (hit) { hit.disabled = false; hit.classList.remove("ck-hot"); }
    ckSet(host, "#ck-msg", "");
    ckSet(host, "#ck-hint", "Питомец выполняет действие…");
    ckPaint(host);
    clicker.rafId = requestAnimationFrame(ckTick);
  }

  function ckTick() {
    const host = clicker.host;
    clicker.rafId = 0;
    if (!clicker.running || !clicker.waiting) return;
    /* панель перерисована (view.innerHTML заменён) — гасим кадр и таймеры */
    if (!document.body.contains(host)) { ckAbort(); return; }
    if (!alive(host)) { ckAbort(); return; }
    const now = performance.now();
    const t = Math.min(1, (now - clicker.attemptStart) / clicker.duration);
    const fill = $("#ck-fill", host);
    if (fill) fill.style.width = (t * 100).toFixed(1) + "%";
    const inWin = now >= clicker.windowOpen;
    const hit = $("#ck-hit", host);
    if (hit) hit.classList.toggle("ck-hot", inWin);
    if (inWin) ckSet(host, "#ck-hint", "🟢 Окно награды открыто!");
    if (t >= 1) {
      clicker.waiting = false;
      clicker.grace = true;
      ckSet(host, "#ck-hint", "🐢 Награда запаздывает…");
      clicker.timers.push(setTimeout(() => { ckResolve("late", clicker.winMs, true); }, 700));
      return;
    }
    clicker.rafId = requestAnimationFrame(ckTick);
  }

  function ckHit() {
    const host = clicker.host;
    if (!clicker.running) return;
    if (!alive(host)) { ckAbort(); return; }
    const now = performance.now();
    if (clicker.waiting) {
      if (now >= clicker.windowOpen) ckResolve("perfect", now - clicker.windowOpen, false);
      else ckResolve("early", now - clicker.windowOpen, false);
    } else if (clicker.grace) {
      ckResolve("late", now - clicker.windowClose, false);
    }
  }

  function ckResolve(result, delay, timedOut) {
    const host = clicker.host;
    if (!clicker.running || clicker.answered) return;
    clicker.answered = true;
    clicker.waiting = false;
    clicker.grace = false;
    if (clicker.rafId) { cancelAnimationFrame(clicker.rafId); clicker.rafId = 0; }
    clicker.timers.forEach((id) => clearTimeout(id));
    clicker.timers = [];

    const xp = result === "perfect" ? CLICKER_PERFECT_XP : CLICKER_MISS_XP;
    clicker.attempt += 1;
    clicker.score += xp;
    if (result === "perfect") {
      clicker.perfect += 1;
      clicker.series += 1;
      clicker.bestSeries = Math.max(clicker.bestSeries, clicker.series);
    } else {
      clicker.series = 0;
    }
    clicker.clicks.push({ result, delay, xp, timedOut: !!timedOut });

    const box = alive(host) ? $("#ck-msg", host) : null;
    if (box) {
      if (result === "perfect") {
        box.innerHTML = `<div class="ok-box">✅ Идеальный клик! +${xp} XP <span class="muted small">— задержка ${Math.round(delay)} мс от открытия окна</span></div>`;
      } else if (result === "early") {
        box.innerHTML = `<div class="hint-box">⏱ Рано: питомец не понял, что вы награждаете <span class="muted small">— на ${Math.abs(Math.round(delay))} мс раньше окна</span></div>`;
      } else {
        box.innerHTML = `<div class="danger-box">🐢 Поздно: награда пришла с задержкой <span class="muted small">${timedOut ? "— клика не было вовсе" : "— на " + Math.round(delay) + " мс позже"}</span></div>`;
      }
    }
    const hit = alive(host) ? $("#ck-hit", host) : null;
    if (hit) hit.disabled = true;
    ckSet(host, "#ck-hint", "Разбор попытки…");
    ckPaint(host);

    if (clicker.attempt >= CLICKER_ROUND) {
      clicker.timers.push(setTimeout(() => { ckFinish(); }, 950));
    } else {
      clicker.timers.push(setTimeout(() => {
        if (!document.body.contains(clicker.host)) { ckAbort(); return; }
        ckNextAttempt();
      }, 950));
    }
  }

  function clickerAdvice(acc, avgDelay) {
    if (acc >= 80) return "Отличный тайминг! На прогулке отмечайте нужное действие маркером-словом («да!») и награждайте в течение <b>" + (avgDelay != null ? avgDelay : 600) + " мс</b> — именно так формируется понимание, что награда заслужена.";
    if (acc >= 40) return "Неплохо, но клик «плывёт». Считайте про себя «раз-и» и кликайте на втором счёте: у собак окно награды ещё уже, чем у этого тренажёра.";
    return "Спешка мешает: ранний клик сбивает питомца, поздний — закрепляет не то поведение. Перед занятием сделайте 3 спокойных вдоха и ждите зелёную зону.";
  }

  function showRoundModal(res) {
    const range = res.avgDelay != null
      ? "Средняя задержка клика <b>" + res.avgDelay + " мс</b> (окно награды " + CLICKER_WINDOW_MS + " мс)"
      : "Ни один клик не попал в окно — средний промах <b>" + (res.avgMiss != null ? res.avgMiss + " мс" : "—") + "</b>";
    modal({
      title: "Раунд завершён", icon: "🎪", wide: true,
      body: `
        <div class="tracker-tiles mb-2">
          ${stat({ icon: "⭐", value: res.xp + " XP", label: "Заработано", kind: res.acc >= 60 ? "ok" : "warn" })}
          ${stat({ icon: "🎯", value: res.acc + "%", label: "Точность" })}
          ${stat({ icon: "✅", value: res.hits + " / " + CLICKER_ROUND, label: "Идеальных кликов" })}
          ${stat({ icon: "🔥", value: res.best, label: "Лучшая серия" })}
        </div>
        <div class="kv mb-2">
          <div class="kv-row"><span class="kv-k">Разбор тайминга</span><span class="kv-v">${range}</span></div>
          <div class="kv-row"><span class="kv-k">Питомец</span><span class="kv-v">${esc(res.pet.name)}</span></div>
          <div class="kv-row"><span class="kv-k">XP начислено</span><span class="kv-v">+${res.xp} XP${res.isBest ? " · новый рекорд 🏅" : ""}</span></div>
        </div>
        <div class="hint-box"><b>Совет по дрессировке.</b><br>${clickerAdvice(res.acc, res.avgDelay)}</div>`,
      actions: [
        { label: "Закрыть" },
        { label: "Ещё раунд", kind: "primary", onClick: () => { setTimeout(() => Actions.run("training.clickerStart", {}, null, null), 280); } }
      ]
    });
  }

  function ckFinish() {
    if (!clicker.running && clicker.attempt < CLICKER_ROUND) return;
    const host = clicker.host;
    const pet = window.Store.pet();
    const xp = clicker.score;
    const perfect = clicker.perfect;
    const bestSeries = clicker.bestSeries;
    const acc = Math.round((perfect / CLICKER_ROUND) * 100);
    const hits = clicker.clicks.filter((c) => c.result === "perfect");
    const misses = clicker.clicks.filter((c) => c.result !== "perfect");
    const avgDelay = hits.length ? Math.round(hits.reduce((s, c) => s + Math.max(0, c.delay), 0) / hits.length) : null;
    const avgMiss = misses.length ? Math.round(misses.reduce((s, c) => s + Math.abs(c.delay), 0) / misses.length) : null;
    const minutes = Math.max(3, Math.round((performance.now() - clicker.roundStart) / 60000));
    const prevBest = clickerBest();
    const isBest = !prevBest || acc > prevBest.accuracy || (acc === prevBest.accuracy && xp > prevBest.xp);

    /* историю пополняем до перерисовки, чтобы раунд сразу появился в списке */
    clicker.history.unshift({ accuracy: acc, xp, delay: avgDelay, date: fmt.today(), series: bestSeries });
    clicker.history = clicker.history.slice(0, 5);

    ckAbort();
    window.Store.update(() => {
      const t = train(pet.id);
      t.xp = (t.xp || 0) + xp;
      t.games = (t.games || []).concat([{
        id: window.Store.uid("g"), date: fmt.today(), minutes, xp, kind: "clicker", accuracy: acc, title: "Клик-тренажёр"
      }]);
      const st = S();
      if (!st.settings) st.settings = {};
      if (isBest) st.settings.clickerBest = { accuracy: acc, xp, delay: avgDelay, date: fmt.today() };
    }, "training");

    if (alive(host)) ckButtons(host, false);

    showRoundModal({ xp, acc, hits: perfect, best: bestSeries, avgDelay, avgMiss, isBest, pet });
  }

  function clickerTab(pet) {
    const t = train(pet.id);
    const best = clickerBest();
    const rules = card({
      title: "Как устроен тренажёр", icon: "🎯",
      body: `
        <div class="hint-box">
          Раунд — ${CLICKER_ROUND} попыток. В каждой питомец «выполняет действие»: полоса растёт от 0 до 100% за случайные
          ${(CLICKER_MIN_MS / 1000).toFixed(1)}–${(CLICKER_MAX_MS / 1000).toFixed(1)} с, а последние ${CLICKER_WINDOW_MS} мс подсвечены зелёным — это
          <b>окно награды</b>. Клик внутри окна = идеальное подкрепление (+${CLICKER_PERFECT_XP} XP), раньше — питомец не свяжет награду с действием,
          позже — награда придёт с задержкой (+${CLICKER_MISS_XP} XP за попытку).
        </div>
        <div class="muted small mt-2">🎓 Уровень ${Math.floor((t.xp || 0) / 100) + 1} · ${t.xp || 0} XP · 🔥 стрик ${t.streak || 0} · рекорд: ${best ? best.accuracy + "%" : "пока нет"}</div>`
    });
    return `<div class="stack">
      <div class="card">
        <header class="card-head"><h3><span class="card-ico">🎪</span>КЛИК-ТРЕНАЖЁР «Окно награды»</h3></header>
        <div class="card-body" id="ck-live">${ckStage()}</div>
      </div>
      ${rules}
    </div>`;
  }

  /* ========================================================== ИГРЫ ДЛЯ УМА */
  let gamesFilter = "all";
  const gameTimer = { id: null, endAt: 0, remaining: 0, paused: false, tickId: 0, startedAt: 0, totalMs: 0 };

  function mmss(ms) {
    const total = Math.max(0, Math.round(ms / 1000));
    const m = Math.floor(total / 60), s = total % 60;
    return (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
  }

  function gameRemaining() {
    if (!gameTimer.id) return 0;
    if (gameTimer.paused) return Math.max(0, gameTimer.remaining);
    return Math.max(0, gameTimer.endAt - performance.now());
  }

  function stopGameTimer() {
    if (gameTimer.tickId) clearInterval(gameTimer.tickId);
    gameTimer.tickId = 0;
    gameTimer.id = null;
    gameTimer.paused = false;
    gameTimer.remaining = 0;
    gameTimer.endAt = 0;
    gameTimer.totalMs = 0;
  }

  function paintGameCards() {
    D.games.forEach((g) => {
      const active = gameTimer.id === g.id;
      const start = document.getElementById("gm-start-" + g.id);
      const pause = document.getElementById("gm-pause-" + g.id);
      const fin = document.getElementById("gm-finish-" + g.id);
      const time = document.getElementById("gm-time-" + g.id);
      const bar = document.getElementById("gm-bar-" + g.id);
      if (start) start.classList.toggle("hidden", active);
      if (pause) pause.classList.toggle("hidden", !active);
      if (fin) fin.classList.toggle("hidden", !active);
      if (pause) pause.textContent = active && gameTimer.paused ? "▶ Продолжить" : "⏸ Пауза";
      if (time) time.textContent = active ? mmss(gameRemaining()) : mmss(g.minutes * 60000);
      if (bar) {
        const pct = active && gameTimer.totalMs ? 100 - (gameRemaining() / gameTimer.totalMs) * 100 : 0;
        bar.style.width = Math.max(0, Math.min(100, pct)).toFixed(1) + "%";
      }
    });
  }

  function gamesRecord(gameId, elapsedMs) {
    const pet = window.Store.pet();
    const g = D.games.filter((x) => x.id === gameId)[0];
    const minutes = Math.max(1, Math.round(elapsedMs / 60000));
    window.Store.update(() => {
      const t = train(pet.id);
      t.xp = (t.xp || 0) + GAME_XP;
      t.games = (t.games || []).concat([{
        id: window.Store.uid("g"), date: fmt.today(), minutes, xp: GAME_XP,
        gameId, title: g ? g.title : "Игра для ума", kind: "game"
      }]);
    }, "training");
    toast("«" + (g ? g.title : "Игра") + "»: " + minutes + " мин записано, +" + GAME_XP + " XP", "ok");
  }

  function gameStart(gameId) {
    const g = D.games.filter((x) => x.id === gameId)[0];
    if (!g) return;
    if (gameTimer.id) stopGameTimer();
    const total = g.minutes * 60000;
    gameTimer.id = gameId;
    gameTimer.totalMs = total;
    gameTimer.remaining = total;
    gameTimer.endAt = performance.now() + total;
    gameTimer.startedAt = performance.now();
    gameTimer.paused = false;
    if (gameTimer.tickId) clearInterval(gameTimer.tickId);
    gameTimer.tickId = setInterval(gameTick, 250);
    paintGameCards();
    toast("«" + g.title + "» запущена на " + g.minutes + " мин", "info");
  }

  function gameTick() {
    const id = gameTimer.id;
    if (!id) { stopGameTimer(); return; }
    const el = document.getElementById("gm-time-" + id);
    if (!el || !document.body.contains(el)) { stopGameTimer(); return; }
    const left = gameRemaining();
    el.textContent = mmss(left);
    const bar = document.getElementById("gm-bar-" + id);
    if (bar && gameTimer.totalMs) bar.style.width = Math.min(100, Math.max(0, 100 - (left / gameTimer.totalMs) * 100)).toFixed(1) + "%";
    if (left <= 0) {
      const elapsed = performance.now() - gameTimer.startedAt;
      const gameId = id;
      stopGameTimer();
      gamesRecord(gameId, elapsed);
    }
  }

  function gameFinish() {
    if (!gameTimer.id) { toast("Сначала запустите игру", "info"); return; }
    const gameId = gameTimer.id;
    const elapsed = performance.now() - gameTimer.startedAt;
    stopGameTimer();
    gamesRecord(gameId, elapsed);
  }

  function gamePause() {
    if (!gameTimer.id) return;
    if (gameTimer.paused) {
      gameTimer.endAt = performance.now() + gameTimer.remaining;
      gameTimer.paused = false;
      toast("Таймер продолжен", "info");
    } else {
      gameTimer.remaining = Math.max(0, gameTimer.endAt - performance.now());
      gameTimer.paused = true;
      toast("Пауза", "info");
    }
    paintGameCards();
  }

  function gamesTab(pet) {
    const t = train(pet.id);
    const games = t.games || [];
    const weekAgo = window.Store.iso(6);
    const week = games.filter((g) => g.date >= weekAgo);
    const weekMinutes = week.reduce((s, g) => s + (+g.minutes || 0), 0);

    const days = [];
    for (let i = 6; i >= 0; i--) {
      const iso = window.Store.iso(i);
      const minutes = games.filter((g) => g.date === iso).reduce((s, g) => s + (+g.minutes || 0), 0);
      days.push({ label: iso, short: fmt.short(iso), value: minutes });
    }

    const shown = gamesFilter === "all" ? D.games : D.games.filter((g) => g.diff === gamesFilter);
    const filters = ["all", "легко", "средне", "сложно"];
    const filterHtml = `<div class="chip-row">${filters.map((f) =>
      `<button class="tag ${gamesFilter === f ? "active" : ""}" data-act="training.gamesFilter" data-id="${f}">${f === "all" ? "все сложности" : f}</button>`).join("")}</div>`;

    const counter = card({
      title: "Умственная нагрузка", icon: "🧠",
      tools: filterHtml,
      body: `
        <div class="tracker-tiles">
          ${stat({ icon: "🗓", value: week.length + " " + fmt.plural(week.length, "игра", "игры", "игр"), label: "За 7 дней" })}
          ${stat({ icon: "⏱", value: weekMinutes + " мин", label: "Минут за неделю", kind: weekMinutes >= 60 ? "ok" : "warn" })}
          ${stat({ icon: "⭐", value: (t.xp || 0) + " XP", label: "Всего опыта" })}
          ${stat({ icon: "📈", value: Math.floor((t.xp || 0) / 100) + 1, label: "Уровень" })}
        </div>
        <div class="mt-2">${Charts.bars(days, { unit: " мин", color: "#8E44AD", target: 15 })}</div>
        <p class="muted small mt-1">Ориентир — 15 минут умственной работы в день: она утомляет питомца не хуже долгой прогулки.</p>`
    });

    const cards = shown.length ? shown.map((g) => `
      <div class="card">
        <div class="card-body">
          <div class="row-between">
            <div class="row" style="gap:10px">
              <span style="font-size:1.8rem">${g.emoji}</span>
              <div>
                <b>${esc(g.title)}</b>
                <div class="muted small">${esc(g.diff)} · ${g.minutes} мин</div>
              </div>
            </div>
            <span class="badge badge-info" id="gm-time-${g.id}">${mmss(g.minutes * 60000)}</span>
          </div>
          <p class="muted small mt-2">${esc(g.desc)}</p>
          <div class="progress mb-2" style="height:8px"><span id="gm-bar-${g.id}" style="width:0%"></span></div>
          <div class="row">
            <button class="btn btn-sm btn-primary ${gameTimer.id === g.id ? "hidden" : ""}" id="gm-start-${g.id}" data-act="training.gameStart" data-id="${g.id}">▶ Запустить</button>
            <button class="btn btn-sm btn-ghost ${gameTimer.id === g.id ? "" : "hidden"}" id="gm-pause-${g.id}" data-act="training.gamePause" data-id="${g.id}">${gameTimer.id === g.id && gameTimer.paused ? "▶ Продолжить" : "⏸ Пауза"}</button>
            <button class="btn btn-sm btn-green ${gameTimer.id === g.id ? "" : "hidden"}" id="gm-finish-${g.id}" data-act="training.gameFinish" data-id="${g.id}">⏹ Завершить</button>
          </div>
        </div>
      </div>`).join("") : empty("🧩", "В этой сложности игр нет", "Выберите другую сложность — там точно найдётся занятие по силам.",
        `<button class="btn btn-primary" data-act="training.gamesFilter" data-id="all">Показать все игры</button>`);

    const last = games.slice(-5).reverse();
    const history = last.length ? card({
      title: "Журнал игр", icon: "📔",
      body: `<div class="timeline">${last.map((g) =>
        `<div class="tl-item"><div class="tl-rail"><div class="tl-dot">🧩</div><div class="tl-line"></div></div>
         <div class="tl-body"><div class="tl-time">${esc(fmt.short(g.date))}</div>
         <div class="tl-title">${esc(g.title || "Игра для ума")}</div>
         <div class="muted small">${g.minutes} мин${g.accuracy != null ? " · точность " + g.accuracy + "%" : ""} · +${g.xp || GAME_XP} XP</div></div></div>`).join("")}</div>`
    }) : "";

    return `<div class="stack">${counter}<div class="panel-grid cols-2">${cards}</div>${history}</div>`;
  }

  /* =========================================================== ПОВЕДЕНИЕ */
  const behaviorDraft = { active: false, index: 0, answers: {} };

  const ZONES = {
    q1: { name: "Возбуждение при встрече (гиперактивность)", advice: "Учите «место» и спокойному приветствию: игнорируйте прыжки, награждайте только четыре лапы на полу.", course: "c1" },
    q2: { name: "Тревожность в одиночестве", advice: "Приучайте к уходу постепенно: короткие отлучки, лакомство-головоломка, спокойное прощание без эмоций.", course: "c2" },
    q3: { name: "Нейтралитет к другим собакам", advice: "Держите дистанцию, на которой питомец ещё берёт еду, и сокращайте её на один шаг за занятие.", course: "c2" },
    q4: { name: "Подбор с земли и поводок", advice: "Отрабатывайте «фу» и «плюнь» с обменом на вкусняшку, проблемные места проходите на коротком поводке.", course: "c2" },
    q5: { name: "Тревожность и страх громких звуков", advice: "Включайте записи звуков на минимальной громкости и награждайте за спокойствие, не успокаивайте паникой.", course: "c2" },
    q6: { name: "Пищевое поведение", advice: "Кормите по режиму и убирайте миску через 15 минут, часть порции отдавайте на дрессировке.", course: "c1" },
    q7: { name: "Гиперактивность и отдых", advice: "Добавьте умственные игры и приучайте к «месту»: 15 минут нюхательной работы успокаивают лучше часа бега.", course: "c1" },
    q8: { name: "Подзыв и реакция на запрет", advice: "Работайте подзыв на длинном поводке с джекпотом и никогда не наказывайте питомца после подхода.", course: "c1" }
  };

  function behaviorMax() {
    return D.behaviorQuestions.reduce((s, q) => s + Math.max.apply(null, q.options.map((o) => o.s)), 0);
  }

  function behaviorResultOf(record) {
    const max = behaviorMax();
    let score = +record.score || 0;
    let pct;
    if (typeof record.percent === "number") {
      pct = Math.max(0, Math.min(100, Math.round(record.percent)));
      score = Math.round((pct / 100) * max);
    } else if (max && score > max) {
      /* старые записи демо-данных хранят сразу процент */
      pct = Math.max(0, Math.min(100, Math.round(score)));
      score = Math.round((pct / 100) * max);
    } else {
      pct = max ? Math.round((score / max) * 100) : 0;
    }
    const zones = behaviorQuestionsZones(record.answers);
    return { score, pct, zones, max };
  }

  function behaviorQuestionsZones(answers) {
    if (!answers) return [];
    return D.behaviorQuestions
      .filter((q) => typeof answers[q.id] === "number" && answers[q.id] <= 1)
      .map((q) => Object.assign({ q: q.q, score: answers[q.id] }, ZONES[q.id] || { name: q.q, advice: "Позанимайтесь этим пунктом отдельно.", course: "c1" }));
  }

  function behaviorAdvice(pct, zones) {
    if (pct >= 80) return "Поведение в отличной форме: питомец спокоен, контактен и управляем. Поддерживайте режим и вводите новые трюки — обучение держит мозг в тонусе.";
    if (pct >= 60) return "Хороший базовый уровень. Точечно подтяните " + zones.length + " " + fmt.plural(zones.length, "зону", "зоны", "зон") + " ниже — этого достаточно, чтобы город стал комфортным для вас обоих.";
    return "Есть над чем поработать. Начните с одной проблемной зоны, занимайтесь по 5 минут в день и обязательно награждайте за нужное поведение в первую секунду.";
  }

  function behaviorQuestion(step) {
    const q = D.behaviorQuestions[step];
    const chosen = behaviorDraft.answers[q.id];
    const answered = D.behaviorQuestions.filter((x) => typeof behaviorDraft.answers[x.id] === "number").length;
    const pct = Math.round((answered / D.behaviorQuestions.length) * 100);
    return `<div class="card">
      <header class="card-head">
        <h3><span class="card-ico">🧠</span>Опросник поведения</h3>
        <span class="muted small">${answered} из ${D.behaviorQuestions.length} отвечено</span>
      </header>
      <div class="card-body">
        ${progress(pct, "orange")}
        <div class="row-between mt-1 mb-2">
          <span class="muted small">Вопрос ${step + 1} из ${D.behaviorQuestions.length}</span>
          <span class="muted small">${pct}% готово</span>
        </div>
        <h3 style="margin:6px 0 12px">${esc(q.q)}</h3>
        <div class="chip-row">
          ${q.options.map((o, i) => `<button class="tag ${chosen === o.s ? "active" : ""}" data-act="training.bhAnswer" data-q="${q.id}" data-s="${o.s}">${esc(o.t)} <span class="muted small">(${o.s} б.)</span></button>`).join("")}
        </div>
        <div class="row mt-3">
          <button class="btn btn-ghost btn-sm" data-act="training.bhBack" ${step === 0 ? "disabled" : ""}>← Назад</button>
          <button class="btn btn-primary btn-sm" data-act="training.bhNext">${step === D.behaviorQuestions.length - 1 ? "Показать результат" : "Далее →"}</button>
          <button class="btn btn-ghost btn-sm" data-act="training.bhCancel">Прервать</button>
        </div>
      </div>
    </div>`;
  }

  function behaviorHelpCourses(zones) {
    const ids = [];
    (zones || []).forEach((z) => { if (z.course && ids.indexOf(z.course) < 0) ids.push(z.course); });
    if (!ids.length) ids.push("c1", "c2");
    const courses = D.courses.filter((c) => ids.indexOf(c.id) >= 0);
    return card({
      title: "Курсы, которые помогут", icon: "🎓",
      body: `<div class="stack" style="gap:10px">${courses.map((c) => `
        <div class="row-between" style="border:1px solid #E7ECF2;border-radius:12px;padding:10px 12px">
          <div class="row" style="gap:10px"><span style="font-size:1.4rem">${c.emoji}</span>
            <div><b>${esc(c.title)}</b><div class="muted small">${esc(c.desc)}</div></div></div>
          <button class="btn btn-sm btn-soft" data-act="training.course" data-id="${c.id}">Открыть курс</button>
        </div>`).join("")}</div>`
    });
  }

  function behaviorTab(pet) {
    const records = window.Store.bucket("behavior", pet.id).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const last = records[records.length - 1];

    if (behaviorDraft.active) {
      return `<div class="stack">${behaviorQuestion(behaviorDraft.index)}
        <div class="muted small">Отвечайте честно: результат нужен не для оценки, а чтобы подобрать упражнения.</div>
      </div>`;
    }

    if (!last) {
      const intro = card({
        title: "Анализ поведения", icon: "🧠",
        body: `${empty("🧠", "Опросник ещё не пройден",
          "8 коротких вопросов о бытовом поведении: встреча гостей, прогулка, звуки, сон. На выходе — баллы, зоны роста и подбор курсов.",
          `<button class="btn btn-primary" data-act="training.bhStart">Начать опрос</button>`)}`
      });
      return `<div class="stack">${intro}${behaviorHelpCourses([])}</div>`;
    }

    const res = behaviorResultOf(last);
    const kind = res.pct >= 80 ? "ok" : res.pct >= 60 ? "warn" : "danger";
    const label = res.pct >= 80 ? "отлично" : res.pct >= 60 ? "есть зоны роста" : "нужна работа";
    const prev = records.length > 1 ? records[records.length - 2] : null;
    const prevRes = prev ? behaviorResultOf(prev) : null;
    const delta = prevRes ? res.pct - prevRes.pct : null;

    const history = records.length > 1 ? card({
      title: "История результатов", icon: "📈",
      body: Charts.line(records.map((r) => ({ label: r.date, value: behaviorResultOf(r).pct })), { unit: "%", target: 80, min: 0, max: 100, color: "#8E44AD" })
    }) : "";

    const zonesHtml = res.zones.length ? `
      <div class="stack" style="gap:10px">${res.zones.map((z) => `
        <div class="danger-box">
          <b>${esc(z.name)}</b> <span class="muted small">(${z.score} из 3 б.)</span>
          <div class="mt-1">${esc(z.advice)}</div>
          <div class="muted tiny mt-1">Вопрос: ${esc(z.q)}</div>
        </div>`).join("")}</div>`
      : `<div class="ok-box">Проблемных зон не найдено — все ответы в «зелёной» части опросника 👏</div>`;

    const result = `<div class="card">
      <header class="card-head"><h3><span class="card-ico">🧠</span>Результат от ${esc(fmt.date(last.date))}</h3>
        ${badge(label, kind)}</header>
      <div class="card-body">
        <div class="panel-grid cols-2">
          <div>
            ${Charts.gauge(res.pct, { label: "Поведение", max: 100 })}
            <div class="center muted small">${res.score} из ${res.max} баллов${delta != null ? " · " + (delta >= 0 ? "+" : "") + delta + "% к прошлому разу" : ""}</div>
          </div>
          <div>
            <div class="kv">
              <div class="kv-row"><span class="kv-k">Итоговый балл</span><span class="kv-v">${res.score} / ${res.max}</span></div>
              <div class="kv-row"><span class="kv-k">Процент благополучия</span><span class="kv-v">${res.pct}%</span></div>
              <div class="kv-row"><span class="kv-k">Проблемных зон</span><span class="kv-v">${res.zones.length}</span></div>
              <div class="kv-row"><span class="kv-k">Питомец</span><span class="kv-v">${esc(pet.name)}</span></div>
            </div>
            <div class="mt-2">${progress(res.pct, res.pct >= 80 ? "green" : res.pct >= 60 ? "orange" : "red")}</div>
            <div class="row mt-2">
              <button class="btn btn-primary btn-sm" data-act="training.bhStart">↺ Пройти заново</button>
              <button class="btn btn-ghost btn-sm" data-act="hub.open" data-panel="training" data-tab="courses">🎓 Курсы дрессировки</button>
            </div>
          </div>
        </div>
      </div>
    </div>`;

    const advice = card({
      title: "Разбор и рекомендации", icon: "🩺",
      body: `<div class="hint-box mb-2">${esc(last.advice || behaviorAdvice(res.pct, res.zones))}</div>${zonesHtml}`
    });

    return `<div class="stack">${result}${advice}${history}${behaviorHelpCourses(res.zones)}</div>`;
  }

  /* ============================================================ РЕНДЕР */
  window.Panels.register("training", {
    title: "Дрессировка",
    icon: "🎓",
    desc: "Курсы, прогресс и XP, клик-тренажёр, игры для ума и анализ поведения",
    render(view, ctx) {
      const pet = (ctx && ctx.pet) || window.Store.pet();
      const wanted = ctx && ctx.tab;
      const tab = TABS.some((t) => t.id === wanted) ? wanted : "courses";
      let body = "";
      if (tab === "courses") body = coursesTab(pet);
      else if (tab === "clicker") body = clickerTab(pet);
      else if (tab === "games") body = gamesTab(pet);
      else body = behaviorTab(pet);

      view.innerHTML = `<div class="panel">
        <div class="panel-head">
          <div><h2>🎓 Дрессировка</h2><p>${esc(pet.name)} · ${esc(window.Store.ageLabel(pet))} · уровень ${Math.floor((train(pet.id).xp || 0) / 100) + 1}</p></div>
          <div class="panel-tools">
            <button class="btn btn-sm btn-ghost" data-act="hub.open" data-panel="training" data-tab="clicker">🎯 Тренажёр</button>
            <button class="btn btn-sm btn-primary" data-act="hub.open" data-panel="ai">🤖 Спросить ИИ</button>
          </div>
        </div>
        ${tabsBar(tab)}
        ${body}
      </div>`;

      if (tab === "clicker") mountClicker(view);
    }
  });

  /* ============================================================ ДЕЙСТВИЯ */
  Actions.registerAll({
    "training.lesson": (ds) => {
      const pet = window.Store.pet();
      if (!ds.id || !findLesson(ds.id)) return;
      toggleLesson(pet.id, ds.id);
    },

    "training.how": (ds) => {
      const pet = window.Store.pet();
      openLessonModal(findLesson(ds.id), pet.id);
    },

    "training.next": (ds) => {
      const pet = window.Store.pet();
      const course = D.courses.filter((c) => c.id === ds.id)[0];
      if (!course) return;
      const done = train(pet.id).done;
      const next = course.lessons.filter((l) => done.indexOf(l.id) < 0)[0];
      if (!next) { toast("Курс «" + course.title + "» пройден полностью 🎉", "ok"); return; }
      openLessonModal(Object.assign({ courseId: course.id, courseTitle: course.title }, next), pet.id);
    },

    "training.reset": async (ds) => {
      const pet = window.Store.pet();
      const t = train(pet.id);
      const course = ds.id === "all" ? null : D.courses.filter((c) => c.id === ds.id)[0];
      const ids = course ? course.lessons.map((l) => l.id) : null;
      const affected = t.done.filter((id) => !ids || ids.indexOf(id) >= 0).length;
      if (!affected) { toast("Здесь пока нет отметок — сбрасывать нечего", "info"); return; }
      const ok = await confirmDialog(
        course
          ? "Сбросить прогресс курса «" + course.title + "»? Будет снято " + affected + " " + fmt.plural(affected, "отметка", "отметки", "отметок") + " и " + affected * LESSON_XP + " XP."
          : "Сбросить весь прогресс дрессировки? Все отметки уроков и накопленный XP будут удалены (игры и стрик останутся).",
        { ok: "Сбросить", danger: true, icon: "↺" }
      );
      if (!ok) return;
      window.Store.update(() => {
        const x = train(pet.id);
        x.done = ids ? x.done.filter((id) => ids.indexOf(id) < 0) : [];
        x.xp = Math.max(0, (x.xp || 0) - affected * LESSON_XP);
      }, "training");
      toast("Прогресс сброшен", "ok");
    },

    "training.course": (ds) => {
      window.Hub.open("training", "courses");
      const node = document.getElementById("course-" + ds.id);
      if (node) window.PL.scrollToEl(node, 90);
    },

    /* ---- клик-тренажёр ---- */
    "training.clickerStart": () => { ckStart(); },
    "training.clickerHit": () => { ckHit(); },

    /* ---- игры для ума ---- */
    "training.gamesFilter": (ds) => {
      gamesFilter = ["all", "легко", "средне", "сложно"].indexOf(ds.id) >= 0 ? ds.id : "all";
      window.Hub.refresh();
    },
    "training.gameStart": (ds) => { gameStart(ds.id); },
    "training.gamePause": () => { gamePause(); },
    "training.gameFinish": () => { gameFinish(); },

    /* ---- поведение ---- */
    "training.bhStart": () => {
      behaviorDraft.active = true;
      behaviorDraft.index = 0;
      behaviorDraft.answers = {};
      window.Hub.refresh();
    },

    "training.bhCancel": async () => {
      const ok = await confirmDialog("Прервать опрос? Ответы не сохранятся.", { ok: "Прервать", danger: true, icon: "🧠" });
      if (!ok) return;
      behaviorDraft.active = false;
      behaviorDraft.index = 0;
      behaviorDraft.answers = {};
      window.Hub.refresh();
    },

    "training.bhAnswer": (ds) => {
      const q = D.behaviorQuestions.filter((x) => x.id === ds.q)[0];
      if (!q) return;
      behaviorDraft.answers[q.id] = +ds.s;
      if (behaviorDraft.index < D.behaviorQuestions.length - 1) behaviorDraft.index += 1;
      window.Hub.refresh();
    },

    "training.bhBack": () => {
      behaviorDraft.index = Math.max(0, behaviorDraft.index - 1);
      window.Hub.refresh();
    },

    "training.bhNext": () => {
      const last = behaviorDraft.index >= D.behaviorQuestions.length - 1;
      const current = D.behaviorQuestions[behaviorDraft.index];
      if (typeof behaviorDraft.answers[current.id] !== "number") {
        toast("Выберите вариант ответа", "warn");
        return;
      }
      if (!last) { behaviorDraft.index += 1; window.Hub.refresh(); return; }

      const missing = D.behaviorQuestions.filter((q) => typeof behaviorDraft.answers[q.id] !== "number");
      if (missing.length) {
        behaviorDraft.index = D.behaviorQuestions.indexOf(missing[0]);
        toast("Осталось ответить на " + missing.length + " " + fmt.plural(missing.length, "вопрос", "вопроса", "вопросов"), "warn");
        window.Hub.refresh();
        return;
      }

      const pet = window.Store.pet();
      const answers = Object.assign({}, behaviorDraft.answers);
      const max = behaviorMax();
      const sum = D.behaviorQuestions.reduce((s, q) => s + (+answers[q.id] || 0), 0);
      const pct = max ? Math.round((sum / max) * 100) : 0;
      const zones = behaviorQuestionsZones(answers);
      const advice = behaviorAdvice(pct, zones);
      /* сначала закрываем опросник, потом пишем в состояние:
         перерисовка от Store.push сразу покажет итоговый экран */
      behaviorDraft.active = false;
      behaviorDraft.index = 0;
      behaviorDraft.answers = {};
      window.Store.push("behavior", {
        id: window.Store.uid("bh"), date: fmt.today(), score: sum, percent: pct,
        answers, zones: zones.map((z) => z.name), advice
      }, pet.id);
      toast("Готово! Уровень поведения " + pct + "%", pct >= 60 ? "ok" : "warn");
    }
  });
})();
