import { Injectable, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { Pool } from 'pg';
import { MAX_SAVED_IDS, DATABASE_URL } from './config';

const ROOT = path.join(__dirname, '..');

// KV ачкычтары → файл аттары (файл резерви/миграция үчүн)
const KEYS = [
  'banks', 'qr_config', 'seen_users', 'banned_users',
  'user_accounts', 'user_phones', 'withdraw_id_photos', 'user_lang',
];

function toIdArray(value: any): string[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value) return [value];
  return [];
}

export interface Bank { id: string; name: string; baseUrl: string; hash: string; }

@Injectable()
export class StorageService implements OnModuleInit {
  private pool: Pool | null = null;
  private mode: 'pg' | 'file' = 'file';
  private cache: Record<string, any> = {};

  async onModuleInit() {
    try {
      this.pool = new Pool({ connectionString: DATABASE_URL, max: 5 });
      await this.pool.query('CREATE TABLE IF NOT EXISTS kv (key text PRIMARY KEY, value jsonb NOT NULL)');
      // Учурдагы баалуулуктарды жүктөйбүз
      const { rows } = await this.pool.query('SELECT key, value FROM kv');
      for (const r of rows) this.cache[r.key] = r.value;
      // Эски JSON файлдардан миграция (DB'де жок болсо)
      for (const key of KEYS) {
        if (this.cache[key] === undefined) {
          const fileVal = this.readFile(key);
          if (fileVal !== undefined) {
            this.cache[key] = fileVal;
            await this.pool.query(
              'INSERT INTO kv(key, value) VALUES($1, $2) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
              [key, JSON.stringify(fileVal)],
            );
          }
        }
      }
      this.mode = 'pg';
      console.log('🗄  Хранилище: PostgreSQL');
    } catch (e: any) {
      this.mode = 'file';
      this.pool = null;
      console.log('🗄  Хранилище: файлдар (Postgres жеткиликсиз:', e.message, ')');
    }
  }

  private fileOf(key: string) { return path.join(ROOT, `${key}.json`); }
  private readFile(key: string): any {
    try { return JSON.parse(fs.readFileSync(this.fileOf(key), 'utf8')); } catch (e) { return undefined; }
  }
  private writeFile(key: string, value: any) {
    try { fs.writeFileSync(this.fileOf(key), JSON.stringify(value, null, 2), 'utf8'); } catch (e) {}
  }

  private get<T>(key: string, fallback: T): T {
    if (this.mode === 'pg') {
      return this.cache[key] !== undefined ? this.cache[key] : fallback;
    }
    const v = this.readFile(key);
    return v !== undefined ? v : fallback;
  }
  private set(key: string, value: any) {
    this.cache[key] = value;
    if (this.mode === 'pg' && this.pool) {
      this.pool.query(
        'INSERT INTO kv(key, value) VALUES($1, $2) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
        [key, JSON.stringify(value)],
      ).catch((e) => console.log('[PG_WRITE_ERR]', key, e.message));
    } else {
      this.writeFile(key, value);
    }
  }

  // ===== Банктар =====
  loadBanks(): Bank[] { return this.get<Bank[]>('banks', []); }
  saveBanks(banks: Bank[]) { this.set('banks', banks); }

  // ===== Жалпы QR =====
  loadGlobalQrHash(): string | null { return this.get<any>('qr_config', {}).hash || null; }
  saveGlobalQrHash(hash: string) { this.set('qr_config', { hash }); }
  deleteGlobalQrHash() { this.set('qr_config', {}); }

  // ===== Көрүлгөн колдонуучулар =====
  saveSeenUser(user: any) {
    const users = this.get<any[]>('seen_users', []);
    const existing = users.find((u) => u.id === user.id);
    if (existing) Object.assign(existing, user, { lastSeen: new Date().toISOString() });
    else users.push({ ...user, lastSeen: new Date().toISOString() });
    this.set('seen_users', users);
  }

  // ===== Бан =====
  loadBannedUsers(): number[] { return this.get<number[]>('banned_users', []); }
  isBanned(chatId: number): boolean { return this.loadBannedUsers().includes(chatId); }
  banUser(chatId: number) {
    const ids = this.loadBannedUsers();
    if (!ids.includes(chatId)) { ids.push(chatId); this.set('banned_users', ids); }
  }
  unbanUser(chatId: number) {
    this.set('banned_users', this.loadBannedUsers().filter((id) => id !== chatId));
  }

  // ===== Сакталган эсеп ID'лери =====
  saveUserAccountId(chatId: number, site: string, accountId: string) {
    const accounts = this.get<any>('user_accounts', {});
    if (!accounts[chatId]) accounts[chatId] = {};
    const ids = toIdArray(accounts[chatId][site]);
    accounts[chatId][site] = [accountId, ...ids.filter((id) => id !== accountId)].slice(0, MAX_SAVED_IDS);
    this.set('user_accounts', accounts);
  }
  getSavedAccountIds(chatId: number, site: string): string[] {
    const accounts = this.get<any>('user_accounts', {});
    return toIdArray(accounts[chatId] && accounts[chatId][site]);
  }

  // ===== Сакталган телефон номерлери =====
  saveUserPhone(chatId: number, phone: string) {
    const data = this.get<any>('user_phones', {});
    const phones = toIdArray(data[chatId]);
    data[chatId] = [phone, ...phones.filter((p) => p !== phone)].slice(0, MAX_SAVED_IDS);
    this.set('user_phones', data);
  }
  getSavedPhones(chatId: number): string[] { return toIdArray(this.get<any>('user_phones', {})[chatId]); }

  // ===== Мисал сүрөттөр (file_id) =====
  saveWithdrawIdPhoto(key: string, fileId: string) {
    const data = this.get<any>('withdraw_id_photos', {});
    data[key] = fileId;
    this.set('withdraw_id_photos', data);
  }
  getWithdrawIdPhoto(key: string): string | null { return this.get<any>('withdraw_id_photos', {})[key] || null; }

  // ===== Тил =====
  getLang(chatId: number): string | null { return this.get<any>('user_lang', {})[chatId] || null; }
  setLang(chatId: number, lang: string) {
    const data = this.get<any>('user_lang', {});
    data[chatId] = lang;
    this.set('user_lang', data);
  }
}
