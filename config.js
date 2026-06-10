// config.js — настройки теста

module.exports = {

  landingUrl: '',
  ctaText:    '',

  // 'chromium' | 'yandex' | 'iphone' | 'pixel'
  device: 'chromium',

  account: {
    login:     '',
    email:     '',
    password:  '',
    loginMode: 'email',  // 'login' (логин/username) | 'email' (почта)
    type:      'novice',
  },

  card: {
    number:   '2200702165123337',
    expiry:   '05/78',
    cvc:      '123',
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
