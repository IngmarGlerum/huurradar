import { writeFile } from 'node:fs/promises';
import { loadConfig } from './config.js';
import { createDb } from './db.js';
import { errorMessage, log } from './log.js';
import { runBot } from './notify/bot.js';
import { sendWhatsApp } from './notify/callmebot.js';
import { createNotifier } from './notify/notifier.js';
import { createTelegram } from './notify/telegram.js';
import { runSource, type Alert } from './runner.js';
import { createDakSource } from './sources/dak.js';
import { createMvgmSource } from './sources/mvgm.js';
import { createVanderLindenSource } from './sources/vanderlinden.js';
import { createVbtSource } from './sources/vbt.js';
import { createVestedaSource } from './sources/vesteda.js';
import type { Source } from './types.js';

const config = loadConfig();
const db = createDb(config.supabaseUrl, config.supabaseSecretKey);
const telegram = config.telegramToken ? createTelegram(config.telegramToken) : null;
const notifier = createNotifier(db, {
  dryRun: config.dryRun,
  senders: { telegram: telegram ? (chatId, html, keyboard) => telegram.sendMessage(chatId, html, keyboard) : null },
});
const sources: Source[] = [
  createDakSource(),
  createVestedaSource(),
  createMvgmSource(),
  createVanderLindenSource(),
  createVbtSource(),
].filter((s) => !config.disabledSources.includes(s.id));
const once = process.argv.includes('--once');

const alert: Alert = async (text) => {
  log.warn('beheerdersmelding', { text });
  if (config.dryRun) return;
  const sends: Promise<unknown>[] = [];
  if (telegram && config.alertTelegramChatId) {
    sends.push(telegram.sendMessage(config.alertTelegramChatId, text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')));
  }
  if (config.alert) sends.push(sendWhatsApp(config.alert.phone, config.alert.apiKey, text));
  for (const r of await Promise.allSettled(sends)) {
    if (r.status === 'rejected') log.error('beheerdersmelding mislukt', { error: errorMessage(r.reason) });
  }
};

async function flushNotifications() {
  try {
    const n = await notifier.flush();
    if (n > 0) log.info('meldingen verwerkt', { matches: n });
  } catch (e) {
    log.error('meldingen versturen mislukt', { error: errorMessage(e) });
  }
}

async function heartbeat() {
  await writeFile(config.heartbeatFile, new Date().toISOString()).catch(() => {});
}

let stopping = false;
const timers = new Set<NodeJS.Timeout>();

async function loop(source: Source) {
  const lastFp = { value: await db.lastFingerprint(source.id).catch(() => null) };
  const tick = async () => {
    await runSource(source, db, alert, lastFp);
    await flushNotifications();
    await heartbeat();
    if (stopping) return;
    const delay = source.nextDelay(new Date());
    log.debug('volgende run', { source: source.id, inSeconds: Math.round(delay / 1000) });
    const t = setTimeout(() => {
      timers.delete(t);
      void tick();
    }, delay);
    timers.add(t);
  };
  await tick();
}

if (once) {
  for (const source of sources) {
    await runSource(source, db, alert, { value: await db.lastFingerprint(source.id) });
  }
  await flushNotifications();
} else {
  log.info('worker gestart', { sources: sources.map((s) => s.id), telegram: !!telegram, dryRun: config.dryRun });
  // Meldingen die eerder mislukten elke minuut opnieuw proberen.
  const retry = setInterval(() => void flushNotifications(), 60_000);
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      log.info('worker stopt', { signal });
      stopping = true;
      clearInterval(retry);
      for (const t of timers) clearTimeout(t);
      // De Telegram-polling wacht tot 50 s op berichten; niet daarop wachten.
      setTimeout(() => process.exit(0), 1_000).unref();
    });
  }
  await Promise.all([...sources.map(loop), telegram ? runBot(telegram, db, () => stopping) : Promise.resolve()]);
}
