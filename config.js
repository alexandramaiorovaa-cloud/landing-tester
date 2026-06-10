// config.js — настройки теста

module.exports = {
  landingUrl: 'https://example.com',
  device: 'chromium',
  account: {
    login:     '',
    email:     '',
    password:  '',
    loginMode: 'email',
    type:      'novice',
  },
  card: {
    number:   '',
    expiry:   '',
    cvc:      '',
    scenario: 'sms',
  },
  checkYmGoal: true,
  slowMo: 400,
};

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
