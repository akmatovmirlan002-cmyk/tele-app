const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const { Jimp } = require('jimp');
const jsQR = require('jsqr');

// ===== ТОКЕНДИ ОШО ЖЕРГЕ КОЙ =====
const TOKEN = '8957863642:AAGc1PYVGWTnlwBfdamGbDEtCDyD6UxvaQg';
// ==================================

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
const GROUP_CHAT_ID = -1003819679345; // мисалы: -1001234567890
// ====================================================================

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

// ===================== ЖАЗЫЛБАГАН ЗАЯВКАЛАР (ОПЕРАТОР КАРАЙ ТУРГАН) =====================
const pendingApplications = {};

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

  bot.sendMessage(chatId,
    `🎰 <b>Добро пожаловать в наш бот MOLNIY KG!</b>\n\n` +
    `💸 Пополнение — <b>0%</b>\n` +
    `💰 Вывод — <b>0%</b>\n` +
    `🕐 Работаем <b>24/7</b>\n\n` +
    `👨‍💼 Наш оператор: @help-MOLNIY-KG-bot\n\n` +
    `✅ <b>Спасибо за то что выбрали нас!</b>`,
    {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🚀 СТАРТ', callback_data: 'main_menu' }]
        ]
      }
    }
  );
});

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
  bot.sendMessage(chatId,
    `🏠 <b>Главное меню</b>\n\nВыберите действие:`,
    {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '💳 Пополнить', callback_data: 'deposit' },
            { text: '💸 Вывод', callback_data: 'withdraw' }
          ]
        ]
      }
    }
  );
}

// ===================== DEPOSIT — ВЫБОР САЙТА =====================
function showDepositMenu(chatId) {
  bot.sendMessage(chatId,
    `💳 <b>Пополнение счета</b>\n\nВыберите ваш способ:`,
    {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '1️⃣ 1XBET', callback_data: 'site_1xbet' },
            { text: '2️⃣ MELBET', callback_data: 'site_melbet' }
          ],
          [
            { text: '🔴 Отмена', callback_data: 'main_menu' }
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

  const siteLabel = site === '1xbet' ? '1XBET' : 'MTLBET';
  const savedIds = getSavedAccountIds(chatId, site);

  const rows = savedIds.map((id, i) => [{ text: `✅ ${id}`, callback_data: `use_saved_id_${i}` }]);
  rows.push([{ text: '🔴 Отмена', callback_data: 'main_menu' }]);

  const hint = savedIds.length ? `\n\n💡 Мурунку ID'лериңден тандай аласың:` : '';

  bot.sendPhoto(chatId,
    'https://i.imgur.com/placeholder_account.png', // фото жери — өз фотоңду кой
    {
      caption:
        `💳 <b>Пополнение счета</b>\n\n` +
        `Счет: <b>${siteLabel}</b>\n\n` +
        `📝 Введите ID счета:${hint}`,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: rows }
    }
  ).catch((err) => {
    console.log('[ASK_FOR_ID_PHOTO_ERR]', err.message);
    // Эгер фото жок болсо, жөн текст жибер
    bot.sendMessage(chatId,
      `💳 <b>Пополнение счета</b>\n\n` +
      `Счет: <b>${siteLabel}</b>\n\n` +
      `📝 Введите ID счета:${hint}`,
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

  bot.sendMessage(chatId,
    `💳 <b>Пополнение счета</b>\n\n` +
    `📊 Минимум: <b>35</b>\n` +
    `📊 Максимум: <b>200 000</b>\n\n` +
    `💰 Введите сумму пополнения:`,
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
            { text: '🔴 Отмена', callback_data: 'main_menu' }
          ]
        ]
      }
    }
  );
}

// ===================== ВЫБОР БАНКА (КЛИЕНТ) =====================
function showBankMenu(chatId) {
  const session = getSession(chatId);
  session.step = 'waiting_receipt';
  session.paymentStart = Date.now();

  const banks = loadBanks();
  const rows = banks.map(b => [{ text: b.name, url: `${b.baseUrl}${b.hash}` }]);
  rows.push([{ text: '❌ Отмена', callback_data: 'main_menu' }]);

  bot.sendMessage(chatId,
    `💳 <b>Пополнение счета</b>\n\n` +
    `👤 Ваш ID: <code>${session.userId}</code>\n` +
    `💰 Сумма к оплате: <b>${session.amount} сом</b>\n\n` +
    `🏦 Банкты тандап, өтөгүлдү басыңыз:\n` +
    `⏳ У вас есть <b>5 минут</b> на оплату\n` +
    `📸 Төлөгөндөн кийин чек (скриншот) жибериңиз`,
    {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: rows }
    }
  );
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
    paymentStart: session.paymentStart,
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
        { text: '⏳ Иштетүү', callback_data: `app_process_${appId}` },
        { text: '✅ Бекитүү', callback_data: `app_approve_${appId}` }
      ],
      [
        { text: '❌ Четке кагуу', callback_data: `app_cancel_${appId}` },
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
  const siteLabel = session.site === '1xbet' ? '1XBET' : 'MELBET';

  sendApplicationToGroup(chatId, msg);

  bot.sendMessage(chatId,
    `✅ <b>Заявка отправлена!</b>\n\n` +
    `💰 Сумма: <b>${session.amount} сом</b>\n` +
    `🎰 ID счета: <b>${siteLabel}</b>\n` +
    `👤 ID: <code>${session.userId}</code>\n\n` +
    `⏳ <b>Ожидайте подтверждения от оператора.</b>\n` +
    `🕐 Время обработки: до 5 минут.`,
    {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🏠 Главное меню', callback_data: 'main_menu' }]
        ]
      }
    }
  );
}

