import { writeFile } from 'node:fs/promises';
import { loadConfig } from './config.js';
import { createDb } from './db.js';
import { errorMessage, log } from './log.js';
import { sendWhatsApp } from './notify/callmebot.js';
import { createNotifier } from './notify/notifier.js';
import { runSource, type Alert } from './runner.js';
import { createDakSource } from './sources/dak.js';
import type { Source } from './types.js';

const config = loadConfig();
const db = createDb(config.supabaseUrl, config.supabaseSecretKey);
const notifier = createNotifier(db, { dryRun: config.dryRun });
const sources: Source[] = [createDakSource()];
const once = process.argv.includes('--once');

const alert: Alert = async (text) => {
  log.warn('beheerdersmelding', { text });
  if (!config.alert || config.dryRun) return;
  await sendWhatsApp(config.alert.phone, config.alert.apiKey, text).catch((e) =>
    log.error('beheerdersmelding mislukt', { error: errorMessage(e) }),
  );
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
  log.info('worker gestart', { sources: sources.map((s) => s.id), dryRun: config.dryRun });
  // Meldingen die eerder mislukten elke minuut opnieuw proberen.
  const retry = setInterval(() => void flushNotifications(), 60_000);
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      log.info('worker stopt', { signal });
      stopping = true;
      clearInterval(retry);
      for (const t of timers) clearTimeout(t);
    });
  }
  await Promise.all(sources.map(loop));
}
