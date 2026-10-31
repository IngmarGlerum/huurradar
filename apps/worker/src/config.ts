function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Omgevingsvariabele ${name} ontbreekt (zie .env.example)`);
  return v;
}

export function loadConfig() {
  return {
    supabaseUrl: required('SUPABASE_URL'),
    supabaseSecretKey: required('SUPABASE_SECRET_KEY'),
    // true: meldingen alleen loggen, niet versturen.
    dryRun: process.env.DRY_RUN === 'true',
    // Token van de Telegram-bot (@BotFather). Zonder token alleen WhatsApp via CallMeBot.
    telegramToken: process.env.TELEGRAM_BOT_TOKEN || null,
    // Optioneel: melding naar de beheerder als een bron blijft falen (Telegram-chat-ID of WhatsApp).
    alertTelegramChatId: process.env.ALERT_TELEGRAM_CHAT_ID ? Number(process.env.ALERT_TELEGRAM_CHAT_ID) : null,
    alert:
      process.env.ALERT_WHATSAPP_PHONE && process.env.ALERT_CALLMEBOT_APIKEY
        ? { phone: process.env.ALERT_WHATSAPP_PHONE, apiKey: process.env.ALERT_CALLMEBOT_APIKEY }
        : null,
    // Bronnen die niet mogen draaien, kommagescheiden (bijv. "vanderlinden").
    disabledSources: (process.env.DISABLED_SOURCES ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    // Bestand dat na elke run wordt bijgewerkt; de Docker-healthcheck kijkt naar de leeftijd.
    heartbeatFile: process.env.HEARTBEAT_FILE ?? '/tmp/huurradar-heartbeat',
  };
}

export type Config = ReturnType<typeof loadConfig>;
