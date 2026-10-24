// Verwerkt wat gebruikers naar de Telegram-bot sturen: koppelen via /start <code> en de knoppen
// onder een melding.

import type { Db } from '../db.js';
import { errorMessage, log } from '../log.js';
import type { Telegram, TelegramUpdate } from './telegram.js';

const STATUS_TEXT: Record<string, string> = {
  reacted: '✅ Gemarkeerd als gereageerd',
  dismissed: '🗑 Verborgen in je lijst',
};

export async function handleUpdate(update: TelegramUpdate, tg: Telegram, db: Db) {
  const msg = update.message;
  if (msg?.text?.startsWith('/start')) {
    const code = msg.text.split(/\s+/)[1];
    if (!code) {
      await tg.sendMessage(msg.chat.id, 'Koppel deze chat via de huurradar-app: tabblad <b>Meldingen</b> → <b>Koppel Telegram</b>.');
      return;
    }
    const ok = await db.linkTelegram(code, msg.chat.id);
    await tg.sendMessage(
      msg.chat.id,
      ok
        ? '✅ Gekoppeld! Je krijgt hier een bericht zodra er een nieuwe woning is die bij je zoekprofiel past.'
        : 'Deze koppelcode ken ik niet. Gebruik de knop <b>Koppel Telegram</b> in de huurradar-app.',
    );
    log.info('telegram koppeling', { ok });
    return;
  }

  const cb = update.callback_query;
  if (cb?.data && cb.message) {
    const [status, listingId] = cb.data.split(':');
    if (status === 'noop') {
      await tg.answerCallback(cb.id, '');
      return;
    }
    if (!status || !STATUS_TEXT[status] || !listingId) {
      await tg.answerCallback(cb.id, 'Onbekende actie');
      return;
    }
    const n = await db.setMatchStatusByChat(cb.message.chat.id, Number(listingId), status);
    await tg.answerCallback(cb.id, n > 0 ? STATUS_TEXT[status]! : 'Deze woning staat niet (meer) in je lijst');
    if (n > 0) {
      // Actieknoppen vervangen door de gekozen status; de link blijft staan.
      const link = cb.message.reply_markup?.inline_keyboard[0] ?? [];
      await tg.editKeyboard(cb.message.chat.id, cb.message.message_id, [link, [{ text: STATUS_TEXT[status]!, callback_data: 'noop:0' }]]);
    }
  }
}

// Draait zolang de worker draait. Telegram bewaart updates tot ze bevestigd zijn (via offset),
// dus na een herstart gaat er niets verloren.
export async function runBot(tg: Telegram, db: Db, shouldStop: () => boolean) {
  let offset = 0;
  while (!shouldStop()) {
    try {
      const updates = await tg.getUpdates(offset);
      for (const u of updates) {
        offset = u.update_id + 1;
        await handleUpdate(u, tg, db).catch((e) => log.error('telegram update mislukt', { error: errorMessage(e) }));
      }
    } catch (e) {
      log.warn('telegram polling mislukt', { error: errorMessage(e) });
      await new Promise((r) => setTimeout(r, 10_000));
    }
  }
}
