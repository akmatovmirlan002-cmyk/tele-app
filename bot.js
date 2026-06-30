const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const { Jimp } = require('jimp');
const jsQR = require('jsqr');
const QRCode = require('qrcode');

// ===== ТОКЕНДИ ОШО ЖЕРГЕ КОЙ =====
const TOKEN = '8957863642:AAGc1PYVGWTnlwBfdamGbDEtCDyD6UxvaQg';
// ==================================

// ===== БРЕНД ЖАНА ОПЕРАТОР (өзгөртсөң болот) =====
const BRAND = 'MOLNIY KG';
const OPERATOR = '@WEEFtON';
// ================================================

// ===================== ЭКИ ТИЛ (RU / KY) =====================
const fsForLang = require('fs');
const LANG_FILE = path.join(__dirname, 'user_lang.json');
function loadLangs() {
  try { return JSON.parse(fsForLang.readFileSync(LANG_FILE, 'utf8')); } catch (e) { return {}; }
}
function getLang(chatId) {
  return loadLangs()[chatId] || null; // null = тил тандала элек
}
function setLang(chatId, lang) {
  const data = loadLangs();
  data[chatId] = lang;
  fsForLang.writeFileSync(LANG_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// Котормолор: ar бир ачкыч — функция же текст, ru/ky
const T = {
  btn_deposit:   { ru: '💰 Пополнить',       ky: '💰 Толуктоо' },
  btn_withdraw:  { ru: '💵 Вывести',         ky: '💵 Чыгаруу' },
  btn_support:   { ru: '🧑‍💻 Тех поддержка',  ky: '🧑‍💻 Колдоо' },
  btn_cancel:    { ru: '🔴 Отмена',          ky: '🔴 Артка' },
  btn_cancel2:   { ru: '❌ Отмена',          ky: '❌ Артка' },
  btn_main:      { ru: '🏠 Главное меню',    ky: '🏠 Башкы меню' },
  btn_back:      { ru: '🔙 Назад',           ky: '🔙 Артка' },
  btn_pay_qr:    { ru: '📱 Оплата по QR',    ky: '📱 QR менен төлөө' },

  choose_lang:   { ru: '🌐 Выберите язык:',  ky: '🌐 Тилди тандаңыз:' },
  welcome: {
    ru: (n) => `Привет, ${n} | <b>${BRAND}!</b> 🔛\n\n🟢 <b>Пополнение | Вывод</b>\n\n📥 Пополнение — <b>0%</b>\n📤 Вывод — <b>0%</b>\n🕓 Работаем <b>24/7</b>\n\n🧑‍💻 Оператор: ${OPERATOR}`,
    ky: (n) => `Салам, ${n} | <b>${BRAND}!</b> 🔛\n\n🟢 <b>Толуктоо | Чыгаруу</b>\n\n📥 Толуктоо — <b>0%</b>\n📤 Чыгаруу — <b>0%</b>\n🕓 Иштейбиз <b>24/7</b>\n\n🧑‍💻 Оператор: ${OPERATOR}`
  },
  main_title:    { ru: '🏠 <b>Главное меню</b>\n\nВыберите действие:', ky: '🏠 <b>Башкы меню</b>\n\nАракетти тандаңыз:' },

  dep_choose_site: { ru: '💳 <b>Пополнение счета</b>\n\nВыберите ваш способ:', ky: '💳 <b>Эсепти толуктоо</b>\n\nЫкманы тандаңыз:' },
  dep_enter_id: {
    ru: (s, h) => `💳 <b>Пополнение счета</b>\n\nСчет: <b>${s}</b>\n\n📝 Введите ID счета:${h}`,
    ky: (s, h) => `💳 <b>Эсепти толуктоо</b>\n\nЭсеп: <b>${s}</b>\n\n📝 Эсептин ID'син жазыңыз:${h}`
  },
  hint_prev_ids: { ru: `\n\n💡 Можете выбрать из предыдущих ID:`, ky: `\n\n💡 Мурунку ID'лерден тандасаңыз болот:` },
  hint_prev_phones: { ru: `\n\n💡 Можете выбрать из предыдущих номеров:`, ky: `\n\n💡 Мурунку номерлерден тандасаңыз болот:` },
  dep_enter_amount: {
    ru: `💳 <b>Пополнение счета</b>\n\n📊 Минимум: <b>35</b>\n📊 Максимум: <b>200 000</b>\n\n💰 Введите сумму пополнения:`,
    ky: `💳 <b>Эсепти толуктоо</b>\n\n📊 Минимум: <b>35</b>\n📊 Максимум: <b>200 000</b>\n\n💰 Толуктоо суммасын жазыңыз:`
  },
  invalid_amount: {
    ru: `❌ Неверная сумма! Введите от <b>35</b> до <b>200 000</b>:`,
    ky: `❌ Туура эмес сумма! <b>35</b>тен <b>200 000</b>ге чейин жазыңыз:`
  },
  bank_caption: {
    ru: (id, amt) => `💳 <b>Пополнение счета</b>\n\n👉 Ваш ID: <code>${id}</code>\n💰 Сумма к оплате: <b>${amt} сом</b>\n\n‼️ <b>ОЧЕНЬ ВАЖНО!</b>\nУважаемый клиент, отправляйте указанную сумму <b>точно до копейки</b> (${amt} сом), иначе платёж не будет засчитан.\n\n⏰ У вас есть <b>5 минут</b> на оплату\n🧾 Чек отправьте после оплаты`,
    ky: (id, amt) => `💳 <b>Эсепти толуктоо</b>\n\n👉 Сиздин ID: <code>${id}</code>\n💰 Төлөнүүчү сумма: <b>${amt} сом</b>\n\n‼️ <b>АБДАН МААНИЛҮҮ!</b>\nУрматтуу кардар, көрсөтүлгөн сумманы <b>тыйынына чейин так</b> (${amt} сом) которуңуз, болбосо төлөм эсепке алынбайт.\n\n⏰ Төлөөгө <b>5 мүнөт</b> убактыңыз бар\n🧾 Төлөгөндөн кийин чекти жибериңиз`
  },
  qr_caption: {
    ru: (id, amt) => `📱 <b>Оплата по QR</b>\n\n👤 Ваш ID: <code>${id}</code>\n💰 Сумма к оплате: <b>${amt} сом</b>\n\n📲 Этот QR работает <b>со всеми банками</b> — отсканируйте в приложении любого банка и оплатите\n⏰ У вас есть <b>5 минут</b> на оплату\n📸 После оплаты отправьте чек (скриншот)`,
    ky: (id, amt) => `📱 <b>QR менен төлөө</b>\n\n👤 Сиздин ID: <code>${id}</code>\n💰 Төлөнүүчү сумма: <b>${amt} сом</b>\n\n📲 Бул QR <b>бардык банктарга</b> иштейт — каалаган банктын тиркемесинде сканерлеп төлөңүз\n⏰ Төлөөгө <b>5 мүнөт</b> убактыңыз бар\n📸 Төлөгөндөн кийин чекти (скриншот) жибериңиз`
  },
  qr_not_set: { ru: `❌ QR код пока не установлен. Оплатите через кнопку банка.`, ky: `❌ QR код азырынча коюлган жок. Банк баскычы аркылуу төлөңүз.` },
  send_receipt: { ru: `📸 Пожалуйста, отправьте <b>фото чека</b> (скриншот):`, ky: `📸 Сураныч, <b>чектин сүрөтүн</b> (скриншот) жибериңиз:` },
  app_sent: {
    ru: (amt, s, id) => `✅ <b>Заявка отправлена!</b>\n\n💰 Сумма: <b>${amt} сом</b>\n🎰 ID счета: <b>${s}</b>\n👤 ID: <code>${id}</code>\n\n⏳ <b>Ожидайте подтверждения от оператора.</b>\n🕐 Время обработки: до 5 минут.`,
    ky: (amt, s, id) => `✅ <b>Арыз жөнөтүлдү!</b>\n\n💰 Сумма: <b>${amt} сом</b>\n🎰 Эсеп ID: <b>${s}</b>\n👤 ID: <code>${id}</code>\n\n⏳ <b>Оператордун ырастоосун күтүңүз.</b>\n🕐 Иштетүү убактысы: 5 мүнөткө чейин.`
  },
  balance_done: {
    ru: (amt, s, id, e) => `🎉 <b>Ваш баланс пополнен!</b>\n\n💰 Сумма: <b>${amt} сом</b>\n🎰 Счет: <b>${s}</b>\n👤 ID: <code>${id}</code>\n⚡ Закрыто за: <b>${e}с</b>`,
    ky: (amt, s, id, e) => `🎉 <b>Балансыңыз толукталды!</b>\n\n💰 Сумма: <b>${amt} сом</b>\n🎰 Эсеп: <b>${s}</b>\n👤 ID: <code>${id}</code>\n⚡ Жабылды: <b>${e}с</b>`
  },
  timeout_cancel: {
    ru: `⏰ <b>Время оплаты (5 минут) истекло.</b>\nЗаявка автоматически отменена.`,
    ky: `⏰ <b>Төлөө убактысы (5 мүнөт) бүттү.</b>\nАрыз автоматтык түрдө жокко чыгарылды.`
  },
  support_msg: {
    ru: `🧑‍💻 <b>Тех поддержка</b>\n\nПо всем вопросам обращайтесь к оператору:\n${OPERATOR}`,
    ky: `🧑‍💻 <b>Колдоо</b>\n\nСуроолор боюнча операторго жазыңыз:\n${OPERATOR}`
  },
  wd_choose_bm: { ru: `💵 <b>Вывод средств</b>\n\nВыберите букмекер для вывода:`, ky: `💵 <b>Каражат чыгаруу</b>\n\nЧыгаруу үчүн букмекерди тандаңыз:` },
  wd_choose_method: { ru: `💵 <b>Вывод средств</b>\n\nВыберите способ вывода:`, ky: `💵 <b>Каражат чыгаруу</b>\n\nЧыгаруу ыкмасын тандаңыз:` },
  wd_enter_id: {
    ru: (s, h) => `🎰 <b>${s}</b>\n\n📝 Отправьте ваш ID:${h}`,
    ky: (s, h) => `🎰 <b>${s}</b>\n\n📝 ID'ңизди жибериңиз:${h}`
  },
  wd_enter_phone: {
    ru: (b, h) => `💵 <b>Вывод — ${b}</b>\n\n📱 Введите номер телефона:${h}`,
    ky: (b, h) => `💵 <b>Чыгаруу — ${b}</b>\n\n📱 Телефон номерин жазыңыз:${h}`
  },
  wd_send_qr: {
    ru: (b, p) => `💵 <b>Вывод — ${b}</b>\n📱 Номер: <code>${p}</code>\n\n📸 Отправьте QR код вашего банка:`,
    ky: (b, p) => `💵 <b>Чыгаруу — ${b}</b>\n📱 Номер: <code>${p}</code>\n\n📸 Банкыңыздын QR кодун жибериңиз:`
  },
  wd_instructions: {
    ru: `📍 <b>Заходим</b> 👇\n📍 1. Настройки!\n📍 2. Вывести со счета!\n📍 3. Наличные\n📍 4. Сумму для Вывода!\n🏙 Город: <b>Ош</b>\n🏠 Улица: <b>MOLNIY KG</b>\n📍 5. Подтвердить\n📍 6. Получить Код!\n📍 7. Отправить его в бота`,
    ky: `📍 <b>Кирүү</b> 👇\n📍 1. Жөндөөлөр!\n📍 2. Эсептен чыгаруу!\n📍 3. Накталай\n📍 4. Чыгаруу суммасы!\n🏙 Шаар: <b>Ош</b>\n🏠 Көчө: <b>MOLNIY KG</b>\n📍 5. Ырастоо\n📍 6. Кодду алуу!\n📍 7. Аны ботко жибериңиз`
  },
  wd_accepted: {
    ru: (s, id, b, p, c) => `✅ <b>Заявка на вывод принята!</b>\n\n🎰 Букмекер: <b>${s}</b>\n🆔 ID: <code>${id}</code>\n🏦 Способ: <b>${b}</b>\n📱 Номер: <code>${p}</code>\n🔑 Код: <code>${c}</code>\n\n⏳ <b>Ожидайте подтверждения от оператора.</b>`,
    ky: (s, id, b, p, c) => `✅ <b>Чыгаруу арызы кабыл алынды!</b>\n\n🎰 Букмекер: <b>${s}</b>\n🆔 ID: <code>${id}</code>\n🏦 Ыкма: <b>${b}</b>\n📱 Номер: <code>${p}</code>\n🔑 Код: <code>${c}</code>\n\n⏳ <b>Оператордун ырастоосун күтүңүз.</b>`
  },
  proc_notify:    { ru: `⏳ <b>Ваша заявка обрабатывается оператором...</b>`, ky: `⏳ <b>Арызыңыз оператор тарабынан каралып жатат...</b>` },
  cancel_notify:  { ru: `❌ <b>Ваша заявка отклонена.</b>\n\nВозможно, данные неверны или чек не подходит. Свяжитесь с оператором: ${OPERATOR}`, ky: `❌ <b>Арызыңыз четке кагылды.</b>\n\nМаалымат туура эмес же чек ылайык эмес болушу мүмкүн. Операторго жазыңыз: ${OPERATOR}` },
  ban_notify:     { ru: `🚫 <b>Ваш аккаунт заблокирован.</b>\n\nДля уточнения причины обратитесь к оператору: ${OPERATOR}`, ky: `🚫 <b>Аккаунтуңуз бөгөттөлдү.</b>\n\nСебебин билүү үчүн операторго кайрылыңыз: ${OPERATOR}` },
  wd_approve_notify: { ru: (s) => `✅ <b>Ваша заявка на вывод закрыта!</b>\n\n🎰 Букмекер: <b>${s}</b>\n💰 Средства отправлены.`, ky: (s) => `✅ <b>Чыгаруу арызыңыз жабылды!</b>\n\n🎰 Букмекер: <b>${s}</b>\n💰 Каражат жөнөтүлдү.` },
  wd_cancel_notify:  { ru: `❌ <b>Ваша заявка на вывод отклонена.</b>\n\nСвяжитесь с оператором: ${OPERATOR}`, ky: `❌ <b>Чыгаруу арызыңыз четке кагылды.</b>\n\nОператорго жазыңыз: ${OPERATOR}` },
  bank_gone:      { ru: `❌ Этот банк сейчас недоступен. Выберите другой.`, ky: `❌ Бул банк азыр жеткиликсиз. Башкасын тандаңыз.` }
};

function t(lang, key, ...args) {
  const L = (lang === 'ky') ? 'ky' : 'ru';
  const entry = T[key];
  if (!entry) return key;
  const val = entry[L] !== undefined ? entry[L] : entry.ru;
  return typeof val === 'function' ? val(...args) : val;
}

// Тил тандоо экраны
function langKeyboard() {
  return { inline_keyboard: [[
    { text: '🇰🇬 Кыргызча', callback_data: 'setlang_ky' },
    { text: '🇷🇺 Русский', callback_data: 'setlang_ru' }
  ]] };
}

// Негизги меню (тилге жараша + жогорусунда тил баскычтары)
function mainMenu(lang) {
  return {
    inline_keyboard: [
      [
        { text: '🇰🇬 Кыргызча', callback_data: 'setlang_ky' },
        { text: '🇷🇺 Русский', callback_data: 'setlang_ru' }
      ],
      [
        { text: t(lang, 'btn_deposit'), callback_data: 'deposit' },
        { text: t(lang, 'btn_withdraw'), callback_data: 'withdraw' }
      ],
      [{ text: t(lang, 'btn_support'), callback_data: 'support' }]
    ]
  };
}
// ============================================================

// ===== АДМИНДЕРДИН TELEGRAM ID'ЛЕРИ ОШО ЖЕРГЕ КОЙ =====
// Өз ID'ңди билбесең, ботко /myid жаз — бот сага ID'ңди жазып берет.
const ADMIN_IDS = [
  // 123456789,
  8747316694
];
// ======================================================

// ===== ЗАЯВКАЛАР ЖИБЕРИЛЕ ТУРГАН ГРУППАНЫН ID'СИ ОШО ЖЕРГЕ КОЙ =====
// Группанын ID'син билбесең: ботту группага кош, группада /myid жаз —
// бот ошол группанын ID'син жазып берет (адатта минус менен баштайт, мис: -1001234567890).
const GROUP_CHAT_ID = -1003819679345; // ПОПОЛНЕНИЕ заявкалары
// ====================================================================

// ===== ВЫВОД ЗАЯВКАЛАРЫ ЖИБЕРИЛЕ ТУРГАН ГРУППАНЫН ID'СИ =====
// Өзүнчө вывод группасын ачып, ботту кош, /myid жазып ID'син алгын.
const WITHDRAW_GROUP_CHAT_ID = -1004408979821; // вывод группасы
// ============================================================

const bot = new TelegramBot(TOKEN, { polling: false });

// Polling баштаганга чейин, бот өчүрүлүп турган маалда чогулган
// эски (already-stale) кутулмаларды тазалайбыз — болбосо алар
// кайра иштеткенде бир учурда "топон" болуп, query'лер "too old"
// деген ката берет.
bot.deleteWebHook({ drop_pending_updates: true })
  .catch(() => {})
  .finally(() => bot.startPolling());

// Ботту токтоткондо polling'ди таза жабат, мунун аркасында
// кайра иштетилгенде "Conflict: terminated by other getUpdates request"
// катасы азаят.
function shutdown() {
  bot.stopPolling().finally(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Бирдей callback_query экинчи жолу (мис. кош update же эски сессиядан)
// келип калса, кайра иштетпей өткөрүп жиберет.
const processedCallbackIds = new Set();
function isDuplicateCallback(id) {
  if (processedCallbackIds.has(id)) return true;
  processedCallbackIds.add(id);
  if (processedCallbackIds.size > 500) {
    const first = processedCallbackIds.values().next().value;
    processedCallbackIds.delete(first);
  }
  return false;
}

const BANKS_FILE = path.join(__dirname, 'banks.json');

function loadBanks() {
  try {
    return JSON.parse(fs.readFileSync(BANKS_FILE, 'utf8'));
  } catch (e) {
    return [];
  }
}

function saveBanks(banks) {
  fs.writeFileSync(BANKS_FILE, JSON.stringify(banks, null, 2), 'utf8');
}

// ===================== ЖАЛПЫ (БИРДИКТҮҮ) QR КОД =====================
// Баардык банктарга бирдей иштеген бир QR код. Админ аны сүрөт менен коёт.
const QR_CONFIG_FILE = path.join(__dirname, 'qr_config.json');

function loadGlobalQrHash() {
  try {
    return JSON.parse(fs.readFileSync(QR_CONFIG_FILE, 'utf8')).hash || null;
  } catch (e) {
    return null;
  }
}

function saveGlobalQrHash(hash) {
  fs.writeFileSync(QR_CONFIG_FILE, JSON.stringify({ hash }, null, 2), 'utf8');
}

function isAdmin(chatId) {
  return ADMIN_IDS.includes(chatId);
}

// ===================== КОРИСТУУЧУЛАРДЫН ID'ЛЕРИ =====================
const SEEN_USERS_FILE = path.join(__dirname, 'seen_users.json');

function loadSeenUsers() {
  try {
    return JSON.parse(fs.readFileSync(SEEN_USERS_FILE, 'utf8'));
  } catch (e) {
    return [];
  }
}

function saveSeenUser(user) {
  const users = loadSeenUsers();
  const existing = users.find(u => u.id === user.id);
  if (existing) {
    Object.assign(existing, user, { lastSeen: new Date().toISOString() });
  } else {
    users.push({ ...user, lastSeen: new Date().toISOString() });
  }
  fs.writeFileSync(SEEN_USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
}

// ===================== БАНДАЛГАН КОЛДОНУУЧУЛАР =====================
const BANNED_FILE = path.join(__dirname, 'banned_users.json');

function loadBannedUsers() {
  try {
    return JSON.parse(fs.readFileSync(BANNED_FILE, 'utf8'));
  } catch (e) {
    return [];
  }
}

function saveBannedUsers(ids) {
  fs.writeFileSync(BANNED_FILE, JSON.stringify(ids, null, 2), 'utf8');
}

function isBanned(chatId) {
  return loadBannedUsers().includes(chatId);
}

function banUser(chatId) {
  const ids = loadBannedUsers();
  if (!ids.includes(chatId)) {
    ids.push(chatId);
    saveBannedUsers(ids);
  }
}

function unbanUser(chatId) {
  const ids = loadBannedUsers().filter(id => id !== chatId);
  saveBannedUsers(ids);
}

// ===================== ЖАЗЫЛБАГАН ЗАЯВКАЛАР (ОПЕРАТОР КАРАЙ ТУРГАН) =====================
const pendingApplications = {};
const pendingWithdrawals = {};

function makeApplicationId() {
  return `${Date.now()}_${Math.floor(Math.random() * 10000)}`;
}

// ===================== КЛИЕНТТИН САКТАЛГАН ЭСЕП ID'ЛЕРИ =====================
const USER_ACCOUNTS_FILE = path.join(__dirname, 'user_accounts.json');

function loadUserAccounts() {
  try {
    return JSON.parse(fs.readFileSync(USER_ACCOUNTS_FILE, 'utf8'));
  } catch (e) {
    return {};
  }
}

const MAX_SAVED_IDS = 3;

function toIdArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value) return [value];
  return [];
}

function saveUserAccountId(chatId, site, accountId) {
  const accounts = loadUserAccounts();
  if (!accounts[chatId]) accounts[chatId] = {};
  const ids = toIdArray(accounts[chatId][site]);
  const updated = [accountId, ...ids.filter(id => id !== accountId)].slice(0, MAX_SAVED_IDS);
  accounts[chatId][site] = updated;
  fs.writeFileSync(USER_ACCOUNTS_FILE, JSON.stringify(accounts, null, 2), 'utf8');
}

function getSavedAccountIds(chatId, site) {
  const accounts = loadUserAccounts();
  return toIdArray(accounts[chatId] && accounts[chatId][site]);
}

// ===================== КЛИЕНТТИН САКТАЛГАН ТЕЛЕФОН НОМЕРЛЕРИ =====================
const USER_PHONES_FILE = path.join(__dirname, 'user_phones.json');

function loadUserPhones() {
  try {
    return JSON.parse(fs.readFileSync(USER_PHONES_FILE, 'utf8'));
  } catch (e) {
    return {};
  }
}

function saveUserPhone(chatId, phone) {
  const data = loadUserPhones();
  const phones = toIdArray(data[chatId]);
  data[chatId] = [phone, ...phones.filter(p => p !== phone)].slice(0, MAX_SAVED_IDS);
  fs.writeFileSync(USER_PHONES_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function getSavedPhones(chatId) {
  const data = loadUserPhones();
  return toIdArray(data[chatId]);
}

// ===================== ВЫВОД ID МИСАЛ СҰРӨТҰ (админ жүктөйт) =====================
// Букмекер боюнча "ID кайда жазылат" мисал сүрөтүнүн file_id'син сактайт.
const WITHDRAW_ID_PHOTO_FILE = path.join(__dirname, 'withdraw_id_photos.json');

function loadWithdrawIdPhotos() {
  try {
    return JSON.parse(fs.readFileSync(WITHDRAW_ID_PHOTO_FILE, 'utf8'));
  } catch (e) {
    return {};
  }
}

function saveWithdrawIdPhoto(siteKey, fileId) {
  const data = loadWithdrawIdPhotos();
  data[siteKey] = fileId;
  fs.writeFileSync(WITHDRAW_ID_PHOTO_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function getWithdrawIdPhoto(siteKey) {
  return loadWithdrawIdPhotos()[siteKey] || null;
}

// ===================== БАНК ЛИНК ҮЛГҰЛӗРИ =====================
const BANK_TEMPLATES = [
  { name: '🏦 Bakai Bank', baseUrl: 'https://bakai.app/#' },
  { name: '🏦 MBANK', baseUrl: 'https://app.mbank.kg/qr/#' },
  { name: '🏦 O!Dengi', baseUrl: 'https://api.dengi.o.kg/#' },
  { name: '🏦 MegaPay', baseUrl: 'https://megapay.kg/get#' }
];

// Колдонуучунун маалыматтарын сактоо
const userSessions = {};

function getSession(chatId) {
  if (!userSessions[chatId]) {
    userSessions[chatId] = {};
  }
  return userSessions[chatId];
}

// ===================== СУММАГА РАНДОМ КОПЕЙКА КОШУУ =====================
// Клиент жазган суммага 1ден 99га чейин рандом копейка кошот (мис. 100 → 100.29).
function withRandomKopecks(amount) {
  const kopecks = Math.floor(Math.random() * 99) + 1; // 1..99
  return (parseInt(amount, 10) + kopecks / 100).toFixed(2);
}

// ===================== QR ОКУУ =====================
async function decodeQrFromFileId(fileId) {
  const fileUrl = await bot.getFileLink(fileId);
  const res = await fetch(fileUrl);
  const buffer = Buffer.from(await res.arrayBuffer());
  const image = await Jimp.read(buffer);
  const { data, width, height } = image.bitmap;
  const result = jsQR(new Uint8ClampedArray(data), width, height);
  return result ? result.data.trim() : null;
}

function extractHash(qrText) {
  // QR'дын ичинде # болсо, # дан кийинки бөлүгүн алабыз,
  // болбосо QR'дын бүт текстин хеш катары алабыз
  const idx = qrText.lastIndexOf('#');
  return idx === -1 ? qrText : qrText.slice(idx + 1);
}

function makeBankId(name) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9а-яёң]+/gi, '_')
    .replace(/^_+|_+$/g, '');
  return `${base}_${Date.now()}`;
}

// ===================== START =====================
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  console.log(`[CMD] /start chat=${chatId}`);
  if (isBanned(chatId)) return;
  userSessions[chatId] = {}; // сессияны тазала

  const name = msg.from.first_name || '';
  const lang = getLang(chatId);

  // Тил тандала элек болсо — адегенде тил тандатабыз
  if (!lang) {
    bot.sendMessage(chatId,
      `🌐 Тилди тандаңыз / Выберите язык:`,
      { reply_markup: langKeyboard() }
    );
    return;
  }

  showWelcome(chatId, name, lang);
});

// Саламдашуу + негизги меню
function showWelcome(chatId, name, lang) {
  bot.sendMessage(chatId,
    t(lang, 'welcome', name),
    {
      parse_mode: 'HTML',
      reply_markup: mainMenu(lang)
    }
  );
}

// ===================== MYID =====================
bot.onText(/\/myid/, (msg) => {
  const chatId = msg.chat.id;
  console.log(`[CMD] /myid chat=${chatId}`);
  saveSeenUser({
    id: chatId,
    firstName: msg.from.first_name || '',
    lastName: msg.from.last_name || '',
    username: msg.from.username || ''
  });
  bot.sendMessage(chatId, `🆔 Сенин chat ID'ң: <code>${chatId}</code>`, { parse_mode: 'HTML' });
});

// ===================== PROFILE =====================
bot.onText(/\/profile/, (msg) => {
  const chatId = msg.chat.id;
  console.log(`[CMD] /profile chat=${chatId}`);
  const from = msg.from;
  saveSeenUser({
    id: chatId,
    firstName: from.first_name || '',
    lastName: from.last_name || '',
    username: from.username || ''
  });
  bot.sendMessage(chatId,
    `👤 <b>Профиль</b>\n\n` +
    `Аты: <b>${from.first_name || '—'}</b>\n` +
    `Фамилиясы: <b>${from.last_name || '—'}</b>\n` +
    `Username: <b>${from.username ? '@' + from.username : '—'}</b>\n` +
    `Telegram ID: <code>${chatId}</code>`,
    { parse_mode: 'HTML' }
  );
});

// ===================== MAIN MENU =====================
function showMainMenu(chatId) {
  const lang = getLang(chatId) || 'ru';
  bot.sendMessage(chatId,
    t(lang, 'main_title'),
    {
      parse_mode: 'HTML',
      reply_markup: mainMenu(lang)
    }
  );
}

// ===================== DEPOSIT — ВЫБОР САЙТА =====================
function showDepositMenu(chatId) {
  const lang = getLang(chatId) || 'ru';
  bot.sendMessage(chatId,
    t(lang, 'dep_choose_site'),
    {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '1️⃣ 1XBET', callback_data: 'site_1xbet' },
            { text: '2️⃣ MELBET', callback_data: 'site_melbet' }
          ],
          [
            { text: t(lang, 'btn_cancel'), callback_data: 'main_menu' }
          ]
        ]
      }
    }
  );
}

