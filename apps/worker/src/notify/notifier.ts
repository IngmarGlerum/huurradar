import type { ClaimedNotification, Db } from '../db.js';
import { errorMessage, log } from '../log.js';
import { sendWhatsApp } from './callmebot.js';
import { formatMessage } from './format.js';

const PER_MESSAGE = 4;
// CallMeBot staat maar een paar berichten per minuut toe.
const PAUSE_MS = 4_000;

export type Sender = (phone: string, apiKey: string, text: string) => Promise<void>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createNotifier(db: Db, opts: { dryRun: boolean; send?: Sender }) {
  const send: Sender = opts.send ?? ((phone, key, text) => sendWhatsApp(phone, key, text));

  async function deliver(batch: ClaimedNotification[]) {
    const first = batch[0]!;
    const text = formatMessage(batch.map((n) => n.listing));
    const ids = batch.map((n) => n.match_id);
    if (opts.dryRun) {
      log.info('DRY_RUN: melding niet verstuurd', { user: first.user_id, matches: ids, text });
      return;
    }
    try {
      await send(first.whatsapp_phone, first.callmebot_apikey, text);
      log.info('melding verstuurd', { user: first.user_id, matches: ids });
    } catch (e) {
      log.warn('melding mislukt, later opnieuw', { user: first.user_id, matches: ids, error: errorMessage(e) });
      await db.releaseNotifications(ids, errorMessage(e));
    }
  }

  return {
    // Verstuurt alle openstaande meldingen, gebundeld per gebruiker.
    async flush() {
      const claimed = await db.claimNotifications(50);
      if (claimed.length === 0) return 0;

      const perUser = new Map<string, ClaimedNotification[]>();
      for (const n of claimed) perUser.set(n.user_id, [...(perUser.get(n.user_id) ?? []), n]);

      let sent = 0;
      for (const list of perUser.values()) {
        for (let i = 0; i < list.length; i += PER_MESSAGE) {
          if (sent > 0 && !opts.dryRun) await sleep(PAUSE_MS);
          await deliver(list.slice(i, i + PER_MESSAGE));
          sent++;
        }
      }
      return claimed.length;
    },
  };
}