// ===================== БАЛАНС ПОПОЛНЕН =====================
function confirmPayment(app) {
  const elapsed = Math.round((Date.now() - (app.paymentStart || Date.now())) / 1000);

  bot.sendMessage(app.chatId,
    `🎉 <b>Ваш баланс пополнен!</b>\n\n` +
    `💰 Сумма: <b>${app.amount} сом</b>\n` +
    `🎰 Счет: <b>${app.site}</b>\n` +
    `👤 ID: <code>${app.userId}</code>\n` +
    `⚡ Закрыто за: <b>${elapsed}с</b>`,
    {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🏠 Главное меню', callback_data: 'main_menu' }]
        ]
      }
    }
  );
}

// ===================== ВЫВОД =====================
function showWithdraw(chatId) {
  bot.sendMessage(chatId,
    `💸 <b>Вывод средств</b>\n\n` +
    `👨‍💼 Для вывода обратитесь к оператору:\n@help-MOLNIY-KG-bot`,
    {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔴 Назад', callback_data: 'main_menu' }]
        ]
      }
    }
  );
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

  bot.sendMessage(chatId,
    `⚙️ <b>Админ панель — Банктар</b>\n\nБанк кошуу, аты/QR'ын өзгөртүү же өчүрүү:`,
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

    if (session.adminStep === 'add_qr') {
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
    session.amount = amount;
    session.step = null;
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
    bot.sendMessage(app.chatId, `⏳ <b>Сиздин арызыңыз оператор тарабынан каралып жатат...</b>`, { parse_mode: 'HTML' });
    bot.editMessageReplyMarkup(
      { inline_keyboard: [
        [
          { text: '⏳ Иштетилип жатат...', callback_data: 'noop' },
          { text: '✅ Бекитүү', callback_data: `app_approve_${appId}` }
        ],
        [
          { text: '❌ Четке кагуу', callback_data: `app_cancel_${appId}` },
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
      { inline_keyboard: [[{ text: '✅ Бекитилди', callback_data: 'noop' }]] },
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
    bot.sendMessage(app.chatId,
      `❌ <b>Сиздин арызыңыз четке кагылды.</b>\n\n` +
      `Маалымат туура эмес же чек ылайык эмес болсо болот. Оператор менен байланышыңыз: @help-MOLNIY-KG-bot`,
      { parse_mode: 'HTML' }
    );
    bot.editMessageReplyMarkup(
      { inline_keyboard: [[{ text: '❌ Четке кагылды', callback_data: 'noop' }]] },
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
    bot.sendMessage(app.chatId, `🚫 <b>Сиз ботту колдонуудан бандалдыңыз.</b>`, { parse_mode: 'HTML' }).catch(() => {});
    bot.editMessageReplyMarkup(
      { inline_keyboard: [[{ text: '🚫 Бандалды', callback_data: 'noop' }]] },
      { chat_id: chatId, message_id: query.message.message_id }
    ).catch(() => {});
    delete pendingApplications[appId];
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

  if (!isAdmin(chatId) && chatId !== GROUP_CHAT_ID && isBanned(chatId)) {
    return;
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
    if ((session.adminStep === 'add_qr' || session.adminStep === 'edit_qr')) {
      if (msg.photo) {
        handleQrPhoto(chatId, msg);
      } else {
        bot.sendMessage(chatId, `📸 QR кодду сурет (фото) түрүндө жибериңиз:`);
      }
      return;
    }
  }

  // /start, /admin, /myid кайра иштебесин
  if (msg.text && msg.text.startsWith('/')) return;

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
        `❌ Неверная сумма! Введите от <b>35</b> до <b>200 000</b>:`,
        { parse_mode: 'HTML' }
      );
    } else {
      session.amount = amount;
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
        `📸 Пожалуйста, отправьте <b>фото чека</b> (скриншот):`,
        { parse_mode: 'HTML' }
      );
    }
    return;
  }
});

console.log('🚀 MOLNIY KG Bot запущен!');