// ===================== ВВОД ID =====================
function askForId(chatId, site) {
  const session = getSession(chatId);
  session.site = site;
  session.step = 'waiting_id';

  const lang = getLang(chatId) || 'ru';
  const siteLabel = site === '1xbet' ? '1XBET' : 'MELBET';
  const savedIds = getSavedAccountIds(chatId, site);

  const rows = savedIds.map((id, i) => [{ text: `✅ ${id}`, callback_data: `use_saved_id_${i}` }]);
  rows.push([{ text: t(lang, 'btn_cancel'), callback_data: 'main_menu' }]);

  const hint = savedIds.length ? t(lang, 'hint_prev_ids') : '';
  const caption = t(lang, 'dep_enter_id', siteLabel, hint);

  // Админ жүктөгөн "ID кайда жазылат" мисал сүрөтү (бар болсо)
  const photoId = getWithdrawIdPhoto('deposit_account');
  if (!photoId) {
    bot.sendMessage(chatId, caption, { parse_mode: 'HTML', reply_markup: { inline_keyboard: rows } });
    return;
  }

  bot.sendPhoto(chatId, photoId,
    {
      caption,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: rows }
    }
  ).catch((err) => {
    console.log('[ASK_FOR_ID_PHOTO_ERR]', err.message);
    // Эгер фото жок болсо, жөн текст жибер
    bot.sendMessage(chatId,
      caption,
      {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: rows }
      }
    ).catch(err2 => console.log('[ASK_FOR_ID_TEXT_ERR]', err2.message));
  });
}

