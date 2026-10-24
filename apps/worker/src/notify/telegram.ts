// Telegram Bot API. Eén bot voor alle gebruikers; het token komt van @BotFather.

export interface InlineButton {
  text: string;
  url?: string;
  callback_data?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: { chat: { id: number }; text?: string };
  callback_query?: {
    id: string;
    data?: string;
    message?: { chat: { id: number }; message_id: number; reply_markup?: { inline_keyboard: InlineButton[][] } };
  };
}

export function createTelegram(token: string, fetchImpl: typeof fetch = fetch) {
  async function call<T>(method: string, body: Record<string, unknown>, timeoutMs = 30_000): Promise<T> {
    const res = await fetchImpl(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string };
    if (!json.ok) throw new Error(`Telegram ${method}: ${json.description ?? `HTTP ${res.status}`}`);
    return json.result as T;
  }

  return {
    sendMessage: (chatId: number, html: string, keyboard?: InlineButton[][]) =>
      call('sendMessage', {
        chat_id: chatId,
        text: html,
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
        ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
      }),
    // Long polling: wacht tot 50 seconden op nieuwe berichten of knopdrukken.
    getUpdates: (offset: number) =>
      call<TelegramUpdate[]>(
        'getUpdates',
        { offset, timeout: 50, allowed_updates: ['message', 'callback_query'] },
        60_000,
      ),
    answerCallback: (id: string, text: string) => call('answerCallbackQuery', { callback_query_id: id, text }),
    editKeyboard: (chatId: number, messageId: number, keyboard: InlineButton[][]) =>
      call('editMessageReplyMarkup', { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: keyboard } }),
  };
}

export type Telegram = ReturnType<typeof createTelegram>;
