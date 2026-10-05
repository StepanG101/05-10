/* ============================================================================
 * PetLife — form.js
 * Форма раннего доступа: валидация, отправка на локальный сервер, сохранение
 * заявки в localStorage (если сервер не запущен) и экран благодарности.
 * ==========================================================================*/
(function () {
  "use strict";
  const { $, esc, toast } = window.PL;
  const BASE = (window.PETLIFE_CONFIG && window.PETLIFE_CONFIG.API_BASE) || "";
  const KEY = "petlife.leads";

  function leads() {
    try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch (e) { return []; }
  }

  function saveLocal(entry) {
    const list = leads();
    list.push(entry);
    try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) { /* приватный режим */ }
  }

  function showError(inputId, errorId, show) {
    const input = $("#" + inputId), err = $("#" + errorId);
    if (!input || !err) return;
    input.classList.toggle("invalid", !!show);
    err.classList.toggle("hidden", !show);
  }

  function validate() {
    const name = $("#leadName").value.trim();
    const email = $("#leadEmail").value.trim();
    const nameOk = name.length >= 2;
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.includes("@") && email.includes(".");
    showError("leadName", "leadNameError", !nameOk);
    showError("leadEmail", "leadEmailError", !emailOk);
    return { ok: nameOk && emailOk, name, email, breed: $("#leadBreed").value.trim(), premium: $("#leadPremium").checked };
  }

  function success(data) {
    const card = $("#leadCard");
    const breed = data.breed || "любимец";
    card.innerHTML = `
      <div class="success-box">
        <div class="s-ico">🐾</div>
        <h3>Спасибо, ${esc(data.name)}!</h3>
        <p>Мы свяжемся с вами по адресу <b>${esc(data.email)}</b>.<br>
        Ваш питомец (${esc(breed)}) получит <b>бесплатный Premium на месяц</b> при запуске!</p>
        <div class="hint-box" style="text-align:left;max-width:520px;margin:18px auto 0">
          <b>Что дальше?</b>
          <ul class="list dot mt-1">
            <li>Мы пришлём письмо с доступом к закрытой бета-версии.</li>
            <li>${data.premium ? "5% от вашей подписки пойдут в приюты — вы уже в команде миссии ❤️" : "Вы можете подключить миссию «5% в приюты» в любой момент."}</li>
            <li>Пока ждёте — попробуйте демо-кабинет: погода, ИИ-анализ фото, трекеры и форум уже работают.</li>
          </ul>
        </div>
        <div class="row mt-3" style="justify-content:center">
          <button class="btn btn-primary" data-act="hub.open" data-panel="overview">Открыть демо-кабинет</button>
          <button class="btn btn-ghost" data-act="form.again">Отправить ещё одну заявку</button>
        </div>
      </div>`;
    toast("Заявка сохранена. Добро пожаловать в PetLife!", "ok");
  }

  function init() {
    const form = $("#leadForm");
    if (!form) return;

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const data = validate();
      if (!data.ok) {
        toast("Проверьте поля формы", "warn");
        return;
      }
      const btn = $("#leadSubmit");
      const original = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Отправляем…';
      const entry = { name: data.name, email: data.email, breed: data.breed, premium: data.premium, createdAt: new Date().toISOString() };
      saveLocal(entry);
      try {
        await fetch(BASE + "/api/access", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(entry)
        });
      } catch (err) { /* сервер не запущен — заявка уже сохранена локально */ }
      setTimeout(() => {
        btn.disabled = false;
        btn.innerHTML = original;
        success(entry);
      }, 450);
    });

    ["leadName", "leadEmail"].forEach((id) => {
      const el = $("#" + id);
      if (el) el.addEventListener("input", () => showError(id, id + "Error", false));
    });
  }

  window.PL.Actions.registerAll({
    "form.again": () => {
      window.location.hash = "#form";
      window.location.reload();
    },
    "form.stats": () => {
      const list = leads();
      window.PL.modal({
        title: "Заявки на ранний доступ", icon: "📨",
        body: list.length
          ? window.PL.table(["Дата", "Имя", "Email", "Порода", "Premium"], list.slice().reverse().map((l) =>
              [esc(window.PL.fmt.date(l.createdAt)), esc(l.name), esc(l.email), esc(l.breed || "—"), l.premium ? "да" : "нет"]))
          : window.PL.empty("📭", "Заявок пока нет", "Отправьте форму — она появится здесь и сохранится локально.")
      });
    }
  });

  window.LeadForm = { init, leads };
})();
