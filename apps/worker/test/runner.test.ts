import { describe, expect, it, vi } from 'vitest';
import type { ClaimedNotification, Db } from '../src/db.js';
import { createNotifier } from '../src/notify/notifier.js';
import { formatMessage, formatTelegram } from '../src/notify/format.js';
import { handleUpdate } from '../src/notify/bot.js';
import { runSource } from '../src/runner.js';
import { SourceChangedError, type NormalizedListing, type Source } from '../src/types.js';

const listing = (id: string, extra: Partial<NormalizedListing> = {}): NormalizedListing => ({
  external_id: id,
  url: `https://amsterdam.mijndak.nl/HuisDetails?PublicatieId=${id}`,
  street: 'Keizersgracht',
  house_number: '12A',
  postcode: '1015AA',
  city: 'Amsterdam',
  district: 'Centrum',
  rent_net: 1100,
  rent_gross: 1150,
  area_m2: 61.4,
  rooms: 3,
  unit_kind: 'Woonruimte',
  dwelling_type: 'Portiekwoning',
  energy_label: 'A',
  landlord: 'Eigen Haard',
  allocation_model: 'Vrije sector',
  label: 'Middenhuur',
  contract_type: 'Onbepaalde tijd contract',
  target_group: 'Gezin',
  lat: null,
  lng: null,
  published_at: '2026-10-20T22:01:00Z',
  deadline_at: '2026-10-27T22:59:00Z',
  raw: {},
  ...extra,
});

function fakeDb(overrides: Partial<Db> = {}): Db {
  return {
    lastFingerprint: vi.fn(async () => null),
    ingest: vi.fn(async () => ({ new: 1, changed: 0, offline: 0, closed: 0 })),
    recordRun: vi.fn(async () => 0),
    claimNotifications: vi.fn(async () => []),
    releaseNotifications: vi.fn(async () => {}),
    linkTelegram: vi.fn(async () => true),
    setMatchStatusByChat: vi.fn(async () => 1),
    ...overrides,
  };
}

const source = (fetchAll: Source['fetchAll']): Source => ({ id: 'dak', name: 'Amsterdam DAK', fetchAll, nextDelay: () => 1 });

describe('runSource', () => {
  it('verwerkt alleen als de vingerafdruk verandert', async () => {
    const db = fakeDb();
    const s = source(async () => ({ items: [listing('1')], complete: true }));
    const fp = { value: null as string | null };

    await runSource(s, db, vi.fn(), fp);
    await runSource(s, db, vi.fn(), fp);

    expect(db.ingest).toHaveBeenCalledTimes(1);
    expect(db.recordRun).toHaveBeenCalledTimes(1);
    expect(vi.mocked(db.recordRun).mock.calls[0]![2]).toBe(true);
  });

  it('legt fouten vast en waarschuwt bij de derde fout op rij', async () => {
    let failures = 0;
    const db = fakeDb({ recordRun: vi.fn(async () => ++failures) });
    const alert = vi.fn(async () => {});
    const s = source(async () => {
      throw new Error('HTTP 503');
    });

    for (let i = 0; i < 3; i++) await runSource(s, db, alert, { value: null });

    expect(db.ingest).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert.mock.calls[0]![0]).toMatch(/3x achter elkaar/);
  });

  it('waarschuwt direct als de bron is gewijzigd', async () => {
    const alert = vi.fn(async () => {});
    await runSource(
      source(async () => {
        throw new SourceChangedError('API gewijzigd');
      }),
      fakeDb(),
      alert,
      { value: null },
    );
    expect(alert).toHaveBeenCalledTimes(1);
  });
});

describe('notifier', () => {
  const claimed = (matchId: number, user: string, id: string): ClaimedNotification => ({
    match_id: matchId,
    user_id: user,
    telegram_chat_id: null,
    whatsapp_phone: `+3160000000${user}`,
    callmebot_apikey: `key-${user}`,
    listing: { ...listing(id), id: Number(id) },
  });

  it('bundelt per gebruiker en geeft mislukte meldingen vrij', async () => {
    const db = fakeDb({
      claimNotifications: vi.fn(async () => [claimed(1, '1', '10'), claimed(2, '1', '11'), claimed(3, '2', '10')]),
    });
    const send = vi.fn(async (phone: string) => {
      if (phone.endsWith('2')) throw new Error('APIKey is invalid');
    });
    vi.useFakeTimers();
    const done = createNotifier(db, { dryRun: false, senders: { whatsapp: send } }).flush();
    await vi.runAllTimersAsync();
    expect(await done).toBe(3);
    vi.useRealTimers();

    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0]![2]).toMatch(/2 nieuwe woningen/);
    expect(db.releaseNotifications).toHaveBeenCalledWith([3], 'Error: APIKey is invalid');
  });

  it('verstuurt niets in DRY_RUN', async () => {
    const send = vi.fn(async () => {});
    const db = fakeDb({ claimNotifications: vi.fn(async () => [claimed(1, '1', '10')]) });
    await createNotifier(db, { dryRun: true, senders: { whatsapp: send } }).flush();
    expect(send).not.toHaveBeenCalled();
  });
});