// ===================== ВВОД СУММЫ =====================
function askForAmount(chatId) {
  const session = getSession(chatId);
  session.step = 'waiting_amount';
  const lang = getLang(chatId) || 'ru';

  bot.sendMessage(chatId,
    t(lang, 'dep_enter_amount'),
    {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '100', callback_data: 'amount_100' },
            { text: '200', callback_data: 'amount_200' },
            { text: '500', callback_data: 'amount_500' }
          ],
          [
            { text: '1000', callback_data: 'amount_1000' },
            { text: '2000', callback_data: 'amount_2000' },
            { text: '5000', callback_data: 'amount_5000' }
          ],
          [
            { text: t(lang, 'btn_cancel'), callback_data: 'main_menu' }
          ]
        ]
      }
    }
  );
}

// ===================== ВЫБОР БАНКА (КЛИЕНТ) =====================
async function showBankMenu(chatId) {
  const session = getSession(chatId);
  const lang = getLang(chatId) || 'ru';
  session.step = 'waiting_receipt';
  session.paymentStart = Date.now();
  session.receiptSent = false;

  // 5 мүнөттүн ичинде чек келбесе — автоматтык отмена + башкы меню
  const token = session.paymentStart;
  clearTimeout(session.paymentTimer);
  session.paymentTimer = setTimeout(() => {
    const s = getSession(chatId);
    if (s.step === 'waiting_receipt' && s.paymentStart === token && !s.receiptSent) {
      s.step = null;
      bot.sendMessage(chatId,
        t(lang, 'timeout_cancel'),
        { parse_mode: 'HTML' }
      ).finally(() => showMainMenu(chatId));
    }
  }, 5 * 60 * 1000);

  const banks = loadBanks();
  // Банк баскычтары + Отмена — баарын 2'ден катарга бөлөбүз
  const items = banks.map(b => ({ text: b.name, url: `${b.baseUrl}${b.hash}` }));
  items.push({ text: t(lang, 'btn_cancel2'), callback_data: 'main_menu' });

  const rows = [];
  for (let i = 0; i < items.length; i += 2) {
    rows.push(items.slice(i, i + 2));
  }

  const caption = t(lang, 'bank_caption', session.userId, session.amount);

  // Жогоруда админ койгон жалпы QR сүрөтүн көрсөтөбүз (бар болсо)
  const link = loadGlobalQrHash();
  if (link) {
    try {
      const qrBuffer = await QRCode.toBuffer(link, {
        type: 'png', width: 512, margin: 2, errorCorrectionLevel: 'M'
      });
      await bot.sendPhoto(chatId, qrBuffer, {
        caption,
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: rows }
      });
      return;
    } catch (err) {
      console.log('[QR_GEN_ERR]', err.message);
    }
  }

  bot.sendMessage(chatId, caption, {
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: rows }
  });
}

