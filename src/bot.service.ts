import { Injectable, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { Jimp } from 'jimp';
import * as jsQR from 'jsqr';
import * as QRCode from 'qrcode';
import TelegramBot = require('node-telegram-bot-api');

import { StorageService } from './storage.service';
import { I18nService } from './i18n.service';
import {
  TOKEN, ADMIN_IDS, GROUP_CHAT_ID, WITHDRAW_GROUP_CHAT_ID,
} from './config';

const ROOT = path.join(__dirname, '..');

const WITHDRAW_BANKS = [
  { id: 'mbank', name: '🏦 МБанк' },
  { id: 'odengi', name: '🏦 О!Деньги' },
  { id: 'kompanion', name: '🏦 Компаньон' },
  { id: 'bakai', name: '🏦 Бакай' },
  { id: 'optima', name: '🏦 Оптима' },
];

const BANK_TEMPLATES = [
  { name: '🏦 Bakai Bank', baseUrl: 'https://bakai.app/#' },
  { name: '🏦 MBANK', baseUrl: 'https://app.mbank.kg/qr/#' },
  { name: '🏦 O!Dengi', baseUrl: 'https://api.dengi.o.kg/#' },
  { name: '🏦 MegaPay', baseUrl: 'https://megapay.kg/get#' },
];

@Injectable()
export class BotService implements OnModuleInit {
  private bot: any;
  private sessions: Record<number, any> = {};
  private pendingApplications: Record<string, any> = {};
  private pendingWithdrawals: Record<string, any> = {};
  private processedCallbackIds = new Set<string>();

  constructor(
    private readonly storage: StorageService,
    private readonly i18n: I18nService,
  ) {}

  onModuleInit() {
    this.bot = new TelegramBot(TOKEN, { polling: false });
    this.bot.deleteWebHook({ drop_pending_updates: true })
      .catch(() => {})
      .finally(() => this.bot.startPolling());

    const shutdown = () => this.bot.stopPolling().finally(() => process.exit(0));
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    this.registerHandlers();
    console.log('🚀 MOLNIY KG Bot (NestJS) запущен!');
  }

  // ===== Жардамчылар =====
  private t(lang: string | null, key: string, ...args: any[]) { return this.i18n.t(lang, key, ...args); }
  private getLang(chatId: number) { return this.storage.getLang(chatId); }
  private isAdmin(chatId: number) { return ADMIN_IDS.includes(chatId); }
  private session(chatId: number) {
    if (!this.sessions[chatId]) this.sessions[chatId] = {};
    return this.sessions[chatId];
  }
  private makeApplicationId() { return `${Date.now()}_${Math.floor(Math.random() * 10000)}`; }
  private isDuplicateCallback(id: string) {
    if (this.processedCallbackIds.has(id)) return true;
    this.processedCallbackIds.add(id);
    if (this.processedCallbackIds.size > 500) {
      const first = this.processedCallbackIds.values().next().value;
      this.processedCallbackIds.delete(first);
    }
    return false;
  }
  private withRandomKopecks(amount: any) {
    const kopecks = Math.floor(Math.random() * 99) + 1;
    return (parseInt(amount, 10) + kopecks / 100).toFixed(2);
  }
  private extractHash(qrText: string) {
    const idx = qrText.lastIndexOf('#');
    return idx === -1 ? qrText : qrText.slice(idx + 1);
  }
  private makeBankId(name: string) {
    const base = name.toLowerCase().replace(/[^a-z0-9а-яёң]+/gi, '_').replace(/^_+|_+$/g, '');
    return `${base}_${Date.now()}`;
  }
  private async decodeQrFromFileId(fileId: string) {
    const fileUrl = await this.bot.getFileLink(fileId);
    const res = await fetch(fileUrl);
    const buffer = Buffer.from(await res.arrayBuffer());
    const image = await Jimp.read(buffer);
    const { data, width, height } = image.bitmap;
    const result = (jsQR as any)(new Uint8ClampedArray(data), width, height);
    return result ? result.data.trim() : null;
  }

  // QR код жок болсо — бот техникалык иштер режиминде
  private isMaintenance() { return !this.storage.loadGlobalQrHash(); }
  private sendTechWork(chatId: number) {
    const lang = this.getLang(chatId) || 'ru';
    this.bot.sendMessage(chatId, this.t(lang, 'tech_work'), { parse_mode: 'HTML' }).catch(() => {});
  }

  // QR код түзүлбөй калса: админдерге билдирүү + кардарга "техникалык иштер"
  private handleQrFailure(chatId: number, reason: string) {
    const lang = this.getLang(chatId) || 'ru';
    const session = this.session(chatId);
    session.step = null;
    clearTimeout(session.paymentTimer);
    for (const adminId of ADMIN_IDS) {
      this.bot.sendMessage(adminId,
        `⚠️ <b>QR код түзүлбөй жатат!</b>\n\n` +
        `👤 Клиент: <code>${chatId}</code>\n` +
        `💰 Сумма: <b>${session.amount || '—'}</b>\n` +
        `❗️ Себеп: ${reason}`,
        { parse_mode: 'HTML' }).catch(() => {});
    }
    this.bot.sendMessage(chatId, this.t(lang, 'tech_work'), { parse_mode: 'HTML' }).catch(() => {});
  }

  private langKeyboard() {
    return { inline_keyboard: [[
      { text: '🇰🇬 Кыргызча', callback_data: 'setlang_ky' },
      { text: '🇷🇺 Русский', callback_data: 'setlang_ru' },
    ]] };
  }
  private mainMenu(lang: string) {
    return { inline_keyboard: [
      [
        { text: '🇰🇬 Кыргызча', callback_data: 'setlang_ky' },
        { text: '🇷🇺 Русский', callback_data: 'setlang_ru' },
      ],
      [
        { text: this.t(lang, 'btn_deposit'), callback_data: 'deposit' },
        { text: this.t(lang, 'btn_withdraw'), callback_data: 'withdraw' },
      ],
      [{ text: this.t(lang, 'btn_support'), callback_data: 'support' }],
    ] };
  }

  // ===================== ЭКРАНДАР =====================
  private showWelcome(chatId: number, name: string, lang: string) {
    this.bot.sendMessage(chatId, this.t(lang, 'welcome', name), { parse_mode: 'HTML', reply_markup: this.mainMenu(lang) });
  }
  private showMainMenu(chatId: number) {
    const lang = this.getLang(chatId) || 'ru';
    this.bot.sendMessage(chatId, this.t(lang, 'main_title'), { parse_mode: 'HTML', reply_markup: this.mainMenu(lang) });
  }
  private showDepositMenu(chatId: number) {
    const lang = this.getLang(chatId) || 'ru';
    this.bot.sendMessage(chatId, this.t(lang, 'dep_choose_site'), {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [
        [{ text: '1️⃣ 1XBET', callback_data: 'site_1xbet' }, { text: '2️⃣ MELBET', callback_data: 'site_melbet' }],
        [{ text: this.t(lang, 'btn_cancel'), callback_data: 'main_menu' }],
      ] },
    });
  }
  private askForId(chatId: number, site: string) {
    const session = this.session(chatId);
    const lang = this.getLang(chatId) || 'ru';
    session.site = site;
    session.step = 'waiting_id';
    const siteLabel = site === '1xbet' ? '1XBET' : 'MELBET';
    const savedIds = this.storage.getSavedAccountIds(chatId, site);
    const rows: any[] = savedIds.map((id, i) => [{ text: `✅ ${id}`, callback_data: `use_saved_id_${i}` }]);
    rows.push([{ text: this.t(lang, 'btn_cancel'), callback_data: 'main_menu' }]);
    const hint = savedIds.length ? this.t(lang, 'hint_prev_ids') : '';
    const caption = this.t(lang, 'dep_enter_id', siteLabel, hint);
    const photoId = this.storage.getWithdrawIdPhoto('deposit_account');
    if (!photoId) {
      this.bot.sendMessage(chatId, caption, { parse_mode: 'HTML', reply_markup: { inline_keyboard: rows } });
      return;
    }
    this.bot.sendPhoto(chatId, photoId, { caption, parse_mode: 'HTML', reply_markup: { inline_keyboard: rows } })
      .catch(() => this.bot.sendMessage(chatId, caption, { parse_mode: 'HTML', reply_markup: { inline_keyboard: rows } }));
  }
  private askForAmount(chatId: number) {
    const session = this.session(chatId);
    session.step = 'waiting_amount';
    const lang = this.getLang(chatId) || 'ru';
    this.bot.sendMessage(chatId, this.t(lang, 'dep_enter_amount'), {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [
        [{ text: '100', callback_data: 'amount_100' }, { text: '200', callback_data: 'amount_200' }, { text: '500', callback_data: 'amount_500' }],
        [{ text: '1000', callback_data: 'amount_1000' }, { text: '2000', callback_data: 'amount_2000' }, { text: '5000', callback_data: 'amount_5000' }],
        [{ text: this.t(lang, 'btn_cancel'), callback_data: 'main_menu' }],
      ] },
    });
  }
  private async showBankMenu(chatId: number) {
    const session = this.session(chatId);
    const lang = this.getLang(chatId) || 'ru';
    session.step = 'waiting_receipt';
    session.paymentStart = Date.now();
    session.receiptSent = false;
    const token = session.paymentStart;
    clearTimeout(session.paymentTimer);
    session.paymentTimer = setTimeout(() => {
      const s = this.session(chatId);
      if (s.step === 'waiting_receipt' && s.paymentStart === token && !s.receiptSent) {
        s.step = null;
        this.bot.sendMessage(chatId, this.t(lang, 'timeout_cancel'), { parse_mode: 'HTML' })
          .finally(() => this.showMainMenu(chatId));
      }
    }, 5 * 60 * 1000);

    const banks = this.storage.loadBanks();
    const items: any[] = banks.map((b) => ({ text: b.name, url: `${b.baseUrl}${b.hash}` }));
    items.push({ text: this.t(lang, 'btn_cancel2'), callback_data: 'main_menu' });
    const rows: any[] = [];
    for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));
    const caption = this.t(lang, 'bank_caption', session.userId, session.amount);

    const link = this.storage.loadGlobalQrHash();
    if (!link) {
      this.handleQrFailure(chatId, 'showBankMenu: QR код коюлган жок');
      return;
    }
    try {
      const qrBuffer = await QRCode.toBuffer(link, { type: 'png', width: 512, margin: 2, errorCorrectionLevel: 'M' });
      await this.bot.sendPhoto(chatId, qrBuffer, { caption, parse_mode: 'HTML', reply_markup: { inline_keyboard: rows } });
    } catch (err) {
      console.log('[QR_GEN_ERR]', err.message);
      this.handleQrFailure(chatId, `showBankMenu: ${err.message}`);
    }
  }
  private async sendGlobalQr(chatId: number) {
    const session = this.session(chatId);
    const lang = this.getLang(chatId) || 'ru';
    const link = this.storage.loadGlobalQrHash();
    if (!link) { this.handleQrFailure(chatId, 'sendGlobalQr: QR код коюлган жок'); return; }
    session.bank = 'QR';
    session.step = 'waiting_receipt';
    const rows: any[] = [];
    if (/^https?:\/\//i.test(link)) rows.push([{ text: '🔗 ' + (lang === 'ky' ? 'Төлөө шилтемеси' : 'Ссылка для оплаты'), url: link }]);
    rows.push([{ text: this.t(lang, 'btn_back'), callback_data: 'back_to_banks' }]);
    rows.push([{ text: this.t(lang, 'btn_cancel2'), callback_data: 'main_menu' }]);
    const caption = this.t(lang, 'qr_caption', session.userId, session.amount);
    try {
      const qrBuffer = await QRCode.toBuffer(link, { type: 'png', width: 512, margin: 2, errorCorrectionLevel: 'M' });
      await this.bot.sendPhoto(chatId, qrBuffer, { caption, parse_mode: 'HTML', reply_markup: { inline_keyboard: rows } });
    } catch (err) {
      console.log('[QR_GEN_ERR]', err.message);
      this.handleQrFailure(chatId, `sendGlobalQr: ${err.message}`);
    }
  }
  private sendApplicationToGroup(chatId: number, msg: any) {
    if (!GROUP_CHAT_ID) return;
    const session = this.session(chatId);
    const siteLabel = session.site === '1xbet' ? '1XBET' : 'MELBET';
    const from = msg.from;
    const username = from.username ? `@${from.username}` : '—';
    const appId = this.makeApplicationId();
    this.pendingApplications[appId] = {
      chatId, amount: session.amount, site: siteLabel, userId: session.userId,
      bank: session.bank || '—', receiptSentAt: Date.now(), status: 'new',
    };
    const caption =
      `🆕 <b>Жаңы заявка</b>\n\n` +
      `👤 Клиент: <b>${from.first_name || ''} ${from.last_name || ''}</b> (${username})\n` +
      `🆔 Chat ID: <code>${chatId}</code>\n\n` +
      `🎰 Сайт: <b>${siteLabel}</b>\n` +
      `👤 Счет ID: <code>${session.userId}</code>\n` +
      `💰 Сумма: <b>${session.amount} сом</b>\n` +
      `🏦 Банк: <b>${session.bank || '—'}</b>`;
    const buttons = { inline_keyboard: [
      [{ text: '⏳ Обработать', callback_data: `app_process_${appId}` }, { text: '✅ Подтвердить', callback_data: `app_approve_${appId}` }],
      [{ text: '❌ Отмена', callback_data: `app_cancel_${appId}` }, { text: '🚫 Бан', callback_data: `app_ban_${appId}` }],
    ] };
    if (msg.photo) this.bot.sendPhoto(GROUP_CHAT_ID, msg.photo[msg.photo.length - 1].file_id, { caption, parse_mode: 'HTML', reply_markup: buttons });
    else if (msg.document) this.bot.sendDocument(GROUP_CHAT_ID, msg.document.file_id, { caption, parse_mode: 'HTML', reply_markup: buttons });
    else this.bot.sendMessage(GROUP_CHAT_ID, caption, { parse_mode: 'HTML', reply_markup: buttons });
  }
  private showApplicationSent(chatId: number, msg: any) {
    const session = this.session(chatId);
    const lang = this.getLang(chatId) || 'ru';
    const siteLabel = session.site === '1xbet' ? '1XBET' : 'MELBET';
    session.receiptSent = true;
    session.step = null;
    clearTimeout(session.paymentTimer);
    this.sendApplicationToGroup(chatId, msg);
    this.bot.sendMessage(chatId, this.t(lang, 'app_sent', session.amount, siteLabel, session.userId), {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [[{ text: this.t(lang, 'btn_main'), callback_data: 'main_menu' }]] },
    });
  }
  private confirmPayment(app: any) {
    const realSeconds = (Date.now() - (app.receiptSentAt || Date.now())) / 1000;
    const elapsed = Math.max(1, Math.round(realSeconds / 2));
    const lang = this.getLang(app.chatId) || 'ru';
    this.bot.sendMessage(app.chatId, this.t(lang, 'balance_done', app.amount, app.site, app.userId, elapsed), {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [[{ text: this.t(lang, 'btn_main'), callback_data: 'main_menu' }]] },
    });
  }

  // ===== Вывод =====
  private showWithdraw(chatId: number) {
    const lang = this.getLang(chatId) || 'ru';
    this.bot.sendMessage(chatId, this.t(lang, 'wd_choose_bm'), {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [
        [{ text: '1️⃣ 1XBET', callback_data: 'withdraw_1xbet' }, { text: '2️⃣ MELBET', callback_data: 'withdraw_melbet' }],
        [{ text: this.t(lang, 'btn_cancel'), callback_data: 'main_menu' }],
      ] },
    });
  }
  private showWithdrawBanks(chatId: number) {
    const lang = this.getLang(chatId) || 'ru';
    const items: any[] = WITHDRAW_BANKS.map((b) => ({ text: b.name, callback_data: `wbank_${b.id}` }));
    items.push({ text: this.t(lang, 'btn_cancel'), callback_data: 'main_menu' });
    const rows: any[] = [];
    for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));
    this.bot.sendMessage(chatId, this.t(lang, 'wd_choose_method'), { parse_mode: 'HTML', reply_markup: { inline_keyboard: rows } });
  }
  private askWithdrawId(chatId: number) {
    const session = this.session(chatId);
    const lang = this.getLang(chatId) || 'ru';
    session.step = 'waiting_withdraw_id';
    const site = session.withdrawSite || '';
    const savedIds = this.storage.getSavedAccountIds(chatId, site.toLowerCase());
    const idRows: any[] = savedIds.map((id, i) => [{ text: `✅ ${id}`, callback_data: `use_wid_${i}` }]);
    idRows.push([{ text: this.t(lang, 'btn_cancel'), callback_data: 'main_menu' }]);
    const hint = savedIds.length ? this.t(lang, 'hint_prev_ids') : '';
    const caption = this.t(lang, 'wd_enter_id', site, hint);
    const markup = { inline_keyboard: idRows };
    const fileId = this.storage.getWithdrawIdPhoto(site.toLowerCase());
    if (fileId) {
      this.bot.sendPhoto(chatId, fileId, { caption, parse_mode: 'HTML', reply_markup: markup })
        .catch(() => this.bot.sendMessage(chatId, caption, { parse_mode: 'HTML', reply_markup: markup }));
      return;
    }
    const exts = ['jpg', 'jpeg', 'png', 'webp'];
    for (const ext of exts) {
      const p = path.join(ROOT, 'assets', `id_${site.toLowerCase()}.${ext}`);
      if (fs.existsSync(p)) {
        this.bot.sendPhoto(chatId, p, { caption, parse_mode: 'HTML', reply_markup: markup })
          .catch(() => this.bot.sendMessage(chatId, caption, { parse_mode: 'HTML', reply_markup: markup }));
        return;
      }
    }
    this.bot.sendMessage(chatId, caption, { parse_mode: 'HTML', reply_markup: markup });
  }
  private showWithdrawInstructions(chatId: number) {
    const session = this.session(chatId);
    const lang = this.getLang(chatId) || 'ru';
    session.step = 'waiting_withdraw_code';
    const caption = this.t(lang, 'wd_instructions');
    const markup = { inline_keyboard: [[{ text: this.t(lang, 'btn_cancel'), callback_data: 'main_menu' }]] };
    const fileId = this.storage.getWithdrawIdPhoto('instruction');
    if (fileId) {
      this.bot.sendPhoto(chatId, fileId, { caption, parse_mode: 'HTML', reply_markup: markup })
        .catch(() => this.bot.sendMessage(chatId, caption, { parse_mode: 'HTML', reply_markup: markup }));
    } else {
      this.bot.sendMessage(chatId, caption, { parse_mode: 'HTML', reply_markup: markup });
    }
  }
  private finishWithdraw(chatId: number) {
    const session = this.session(chatId);
    const lang = this.getLang(chatId) || 'ru';
    session.step = 'waiting_withdraw_qr';
    this.bot.sendMessage(chatId, this.t(lang, 'wd_send_qr', session.withdrawBank || '', session.withdrawPhone || '—'), {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [[{ text: this.t(lang, 'btn_cancel'), callback_data: 'main_menu' }]] },
    });
  }
  private sendWithdrawToGroup(chatId: number, msg: any) {
    const targetGroup = WITHDRAW_GROUP_CHAT_ID || GROUP_CHAT_ID;
    if (!targetGroup) return;
    const session = this.session(chatId);
    const from = msg.from;
    const username = from.username ? `@${from.username}` : '—';
    const appId = this.makeApplicationId();
    this.pendingWithdrawals[appId] = {
      chatId, site: session.withdrawSite, userId: session.withdrawUserId,
      bank: session.withdrawBank, phone: session.withdrawPhone, code: session.withdrawCode, status: 'new',
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
    const buttons = { inline_keyboard: [[
      { text: '✅ Подтвердить', callback_data: `wapp_approve_${appId}` },
      { text: '❌ Отмена', callback_data: `wapp_cancel_${appId}` },
    ]] };
    if (session.withdrawQrFileId) {
      this.bot.sendPhoto(targetGroup, session.withdrawQrFileId, { caption, parse_mode: 'HTML', reply_markup: buttons })
        .catch(() => this.bot.sendMessage(targetGroup, caption, { parse_mode: 'HTML', reply_markup: buttons }));
    } else {
      this.bot.sendMessage(targetGroup, caption, { parse_mode: 'HTML', reply_markup: buttons });
    }
  }

  // ===== Админ =====
  private showAdminMenu(chatId: number) {
    const banks = this.storage.loadBanks();
    const rows: any[] = banks.map((b) => [
      { text: b.name, callback_data: 'noop' },
      { text: '🔄 QR', callback_data: `admin_editqr_${b.id}` },
      { text: '✏️ Аты', callback_data: `admin_editname_${b.id}` },
      { text: '🗑', callback_data: `admin_delete_${b.id}` },
    ]);
    rows.push([{ text: '➕ Банк кошуу', callback_data: 'admin_add' }]);
    const qrSet = this.storage.loadGlobalQrHash() ? '✅' : '❌';
    rows.push([{ text: `📱 Жалпы QR код коюу ${qrSet}`, callback_data: 'admin_setglobalqr' }]);
    if (this.storage.loadGlobalQrHash()) {
      rows.push([{ text: '🗑 QR өчүрүү (тех. иштер режими)', callback_data: 'admin_delglobalqr' }]);
    }
    const id1 = this.storage.getWithdrawIdPhoto('1xbet') ? '✅' : '❌';
    const id2 = this.storage.getWithdrawIdPhoto('melbet') ? '✅' : '❌';
    rows.push([
      { text: `📷 1XBET ID фото ${id1}`, callback_data: 'admin_idphoto_1xbet' },
      { text: `📷 MELBET ID фото ${id2}`, callback_data: 'admin_idphoto_melbet' },
    ]);
    const insSet = this.storage.getWithdrawIdPhoto('instruction') ? '✅' : '❌';
    rows.push([{ text: `📷 Вывод инструкция фото ${insSet}`, callback_data: 'admin_idphoto_instruction' }]);
    const depSet = this.storage.getWithdrawIdPhoto('deposit_account') ? '✅' : '❌';
    rows.push([{ text: `📷 Пополнение фото ${depSet}`, callback_data: 'admin_idphoto_deposit_account' }]);
    this.bot.sendMessage(chatId,
      `⚙️ <b>Админ панель — Банктар</b>\n\n📱 Жалпы QR: ${qrSet === '✅' ? 'коюлган' : 'коюла элек'}\n\nБанк кошуу, аты/QR'ын өзгөртүү, өчүрүү же жалпы QR коюу:`,
      { parse_mode: 'HTML', reply_markup: { inline_keyboard: rows } });
  }
  private startAddBank(chatId: number) {
    const session = this.session(chatId);
    session.adminStep = 'add_template';
    const rows: any[] = BANK_TEMPLATES.map((tpl, i) => [{ text: tpl.name, callback_data: `admin_tpl_${i}` }]);
    rows.push([{ text: '✏️ Башка (өзүм жазам)', callback_data: 'admin_tpl_custom' }]);
    this.bot.sendMessage(chatId, `🏦 Банктын түрүн тандаңыз:`, { reply_markup: { inline_keyboard: rows } });
  }
  private askEditName(chatId: number, bankId: string) {
    const session = this.session(chatId);
    session.adminStep = 'edit_name';
    session.adminEditId = bankId;
    this.bot.sendMessage(chatId, `📝 Жаңы атын жазыңыз:`);
  }
  private askQr(chatId: number, bankId: string) {
    const session = this.session(chatId);
    session.adminStep = bankId ? 'edit_qr' : 'add_qr';
    session.adminEditId = bankId || null;
    this.bot.sendMessage(chatId, `📸 Банктын QR кодун сурет (фото) түрүндө жибериңиз:`);
  }
  private askGlobalQr(chatId: number) {
    const session = this.session(chatId);
    session.adminStep = 'set_global_qr';
    this.bot.sendMessage(chatId, `📸 Баардык банктарга иштей турган <b>жалпы QR кодду</b> сурет (фото) түрүндө жибериңиз:`, { parse_mode: 'HTML' });
  }
  private askDeleteConfirm(chatId: number, bankId: string) {
    const bank = this.storage.loadBanks().find((b) => b.id === bankId);
    if (!bank) return;
    this.bot.sendMessage(chatId, `❗️ <b>${bank.name}</b> банкын чын эле өчүрөсүзбү?`, {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [[
        { text: '✅ Ооба, өчүр', callback_data: `admin_deleteconfirm_${bankId}` },
        { text: '❌ Жок', callback_data: 'admin_menu' },
      ]] },
    });
  }
  private async handleQrPhoto(chatId: number, msg: any) {
    const session = this.session(chatId);
    try {
      const fileId = msg.photo[msg.photo.length - 1].file_id;
      const qrText = await this.decodeQrFromFileId(fileId);
      if (!qrText) { this.bot.sendMessage(chatId, `❌ QR код табылбады. Сурет тунук, ачык болсун, кайра жибериңиз:`); return; }
      const hash = this.extractHash(qrText);
      const banks = this.storage.loadBanks();
      if (session.adminStep === 'set_global_qr') {
        this.storage.saveGlobalQrHash(qrText);
        session.adminStep = null;
        this.bot.sendMessage(chatId, `✅ Жалпы QR код сакталды. Эми ал баардык банктарга иштейт.\n🔗 ${qrText}`, { parse_mode: 'HTML' });
        this.showAdminMenu(chatId);
      } else if (session.adminStep === 'add_qr') {
        const bank = { id: this.makeBankId(session.adminNewName || 'bank'), name: session.adminNewName || '🏦 Банк', baseUrl: session.adminNewBaseUrl || '', hash };
        banks.push(bank);
        this.storage.saveBanks(banks);
        session.adminStep = null; session.adminNewName = null; session.adminNewBaseUrl = null;
        this.bot.sendMessage(chatId, `✅ Банк кошулду: <b>${bank.name}</b>\n🔗 ${bank.baseUrl}${bank.hash}`, { parse_mode: 'HTML' });
        this.showAdminMenu(chatId);
      } else if (session.adminStep === 'edit_qr') {
        const bank = banks.find((b) => b.id === session.adminEditId);
        if (bank) { bank.hash = hash; this.storage.saveBanks(banks); this.bot.sendMessage(chatId, `✅ QR жаңыртылды: <b>${bank.name}</b>\n🔗 ${bank.baseUrl}${bank.hash}`, { parse_mode: 'HTML' }); }
        session.adminStep = null; session.adminEditId = null;
        this.showAdminMenu(chatId);
      }
    } catch (e) {
      this.bot.sendMessage(chatId, `❌ QR окуу учурунда ката кетти: ${e.message}`);
    }
  }

  // ===================== HANDLERS =====================
  private registerHandlers() {
    this.bot.onText(/\/start/, (msg: any) => {
      const chatId = msg.chat.id;
      if (this.storage.isBanned(chatId)) return;
      this.sessions[chatId] = {};
      // QR код жок болсо — техникалык иштер (админ /admin аркылуу коё алат)
      if (this.isMaintenance() && !this.isAdmin(chatId)) { this.sendTechWork(chatId); return; }
      const name = msg.from.first_name || '';
      const lang = this.getLang(chatId);
      if (!lang) {
        this.bot.sendMessage(chatId, `🌐 Тилди тандаңыз / Выберите язык:`, { reply_markup: this.langKeyboard() });
        return;
      }
      this.showWelcome(chatId, name, lang);
    });

    this.bot.onText(/\/myid/, (msg: any) => {
      const chatId = msg.chat.id;
      this.storage.saveSeenUser({ id: chatId, firstName: msg.from.first_name || '', lastName: msg.from.last_name || '', username: msg.from.username || '' });
      this.bot.sendMessage(chatId, `🆔 Сенин chat ID'ң: <code>${chatId}</code>`, { parse_mode: 'HTML' });
    });

    this.bot.onText(/\/profile/, (msg: any) => {
      const chatId = msg.chat.id;
      const from = msg.from;
      this.storage.saveSeenUser({ id: chatId, firstName: from.first_name || '', lastName: from.last_name || '', username: from.username || '' });
      this.bot.sendMessage(chatId,
        `👤 <b>Профиль</b>\n\nАты: <b>${from.first_name || '—'}</b>\nФамилиясы: <b>${from.last_name || '—'}</b>\nUsername: <b>${from.username ? '@' + from.username : '—'}</b>\nTelegram ID: <code>${chatId}</code>`,
        { parse_mode: 'HTML' });
    });

    this.bot.onText(/\/admin/, (msg: any) => {
      const chatId = msg.chat.id;
      if (!this.isAdmin(chatId)) { this.bot.sendMessage(chatId, `⛔️ Бул команда сага жеткиликсиз.`); return; }
      this.showAdminMenu(chatId);
    });

    this.bot.on('callback_query', (query: any) => this.onCallback(query));
    this.bot.on('message', (msg: any) => this.onMessage(msg));
    this.bot.on('polling_error', (e: any) => console.log('polling_error', e.code || e.message));
  }

  private onCallback(query: any) {
    const chatId = query.message.chat.id;
    const data = query.data;
    const session = this.session(chatId);
    this.bot.answerCallbackQuery(query.id).catch(() => {});
    if (this.isDuplicateCallback(query.id)) return;

    if (data === 'noop') return;
    else if (data === 'setlang_ru' || data === 'setlang_ky') {
      const lang = data === 'setlang_ky' ? 'ky' : 'ru';
      this.storage.setLang(chatId, lang);
      this.showWelcome(chatId, query.from.first_name || '', lang);
    }
    else if (data === 'main_menu') { session.step = null; this.showMainMenu(chatId); }
    else if (data === 'deposit') {
      if (this.isMaintenance() && !this.isAdmin(chatId)) { this.sendTechWork(chatId); return; }
      this.showDepositMenu(chatId);
    }
    else if (data === 'withdraw') {
      if (this.isMaintenance() && !this.isAdmin(chatId)) { this.sendTechWork(chatId); return; }
      this.showWithdraw(chatId);
    }
    else if (data === 'withdraw_1xbet' || data === 'withdraw_melbet') {
      session.withdrawSite = data === 'withdraw_1xbet' ? '1XBET' : 'MELBET';
      this.showWithdrawBanks(chatId);
    }
    else if (data.startsWith('wbank_')) {
      const bankId = data.replace('wbank_', '');
      const bank = WITHDRAW_BANKS.find((b) => b.id === bankId);
      session.withdrawBank = bank ? bank.name : bankId;
      session.step = 'waiting_withdraw_phone';
      const lang = this.getLang(chatId) || 'ru';
      const savedPhones = this.storage.getSavedPhones(chatId);
      const rows: any[] = savedPhones.map((p, i) => [{ text: `📱 ${p}`, callback_data: `use_phone_${i}` }]);
      rows.push([{ text: this.t(lang, 'btn_cancel'), callback_data: 'main_menu' }]);
      const hint = savedPhones.length ? this.t(lang, 'hint_prev_phones') : '';
      this.bot.sendMessage(chatId, this.t(lang, 'wd_enter_phone', session.withdrawBank, hint), { parse_mode: 'HTML', reply_markup: { inline_keyboard: rows } });
    }
    else if (data.startsWith('use_phone_')) {
      const index = parseInt(data.replace('use_phone_', ''));
      const phone = this.storage.getSavedPhones(chatId)[index];
      if (!phone) return;
      session.withdrawPhone = phone; session.step = null;
      this.storage.saveUserPhone(chatId, phone);
      this.finishWithdraw(chatId);
    }
    else if (data.startsWith('use_wid_')) {
      const index = parseInt(data.replace('use_wid_', ''));
      const wid = this.storage.getSavedAccountIds(chatId, (session.withdrawSite || '').toLowerCase())[index];
      if (!wid) return;
      session.withdrawUserId = wid; session.step = null;
      this.storage.saveUserAccountId(chatId, (session.withdrawSite || '').toLowerCase(), wid);
      this.showWithdrawInstructions(chatId);
    }
    else if (data === 'support') {
      const lang = this.getLang(chatId) || 'ru';
      this.bot.sendMessage(chatId, this.t(lang, 'support_msg'), { parse_mode: 'HTML' });
    }
    else if (data === 'site_1xbet') this.askForId(chatId, '1xbet');
    else if (data === 'site_melbet') this.askForId(chatId, 'melbet');
    else if (data.startsWith('use_saved_id_')) {
      const index = parseInt(data.replace('use_saved_id_', ''));
      const savedId = this.storage.getSavedAccountIds(chatId, session.site)[index];
      if (!savedId) return;
      session.userId = savedId; session.step = null;
      this.storage.saveUserAccountId(chatId, session.site, savedId);
      this.askForAmount(chatId);
    }
    else if (data.startsWith('amount_')) {
      session.amount = this.withRandomKopecks(data.replace('amount_', ''));
      session.step = null;
      this.showBankMenu(chatId);
    }
    else if (data === 'pay_qr') this.sendGlobalQr(chatId);
    else if (data === 'back_to_banks') this.showBankMenu(chatId);
    // Админ
    else if (data === 'admin_menu') { if (!this.isAdmin(chatId)) return; session.adminStep = null; this.showAdminMenu(chatId); }
    else if (data === 'admin_add') { if (!this.isAdmin(chatId)) return; this.startAddBank(chatId); }
    else if (data === 'admin_setglobalqr') { if (!this.isAdmin(chatId)) return; this.askGlobalQr(chatId); }
    else if (data === 'admin_delglobalqr') {
      if (!this.isAdmin(chatId)) return;
      this.storage.deleteGlobalQrHash();
      this.bot.sendMessage(chatId, `🗑 Жалпы QR өчүрүлдү. Бот эми <b>техникалык иштер</b> режиминде (кардарларга).`, { parse_mode: 'HTML' });
      this.showAdminMenu(chatId);
    }
    else if (data === 'admin_idphoto_1xbet' || data === 'admin_idphoto_melbet') {
      if (!this.isAdmin(chatId)) return;
      const site = data === 'admin_idphoto_1xbet' ? '1xbet' : 'melbet';
      session.adminStep = `set_idphoto_${site}`;
      this.bot.sendMessage(chatId, `📷 <b>${site.toUpperCase()}</b> үчүн "ID кайда жазылат" мисал сүрөтүн жибериңиз:`, { parse_mode: 'HTML' });
    }
    else if (data === 'admin_idphoto_instruction') { if (!this.isAdmin(chatId)) return; session.adminStep = 'set_idphoto_instruction'; this.bot.sendMessage(chatId, `📷 Вывод инструкциясынын сүрөтүн жибериңиз:`); }
    else if (data === 'admin_idphoto_deposit_account') { if (!this.isAdmin(chatId)) return; session.adminStep = 'set_idphoto_deposit_account'; this.bot.sendMessage(chatId, `📷 "Пополнение счета — Введите ID" экранынын сүрөтүн жибериңиз:`); }
    else if (data.startsWith('admin_tpl_')) {
      if (!this.isAdmin(chatId)) return;
      const key = data.replace('admin_tpl_', '');
      if (key === 'custom') { session.adminStep = 'add_name'; this.bot.sendMessage(chatId, `📝 Банктын атын жазыңыз (мисалы: 🏦 Bakai Bank):`); }
      else {
        const tpl = BANK_TEMPLATES[parseInt(key)];
        session.adminNewName = tpl.name; session.adminNewBaseUrl = tpl.baseUrl; session.adminStep = 'add_qr';
        this.bot.sendMessage(chatId, `📸 Эми «${tpl.name}» банкынын QR кодун сурет (фото) түрүндө жибериңиз:`);
      }
    }
    else if (data.startsWith('admin_editqr_')) { if (!this.isAdmin(chatId)) return; this.askQr(chatId, data.replace('admin_editqr_', '')); }
    else if (data.startsWith('admin_editname_')) { if (!this.isAdmin(chatId)) return; this.askEditName(chatId, data.replace('admin_editname_', '')); }
    else if (data.startsWith('admin_deleteconfirm_')) {
      if (!this.isAdmin(chatId)) return;
      const bankId = data.replace('admin_deleteconfirm_', '');
      this.storage.saveBanks(this.storage.loadBanks().filter((b) => b.id !== bankId));
      this.bot.sendMessage(chatId, `🗑 Банк өчүрүлдү.`);
      this.showAdminMenu(chatId);
    }
    else if (data.startsWith('admin_delete_')) { if (!this.isAdmin(chatId)) return; this.askDeleteConfirm(chatId, data.replace('admin_delete_', '')); }
    // Заявка (группада)
    else if (data.startsWith('app_process_')) {
      if (!this.isAdmin(query.from.id)) return;
      const appId = data.replace('app_process_', '');
      const app = this.pendingApplications[appId];
      if (!app) return;
      app.status = 'processing';
      this.bot.sendMessage(app.chatId, this.t(this.getLang(app.chatId) || 'ru', 'proc_notify'), { parse_mode: 'HTML' });
      this.bot.editMessageReplyMarkup({ inline_keyboard: [
        [{ text: '⏳ Обрабатывается...', callback_data: 'noop' }, { text: '✅ Подтвердить', callback_data: `app_approve_${appId}` }],
        [{ text: '❌ Отмена', callback_data: `app_cancel_${appId}` }, { text: '🚫 Бан', callback_data: `app_ban_${appId}` }],
      ] }, { chat_id: chatId, message_id: query.message.message_id }).catch(() => {});
    }
    else if (data.startsWith('app_approve_')) {
      if (!this.isAdmin(query.from.id)) return;
      const appId = data.replace('app_approve_', '');
      const app = this.pendingApplications[appId];
      if (!app) return;
      app.status = 'approved';
      this.confirmPayment(app);
      this.bot.editMessageReplyMarkup({ inline_keyboard: [[{ text: '✅ Подтверждено', callback_data: 'noop' }]] }, { chat_id: chatId, message_id: query.message.message_id }).catch(() => {});
      delete this.pendingApplications[appId];
    }
    else if (data.startsWith('app_cancel_')) {
      if (!this.isAdmin(query.from.id)) return;
      const appId = data.replace('app_cancel_', '');
      const app = this.pendingApplications[appId];
      if (!app) return;
      app.status = 'cancelled';
      this.bot.sendMessage(app.chatId, this.t(this.getLang(app.chatId) || 'ru', 'cancel_notify'), { parse_mode: 'HTML' });
      this.bot.editMessageReplyMarkup({ inline_keyboard: [[{ text: '❌ Отклонено', callback_data: 'noop' }]] }, { chat_id: chatId, message_id: query.message.message_id }).catch(() => {});
      delete this.pendingApplications[appId];
    }
    else if (data.startsWith('app_ban_')) {
      if (!this.isAdmin(query.from.id)) return;
      const appId = data.replace('app_ban_', '');
      const app = this.pendingApplications[appId];
      if (!app) return;
      app.status = 'banned';
      this.storage.banUser(app.chatId);
      this.bot.sendMessage(app.chatId, this.t(this.getLang(app.chatId) || 'ru', 'ban_notify'), { parse_mode: 'HTML' }).catch(() => {});
      this.bot.editMessageReplyMarkup({ inline_keyboard: [[{ text: '♻️ Разбанить', callback_data: `unban_${app.chatId}` }]] }, { chat_id: chatId, message_id: query.message.message_id }).catch(() => {});
      delete this.pendingApplications[appId];
    }
    else if (data.startsWith('unban_')) {
      if (!this.isAdmin(query.from.id)) return;
      const targetId = Number(data.replace('unban_', ''));
      this.storage.unbanUser(targetId);
      this.bot.sendMessage(targetId, this.t(this.getLang(targetId) || 'ru', 'unban_notify'), { parse_mode: 'HTML' }).catch(() => {});
      this.bot.editMessageReplyMarkup({ inline_keyboard: [[{ text: '✅ Разбанен', callback_data: 'noop' }]] }, { chat_id: chatId, message_id: query.message.message_id }).catch(() => {});
    }
    // Вывод заявка (группада)
    else if (data.startsWith('wapp_approve_')) {
      if (!this.isAdmin(query.from.id)) return;
      const appId = data.replace('wapp_approve_', '');
      const app = this.pendingWithdrawals[appId];
      if (!app) return;
      app.status = 'approved';
      this.bot.sendMessage(app.chatId, this.t(this.getLang(app.chatId) || 'ru', 'wd_approve_notify', app.site || '—'), { parse_mode: 'HTML' }).catch(() => {});
      this.bot.editMessageReplyMarkup({ inline_keyboard: [[{ text: '✅ Подтверждено', callback_data: 'noop' }]] }, { chat_id: chatId, message_id: query.message.message_id }).catch(() => {});
      delete this.pendingWithdrawals[appId];
    }
    else if (data.startsWith('wapp_cancel_')) {
      if (!this.isAdmin(query.from.id)) return;
      const appId = data.replace('wapp_cancel_', '');
      const app = this.pendingWithdrawals[appId];
      if (!app) return;
      app.status = 'cancelled';
      this.bot.sendMessage(app.chatId, this.t(this.getLang(app.chatId) || 'ru', 'wd_cancel_notify'), { parse_mode: 'HTML' }).catch(() => {});
      this.bot.editMessageReplyMarkup({ inline_keyboard: [[{ text: '❌ Отменено', callback_data: 'noop' }]] }, { chat_id: chatId, message_id: query.message.message_id }).catch(() => {});
      delete this.pendingWithdrawals[appId];
    }
  }

  private onMessage(msg: any) {
    const chatId = msg.chat.id;
    const session = this.session(chatId);

    if (!this.isAdmin(chatId) && chatId !== GROUP_CHAT_ID && chatId !== WITHDRAW_GROUP_CHAT_ID && this.storage.isBanned(chatId)) return;

    // Custom emoji ID окуп берүү (админ)
    if (this.isAdmin(chatId)) {
      const entities = msg.entities || msg.caption_entities;
      const text = msg.text || msg.caption || '';
      if (entities) {
        const customs = entities.filter((e: any) => e.type === 'custom_emoji');
        if (customs.length) {
          const lines = customs.map((e: any) => `${text.substr(e.offset, e.length)} → <code>${e.custom_emoji_id}</code>`);
          this.bot.sendMessage(chatId, `🆔 <b>Custom emoji ID'лери:</b>\n\n${lines.join('\n')}`, { parse_mode: 'HTML' });
          return;
        }
      }
    }

    // Админ флоу
    if (this.isAdmin(chatId) && session.adminStep) {
      if (session.adminStep === 'add_name' && msg.text) {
        session.adminNewName = msg.text.trim(); session.adminStep = 'add_baseurl';
        this.bot.sendMessage(chatId, `🔗 Эми банктын линк үлгүсүн жазыңыз ("#" белгисине чейинки бөлүгү), мисалы:\nhttps://bakai.app/#`);
        return;
      }
      if (session.adminStep === 'add_baseurl' && msg.text) {
        session.adminNewBaseUrl = msg.text.trim(); session.adminStep = 'add_qr';
        this.bot.sendMessage(chatId, `📸 Эми ошол банктын QR кодун сурет (фото) түрүндө жибериңиз:`);
        return;
      }
      if (session.adminStep === 'edit_name' && msg.text) {
        const banks = this.storage.loadBanks();
        const bank = banks.find((b) => b.id === session.adminEditId);
        if (bank) { bank.name = msg.text.trim(); this.storage.saveBanks(banks); this.bot.sendMessage(chatId, `✅ Аты жаңыртылды: <b>${bank.name}</b>`, { parse_mode: 'HTML' }); }
        session.adminStep = null; session.adminEditId = null;
        this.showAdminMenu(chatId);
        return;
      }
      if (session.adminStep === 'add_qr' || session.adminStep === 'edit_qr' || session.adminStep === 'set_global_qr') {
        if (msg.photo) this.handleQrPhoto(chatId, msg);
        else this.bot.sendMessage(chatId, `📸 QR кодду сурет (фото) түрүндө жибериңиз:`);
        return;
      }
      if (session.adminStep && session.adminStep.startsWith('set_idphoto_')) {
        if (msg.photo) {
          const key = session.adminStep.replace('set_idphoto_', '');
          this.storage.saveWithdrawIdPhoto(key, msg.photo[msg.photo.length - 1].file_id);
          session.adminStep = null;
          this.bot.sendMessage(chatId, `✅ Сүрөт сакталды (${key}).`);
          this.showAdminMenu(chatId);
        } else this.bot.sendMessage(chatId, `📷 Сүрөт (фото) түрүндө жибериңиз:`);
        return;
      }
    }

    if (msg.text && msg.text.startsWith('/')) return;

    if (session.step === 'waiting_withdraw_phone') {
      if (msg.text) { session.withdrawPhone = msg.text.trim(); this.storage.saveUserPhone(chatId, session.withdrawPhone); session.step = null; this.finishWithdraw(chatId); }
      return;
    }
    if (session.step === 'waiting_withdraw_qr') {
      if (msg.photo || msg.document) {
        session.withdrawQrFileId = msg.photo ? msg.photo[msg.photo.length - 1].file_id : msg.document.file_id;
        session.step = null;
        this.askWithdrawId(chatId);
      } else this.bot.sendMessage(chatId, `📸 Отправьте <b>QR код вашего банка</b> (фото):`, { parse_mode: 'HTML' });
      return;
    }
    if (session.step === 'waiting_withdraw_id') {
      if (msg.text) {
        session.withdrawUserId = msg.text.trim();
        this.storage.saveUserAccountId(chatId, (session.withdrawSite || '').toLowerCase(), session.withdrawUserId);
        session.step = null;
        this.showWithdrawInstructions(chatId);
      }
      return;
    }
    if (session.step === 'waiting_withdraw_code') {
      if (msg.text) {
        session.withdrawCode = msg.text.trim(); session.step = null;
        const lang = this.getLang(chatId) || 'ru';
        this.sendWithdrawToGroup(chatId, msg);
        this.bot.sendMessage(chatId,
          this.t(lang, 'wd_accepted', session.withdrawSite || '—', session.withdrawUserId || '—', session.withdrawBank || '—', session.withdrawPhone || '—', session.withdrawCode),
          { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: this.t(lang, 'btn_main'), callback_data: 'main_menu' }]] } });
      }
      return;
    }
    if (session.step === 'waiting_id') {
      if (msg.text) {
        session.userId = msg.text.trim();
        this.storage.saveUserAccountId(chatId, session.site, session.userId);
        session.step = null;
        this.askForAmount(chatId);
      }
      return;
    }
    if (session.step === 'waiting_amount') {
      const amount = parseInt(msg.text);
      if (isNaN(amount) || amount < 35 || amount > 200000) {
        this.bot.sendMessage(chatId, this.t(this.getLang(chatId) || 'ru', 'invalid_amount'), { parse_mode: 'HTML' });
      } else {
        session.amount = this.withRandomKopecks(amount); session.step = null;
        this.showBankMenu(chatId);
      }
      return;
    }
    if (session.step === 'waiting_receipt') {
      if (msg.photo || msg.document) this.showApplicationSent(chatId, msg);
      else this.bot.sendMessage(chatId, this.t(this.getLang(chatId) || 'ru', 'send_receipt'), { parse_mode: 'HTML' });
      return;
    }
  }
}
