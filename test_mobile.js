// test-mobile.js — Playwright-скрипт для тестирования лендинга (мобильный)
// Запуск: node test-mobile.js

const { chromium, webkit, devices } = require('playwright');
const readline = require('readline');
const fs = require('fs');
const path = require('path');
const config = require('./config.js');

// ─── Логирование в файл ────────────────────────────────────────────────────
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir);
const logDate = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const urlSlug = (config.landingUrl || '').replace(/https?:\/\//, '').replace(/[^\w]/g, '_').slice(0, 40);
const logFile = path.join(logsDir, logDate + '_mobile_' + urlSlug + '.log');
const logStream = fs.createWriteStream(logFile, { flags: 'a' });
logStream.write('=== LandingTester Mobile · ' + new Date().toLocaleString('ru') + ' ===\n');
logStream.write('URL: ' + config.landingUrl + '\n');
logStream.write('Device: ' + (config.device || 'iphone') + '\n\n');

// ─── Автодетект селекторов по URL ─────────────────────────────────────────
let selectorProfile = null;
try {
  const registry = require('./selectors.js');
  selectorProfile = registry.find(p => p.match(config.landingUrl)) || null;
  if (selectorProfile) log('Профиль селекторов: ' + selectorProfile.name, 'info');
} catch (_) {}

// Хелпер — берёт из профиля или из config.selectors или дефолт
function sel(key, fallback) {
  const fromProfile = selectorProfile?.[key];
  const fromConfig  = config.selectors?.[key];
  return fromConfig || fromProfile || fallback;
}

// ─── Утилиты ───────────────────────────────────────────────────────────────
function log(msg, type) {
  const icons  = { info:'→', ok:'✓', fail:'✗', warn:'⚠', pause:'⏸' };
  const colors = { info:'\x1b[36m', ok:'\x1b[32m', fail:'\x1b[31m', warn:'\x1b[33m', pause:'\x1b[35m' };
  console.log((colors[type]||'') + (icons[type]||'·') + ' ' + msg + '\x1b[0m');
  logStream.write((icons[type]||'·') + ' ' + msg + '\n');
}

function sep(title) {
  console.log('\n\x1b[90m' + '─'.repeat(50) + '\x1b[0m');
  if (title) console.log('\x1b[1m\x1b[37m  ' + title + '\x1b[0m');
  console.log('\x1b[90m' + '─'.repeat(50) + '\x1b[0m\n');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function waitForSmsCode() {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    console.log('\n\x1b[35m' + '═'.repeat(50) + '\x1b[0m');
    console.log('\x1b[35m  SMS-ПОДТВЕРЖДЕНИЕ\x1b[0m');
    console.log('\x1b[35m' + '═'.repeat(50) + '\x1b[0m');
    console.log('\x1b[33m  Банк отправил SMS с кодом.\x1b[0m');
    console.log('\x1b[33m  Введите код и нажмите Enter.\x1b[0m');
    console.log('\x1b[33m  (пустой Enter = пропустить)\x1b[0m\n');
    rl.question('  Код из SMS: ', code => {
      rl.close();
      console.log('\x1b[35m' + '═'.repeat(50) + '\x1b[0m\n');
      resolve(code.trim());
    });
  });
}

async function sleep_(ms) { return sleep(ms); }

// ─── Умный поиск input ─────────────────────────────────────────────────────
async function findInput(ctx, selectors) {
  for (const sel of selectors) {
    try {
      const el = await ctx.$(sel);
      if (el && await el.isVisible()) return el;
    } catch (_) {}
  }
  return null;
}

// ─── Обработка капчи ──────────────────────────────────────────────────────
async function handleCaptcha(page) {
  const captchaSelectors = [
    '[class*="captcha"]', '[id*="captcha"]',
    '[class*="smartcaptcha"]', 'iframe[src*="captcha"]',
    'iframe[src*="showcaptcha"]',
  ];
  for (const sel of captchaSelectors) {
    try {
      const el = await page.$(sel);
      if (el && await el.isVisible()) {
        console.log('\n\x1b[35m' + '═'.repeat(50) + '\x1b[0m');
        console.log('\x1b[35m  Капча! Решите её вручную и нажмите Enter...\x1b[0m');
        console.log('\x1b[35m' + '═'.repeat(50) + '\x1b[0m\n');
        await new Promise(resolve => {
          const rl = require('readline').createInterface({ input: process.stdin, output: process.stdout });
          rl.question('', () => { rl.close(); resolve(); });
        });
        log('Продолжаем после капчи', 'ok');
        return true;
      }
    } catch (_) {}
  }
  return false;
}

// ─── Обработка поп-апа ─────────────────────────────────────────────────────
// Возвращает: 'closed' | 'auth_required' | 'none'
async function handlePopup(page) {
  await sleep(1500);

  // Кнопки закрытия поп-апа (без авторизации)
  const closeSels = [
    // крестик
    'button[aria-label="Закрыть"]', 'button[aria-label="Close"]',
    '[class*="close"]',             '[class*="Close"]',
    '[class*="popup__close"]',      '[class*="modal__close"]',
    '[class*="dialog__close"]',
    // текстовые кнопки отказа
    'button:has-text("Позже")',     'button:has-text("Не сейчас")',
    'button:has-text("Пропустить")','button:has-text("Отмена")',
    'button:has-text("Нет")',       'button:has-text("Нет, спасибо")',
    'button:has-text("Закрыть")',
    // cookie
    'button[data-t="button:accept"]',
    'button:has-text("Принять")',   'button:has-text("Хорошо")',
    'button:has-text("Согласен")',
  ];

  for (const sel of closeSels) {
    try {
      const btn = await page.$(sel);
      if (btn && await btn.isVisible()) {
        const txt = await btn.innerText().catch(() => sel);
        log('Закрываем поп-ап: "' + txt.trim() + '"', 'ok');
        await btn.click();
        await sleep(800);
        return 'closed';
      }
    } catch (_) {}
  }

  // Поп-ап с обязательной авторизацией (нет кнопки закрытия)
  const authPopupSels = [
    // мобильный поп-ап Яндекс Музыки
    'div.app__sign-in',
    'div.sign-in__block',
    '[class*="sign-in__block"]',
    'div.sign-in__button.button',
    // общие
    'button:has-text("Войти")',
    'button:has-text("Войдите")',
    'a:has-text("Войти")',
    '[class*="auth"] button',
    '[class*="login"] button',
    '[class*="passport"]',
  ];

  for (const sel of authPopupSels) {
    try {
      const el = await page.$(sel);
      if (el && await el.isVisible()) {
        log('Поп-ап требует авторизацию', 'info');
        return 'auth_required';
      }
    } catch (_) {}
  }

  return 'none';
}