// ===================== ЖАЛПЫ QR КОД МЕНЕН ТӨЛӨӨ =====================
// Баардык банктарга бирдей иштеген бирдиктүү QR кодду жөнөтөт.
async function sendGlobalQr(chatId) {
  const session = getSession(chatId);
  const lang = getLang(chatId) || 'ru';
  const link = loadGlobalQrHash(); // админден алынган QR'дын линки/тексти

  if (!link) {
    bot.sendMessage(chatId, t(lang, 'qr_not_set'));
    return;
  }

  session.bank = 'QR';
  session.step = 'waiting_receipt';

  const rows = [];
  if (/^https?:\/\//i.test(link)) {
    rows.push([{ text: '🔗 ' + (lang === 'ky' ? 'Төлөө шилтемеси' : 'Ссылка для оплаты'), url: link }]);
  }
  rows.push([{ text: t(lang, 'btn_back'), callback_data: 'back_to_banks' }]);
  rows.push([{ text: t(lang, 'btn_cancel2'), callback_data: 'main_menu' }]);

  const caption = t(lang, 'qr_caption', session.userId, session.amount);

  try {
    // Админден келген линкти окуп, ошондон кайра QR код сүрөтүн түзөбүз
    const qrBuffer = await QRCode.toBuffer(link, {
      type: 'png',
      width: 512,
      margin: 2,
      errorCorrectionLevel: 'M'
    });

    await bot.sendPhoto(chatId, qrBuffer, {
      caption,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: rows }
    });
  } catch (err) {
    console.log('[QR_GEN_ERR]', err.message);
    bot.sendMessage(chatId,
      caption + `\n\n🔗 Шилтеме:\n<code>${link}</code>`,
      {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: rows }
      }
    );
  }
}

