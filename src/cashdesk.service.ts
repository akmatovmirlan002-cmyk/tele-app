import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { CASHDESK } from './config';

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const md5 = (s: string) => crypto.createHash('md5').update(s).digest('hex');

// 1xBet / Melbet кассир API (CashdeskBotAPI)
// Документ: partners.servcul.com/CashdeskBotAPI
@Injectable()
export class CashdeskService {
  private get url() { return CASHDESK.url.replace(/\/$/, ''); }

  enabled(): boolean {
    return !!(CASHDESK.hash && CASHDESK.cashierpass && CASHDESK.cashdeskId);
  }

  private confirm(idOrUserId: string | number) {
    return md5(`${idOrUserId}:${CASHDESK.hash}`);
  }

  private async request(method: 'GET' | 'POST', path: string, sign: string, body?: any) {
    const res = await fetch(`${this.url}/${path}`, {
      method,
      headers: { 'sign': sign, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch (e) { /* not json */ }
    return { status: res.status, json, text };
  }

  private nowUtc() {
    // yyyy.MM.dd HH:mm:ss (UTC+0)
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}.${p(d.getUTCMonth() + 1)}.${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
  }

  // 1. Касса балансы
  async getBalance() {
    const dt = this.nowUtc();
    const s1 = sha256(`hash=${CASHDESK.hash}&cashierpass=${CASHDESK.cashierpass}&dt=${dt}`);
    const s2 = md5(`dt=${dt}&cashierpass=${CASHDESK.cashierpass}&cashdeskid=${CASHDESK.cashdeskId}`);
    const sign = sha256(s1 + s2);
    const confirm = this.confirm(CASHDESK.cashdeskId);
    return this.request('GET', `Cashdesk/${CASHDESK.cashdeskId}/Balance?confirm=${confirm}&dt=${encodeURIComponent(dt)}`, sign);
  }

  // 2. Оюнчуну издөө
  async searchPlayer(userId: string | number) {
    const s1 = sha256(`hash=${CASHDESK.hash}&userid=${userId}&cashdeskid=${CASHDESK.cashdeskId}`);
    const s2 = md5(`userid=${userId}&cashierpass=${CASHDESK.cashierpass}&hash=${CASHDESK.hash}`);
    const sign = sha256(s1 + s2);
    const confirm = this.confirm(userId);
    return this.request('GET', `Users/${userId}?confirm=${confirm}&cashdeskId=${CASHDESK.cashdeskId}`, sign);
  }

  // 3. Депозит — оюнчунун эсебин толуктоо
  async deposit(userId: string | number, summa: number, lng = 'ru') {
    const s1 = sha256(`hash=${CASHDESK.hash}&lng=${lng}&userid=${userId}`);
    const s2 = md5(`summa=${summa}&cashierpass=${CASHDESK.cashierpass}&cashdeskid=${CASHDESK.cashdeskId}`);
    const sign = sha256(s1 + s2);
    const confirm = this.confirm(userId);
    return this.request('POST', `Deposit/${userId}/Add`, sign, {
      cashdeskId: Number(CASHDESK.cashdeskId), lng, summa, confirm,
    });
  }

  // 4. Выплата — код менен эсептен чыгаруу
  async payout(userId: string | number, code: string, lng = 'ru') {
    const s1 = sha256(`hash=${CASHDESK.hash}&lng=${lng}&userid=${userId}`);
    const s2 = md5(`code=${code}&cashierpass=${CASHDESK.cashierpass}&cashdeskid=${CASHDESK.cashdeskId}`);
    const sign = sha256(s1 + s2);
    const confirm = this.confirm(userId);
    return this.request('POST', `Deposit/${userId}/Payout`, sign, {
      cashdeskId: Number(CASHDESK.cashdeskId), lng, code, confirm,
    });
  }
}
