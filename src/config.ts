// ===== Негизги конфигурация (өзгөртсөң болот) =====
// Токен .env файлынан (BOT_TOKEN) алынат
export const TOKEN = process.env.BOT_TOKEN || '';
if (!TOKEN) {
  console.error('❌ BOT_TOKEN коюлган жок! .env файлга BOT_TOKEN=... жазыңыз.');
  process.exit(1);
}

export const BRAND = 'MOLNIY KG';
export const OPERATOR = '@WEEFtON';

// Админдердин Telegram ID'лери
export const ADMIN_IDS: number[] = [
  8747316694,
];

// Пополнение заявкалары жибериле турган группа
export const GROUP_CHAT_ID: number | null = -1003819679345;

// Вывод заявкалары жибериле турган группа
export const WITHDRAW_GROUP_CHAT_ID: number | null = -1004408979821;

export const MAX_SAVED_IDS = 3;

// Демейки банктар — база таза болгондо коюлат. Хеш ЖОК (бош):
// бардык банк баскычтары жалпы QR'дын хешин колдонот — админ QR'ды алмаштырса, баары жаңырат.
export const DEFAULT_BANKS = [
  { id: 'bakai', name: '🏦 Bakai Bank', baseUrl: 'https://bakai.app/#', hash: '' },
  { id: 'dengi', name: '🏦 O!Dengi', baseUrl: 'https://api.dengi.o.kg/#', hash: '' },
  { id: 'mbank', name: '🏦 MBANK', baseUrl: 'https://app.mbank.kg/qr/#', hash: '' },
  { id: 'megapay', name: '🏦 MegaPay', baseUrl: 'https://megapay.kg/get#', hash: '' },
];

// 1xBet/Melbet кассир API (CashdeskBotAPI)
export const CASHDESK = {
  url: process.env.CASHDESK_URL || 'https://partners.servcul.com/CashdeskBotAPI',
  cashdeskId: process.env.CASHDESK_ID || '1471068',
  hash: process.env.CASHDESK_HASH || 'fa8d3b8fe2e413ce067379ea545643059a4a11e48ec9a88fb6d5708ea28f72f6',
  cashierpass: process.env.CASHDESK_PASS || '', // ⚠️ .env'ге кой
  login: process.env.CASHDESK_LOGIN || '',
  currencyId: Number(process.env.CASHDESK_CURRENCY || 7), // 7 = KGS (кыргыз сом)
};

// PostgreSQL байланышы (docker-compose менен дал келет)
export const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgres://molniy:molniy_pass@localhost:5432/molniy_bot';

