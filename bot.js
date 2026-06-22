const TelegramBot = require('node-telegram-bot-api');

// ===== ТОКЕНДИ ОШО ЖЕРГЕ КОЙ =====
const TOKEN = 'YOUR_BOT_TOKEN_HERE';
// ==================================

const bot = new TelegramBot(TOKEN, { polling: true });

// Колдонуучунун маалыматтарын сактоо
const userSessions = {};

function getSession(chatId) {
  if (!userSessions[chatId]) {
    userSessions[chatId] = {};
  }
  return userSessions[chatId];
}

// ===================== START =====================
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  userSessions[chatId] = {}; // сессияны тазала

  bot.sendMessage(chatId,
    `🎰 *Добро пожаловать в наш бот MOLNIY KG!*\n\n` +
    `💸 Пополнение — *0%*\n` +
    `💰 Вывод — *0%*\n` +
    `🕐 Работаем *24/7*\n\n` +
    `👨‍💼 Наш оператор: @help\\-MOLNIY\\-KG\\-bot\n\n` +
    `✅ *Спасибо за то что выбрали нас!*`,
    {
      parse_mode: 'MarkdownV2',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🚀 СТАРТ', callback_data: 'main_menu' }]
        ]
      }
    }
  );
});

// ===================== MAIN MENU =====================
function showMainMenu(chatId) {
  bot.sendMessage(chatId,
    `🏠 *Главное меню*\n\nВыберите действие:`,
    {
      parse_mode: 'Markdown',
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
    `💳 *Пополнение счета*\n\nВыберите ваш способ:`,
    {
      parse_mode: 'Markdown',
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

  bot.sendPhoto(chatId,
    'https://i.imgur.com/placeholder_account.png', // фото жери — өз фотоңду кой
    {
      caption:
        `💳 *Пополнение счета*\n\n` +
        `Счет: *${siteLabel}*\n\n` +
        `📝 Введите ID счета:`,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔴 Отмена', callback_data: 'main_menu' }]
        ]
      }
    }
  ).catch(() => {
    // Эгер фото жок болсо, жөн текст жибер
    bot.sendMessage(chatId,
      `💳 *Пополнение счета*\n\n` +
      `Счет: *${siteLabel}*\n\n` +
      `📝 Введите ID счета:`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔴 Отмена', callback_data: 'main_menu' }]
          ]
        }
      }
    );
  });
}

// ===================== ВВОД СУММЫ =====================
function askForAmount(chatId) {
  const session = getSession(chatId);
  session.step = 'waiting_amount';

  bot.sendMessage(chatId,
    `💳 *Пополнение счета*\n\n` +
    `📊 Минимум: *35*\n` +
    `📊 Максимум: *200 000*\n\n` +
    `💰 Введите сумму пополнения:`,
    {
      parse_mode: 'Markdown',
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

// ===================== ВЫБОР БАНКА =====================
function showBankMenu(chatId) {
  const session = getSession(chatId);
  session.step = 'waiting_receipt';
  session.paymentStart = Date.now();

  const siteLabel = session.site === '1xbet' ? '1XBET' : 'MELBET';

  bot.sendPhoto(chatId,
    'https://i.imgur.com/placeholder_payment.png', // төлөм фотосу — өз фотоңду кой
    {
      caption:
        `💳 *Пополнение счета*\n\n` +
        `👤 Ваш ID: \`${session.userId}\`\n` +
        `💰 Сумма к оплате: *${session.amount} сом*\n\n` +
        `⏳ У вас есть *5 минут* на оплату\n` +
        `📸 Чек отправьте после оплаты`,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🏦 MBANK', callback_data: 'bank_mbank' },
            { text: '🏦 O!Bank', callback_data: 'bank_obank' }
          ],
          [
            { text: '🏦 Optima24', callback_data: 'bank_optima' },
            { text: '🏦 DemirBank', callback_data: 'bank_demir' }
          ],
          [
            { text: '🏦 Bakai Bank', callback_data: 'bank_bakai' }
          ],
          [
            { text: '❌ Отмена', callback_data: 'main_menu' }
          ]
        ]
      }
    }
  ).catch(() => {
    bot.sendMessage(chatId,
      `💳 *Пополнение счета*\n\n` +
      `👤 Ваш ID: \`${session.userId}\`\n` +
      `💰 Сумма к оплате: *${session.amount} сом*\n\n` +
      `⏳ У вас есть *5 минут* на оплату\n` +
      `📸 Чек отправьте после оплаты`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🏦 MBANK', callback_data: 'bank_mbank' },
              { text: '🏦 O!Bank', callback_data: 'bank_obank' }
            ],
            [
              { text: '🏦 Optima24', callback_data: 'bank_optima' },
              { text: '🏦 DemirBank', callback_data: 'bank_demir' }
            ],
            [
              { text: '🏦 Bakai Bank', callback_data: 'bank_bakai' }
            ],
            [
              { text: '❌ Отмена', callback_data: 'main_menu' }
            ]
          ]
        }
      }
    );
  });
}