// ===================== ЗАЯВКАНЫ ГРУППАГА ЖИБЕРҦӦ =====================
function sendApplicationToGroup(chatId, msg) {
  if (!GROUP_CHAT_ID) return;

  const session = getSession(chatId);
  const siteLabel = session.site === '1xbet' ? '1XBET' : 'MELBET';
  const from = msg.from;
  const username = from.username ? `@${from.username}` : '—';

  const appId = makeApplicationId();
  pendingApplications[appId] = {
    chatId,
    amount: session.amount,
    site: siteLabel,
    userId: session.userId,
    bank: session.bank || '—',
    receiptSentAt: Date.now(), // клиент чекти жөнөткөн учур — ушундан эсептейбиз
    status: 'new'
  };

  const caption =
    `🆕 <b>Жаңы заявка</b>\n\n` +
    `👤 Клиент: <b>${from.first_name || ''} ${from.last_name || ''}</b> (${username})\n` +
    `🆔 Chat ID: <code>${chatId}</code>\n\n` +
    `🎰 Сайт: <b>${siteLabel}</b>\n` +
    `👤 Счет ID: <code>${session.userId}</code>\n` +
    `💰 Сумма: <b>${session.amount} сом</b>\n` +
    `🏦 Банк: <b>${session.bank || '—'}</b>`;

  const buttons = {
    inline_keyboard: [
      [
        { text: '⏳ Обработать', callback_data: `app_process_${appId}` },
        { text: '✅ Подтвердить', callback_data: `app_approve_${appId}` }
      ],
      [
        { text: '❌ Отмена', callback_data: `app_cancel_${appId}` },
        { text: '🚫 Бан', callback_data: `app_ban_${appId}` }
      ]
    ]
  };

  if (msg.photo) {
    const fileId = msg.photo[msg.photo.length - 1].file_id;
    bot.sendPhoto(GROUP_CHAT_ID, fileId, { caption, parse_mode: 'HTML', reply_markup: buttons });
  } else if (msg.document) {
    bot.sendDocument(GROUP_CHAT_ID, msg.document.file_id, { caption, parse_mode: 'HTML', reply_markup: buttons });
  } else {
    bot.sendMessage(GROUP_CHAT_ID, caption, { parse_mode: 'HTML', reply_markup: buttons });
  }
}

// ===================== ЗАЯВКА ОТПРАВЛЕНА =====================
function showApplicationSent(chatId, msg) {
  const session = getSession(chatId);
  const lang = getLang(chatId) || 'ru';
  const siteLabel = session.site === '1xbet' ? '1XBET' : 'MELBET';

  // Чек келди — авто-отмена таймерин токтотобуз
  session.receiptSent = true;
  session.step = null;
  clearTimeout(session.paymentTimer);

  sendApplicationToGroup(chatId, msg);

  bot.sendMessage(chatId,
    t(lang, 'app_sent', session.amount, siteLabel, session.userId),
    {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: t(lang, 'btn_main'), callback_data: 'main_menu' }]
        ]
      }
    }
  );
}

// ===================== БАЛАНС ПОПОЛНЕН =====================
function confirmPayment(app) {
  // Клиент чекти жөнөткөн учурдан баштап эсептейбиз, анан экиге бөлөбүз (2с → 1с)
  const realSeconds = (Date.now() - (app.receiptSentAt || Date.now())) / 1000;
  const elapsed = Math.max(1, Math.round(realSeconds / 2));

  const lang = getLang(app.chatId) || 'ru';
  bot.sendMessage(app.chatId,
    t(lang, 'balance_done', app.amount, app.site, app.userId, elapsed),
    {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: t(lang, 'btn_main'), callback_data: 'main_menu' }]
        ]
      }
    }
  );
}

// ===================== ВЫВОД =====================
function showWithdraw(chatId) {
  const lang = getLang(chatId) || 'ru';
  bot.sendMessage(chatId,
    t(lang, 'wd_choose_bm'),
    {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '1️⃣ 1XBET', callback_data: 'withdraw_1xbet' },
            { text: '2️⃣ MELBET', callback_data: 'withdraw_melbet' }
          ],
          [
            { text: t(lang, 'btn_cancel'), callback_data: 'main_menu' }
          ]
        ]
      }
    }
  );
}

// ===================== ВЫВОД — СПОСОБ (БАНК) =====================
const WITHDRAW_BANKS = [
  { id: 'mbank', name: '🏦 МБанк' },
  { id: 'odengi', name: '🏦 О!Деньги' },
  { id: 'kompanion', name: '🏦 Компаньон' },
  { id: 'bakai', name: '🏦 Бакай' },
  { id: 'optima', name: '🏦 Оптима' }
];

function showWithdrawBanks(chatId) {
  const lang = getLang(chatId) || 'ru';
  // 6 баскыч: 2 тилке (3 сол, 3 оң)
  const items = WITHDRAW_BANKS.map(b => ({ text: b.name, callback_data: `wbank_${b.id}` }));
  items.push({ text: t(lang, 'btn_cancel'), callback_data: 'main_menu' });

  const rows = [];
  for (let i = 0; i < items.length; i += 2) {
    rows.push(items.slice(i, i + 2));
  }

  bot.sendMessage(chatId,
    t(lang, 'wd_choose_method'),
    {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: rows }
    }
  );
}

// Букмекердин ID'син сурайт — мисал сүрөтү менен (assets/id_1xbet.jpg / id_melbet.jpg)
function askWithdrawId(chatId) {
  const session = getSession(chatId);
  const lang = getLang(chatId) || 'ru';
  session.step = 'waiting_withdraw_id';
  const site = session.withdrawSite || '';
  const savedIds = getSavedAccountIds(chatId, site.toLowerCase());
  const idRows = savedIds.map((id, i) => [{ text: `✅ ${id}`, callback_data: `use_wid_${i}` }]);
  idRows.push([{ text: t(lang, 'btn_cancel'), callback_data: 'main_menu' }]);
  const hint = savedIds.length ? t(lang, 'hint_prev_ids') : '';
  const caption = t(lang, 'wd_enter_id', site, hint);
  const markup = { inline_keyboard: idRows };

  // 1) Админ ботко жүктөгөн мисал сүрөтү (file_id)
  const fileId = getWithdrawIdPhoto(site.toLowerCase());
  if (fileId) {
    bot.sendPhoto(chatId, fileId, { caption, parse_mode: 'HTML', reply_markup: markup })
      .catch(() => bot.sendMessage(chatId, caption, { parse_mode: 'HTML', reply_markup: markup }));
    return;
  }

  // 2) assets папкасындагы файл (id_1xbet.jpg/png ...)
  const base = `id_${site.toLowerCase()}`;
  const exts = ['jpg', 'jpeg', 'png', 'webp'];
  for (const ext of exts) {
    const p = path.join(__dirname, 'assets', `${base}.${ext}`);
    if (fs.existsSync(p)) {
      bot.sendPhoto(chatId, p, { caption, parse_mode: 'HTML', reply_markup: markup })
        .catch(() => bot.sendMessage(chatId, caption, { parse_mode: 'HTML', reply_markup: markup }));
      return;
    }
  }

  // 3) сүрөт жок болсо — жөн текст
  bot.sendMessage(chatId, caption, { parse_mode: 'HTML', reply_markup: markup });
}

// ID'ден кийинки инструкция (фото + кадамдар)
function showWithdrawInstructions(chatId) {
  const session = getSession(chatId);
  const lang = getLang(chatId) || 'ru';
  session.step = 'waiting_withdraw_code';

  const caption = t(lang, 'wd_instructions');
  const markup = { inline_keyboard: [[{ text: t(lang, 'btn_cancel'), callback_data: 'main_menu' }]] };

  const fileId = getWithdrawIdPhoto('instruction');
  if (fileId) {
    bot.sendPhoto(chatId, fileId, { caption, parse_mode: 'HTML', reply_markup: markup })
      .catch(() => bot.sendMessage(chatId, caption, { parse_mode: 'HTML', reply_markup: markup }));
  } else {
    bot.sendMessage(chatId, caption, { parse_mode: 'HTML', reply_markup: markup });
  }
}

function finishWithdraw(chatId) {
  const session = getSession(chatId);
  const lang = getLang(chatId) || 'ru';
  session.step = 'waiting_withdraw_qr';
  bot.sendMessage(chatId,
    t(lang, 'wd_send_qr', session.withdrawBank || '', session.withdrawPhone || '—'),
    {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: t(lang, 'btn_cancel'), callback_data: 'main_menu' }]
        ]
      }
    }
  );
}

// ===================== ВЫВОД ЗАЯВКАСЫН ГРУППАГА ЖИБЕРҦӦ =====================
function sendWithdrawToGroup(chatId, msg) {
  // Өзүнчө вывод группасы болсо ошого, болбосо жалпы группага
  const targetGroup = WITHDRAW_GROUP_CHAT_ID || GROUP_CHAT_ID;
  if (!targetGroup) return;

  const session = getSession(chatId);
  const from = msg.from;
  const username = from.username ? `@${from.username}` : '—';

  const appId = makeApplicationId();
  pendingWithdrawals[appId] = {
    chatId,
    site: session.withdrawSite,
    userId: session.withdrawUserId,
    bank: session.withdrawBank,
    phone: session.withdrawPhone,
    code: session.withdrawCode,
    status: 'new'
  };

  const caption =
    `💵 <b>Жаңы ВЫВОД заявкасы</b>\n\n` +
    `👤 Клиент: <b>${from.first_name || ''} ${from.last_name || ''}</b> (${username})\n` +
    `🆔 Chat ID: <code>${chatId}</code>\n\n` +
    `🎰 Букмекер: <b>${session.withdrawSite || '—'}</b>\n` +
    `🆔 ID: <code>${session.withdrawUserId || '—'}</code>\n` +
    `🏦 Способ: <b>${session.withdrawBank || '—'}</b>\n` +
    `📱 Номер: <code>${session.withdrawPhone || '—'}</code>\n` +
    `🔑 Код: <code>${session.withdrawCode || '—'}</code>`;

  const buttons = {
    inline_keyboard: [
      [
        { text: '✅ Подтвердить', callback_data: `wapp_approve_${appId}` },
        { text: '❌ Отмена', callback_data: `wapp_cancel_${appId}` }
      ]
    ]
  };

  // Клиент жөнөткөн банк QR сүрөтү менен кошо жөнөтөбүз
  if (session.withdrawQrFileId) {
    bot.sendPhoto(targetGroup, session.withdrawQrFileId, { caption, parse_mode: 'HTML', reply_markup: buttons })
      .catch(() => bot.sendMessage(targetGroup, caption, { parse_mode: 'HTML', reply_markup: buttons }));
  } else {
    bot.sendMessage(targetGroup, caption, { parse_mode: 'HTML', reply_markup: buttons });
  }
}

