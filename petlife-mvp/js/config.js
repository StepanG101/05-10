/* ============================================================================
 * PetLife — config.js
 * Здесь хранятся ключи API.
 *
 * ВАЖНО: проект работает и БЕЗ ключей — включается демо-режим:
 *   • погода и качество воздуха берутся из открытого API Open-Meteo (ключ не нужен);
 *   • анализ фото выполняет локальный анализатор изображения (офлайн).
 * Если вставить ключи ниже — включаются «настоящие» OpenWeather и OpenRouter.
 *
 * 1) OpenWeather (необязательно): https://home.openweathermap.org/api_keys
 * 2) OpenRouter (для vision-ИИ):  https://openrouter.ai/keys
 * ==========================================================================*/
window.PETLIFE_CONFIG = {
  /* Ключ OpenWeather. Пусто → используется Open-Meteo без ключа. */
  OPENWEATHER_API_KEY: "",

  /* Ключ OpenRouter для ИИ-анализа фото и ИИ-ассистента. */
  OPENROUTER_API_KEY: "",

  /* Vision-модель для анализа фото. */
  OPENROUTER_MODEL: "meta-llama/llama-3.2-11b-vision-instruct:free",

  /* Текстовая модель для ИИ-ассистента. */
  OPENROUTER_TEXT_MODEL: "meta-llama/llama-3.3-70b-instruct:free",

  /* База локального Python-сервера (пусто = тот же хост). */
  API_BASE: "",

  /* Версия сборки — показывается в футере хаба. */
  BUILD: "2.0"
};