// ===================== ЗАЯВКА ОТПРАВЛЕНА =====================
function showApplicationSent(chatId) {
  const session = getSession(chatId);
  const siteLabel = session.site === '1xbet' ? '1XBET' : 'MELBET';

  bot.sendMessage(chatId,
    `✅ *Заявка отправлена!*\n\n` +
    `💰 Сумма: *${session.amount} сом*\n` +
    `🎰 ID счета: *${siteLabel}*\n` +
    `👤 ID: \`${session.userId}\`\n\n` +
    `⏳ *Ожидайте подтверждения от оператора.*\n` +
    `🕐 Время обработки: до 5 минут.`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🏠 Главное меню', callback_data: 'main_menu' }]
        ]
      }
    }
  );

  // Симуляция подтверждения оператором (5-10 секунд демо)
  // Реалдуу ботто — оператор өзү тастыктайт
  setTimeout(() => {
    confirmPayment(chatId);
  }, 8000); // 8 секунддан кийин авто-тастыктоо (ДЕМО ГАНА)
}

// ===================== БАЛАНС ПОПОЛНЕН =====================
function confirmPayment(chatId) {
  const session = getSession(chatId);
  const siteLabel = session.site === '1xbet' ? '1XBET' : 'MELBET';
  const elapsed = Math.round((Date.now() - session.paymentStart) / 1000);

  bot.sendMessage(chatId,
    `🎉 *Ваш баланс пополнен!*\n\n` +
    `💰 Сумма: *${session.amount} сом*\n` +
    `🎰 Счет: *${siteLabel}*\n` +
    `👤 ID: \`${session.userId}\`\n` +
    `⚡ Закрыто за: *${elapsed}с*`,
    {
      parse_mode: 'Markdown',
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
    `💸 *Вывод средств*\n\n` +
    `👨‍💼 Для вывода обратитесь к оператору:\n@help\\-MOLNIY\\-KG\\-bot`,
    {
      parse_mode: 'MarkdownV2',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔴 Назад', callback_data: 'main_menu' }]
        ]
      }
    }
  );
}

// ===================== CALLBACK HANDLER =====================
bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  const session = getSession(chatId);

  bot.answerCallbackQuery(query.id);

  if (data === 'main_menu') {
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
  else if (data.startsWith('amount_')) {
    const amount = data.replace('amount_', '');
    session.amount = amount;
    session.step = null;
    showBankMenu(chatId);
  }
  else if (data.startsWith('bank_')) {
    const bankNames = {
      bank_mbank: 'MBANK',
      bank_obank: 'O!Bank',
      bank_optima: 'Optima24',
      bank_demir: 'DemirBank',
      bank_bakai: 'Bakai Bank'
    };
    session.bank = bankNames[data];
    session.step = 'waiting_receipt';
    bot.sendMessage(chatId,
      `✅ Выбран банк: *${session.bank}*\n\n📸 Отправьте скриншот чека:`,
      { parse_mode: 'Markdown' }
    );
  }
});

// ===================== MESSAGE HANDLER =====================
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const session = getSession(chatId);

  // /start кайра иштебесин
  if (msg.text && msg.text.startsWith('/')) return;

  // ID киргизүү
  if (session.step === 'waiting_id') {
    if (msg.text) {
      session.userId = msg.text.trim();
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
        `❌ Неверная сумма! Введите от *35* до *200 000*:`,
        { parse_mode: 'Markdown' }
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
      showApplicationSent(chatId);
    } else {
      bot.sendMessage(chatId,
        `📸 Пожалуйста, отправьте *фото чека* (скриншот):`,
        { parse_mode: 'Markdown' }
      );
    }
    return;
  }
});

console.log('🚀 MOLNIY KG Bot запущен!');