// ===================== АДМИН ПАНЕЛЬ =====================
function showAdminMenu(chatId) {
  const banks = loadBanks();
  const rows = banks.map(b => [
    { text: b.name, callback_data: 'noop' },
    { text: '🔄 QR', callback_data: `admin_editqr_${b.id}` },
    { text: '✏️ Аты', callback_data: `admin_editname_${b.id}` },
    { text: '🗑', callback_data: `admin_delete_${b.id}` }
  ]);
  rows.push([{ text: '➕ Банк кошуу', callback_data: 'admin_add' }]);
  const qrSet = loadGlobalQrHash() ? '✅' : '❌';
  rows.push([{ text: `📱 Жалпы QR код коюу ${qrSet}`, callback_data: 'admin_setglobalqr' }]);
  const id1 = getWithdrawIdPhoto('1xbet') ? '✅' : '❌';
  const id2 = getWithdrawIdPhoto('melbet') ? '✅' : '❌';
  rows.push([
    { text: `📷 1XBET ID фото ${id1}`, callback_data: 'admin_idphoto_1xbet' },
    { text: `📷 MELBET ID фото ${id2}`, callback_data: 'admin_idphoto_melbet' }
  ]);
  const insSet = getWithdrawIdPhoto('instruction') ? '✅' : '❌';
  rows.push([{ text: `📷 Вывод инструкция фото ${insSet}`, callback_data: 'admin_idphoto_instruction' }]);
  const depSet = getWithdrawIdPhoto('deposit_account') ? '✅' : '❌';
  rows.push([{ text: `📷 Пополнение фото ${depSet}`, callback_data: 'admin_idphoto_deposit_account' }]);

  bot.sendMessage(chatId,
    `⚙️ <b>Админ панель — Банктар</b>\n\n` +
    `📱 Жалпы QR: ${qrSet === '✅' ? 'коюлган' : 'коюла элек'}\n\n` +
    `Банк кошуу, аты/QR'ын өзгөртүү, өчүрүү же жалпы QR коюу:`,
    {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: rows }
    }
  );
}

function startAddBank(chatId) {
  const session = getSession(chatId);
  session.adminStep = 'add_template';
  const rows = BANK_TEMPLATES.map((t, i) => [{ text: t.name, callback_data: `admin_tpl_${i}` }]);
  rows.push([{ text: '✏️ Башка (өзүм жазам)', callback_data: 'admin_tpl_custom' }]);
  bot.sendMessage(chatId, `🏦 Банктын түрүн тандаңыз:`, {
    reply_markup: { inline_keyboard: rows }
  });
}

function askEditName(chatId, bankId) {
  const session = getSession(chatId);
  session.adminStep = 'edit_name';
  session.adminEditId = bankId;
  bot.sendMessage(chatId, `📝 Жаңы атын жазыңыз:`);
}

function askQr(chatId, bankId) {
  const session = getSession(chatId);
  session.adminStep = bankId ? 'edit_qr' : 'add_qr';
  session.adminEditId = bankId || null;
  bot.sendMessage(chatId, `📸 Банктын QR кодун сурет (фото) түрүндө жибериңиз:`);
}

function askGlobalQr(chatId) {
  const session = getSession(chatId);
  session.adminStep = 'set_global_qr';
  bot.sendMessage(chatId, `📸 Баардык банктарга иштей турган <b>жалпы QR кодду</b> сурет (фото) түрүндө жибериңиз:`, { parse_mode: 'HTML' });
}

function askDeleteConfirm(chatId, bankId) {
  const banks = loadBanks();
  const bank = banks.find(b => b.id === bankId);
  if (!bank) return;
  bot.sendMessage(chatId,
    `❗️ <b>${bank.name}</b> банкын чын эле өчүрөсүзбү?`,
    {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Ооба, өчүр', callback_data: `admin_deleteconfirm_${bankId}` },
            { text: '❌ Жок', callback_data: 'admin_menu' }
          ]
        ]
      }
    }
  );
}

async function handleQrPhoto(chatId, msg) {
  const session = getSession(chatId);
  try {
    const photos = msg.photo;
    const fileId = photos[photos.length - 1].file_id;
    const qrText = await decodeQrFromFileId(fileId);

    if (!qrText) {
      bot.sendMessage(chatId, `❌ QR код табылбады. Сурет тунук, ачык болсун, кайра жибериңиз:`);
      return;
    }

    const hash = extractHash(qrText);
    const banks = loadBanks();

    if (session.adminStep === 'set_global_qr') {
      // Жалпы QR үчүн декоддолгон ТОЛУК линкти (текстти) сактайбыз —
      // hash'тин гана бөлүгүн эмес.
      saveGlobalQrHash(qrText);
      session.adminStep = null;
      bot.sendMessage(chatId, `✅ Жалпы QR код сакталды. Эми ал баардык банктарга иштейт.\n🔗 ${qrText}`, { parse_mode: 'HTML' });
      showAdminMenu(chatId);
    } else if (session.adminStep === 'add_qr') {
      const bank = {
        id: makeBankId(session.adminNewName || 'bank'),
        name: session.adminNewName || '🏦 Банк',
        baseUrl: session.adminNewBaseUrl || '',
        hash
      };
      banks.push(bank);
      saveBanks(banks);
      session.adminStep = null;
      session.adminNewName = null;
      session.adminNewBaseUrl = null;
      bot.sendMessage(chatId, `✅ Банк кошулду: <b>${bank.name}</b>\n🔗 ${bank.baseUrl}${bank.hash}`, { parse_mode: 'HTML' });
      showAdminMenu(chatId);
    } else if (session.adminStep === 'edit_qr') {
      const bank = banks.find(b => b.id === session.adminEditId);
      if (bank) {
        bank.hash = hash;
        saveBanks(banks);
        bot.sendMessage(chatId, `✅ QR жаңыртылды: <b>${bank.name}</b>\n🔗 ${bank.baseUrl}${bank.hash}`, { parse_mode: 'HTML' });
      }
      session.adminStep = null;
      session.adminEditId = null;
      showAdminMenu(chatId);
    }
  } catch (e) {
    bot.sendMessage(chatId, `❌ QR окуу учурунда ката кетти: ${e.message}`);
  }
}

