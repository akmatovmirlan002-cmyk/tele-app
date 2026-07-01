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

// PostgreSQL байланышы (docker-compose менен дал келет)
export const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgres://molniy:molniy_pass@localhost:5432/molniy_bot';