describe('notifier via Telegram', () => {
  const tgClaim = (matchId: number, id: string): ClaimedNotification => ({
    match_id: matchId,
    user_id: 'u1',
    telegram_chat_id: 42,
    whatsapp_phone: '+31600000000',
    callmebot_apikey: 'k',
    listing: { ...listing(id), id: Number(id) },
  });

  it('stuurt één bericht per woning met knoppen, en gaat voor op WhatsApp', async () => {
    const db = fakeDb({ claimNotifications: vi.fn(async () => [tgClaim(1, '10'), tgClaim(2, '11')]) });
    const telegram = vi.fn(async () => ({}));
    const whatsapp = vi.fn(async () => {});
    vi.useFakeTimers();
    const done = createNotifier(db, { dryRun: false, senders: { telegram, whatsapp } }).flush();
    await vi.runAllTimersAsync();
    await done;
    vi.useRealTimers();

    expect(whatsapp).not.toHaveBeenCalled();
    expect(telegram).toHaveBeenCalledTimes(2);
    const [chatId, html, keyboard] = telegram.mock.calls[0] as unknown as [number, string, { callback_data?: string; url?: string }[][]];
    expect(chatId).toBe(42);
    expect(html).toContain('<b>Keizersgracht 12A</b>');
    expect(keyboard[0]![0]!.url).toContain('PublicatieId=10');
    expect(keyboard[1]!.map((b) => b.callback_data)).toEqual(['reacted:10', 'dismissed:10']);
  });

  it('valt terug op WhatsApp als de worker geen Telegram-token heeft', async () => {
    const db = fakeDb({ claimNotifications: vi.fn(async () => [tgClaim(1, '10')]) });
    const whatsapp = vi.fn(async () => {});
    await createNotifier(db, { dryRun: false, senders: { telegram: null, whatsapp } }).flush();
    expect(whatsapp).toHaveBeenCalledTimes(1);
  });

  it('escapet HTML in Telegram-berichten', () => {
    expect(formatTelegram(listing('1', { street: 'A<b>&c' }))).toContain('A&lt;b&gt;&amp;c');
  });
});

describe('telegram-bot', () => {
  const tg = () => ({
    sendMessage: vi.fn(async () => ({})),
    getUpdates: vi.fn(async () => []),
    answerCallback: vi.fn(async () => ({})),
    editKeyboard: vi.fn(async () => ({})),
  });

  it('koppelt een chat via /start <code>', async () => {
    const t = tg();
    const db = fakeDb();
    await handleUpdate({ update_id: 1, message: { chat: { id: 7 }, text: '/start abc123' } }, t, db);
    expect(db.linkTelegram).toHaveBeenCalledWith('abc123', 7);
    expect(t.sendMessage.mock.calls[0]![1]).toMatch(/Gekoppeld/);
  });

  it('verwerkt de knop Gereageerd', async () => {
    const t = tg();
    const db = fakeDb();
    await handleUpdate(
      {
        update_id: 2,
        callback_query: {
          id: 'cb',
          data: 'reacted:10',
          message: { chat: { id: 7 }, message_id: 99, reply_markup: { inline_keyboard: [[{ text: 'Bekijk', url: 'u' }]] } },
        },
      },
      t,
      db,
    );
    expect(db.setMatchStatusByChat).toHaveBeenCalledWith(7, 10, 'reacted');
    expect(t.answerCallback).toHaveBeenCalledWith('cb', expect.stringMatching(/gereageerd/));
    expect(t.editKeyboard).toHaveBeenCalledTimes(1);
  });

  it('negeert onbekende acties', async () => {
    const t = tg();
    const db = fakeDb();
    await handleUpdate({ update_id: 3, callback_query: { id: 'cb', data: 'delete:10', message: { chat: { id: 7 }, message_id: 1 } } }, t, db);
    expect(db.setMatchStatusByChat).not.toHaveBeenCalled();
  });
});

describe('formatMessage', () => {
  it('toont adres, huur, m², type en deadline', () => {
    const text = formatMessage([listing('383139')]);
    expect(text).toContain('*Keizersgracht 12A, Amsterdam · Centrum*');
    expect(text).toMatch(/€\s1\.100 kaal · 61 m² · 3 kamers/);
    expect(text).toContain('Middenhuur · Vrije sector · Eigen Haard');
    expect(text).toContain('Reageren tot');
    expect(text).toContain('PublicatieId=383139');
  });
});
