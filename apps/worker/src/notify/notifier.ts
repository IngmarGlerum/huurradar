import type { ClaimedNotification, Db } from '../db.js';
import { errorMessage, log } from '../log.js';
import { sendWhatsApp } from './callmebot.js';
import { formatMessage, formatTelegram, telegramKeyboard } from './format.js';
import type { InlineButton } from './telegram.js';

const WHATSAPP_PER_MESSAGE = 4;
// CallMeBot staat maar een paar berichten per minuut toe.
const WHATSAPP_PAUSE_MS = 4_000;
// Telegram: ruim onder de limiet van ongeveer 1 bericht per seconde per chat.
const TELEGRAM_PAUSE_MS = 1_100;

export interface Senders {
  whatsapp: (phone: string, apiKey: string, text: string) => Promise<void>;
  telegram: ((chatId: number, html: string, keyboard: InlineButton[][]) => Promise<unknown>) | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createNotifier(db: Db, opts: { dryRun: boolean; senders?: Partial<Senders> }) {
  const senders: Senders = {
    whatsapp: opts.senders?.whatsapp ?? ((phone, key, text) => sendWhatsApp(phone, key, text)),
    telegram: opts.senders?.telegram ?? null,
  };

  // Verstuurt één bericht voor de gegeven matches; bij een fout gaan ze terug in de wachtrij.
  async function deliver(batch: ClaimedNotification[], channel: string, send: () => Promise<unknown>) {
    const ids = batch.map((n) => n.match_id);
    const user = batch[0]!.user_id;
    try {
      await send();
      log.info('melding verstuurd', { user, channel, matches: ids });
    } catch (e) {
      log.warn('melding mislukt, later opnieuw', { user, channel, matches: ids, error: errorMessage(e) });
      await db.releaseNotifications(ids, errorMessage(e));
    }
  }

  async function notifyUser(list: ClaimedNotification[]) {
    const first = list[0]!;

    if (first.telegram_chat_id != null && senders.telegram) {
      const send = senders.telegram;
      for (const [i, n] of list.entries()) {
        if (i > 0 && !opts.dryRun) await sleep(TELEGRAM_PAUSE_MS);
        const html = formatTelegram(n.listing);
        if (opts.dryRun) {
          log.info('DRY_RUN: melding niet verstuurd', { user: n.user_id, channel: 'telegram', matches: [n.match_id], text: html });
          continue;
        }
        await deliver([n], 'telegram', () => send(first.telegram_chat_id!, html, telegramKeyboard(n.listing)));
      }
      return;
    }

    if (first.whatsapp_phone && first.callmebot_apikey) {
      for (let i = 0; i < list.length; i += WHATSAPP_PER_MESSAGE) {
        if (i > 0 && !opts.dryRun) await sleep(WHATSAPP_PAUSE_MS);
        const batch = list.slice(i, i + WHATSAPP_PER_MESSAGE);
        const text = formatMessage(batch.map((n) => n.listing));
        if (opts.dryRun) {
          log.info('DRY_RUN: melding niet verstuurd', {
            user: first.user_id,
            channel: 'whatsapp',
            matches: batch.map((n) => n.match_id),
            text,
          });
          continue;
        }
        await deliver(batch, 'whatsapp', () => senders.whatsapp(first.whatsapp_phone!, first.callmebot_apikey!, text));
      }
      return;
    }

    // Alleen Telegram ingesteld, maar de worker heeft geen bot-token.
    await db.releaseNotifications(
      list.map((n) => n.match_id),
      'geen bruikbaar kanaal (TELEGRAM_BOT_TOKEN ontbreekt?)',
    );
    log.warn('geen bruikbaar meldingskanaal', { user: first.user_id });
  }

  return {
    // Verstuurt alle openstaande meldingen, per gebruiker.
    async flush() {
      const claimed = await db.claimNotifications(50);
      if (claimed.length === 0) return 0;

      const perUser = new Map<string, ClaimedNotification[]>();
      for (const n of claimed) perUser.set(n.user_id, [...(perUser.get(n.user_id) ?? []), n]);
      for (const list of perUser.values()) await notifyUser(list);
      return claimed.length;
    },
  };
}