// ===================== CALLBACK HANDLER =====================
bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  const session = getSession(chatId);
  const fromUser = query.from.username ? `@${query.from.username}` : query.from.id;

  console.log(`[BUTTON] chat=${chatId} from=${fromUser} data="${data}" query_id=${query.id}`);

  bot.answerCallbackQuery(query.id).catch((err) => {
    console.log(`[ANSWER_CALLBACK_ERR] data="${data}" err=${err.message}`);
  });

  if (isDuplicateCallback(query.id)) {
    console.log(`[BUTTON_DUPLICATE] data="${data}" query_id=${query.id}`);
    return;
  }

  if (data === 'noop') {
    return;
  }
  else if (data === 'setlang_ru' || data === 'setlang_ky') {
    const lang = data === 'setlang_ky' ? 'ky' : 'ru';
    setLang(chatId, lang);
    showWelcome(chatId, query.from.first_name || '', lang);
  }
  else if (data === 'main_menu') {
    session.step = null;
    showMainMenu(chatId);
  }
  else if (data === 'deposit') {
    showDepositMenu(chatId);
  }
  else if (data === 'withdraw') {
    showWithdraw(chatId);
  }
  else if (data === 'withdraw_1xbet' || data === 'withdraw_melbet') {
    const site = data === 'withdraw_1xbet' ? '1XBET' : 'MELBET';
    session.withdrawSite = site;
    showWithdrawBanks(chatId);
  }
  else if (data.startsWith('wbank_')) {
    const bankId = data.replace('wbank_', '');
    const bank = WITHDRAW_BANKS.find(b => b.id === bankId);
    session.withdrawBank = bank ? bank.name : bankId;
    session.step = 'waiting_withdraw_phone';

    const lang = getLang(chatId) || 'ru';
    const savedPhones = getSavedPhones(chatId);
    const rows = savedPhones.map((p, i) => [{ text: `📱 ${p}`, callback_data: `use_phone_${i}` }]);
    rows.push([{ text: t(lang, 'btn_cancel'), callback_data: 'main_menu' }]);
    const hint = savedPhones.length ? t(lang, 'hint_prev_phones') : '';

    bot.sendMessage(chatId,
      t(lang, 'wd_enter_phone', session.withdrawBank, hint),
      {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: rows }
      }
    );
  }
  else if (data.startsWith('use_phone_')) {
    const index = parseInt(data.replace('use_phone_', ''));
    const savedPhones = getSavedPhones(chatId);
    const phone = savedPhones[index];
    if (!phone) return;
    session.withdrawPhone = phone;
    session.step = null;
    saveUserPhone(chatId, phone);
    finishWithdraw(chatId);
  }
  else if (data.startsWith('use_wid_')) {
    const index = parseInt(data.replace('use_wid_', ''));
    const savedIds = getSavedAccountIds(chatId, (session.withdrawSite || '').toLowerCase());
    const wid = savedIds[index];
    if (!wid) return;
    session.withdrawUserId = wid;
    session.step = null;
    saveUserAccountId(chatId, (session.withdrawSite || '').toLowerCase(), wid);
    showWithdrawInstructions(chatId);
  }
  else if (data === 'support') {
    const lang = getLang(chatId) || 'ru';
    bot.sendMessage(chatId, t(lang, 'support_msg'), { parse_mode: 'HTML' });
  }
  else if (data === 'site_1xbet') {
    askForId(chatId, '1xbet');
  }
  else if (data === 'site_melbet') {
    askForId(chatId, 'melbet');
  }
  else if (data.startsWith('use_saved_id_')) {
    const index = parseInt(data.replace('use_saved_id_', ''));
    const savedIds = getSavedAccountIds(chatId, session.site);
    const savedId = savedIds[index];
    if (!savedId) return;
    session.userId = savedId;
    session.step = null;
    saveUserAccountId(chatId, session.site, savedId);
    askForAmount(chatId);
  }
  else if (data.startsWith('amount_')) {
    const amount = data.replace('amount_', '');
    session.amount = withRandomKopecks(amount);
    session.step = null;
    showBankMenu(chatId);
  }
  else if (data === 'pay_qr') {
    sendGlobalQr(chatId);
  }
  else if (data === 'back_to_banks') {
    showBankMenu(chatId);
  }
  // ===== АДМИН CALLBACK'ТАРЫ =====
  else if (data === 'admin_menu') {
    if (!isAdmin(chatId)) return;
    session.adminStep = null;
    showAdminMenu(chatId);
  }
  else if (data === 'admin_add') {
    if (!isAdmin(chatId)) return;
    startAddBank(chatId);
  }
  else if (data === 'admin_setglobalqr') {
    if (!isAdmin(chatId)) return;
    askGlobalQr(chatId);
  }
  else if (data === 'admin_idphoto_1xbet' || data === 'admin_idphoto_melbet') {
    if (!isAdmin(chatId)) return;
    const site = data === 'admin_idphoto_1xbet' ? '1xbet' : 'melbet';
    session.adminStep = `set_idphoto_${site}`;
    bot.sendMessage(chatId, `📷 <b>${site.toUpperCase()}</b> үчүн "ID кайда жазылат" мисал сүрөтүн жибериңиз:`, { parse_mode: 'HTML' });
  }
  else if (data === 'admin_idphoto_instruction') {
    if (!isAdmin(chatId)) return;
    session.adminStep = 'set_idphoto_instruction';
    bot.sendMessage(chatId, `📷 Вывод инструкциясынын сүрөтүн жибериңиз:`);
  }
  else if (data === 'admin_idphoto_deposit_account') {
    if (!isAdmin(chatId)) return;
    session.adminStep = 'set_idphoto_deposit_account';
    bot.sendMessage(chatId, `📷 "Пополнение счета — Введите ID" экранынын сүрөтүн жибериңиз:`);
  }
  else if (data.startsWith('admin_tpl_')) {
    if (!isAdmin(chatId)) return;
    const key = data.replace('admin_tpl_', '');
    if (key === 'custom') {
      session.adminStep = 'add_name';
      bot.sendMessage(chatId, `📝 Банктын атын жазыңыз (мисалы: 🏦 Bakai Bank):`);
    } else {
      const tpl = BANK_TEMPLATES[parseInt(key)];
      session.adminNewName = tpl.name;
      session.adminNewBaseUrl = tpl.baseUrl;
      session.adminStep = 'add_qr';
      bot.sendMessage(chatId, `📸 Эми «${tpl.name}» банкынын QR кодун сурет (фото) түрүндө жибериңиз:`);
    }
  }
  else if (data.startsWith('admin_editqr_')) {
    if (!isAdmin(chatId)) return;
    askQr(chatId, data.replace('admin_editqr_', ''));
  }
  else if (data.startsWith('admin_editname_')) {
    if (!isAdmin(chatId)) return;
    askEditName(chatId, data.replace('admin_editname_', ''));
  }
  else if (data.startsWith('admin_deleteconfirm_')) {
    if (!isAdmin(chatId)) return;
    const bankId = data.replace('admin_deleteconfirm_', '');
    const banks = loadBanks().filter(b => b.id !== bankId);
    saveBanks(banks);
    bot.sendMessage(chatId, `🗑 Банк өчүрүлдү.`);
    showAdminMenu(chatId);
  }
  else if (data.startsWith('admin_delete_')) {
    if (!isAdmin(chatId)) return;
    askDeleteConfirm(chatId, data.replace('admin_delete_', ''));
  }
  // ===== ЗАЯВКА CALLBACK'ТАРЫ (ГРУППАДА) =====
  else if (data.startsWith('app_process_')) {
    if (!isAdmin(query.from.id)) return;
    const appId = data.replace('app_process_', '');
    const app = pendingApplications[appId];
    if (!app) return;
    app.status = 'processing';
    bot.sendMessage(app.chatId, t(getLang(app.chatId) || 'ru', 'proc_notify'), { parse_mode: 'HTML' });
    bot.editMessageReplyMarkup(
      { inline_keyboard: [
        [
          { text: '⏳ Обрабатывается...', callback_data: 'noop' },
          { text: '✅ Подтвердить', callback_data: `app_approve_${appId}` }
        ],
        [
          { text: '❌ Отмена', callback_data: `app_cancel_${appId}` },
          { text: '🚫 Бан', callback_data: `app_ban_${appId}` }
        ]
      ] },
      { chat_id: chatId, message_id: query.message.message_id }
    ).catch(() => {});
  }
  else if (data.startsWith('app_approve_')) {
    if (!isAdmin(query.from.id)) return;
    const appId = data.replace('app_approve_', '');
    const app = pendingApplications[appId];
    if (!app) return;
    app.status = 'approved';
    confirmPayment(app);
    bot.editMessageReplyMarkup(
      { inline_keyboard: [[{ text: '✅ Подтверждено', callback_data: 'noop' }]] },
      { chat_id: chatId, message_id: query.message.message_id }
    ).catch(() => {});
    delete pendingApplications[appId];
  }
  else if (data.startsWith('app_cancel_')) {
    if (!isAdmin(query.from.id)) return;
    const appId = data.replace('app_cancel_', '');
    const app = pendingApplications[appId];
    if (!app) return;
    app.status = 'cancelled';
    bot.sendMessage(app.chatId, t(getLang(app.chatId) || 'ru', 'cancel_notify'), { parse_mode: 'HTML' });
    bot.editMessageReplyMarkup(
      { inline_keyboard: [[{ text: '❌ Отклонено', callback_data: 'noop' }]] },
      { chat_id: chatId, message_id: query.message.message_id }
    ).catch(() => {});
    delete pendingApplications[appId];
  }
  else if (data.startsWith('app_ban_')) {
    if (!isAdmin(query.from.id)) return;
    const appId = data.replace('app_ban_', '');
    const app = pendingApplications[appId];
    if (!app) return;
    app.status = 'banned';
    banUser(app.chatId);
    bot.sendMessage(app.chatId, t(getLang(app.chatId) || 'ru', 'ban_notify'), { parse_mode: 'HTML' }).catch(() => {});
    bot.editMessageReplyMarkup(
      { inline_keyboard: [[{ text: '♻️ Разбанить', callback_data: `unban_${app.chatId}` }]] },
      { chat_id: chatId, message_id: query.message.message_id }
    ).catch(() => {});
    delete pendingApplications[appId];
  }
  else if (data.startsWith('unban_')) {
    if (!isAdmin(query.from.id)) return;
    const targetId = Number(data.replace('unban_', ''));
    unbanUser(targetId);
    bot.sendMessage(targetId,
      (getLang(targetId) === 'ky'
        ? `✅ <b>Сиз бөгөттөн чыгарылдыңыз.</b> Кайра /start баса аласыз.`
        : `✅ <b>Вы разблокированы.</b> Можете снова нажать /start.`),
      { parse_mode: 'HTML' }
    ).catch(() => {});
    bot.editMessageReplyMarkup(
      { inline_keyboard: [[{ text: '✅ Разбанен', callback_data: 'noop' }]] },
      { chat_id: chatId, message_id: query.message.message_id }
    ).catch(() => {});
  }
  // ===== ВЫВОД ЗАЯВКА CALLBACK'ТАРЫ (ГРУППАДА) =====
  else if (data.startsWith('wapp_approve_')) {
    if (!isAdmin(query.from.id)) return;
    const appId = data.replace('wapp_approve_', '');
    const app = pendingWithdrawals[appId];
    if (!app) return;
    app.status = 'approved';
    bot.sendMessage(app.chatId, t(getLang(app.chatId) || 'ru', 'wd_approve_notify', app.site || '—'), { parse_mode: 'HTML' }).catch(() => {});
    bot.editMessageReplyMarkup(
      { inline_keyboard: [[{ text: '✅ Подтверждено', callback_data: 'noop' }]] },
      { chat_id: chatId, message_id: query.message.message_id }
    ).catch(() => {});
    delete pendingWithdrawals[appId];
  }
  else if (data.startsWith('wapp_cancel_')) {
    if (!isAdmin(query.from.id)) return;
    const appId = data.replace('wapp_cancel_', '');
    const app = pendingWithdrawals[appId];
    if (!app) return;
    app.status = 'cancelled';
    bot.sendMessage(app.chatId, t(getLang(app.chatId) || 'ru', 'wd_cancel_notify'), { parse_mode: 'HTML' }).catch(() => {});
    bot.editMessageReplyMarkup(
      { inline_keyboard: [[{ text: '❌ Отменено', callback_data: 'noop' }]] },
      { chat_id: chatId, message_id: query.message.message_id }
    ).catch(() => {});
    delete pendingWithdrawals[appId];
  }
});