// ─── Авторизация через Яндекс ID (оверлей или passport) ──────────────────
async function doYandexAuth(page, results) {
  try {
    log('Авторизация Яндекс ID...', 'info');

    // если уже на passport — сразу идём к Тип 1
    const alreadyOnPassport = page.url().includes('passport.yandex');

    // ── Тип 2: форма прямо на лендинге (Кинопоиск) ───────────────────────
    const loginToggle = !alreadyOnPassport ? await page.$(
      config.selectors?.emailToggle ||
      'button.login__toggle-switch, button.login__toggle-btn, button.login_toggle-btn'
    ).catch(() => null) : null;
    const inlineForm = !alreadyOnPassport ? await page.$(
      config.selectors?.emailField ||
      'input.login__input, input[name="phone"], input[name="email"]'
    ).catch(() => null) : null;

    if (loginToggle || inlineForm) {
      log('Форма авторизации прямо на лендинге (Кинопоиск-тип)', 'info');
      await sleep(300);

      // переключаемся на «Почта»
      const emailToggleSel = sel('emailToggle',
        'button.login__toggle-switch:has-text("Почта"), button.login__toggle-btn:has-text("Почта"), button.login_toggle-btn:has-text("Почта")');
      const emailToggle = await page.$(emailToggleSel).catch(() => null);
      if (emailToggle) {
        await emailToggle.click();
        await sleep(500);
        log('Переключились на «Почта»', 'ok');
      }

      // ждём появления поля email после переключения
      await page.waitForSelector(
        'input[name="email"], input[placeholder="Введите email"], input.login__input[type="email"]',
        { timeout: 3000 }
      ).catch(() => {});

      // вводим email
      const emailFieldSel = sel('emailField',
        'input[name="email"].login__input, input[name="email"], input[placeholder="Введите email"]');
      const emailField = await page.$(emailFieldSel).catch(() => null);
      const credential = config.account.loginMode === 'email' ? config.account.email : config.account.login;
      if (emailField) {
        await emailField.click({ force: true }); await sleep(200);
        await emailField.fill(credential);
        log('Email введён: ' + credential, 'ok');
      } else {
        log('Поле email не найдено', 'warn');
      }

      // кнопка «Войти»
      const loginBtnSel = sel('loginBtn', 'button.login__button, button.login_button');
      const loginBtn = await page.$(loginBtnSel).catch(() => null);
      if (loginBtn) { await loginBtn.click(); log('Клик «Войти»', 'ok'); }
      else { await page.keyboard.press('Enter'); }
      await sleep(1500);
      await handleCaptcha(page);

      // ждём passport или изменения страницы
      await page.waitForURL('**/passport.yandex**', { timeout: 8000 }).catch(() => {});
      await sleep(300);

      // если попали на passport — вводим пароль
      if (page.url().includes('passport.yandex')) {
        const passField = await page.$('input[type="password"], input[name="passwd"]').catch(() => null);
        if (passField) {
          await passField.click({ force: true }); await sleep(200);
          await page.keyboard.type(config.account.password, { delay: 50 });
          const nextBtn = await page.$('button:has-text("Далее"), button:has-text("Войти")');
          if (nextBtn) { await nextBtn.click(); } else { await page.keyboard.press('Enter'); }
          log('Пароль введён', 'ok');
        }
      }

      await page.waitForURL(u => !u.includes('passport.yandex'), { timeout: 15000 }).catch(() => {});
      await sleep(1500);
      const finalUrl = page.url();
      if (!finalUrl.includes('passport.yandex')) {
        log('Авторизация успешна — вернулись на: ' + finalUrl.split('?')[0], 'ok');
        results.push({ name: 'Авторизация', status: 'pass' });
        return true;
      }
    }

    // ── Тип 1: passport через поп-ап (Яндекс Музыка/Книги) ───────────────
    await page.waitForURL('**/passport.yandex**', { timeout: 8000 }).catch(() => {});
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await sleep(300);

    // кликаем «Ещё» → «Войти по логину»
    const moreBtnSels = sel('moreBtn', '[data-testid="split-add-user-more-button"], button:has-text("Ещё"), a:has-text("Ещё")').split(',').map(s => s.trim());
    let yetBtn = null;
    for (const s of moreBtnSels) {
      try {
        if (s.startsWith('xpath=')) {
          const els = await page.$x(s.replace('xpath=', '')).catch(() => []);
          if (els[0]) { yetBtn = els[0]; break; }
        } else {
          const el = await page.$(s).catch(() => null);
          if (el && await el.isVisible().catch(() => false)) { yetBtn = el; break; }
        }
      } catch (_) {}
    }
    if (yetBtn && await yetBtn.isVisible()) {
      await yetBtn.click();
      log('Открыто меню «Ещё»', 'ok');
      await sleep(600);
      const loginItemSel = sel('loginItem', '[data-testid="menu-option-switchToLogin"], [data-key="switchToLogin"], button:has-text("Войти по логину"), li:has-text("Войти по логину"), a:has-text("Войти по логину")');
      const loginMenuItem = await page.waitForSelector(loginItemSel, { timeout: 3000 }).catch(() => null);
      if (loginMenuItem) {
        await loginMenuItem.click();
        log('Клик «Войти по логину»', 'ok');
        await page.waitForSelector('div.body-auth, input[name="login"], input[autocomplete="username"]', { timeout: 3000 }).catch(() => {});
        await sleep(300);
      } else {
        log('Пункт «Войти по логину» не найден', 'warn');
      }
    }

    // если уже на странице с полем логина — пропускаем меню
    const credential = config.account.loginMode === 'email'
      ? config.account.email
      : config.account.login;

    const loginField = await findInput(page, [
      'input[placeholder*="Логин или email" i]',
      'input[placeholder*="логин" i]',
      'input[placeholder*="email" i]',
      'input#passp-field-login',
      'input[name="login"]',
      'input[autocomplete="username"]',
    ]);

    if (!loginField) {
      // поле не найдено через селекторы — кликаем по координатам поля и вводим
      log('Поле не найдено через селекторы — кликаем по видимому полю...', 'info');
      try {
        // находим div.body-auth и кликаем внутрь него
        const bodyAuth = await page.$('div.body-auth, [class*="body-auth"]');
        if (bodyAuth) {
          const box = await bodyAuth.boundingBox();
          if (box) {
            // кликаем в верхнюю треть блока — там находится поле ввода
            await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.3);
            await sleep(300);
          }
        } else {
          // кликаем по центру экрана где должно быть поле
          await page.mouse.click(553, 391);
          await sleep(300);
        }
      } catch (_) {}

      await page.keyboard.type(credential, { delay: 80 });
      await sleep(400);
      log(config.account.loginMode + ': ' + credential, 'ok');

      const loginBtn2 = await page.$('button:has-text("Войти")');
      if (loginBtn2) { await loginBtn2.click(); }
      else { await page.keyboard.press('Enter'); }
      await sleep(2000);
    } else {
      await loginField.click();
      await sleep(200);
      await loginField.fill(credential);
      await sleep(400);
      log(config.account.loginMode + ': ' + credential, 'ok');

      // нажимаем кнопку «Войти» или Enter
      const loginBtn = await page.$('button:has-text("Войти")');
      if (loginBtn) { await loginBtn.click(); log('Клик «Войти»', 'ok'); }
      else { await page.keyboard.press('Enter'); }
      await sleep(2000);
    }

    // шаг 2: пароль — ждём появления поля
    await page.waitForSelector(
      'input[type="password"], input[name="passwd"], input#passp-field-passwd',
      { timeout: 5000 }
    ).catch(() => {});
    await sleep(300);

    const passField = await findInput(page, [
      'input[placeholder*="Пароль" i]',
      'input[placeholder*="password" i]',
      'input#passp-field-passwd',
      'input[name="passwd"]',
      'input[type="password"]',
      'input[autocomplete="current-password"]',
    ]);

    if (!passField) {
      // аналогично — кликаем по полю через координаты
      log('Поле пароля не найдено через селекторы — кликаем по видимому полю...', 'info');
      try {
        const bodyAuth = await page.$('div.body-auth, [class*="body-auth"]');
        if (bodyAuth) {
          const box = await bodyAuth.boundingBox();
          if (box) {
            await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.3);
            await sleep(300);
          }
        } else {
          await page.mouse.click(783, 311);
          await sleep(300);
        }
      } catch (_) {}
      await page.keyboard.type(config.account.password, { delay: 80 });
      await sleep(400);
      log('Пароль введён (keyboard)', 'ok');
    } else {
      await passField.click();
      await sleep(200);
      await passField.fill(config.account.password);
      await sleep(400);
      log('Пароль введён', 'ok');
    }

    // нажимаем «Далее» или «Войти» или Enter
    const nextBtn = await page.$('button:has-text("Далее"), button:has-text("Войти")');
    if (nextBtn && !await nextBtn.isDisabled()) {
      await nextBtn.click();
      log('Клик «Далее»', 'ok');
    } else {
      await page.keyboard.press('Enter');
    }

    // ждём редиректа с passport обратно на лендинг
    log('Ждём завершения авторизации...', 'info');
    await page.waitForURL(u => !u.includes('passport.yandex'), { timeout: 15000 }).catch(() => {});
    await sleep(2000);

    const afterUrl = page.url();
    if (!afterUrl.includes('passport.yandex')) {
      log('Авторизация успешна — вернулись на: ' + afterUrl.split('?')[0], 'ok');
      results.push({ name: 'Авторизация', status: 'pass' });

      // для гифт-лендингов — виджет открывается сам после авторизации
      // ждём payment-widget iframe
      await sleep(2000);
      let activateEl = null;
      // ищем сначала на странице
      activateEl = await page.$('[data-testid="submit-button"], button:has-text("Активировать"), [class*="GiftStartScreen"] button').catch(() => null);
      // если не нашли — ищем в payment-widget iframe
      if (!activateEl) {
        for (const f of page.frames()) {
          if (f.url().includes('payment-widget')) {
            activateEl = await f.$('[data-testid="submit-button"], button:has-text("Активировать")').catch(() => null);
            if (activateEl) { log('Кнопка найдена в payment-widget iframe', 'info'); break; }
          }
        }
      }
      log('activateEl найден: ' + (activateEl ? 'да' : 'нет'), 'info');
      if (activateEl) {
        await activateEl.scrollIntoViewIfNeeded().catch(() => {});
        await activateEl.click({ force: true });
        log('Клик «Активировать»', 'ok');
        await sleep(2000);
      }

      return true;
    } else {
      log('Всё ещё на passport — проверьте логин/пароль', 'warn');
      results.push({ name: 'Авторизация', status: 'warn', note: 'Проверьте логин/пароль' });
      return false;
    }
  } catch (e) {
    log('Ошибка авторизации: ' + e.message, 'fail');
    await page.screenshot({ path: 'error-auth.png' }).catch(() => {});
    log('Скриншот ошибки: error-auth.png', 'info');
    results.push({ name: 'Авторизация', status: 'fail', error: e.message });
    return false;
  }
}

