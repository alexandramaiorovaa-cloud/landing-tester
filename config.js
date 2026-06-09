// config.js — настройки теста

module.exports = {

  landingUrl: 'https://www.kinopoisk.ru/special/new/?type=cpa_kp_45_360_perf&promocode=RQE6KXL588',
  ctaText:    '',

  // 'chromium' | 'yandex' | 'iphone' | 'pixel'
  device: 'chromium',

  account: {
    login:     'yndx-alexandra-mai-j69wfs',
    email:     'yndx-alexandra-mai-j69wfs@ya.ru',
    password:  'icP9.Ba20',
    loginMode: 'email',  // 'login' (логин/username) | 'email' (почта)
    type:      'novice',
  },

  card: {
    number:   '2200702165121497',
    expiry:   '05/36',
    cvc:      '735',
    scenario: 'sms', //'sms' //'oneclick'
  },

  // ─── Селекторы (опционально) ───────────────────────────────────────────
  // Если не заданы — скрипт определяет автоматически.
  // Задайте только те что отличаются от стандартных.
  //
  // selectors: {
  //   cta:          'span:has-text("До года бесплатно")', // CTA кнопка на лендинге
  //   popupClose:   'button[aria-label="Закрыть"]',       // закрытие поп-апа
  //   loginBtn:     'button.login__button',               // кнопка «Войти» в форме
  //   emailToggle:  'button.login__toggle-switch',        // переключатель на «Почта»
  //   emailField:   'input[name="email"]',                // поле email
  // },

  checkYmGoal: true,
  slowMo:      400,

};