// ===================== ADMIN КОМАНДАСЫ =====================
bot.onText(/\/admin/, (msg) => {
  const chatId = msg.chat.id;
  console.log(`[CMD] /admin chat=${chatId}`);
  if (!isAdmin(chatId)) {
    bot.sendMessage(chatId, `⛔️ Бул команда сага жеткиликсиз.`);
    return;
  }
  showAdminMenu(chatId);
});

// ===================== MESSAGE HANDLER =====================
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const session = getSession(chatId);

  console.log(`[MESSAGE] chat=${chatId} step=${session.step || '-'} text="${msg.text || ''}" photo=${!!msg.photo} doc=${!!msg.document}`);

  if (!isAdmin(chatId) && chatId !== GROUP_CHAT_ID && chatId !== WITHDRAW_GROUP_CHAT_ID && isBanned(chatId)) {
    return;
  }

  // ===== CUSTOM EMOJI ID ОКУП БЕРҦӦ (админ Premium аккаунттан жөнөтсө) =====
  if (isAdmin(chatId)) {
    const entities = msg.entities || msg.caption_entities;
    const text = msg.text || msg.caption || '';
    if (entities) {
      const customs = entities.filter(e => e.type === 'custom_emoji');
      if (customs.length) {
        const lines = customs.map(e => {
          const emojiChar = text.substr(e.offset, e.length);
          return `${emojiChar} → <code>${e.custom_emoji_id}</code>`;
        });
        bot.sendMessage(chatId,
          `🆔 <b>Custom emoji ID'лери:</b>\n\n${lines.join('\n')}\n\n` +
          `Бул ID'лерди мага бер — /start'ка кошуп берем.`,
          { parse_mode: 'HTML' }
        );
        return;
      }
    }
  }

  // ===== АДМИН ФЛОУ =====
  if (isAdmin(chatId) && session.adminStep) {
    if (session.adminStep === 'add_name' && msg.text) {
      session.adminNewName = msg.text.trim();
      session.adminStep = 'add_baseurl';
      bot.sendMessage(chatId, `🔗 Эми банктын линк үлгүсүн жазыңыз ("#" белгисине чейинки бөлүгү), мисалы:\nhttps://bakai.app/#`);
      return;
    }
    if (session.adminStep === 'add_baseurl' && msg.text) {
      session.adminNewBaseUrl = msg.text.trim();
      session.adminStep = 'add_qr';
      bot.sendMessage(chatId, `📸 Эми ошол банктын QR кодун сурет (фото) түрүндө жибериңиз:`);
      return;
    }
    if (session.adminStep === 'edit_name' && msg.text) {
      const banks = loadBanks();
      const bank = banks.find(b => b.id === session.adminEditId);
      if (bank) {
        bank.name = msg.text.trim();
        saveBanks(banks);
        bot.sendMessage(chatId, `✅ Аты жаңыртылды: <b>${bank.name}</b>`, { parse_mode: 'HTML' });
      }
      session.adminStep = null;
      session.adminEditId = null;
      showAdminMenu(chatId);
      return;
    }
    if ((session.adminStep === 'add_qr' || session.adminStep === 'edit_qr' || session.adminStep === 'set_global_qr')) {
      if (msg.photo) {
        handleQrPhoto(chatId, msg);
      } else {
        bot.sendMessage(chatId, `📸 QR кодду сурет (фото) түрүндө жибериңиз:`);
      }
      return;
    }
    if (session.adminStep && session.adminStep.startsWith('set_idphoto_')) {
      if (msg.photo) {
        const key = session.adminStep.replace('set_idphoto_', '');
        const fileId = msg.photo[msg.photo.length - 1].file_id;
        saveWithdrawIdPhoto(key, fileId);
        session.adminStep = null;
        bot.sendMessage(chatId, `✅ Сүрөт сакталды (${key}).`);
        showAdminMenu(chatId);
      } else {
        bot.sendMessage(chatId, `📷 Сүрөт (фото) түрүндө жибериңиз:`);
      }
      return;
    }
  }

  // /start, /admin, /myid кайра иштебесин
  if (msg.text && msg.text.startsWith('/')) return;

  // Вывод — телефон номери киргизүү
  if (session.step === 'waiting_withdraw_phone') {
    if (msg.text) {
      session.withdrawPhone = msg.text.trim();
      saveUserPhone(chatId, session.withdrawPhone);
      session.step = null;
      finishWithdraw(chatId);
    }
    return;
  }

  // Вывод — банктын QR кодун күтүү
  if (session.step === 'waiting_withdraw_qr') {
    if (msg.photo || msg.document) {
      session.withdrawQrFileId = msg.photo
        ? msg.photo[msg.photo.length - 1].file_id
        : msg.document.file_id;
      session.step = null;
      askWithdrawId(chatId);
    } else {
      bot.sendMessage(chatId, `📸 Отправьте <b>QR код вашего банка</b> (фото):`, { parse_mode: 'HTML' });
    }
    return;
  }

  // Вывод — букмекер ID күтүү
  if (session.step === 'waiting_withdraw_id') {
    if (msg.text) {
      session.withdrawUserId = msg.text.trim();
      saveUserAccountId(chatId, (session.withdrawSite || '').toLowerCase(), session.withdrawUserId);
      session.step = null;
      showWithdrawInstructions(chatId);
    }
    return;
  }

  // Вывод — букмекерден алынган код күтүү
  if (session.step === 'waiting_withdraw_code') {
    if (msg.text) {
      session.withdrawCode = msg.text.trim();
      session.step = null;
      const lang = getLang(chatId) || 'ru';
      sendWithdrawToGroup(chatId, msg);
      bot.sendMessage(chatId,
        t(lang, 'wd_accepted', session.withdrawSite || '—', session.withdrawUserId || '—', session.withdrawBank || '—', session.withdrawPhone || '—', session.withdrawCode),
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: t(lang, 'btn_main'), callback_data: 'main_menu' }]
            ]
          }
        }
      );
    }
    return;
  }

  // ID киргизүү
  if (session.step === 'waiting_id') {
    if (msg.text) {
      session.userId = msg.text.trim();
      saveUserAccountId(chatId, session.site, session.userId);
      session.step = null;
      askForAmount(chatId);
    }
    return;
  }

  // Сумма киргизүү (кол менен)
  if (session.step === 'waiting_amount') {
    const amount = parseInt(msg.text);
    if (isNaN(amount) || amount < 35 || amount > 200000) {
      bot.sendMessage(chatId,
        t(getLang(chatId) || 'ru', 'invalid_amount'),
        { parse_mode: 'HTML' }
      );
    } else {
      session.amount = withRandomKopecks(amount);
      session.step = null;
      showBankMenu(chatId);
    }
    return;
  }

  // Чек (скриншот) күтүү
  if (session.step === 'waiting_receipt') {
    if (msg.photo || msg.document) {
      showApplicationSent(chatId, msg);
    } else {
      bot.sendMessage(chatId,
        t(getLang(chatId) || 'ru', 'send_receipt'),
        { parse_mode: 'HTML' }
      );
    }
    return;
  }
});

console.log('🚀 MOLNIY KG Bot запущен!');