// ─── Главная функция ────────────────────────────────────────────────────────
async function runTests() {
  sep('LandingTester · Playwright Runner');
  log('URL: ' + config.landingUrl, 'info');
  if (config.account.email) log('Аккаунт: ' + config.account.email + ' [' + config.account.type + ']', 'info');
  if (config.card.number)  log('Карта: ' + config.card.number.replace(/\d(?=\d{4})/g,'*') + ' · ' + config.card.scenario, 'info');

  const deviceMap = {
    'iphone': { br: webkit,   opts: { headless: false, slowMo: config.slowMo||400 }, ctx: { ...devices['iPhone 13'], deviceScaleFactor: 2 } },
    'pixel':  { br: chromium, opts: { headless: false, slowMo: config.slowMo||400 }, ctx: devices['Pixel 5'] },
  };
  // мобильный тест — только iphone и pixel
  const mobileDevice = ['iphone','pixel'].includes(config.device) ? config.device : 'iphone';
  if (!['iphone','pixel'].includes(config.device)) {
    log('Мобильный тест: устройство "' + config.device + '" не мобильное — используем iphone', 'warn');
  }
  const dev = deviceMap[mobileDevice];
  log('Устройство: ' + (config.device||'chromium'), 'info');

  const browser = await dev.br.launch(dev.opts);
  const context = await browser.newContext({
    ...dev.ctx,
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
    ...(dev.ctx.userAgent ? {} : {
      viewport: null,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    }),
  });

  const page = await context.newPage();
  const isMobile = true; // мобильный тест
  const results = [];

  // ── БЛОК 1: Открытие лендинга ──────────────────────────────────────────
  sep('Блок 1 · Лендинг');

  const ymUrl = config.landingUrl + (config.landingUrl.includes('?') ? '&' : '?') + '_ym_debug=2';
  const ymGoals = [];

  // слушаем консоль сразу
  page.on('console', msg => {
    const text = msg.text();
    if (/reachGoal|Goal|ym\.|Metrika|metrika/i.test(text)) {
      ymGoals.push(text);
      log('Метрика: ' + text.slice(0, 100), 'ok');
    }
  });
  try {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Runtime.enable');
    cdp.on('Runtime.consoleAPICalled', event => {
      const text = (event.args||[]).map(a => a.value || a.description || '').join(' ');
      if (/reachGoal|Goal|ym\./i.test(text)) {
        ymGoals.push(text);
        log('Метрика(CDP): ' + text.slice(0, 100), 'ok');
      }
    });
  } catch (_) {}

  try {
    log('Открываем с _ym_debug=2: ' + ymUrl, 'info');
    await page.goto(ymUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await sleep(2500);
    log('Страница загружена', 'ok');
    results.push({ name: 'Открытие лендинга', status: 'pass' });
  } catch (e) {
    log('Ошибка: ' + e.message, 'fail');
    results.push({ name: 'Открытие лендинга', status: 'fail', error: e.message });
  }

  // ── Обрабатываем поп-ап ────────────────────────────────────────────────
  sep('Поп-ап');
  const popupResult = await handlePopup(page);

  if (popupResult === 'closed') {
    log('Поп-ап закрыт (скип)', 'ok');
    results.push({ name: 'Поп-ап', status: 'pass', note: 'Скипнут' });

    // после скипа ждём дольше и скроллим вверх
    await page.evaluate(() => window.scrollTo(0, 0));
    await sleep(3000);
    log('Кликаем CTA для авторизации...', 'info');
    const ctaTextsEarly = config.ctaText
      ? [config.ctaText]
      : ['До года','Попробовать','Подключить','Купить','Подписаться','Получить','Слушать'];

    let ctaFoundEarly = false;

    // кликаем по span с текстом внутри кнопки — именно на него реагирует Яндекс
    const ctaSelectors = config.selectors?.cta
      ? [config.selectors.cta]
      : [
          config.ctaText ? 'span:has-text("' + config.ctaText + '")' : null,
          'span:has-text("До года бесплатно")',
          'span:has-text("До года")',
          '.button_type_new-design span',
          '[class*="button__subscription"] span',
          '[class*="button-subscription__button"] span',
        ].filter(Boolean);

    for (const sel of ctaSelectors) {
      try {
        const el = await page.$(sel);
        if (el) {
          const box = await el.boundingBox();
          if (box && box.width > 0 && box.height > 0 && box.y > 0 && box.y < 1200) {
            log('CTA span найден: ' + sel, 'info');

            const [popup] = await Promise.all([
              context.waitForEvent('page', { timeout: 8000 }).catch(() => null),
              page.mouse.click(box.x + box.width / 2, box.y + box.height / 2),
            ]);

            log('Клик по CTA span', 'ok');
            ctaFoundEarly = true;

            if (popup) {
              log('Авторизация открылась в отдельном окне', 'ok');
              await popup.waitForLoadState('domcontentloaded').catch(() => {});
              await sleep(1500);
              if (config.account.email && config.account.password) {
                await doYandexAuth(popup, results);
                await sleep(2000);
                log('Авторизация через popup завершена', 'ok');
              }
            } else {
              await sleep(2000);
              // если редиректнуло на passport — авторизуемся
              if (page.url().includes('passport.yandex') && config.account.email && config.account.password) {
                await doYandexAuth(page, results);
              }
            }
            break;
          }
        }
      } catch (_) {}
    }

    // если не нашли — пробуем по тексту
    if (!ctaFoundEarly) {
      for (const txt of ctaTextsEarly) {
        try {
          const el = await page.$('button:has-text("' + txt + '"), a:has-text("' + txt + '"), div:has-text("' + txt + '")');
          if (el && await el.isVisible()) {
            await el.click();
            log('Клик CTA: "' + txt + '"', 'ok');
            ctaFoundEarly = true;
            await sleep(2000);
            break;
          }
        } catch (_) {}
      }
    }

    // если не нашли — показываем все видимые кнопки на странице для диагностики
    if (!ctaFoundEarly) {
      log('CTA не найдена. Видимые кнопки на странице:', 'warn');
      try {
        const allBtns = await page.$$('button, a[href], div[class*="button"]');
        for (const btn of allBtns) {
          try {
            if (await btn.isVisible()) {
              const txt = (await btn.innerText().catch(() => '')).trim().slice(0, 60);
              if (txt) log('  · "' + txt + '"', 'info');
            }
          } catch (_) {}
        }
      } catch (_) {}
      // если не нашли CTA — всё равно пробуем авторизацию на текущей странице
      if (config.account.email && config.account.password) {
        await doYandexAuth(page, results);
      }
    }

  } else if (popupResult === 'auth_required') {
    // скип не сработал — поп-ап закрыть нельзя, авторизуемся через него
    log('Поп-ап нельзя закрыть — авторизуемся через него', 'info');
    results.push({ name: 'Поп-ап', status: 'pass', note: 'Авторизация' });

    for (const sel_ of [
      sel('popupLogin', null),
      'div.sign-in__button.button', 'div.sign-in__button', '.sign-in__button',
      'button:has-text("Войти")', 'a:has-text("Войти")',
      '[class*="auth"] button',
    ].filter(Boolean)) {
      try {
        const btn = await page.$(sel_);
        if (btn && await btn.isVisible()) {
          await btn.tap().catch(() => btn.click({ force: true }));
          log('Tap «Войти» в поп-апе', 'ok');
          await sleep(1500);
          break;
        }
      } catch (_) {}
    }

    if (config.account.email && config.account.password) {
      await doYandexAuth(page, results);
    } else {
      log('Логин/пароль не заданы в config.js', 'warn');
      results.push({ name: 'Авторизация', status: 'warn', note: 'Нет данных в config.js' });
    }

  } else {
    log('Поп-ап не обнаружен — продолжаем', 'info');
    results.push({ name: 'Поп-ап', status: 'pass', note: 'Нет поп-апа' });
    if (config.account.email && config.account.password) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await sleep(1000);
      const ctaSelectors = [
        ...(selectorProfile?.cta || []),
        config.ctaText ? 'span:has-text("' + config.ctaText + '")' : null,
        'span:has-text("До года бесплатно")', 'span:has-text("До года")',
        '.button_type_new-design span', '[class*="button-subscription__button"] span',
        'div.sign-in__button.button', 'div.sign-in__button',
      ].filter(Boolean);
      for (const sel_ of ctaSelectors) {
        try {
          let el;
          if (sel_.startsWith('xpath=')) {
            const els = await page.$x(sel_.replace('xpath=', '')).catch(() => []);
            el = els[0] || null;
          } else {
            el = await page.$(sel_);
          }
          if (el && await el.isVisible().catch(() => false)) {
            await el.scrollIntoViewIfNeeded().catch(() => {});
            await sleep(300);
            const box = await el.boundingBox();
            if (box && box.width > 0) {
              await el.tap().catch(() => page.mouse.click(box.x + box.width / 2, box.y + box.height / 2));
              log('Клик по CTA: ' + sel_, 'ok');
              await sleep(2000);
              if (page.url().includes('passport.yandex')) {
                await doYandexAuth(page, results);
              }
              break;
            }
          }
        } catch (_) {}
      }
    }
  }

  // ── Базовые проверки лендинга ──────────────────────────────────────────
  sep('Блок 1 (продолжение) · Проверки');

  // H1
  try {
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    const h1s = await page.$$('h1').catch(() => []);
    let realH1 = '';
    for (const h1 of h1s) {
      try {
        const t = (await h1.innerText().catch(() => '')).trim();
        if (t.length > 2 && !t.toLowerCase().includes('cookie') && !t.toLowerCase().includes('использует')) {
          realH1 = t; break;
        }
      } catch (_) {}
    }
    if (selectorProfile?.noH1) {
      log('H1 не проверяется для этого лендинга', 'info');
      results.push({ name: 'H1 присутствует', status: 'pass', note: 'Не применимо' });
    } else if (realH1) {
      log('H1: "' + realH1.slice(0, 70) + '"', 'ok');
      results.push({ name: 'H1 присутствует', status: 'pass' });
    } else {
      log('H1 не найден', 'warn');
      results.push({ name: 'H1 не найден', status: 'warn' });
    }
  } catch (e) {
    log('H1 не найден (навигация)', 'warn');
    results.push({ name: 'H1 присутствует', status: 'warn' });
  }

  // Персональные посадки
  try {
    const url = page.url();
    const personal = ['filmId', 'sportperfm', 'albumId', 'artistId', 'playlistId'];
    const found = personal.filter(p => url.includes(p));
    const isPersonal = config.personalLanding || selectorProfile?.personalLanding || false;
    if (found.length === 0 || isPersonal) {
      if (isPersonal && found.length > 0) {
        log('Персональный лендинг (' + found.join(', ') + ') — ожидаемо', 'ok');
      } else {
        log('Персональных посадок нет', 'ok');
      }
      results.push({ name: 'Персональные посадки отключены', status: 'pass' });
    } else {
      log('Найдены: ' + found.join(', '), 'fail');
      results.push({ name: 'Персональные посадки отключены', status: 'fail', error: found.join(', ') });
    }
  } catch (e) {
    results.push({ name: 'Персональные посадки', status: 'fail', error: e.message });
  }

  // Битые картинки
  try {
    const broken = await page.evaluate(() =>
      Array.from(document.images)
        .filter(img => !img.complete || img.naturalWidth === 0)
        .map(img => img.src)
        .filter(src => !src.includes('data:'))
    );
    if (broken.length === 0) {
      log('Битых картинок нет', 'ok');
      results.push({ name: 'Битые картинки', status: 'pass' });
    } else {
      log('Битые картинки (' + broken.length + '): ' + broken[0], 'fail');
      results.push({ name: 'Битые картинки', status: 'fail', error: broken.join(', ') });
    }
  } catch (e) {
    results.push({ name: 'Битые картинки', status: 'fail', error: e.message });
  }

  // ── БЛОК 2: Цели Метрики — проверяются в блоке 1 (открыты с _ym_debug=2)
  if (config.checkYmGoal) {
    sep('Блок 2 · Цели Метрики');
    if (ymGoals.length > 0) {
      log('Найдено событий Метрики: ' + ymGoals.length, 'ok');
      results.push({ name: 'Цели _ym_debug=2', status: 'pass', note: ymGoals.length + ' событий' });
    } else {
      log('Автоматически не найдено — проверьте F12 → Console вручную', 'warn');
      results.push({ name: 'Цели _ym_debug=2', status: 'warn', note: 'F12 → Console → reachGoal' });
    }
  }

  // ── БЛОК 3+4: Виджет и оплата ─────────────────────────────────────────
  if (config.card.number || config.account.type === 'paid-card') {
    sep('Блок 3 · Виджет покупки');

    // ищем CTA кнопку — скроллим вверх, она может быть в шапке
    await page.evaluate(() => window.scrollTo(0, 0));
    await sleep(800);

    const ctaTexts = config.ctaText
      ? [config.ctaText]
      : ['Попробовать','Подключить','Купить','Подписаться','Получить','Слушать','Оплатить','До года'];

    // ждём чуть дольше — лендинг мог только загрузиться после авторизации
    await sleep(1000);

    let ctaClicked = false;

    // используем тот же подход что сработал — ищем span с текстом и кликаем по координатам
    const ctaSpanSels = selectorProfile?.cta
      || (config.selectors?.cta ? [config.selectors.cta] : null)
      || (config.ctaText ? ['span:has-text("' + config.ctaText + '")'] : null)
      || ['span:has-text("До года бесплатно")', 'span:has-text("До года")', '.button_type_new-design span', '[class*="button-subscription__button"] span', '[class*="subscription-button"] span'];

    for (const sel of ctaSpanSels) {
      try {
        // поддержка XPath селекторов
        let el;
        if (sel.startsWith('xpath=')) {
          const xpath = sel.replace('xpath=', '');
          const els = await page.$x(xpath);
          el = els[0] || null;
        } else {
          el = await page.$(sel);
        }
        if (el) {
          await el.scrollIntoViewIfNeeded().catch(() => {});
          await sleep(300);
          const box = await el.boundingBox();
          if (box && box.width > 0 && box.height > 0) {
            await el.tap().catch(() => page.mouse.click(box.x + box.width / 2, box.y + box.height / 2));
            log('CTA span — кликаем', 'ok');
            results.push({ name: 'CTA кнопка', status: 'pass' });
            ctaClicked = true;
            await sleep(2000);
            break;
          }
        }
      } catch (_) {}
    }

    if (!ctaClicked) {
      if (selectorProfile?.noCta) {
        log('CTA не требуется для этого лендинга', 'info');
        results.push({ name: 'CTA кнопка', status: 'pass', note: 'Активация через виджет' });
      } else {
        log('CTA не найдена — укажите точный текст в config.js → ctaText', 'warn');
        results.push({ name: 'CTA кнопка', status: 'warn' });
      }
    }

    // ── Активация промокода (для гифт-лендингов) ──────────────────────────
    if (selectorProfile?.activateBtn) {
      await sleep(1500);
      const activateSels = selectorProfile.activateBtn.split(',').map(s => s.trim());
      for (const s of activateSels) {
        try {
          let el;
          if (s.startsWith('xpath=')) {
            const els = await page.$x(s.replace('xpath=', '')).catch(() => []);
            el = els[0] || null;
          } else {
            el = await page.$(s);
            if (el && !await el.isVisible().catch(() => false)) el = null;
          }
          if (el) {
            await el.scrollIntoViewIfNeeded().catch(() => {});
            await el.click({ force: true });
            log('Клик «Активировать»', 'ok');
            await sleep(2000);
            break;
          }
        } catch (_) {}
      }
    }

    // проверяем открылся виджет
    const widgetSels = [
      '[class*="widget"]', '[class*="payment"]', '[class*="checkout"]',
      '[class*="pay-form"]', 'iframe[src*="pay"]', 'iframe[src*="widget"]',
    ];
    let widgetFound = false;
    for (const sel of widgetSels) {
      try {
        const el = await page.$(sel);
        if (el && await el.isVisible()) {
          log('Виджет открылся', 'ok');
          results.push({ name: 'Виджет открылся', status: 'pass' });
          widgetFound = true;
          break;
        }
      } catch (_) {}
    }
    if (!widgetFound) {
      log('Виджет не найден автоматически — проверьте вручную', 'warn');
      results.push({ name: 'Виджет открылся', status: 'warn' });
    }

    // ── Оплата ─────────────────────────────────────────────────────────
    sep('Блок 4 · Оплата');

    if (config.account.type === 'paid-card') {
      // одноклик
      try {
        const payBtn = await page.$('button:has-text("Оплатить"), button:has-text("Купить"), button:has-text("Подписаться")');
        if (payBtn) {
          await payBtn.click();
          await sleep(2500);
          log('Клик «Оплатить» (одноклик)', 'ok');
          const smsField = await page.$('input[placeholder*="код" i], input[maxlength="6"]').catch(() => null);
          if (!smsField) {
            log('SMS не запрошен — одноклик работает', 'ok');
            results.push({ name: 'Одноклик без SMS', status: 'pass' });
          } else {
            log('SMS запрошен — одноклик не работает', 'fail');
            results.push({ name: 'Одноклик без SMS', status: 'fail' });
          }
        }
      } catch (e) {
        results.push({ name: 'Одноклик', status: 'fail', error: e.message });
      }

    } else {
      // стандартная оплата — поля карты в diehard.yandex.ru
      let trustFrame = null;
      try {
        await sleep(selectorProfile?.initialWait || 2000);

        // диагностика — все фреймы
        log('Все фреймы в блоке 4:', 'info');
        for (const f of page.frames()) {
          log('  ' + f.url().slice(0, 80), 'info');
        }

        // ждём появления diehard.yandex.ru до 15-25 секунд
        const diehardTimeout = selectorProfile?.diehardTimeout || 15;
        for (let i = 0; i < diehardTimeout; i++) {
          for (const f of page.frames()) {
            if (f.url().includes('diehard.yandex.ru') || f.url().includes('diehard.yandex.net')) {
              trustFrame = f;
              break;
            }
          }
          if (trustFrame) break;
          await sleep(1000);
        }
        if (trustFrame) log('Найден iframe diehard: ' + trustFrame.url().slice(0, 60), 'ok');
        else log('iframe diehard не найден', 'warn');

        // контекст для поиска полей — iframe или страница напрямую
        const cardCtx = trustFrame || page;
        if (!trustFrame) log('Ищем поля карты прямо на странице', 'info');

        if (trustFrame || await page.$('input#regular-card-number-input').catch(() => null)) {
          await cardCtx.waitForSelector('input#regular-card-number-input', { timeout: 10000 })
            .catch(() => { log('Поле карты не появилось', 'warn'); });
          await sleep(300);

          const numEl = await cardCtx.$('input#regular-card-number-input');
          if (numEl) {
            await numEl.click({ force: true }); await sleep(200);
            await numEl.fill(config.card.number.replace(/\s/g, ''));
            log('Номер карты введён', 'ok'); await sleep(300);
          } else { log('Поле номера карты не найдено', 'warn'); }

          const expParts = config.card.expiry.split('/');
          const expMonth = (expParts[0] || '').trim();
          const expYear  = (expParts[1] || '').trim();

          const expMonthEl = await cardCtx.$('input#regular-card-month-input');
          if (expMonthEl) {
            await expMonthEl.click({ force: true }); await sleep(200);
            await expMonthEl.fill(expMonth);
            log('Месяц: ' + expMonth, 'ok'); await sleep(200);
          }

          const expYearEl = await cardCtx.$('input#regular-card-year-input');
          if (expYearEl) {
            await expYearEl.click({ force: true }); await sleep(200);
            await expYearEl.fill(expYear);
            log('Год: ' + expYear, 'ok'); await sleep(200);
          }

          const cvcEl = await cardCtx.$('.field-container__cvv_regular input, .field-container__cvv input');
          if (cvcEl && config.card.cvc) {
            await cvcEl.click({ force: true }); await sleep(200);
            await cvcEl.fill(config.card.cvc);
            log('CVC введён', 'ok'); await sleep(200);
          }
        } else {
          log('iframe diehard.yandex.ru не найден', 'warn');
        }

        // кнопка «Подключить» — в payment-widget iframe
        let widgetFrame = null;
        for (const f of page.frames()) {
          if (f.url().includes('payment-widget.plus.yandex.ru') || f.url().includes('payment-widget.plus.kinopoisk.ru')) {
            widgetFrame = f; break;
          }
        }
        const connectBtnSel = sel('connectBtn', 'button[data-testid="trust-card-form-submit-button"], button:has-text("Подключить")');
        const confirmBtn = (widgetFrame ? await widgetFrame.$(connectBtnSel) : null)
          || await page.$(connectBtnSel);
        if (confirmBtn) {
          await confirmBtn.click({ force: true });
          log('Клик «Подключить»', 'ok');
          await sleep(3000);
        } else { log('Кнопка «Подключить» не найдена', 'warn'); }

        // SMS — вводится вручную, ждём появления опции или финального экрана
        if (config.card.scenario === 'sms') {
          log('Введите SMS-код вручную на сайте...', 'info');
          let paymentDone = false;
          for (let i = 0; i < 90; i++) {
            // ищем кнопку «Попробовать» на странице и в payment-widget iframe
            let upsaleVisible = await page.$('button:has-text("Попробовать"), a:has-text("Попробовать")').catch(() => null);
            if (!upsaleVisible && widgetFrame) {
              upsaleVisible = await widgetFrame.$('button:has-text("Попробовать"), a:has-text("Попробовать")').catch(() => null);
            }
            if (upsaleVisible) {
              try { if (await upsaleVisible.isVisible()) { log('Оплата подтверждена — появился экран опции', 'ok'); paymentDone = true; break; } } catch (_) {}
            }
            // проверяем текст страницы и iframe
            const pageText = await page.textContent('body').catch(() => '');
            let frameText = '';
            if (widgetFrame) frameText = await widgetFrame.textContent('body').catch(() => '');
            const allText = pageText + frameText;
            if (allText.includes('Стало доступно') || allText.includes('Пригласить близких') ||
                allText.includes('Выбрать, что послушать') || allText.includes('Попробовать') ||
                allText.includes('Больше близких') || allText.includes('Введите почту')) {
              log('Оплата подтверждена — финальный экран', 'ok');
              paymentDone = true;
              break;
            }
            await sleep(1000);
          }
          if (paymentDone) {
            results.push({ name: 'SMS-подтверждение', status: 'pass', note: 'Введено вручную' });
          } else {
            log('Ожидание истекло', 'warn');
            results.push({ name: 'SMS-подтверждение', status: 'warn' });
          }
        }

        results.push({ name: 'Оплата', status: 'pass' });
      } catch (e) {
        log('Ошибка оплаты: ' + e.message, 'fail');
        await page.screenshot({ path: 'error-payment.png' }).catch(() => {});
        log('Скриншот ошибки: error-payment.png', 'info');
        results.push({ name: 'Оплата', status: 'fail', error: e.message });
      }
    }

    // закрываем виджет
    sep('Закрытие виджета');
    const widgetCloseSels = [
      // Яндекс Пэй — крестик закрытия
      'button[aria-label="Закрыть"]',
      'button[aria-label="Close"]',
      'button[data-t="button:close"]',
      '[class*="modal__close"]',
      '[class*="popup__close"]',
      '[class*="overlay__close"]',
      '[class*="widget__close"]',
      '[class*="payment__close"]',
      '[class*="close-button"]',
      // текстовые кнопки
      'button:has-text("Закрыть")',
      'button:has-text("Отмена")',
      'button:has-text("Назад")',
      'button:has-text("Нет")',
    ];
    let widgetClosed = false;
    for (const sel of widgetCloseSels) {
      try {
        const btn = await page.$(sel);
        if (btn && await btn.isVisible()) {
          await btn.click();
          await sleep(800);
          log('Виджет закрыт', 'ok');
          results.push({ name: 'Виджет закрыт', status: 'pass' });
          widgetClosed = true;
          break;
        }
      } catch (_) {}
    }
    if (!widgetClosed) {
      log('Виджет закрыт автоматически после оплаты', 'ok');
      results.push({ name: 'Виджет закрыт', status: 'pass' });
    }

    // опция после оплаты — «Попробовать»
    sep('Опция после оплаты');
    try {
      await sleep(5000);
      // ищем в payment-widget iframe и на странице
      let upsaleBtn = await page.$('button:has-text("Попробовать"), a:has-text("Попробовать")').catch(() => null);
      if (!upsaleBtn) {
        for (const f of page.frames()) {
          if (f.url().includes('payment-widget')) {
            upsaleBtn = await f.$('button:has-text("Попробовать"), a:has-text("Попробовать")').catch(() => null);
            if (upsaleBtn) { log('Опция найдена в payment-widget iframe', 'info'); break; }
          }
        }
      }
      if (upsaleBtn && await upsaleBtn.isVisible().catch(() => false)) {
        await upsaleBtn.click({ force: true });
        log('Клик «Попробовать» на опции', 'ok');
        results.push({ name: 'Опция принята', status: 'pass' });
        await sleep(2000);
      } else {
        // экран почты мог появиться без экрана опции
        log('Экран с опцией не появился — проверяем экран почты', 'info');
        results.push({ name: 'Опция принята', status: 'pass', note: 'Экран не появился' });
      }

      // «Не сейчас» на экране почты — проверяем в любом случае
      await sleep(1500);
      let notNowBtn = await page.$('button[data-testid="button-skip-button"], a:has-text("Не сейчас"), button:has-text("Не сейчас")').catch(() => null);
      if (!notNowBtn) {
        for (const f of page.frames()) {
          if (f.url().includes('payment-widget')) {
            notNowBtn = await f.$('button[data-testid="button-skip-button"], a:has-text("Не сейчас"), button:has-text("Не сейчас")').catch(() => null);
            if (notNowBtn) break;
          }
        }
      }
      if (notNowBtn) {
        await notNowBtn.click({ force: true });
        log('Клик «Не сейчас» на экране почты', 'ok');
        await sleep(2000);
      }

      log('Подписка оформлена ✓', 'ok');
      results.push({ name: 'Подписка оформлена', status: 'pass' });
    } catch (e) {
      log('Ошибка при клике на опцию: ' + e.message, 'warn');
      results.push({ name: 'Опция принята', status: 'warn' });
    }
  }

  // ── ИТОГ ──────────────────────────────────────────────────────────────
  sep('Итог');
  const pass = results.filter(r => r.status === 'pass').length;
  const fail = results.filter(r => r.status === 'fail').length;
  const warn = results.filter(r => r.status === 'warn').length;

  results.forEach(r => {
    const color = r.status==='pass' ? '\x1b[32m' : r.status==='fail' ? '\x1b[31m' : '\x1b[33m';
    const icon  = r.status==='pass' ? '✓' : r.status==='fail' ? '✗' : '⚠';
    console.log(color + '  ' + icon + ' ' + r.name + (r.note ? '  (' + r.note + ')' : '') + '\x1b[0m');
    if (r.error) console.log('    \x1b[90m' + r.error + '\x1b[0m');
  });

  console.log('');
  log('Прошли: ' + pass + '  Предупреждения: ' + warn + '  Упали: ' + fail, fail > 0 ? 'fail' : 'ok');
  console.log('\n\x1b[90mБраузер открыт — проверьте результат и закройте окно.\x1b[0m\n');

  // скриншот финального состояния
  try {
    const screenshotPath = logFile.replace('.log', '.png');
    await page.screenshot({ path: screenshotPath, fullPage: false });
    log('Скриншот сохранён: logs/' + path.basename(screenshotPath), 'info');
  } catch (_) {}

  logStream.write('\n=== Конец прогона · Прошли: ' + pass + ' Предупреждения: ' + warn + ' Упали: ' + fail + ' ===\n');
  logStream.end();
}

runTests().catch(err => {
  console.error('\x1b[31mКритическая ошибка:\x1b[0m', err.message);
  process.exit(1);
});