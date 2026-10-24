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
    // Optioneel: WhatsApp naar de beheerder als een bron blijft falen.
    alert:
      process.env.ALERT_WHATSAPP_PHONE && process.env.ALERT_CALLMEBOT_APIKEY
        ? { phone: process.env.ALERT_WHATSAPP_PHONE, apiKey: process.env.ALERT_CALLMEBOT_APIKEY }
        : null,
    // Bestand dat na elke run wordt bijgewerkt; de Docker-healthcheck kijkt naar de leeftijd.
    heartbeatFile: process.env.HEARTBEAT_FILE ?? '/tmp/huurradar-heartbeat',
  };
}

export type Config = ReturnType<typeof loadConfig>;
