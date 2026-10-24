// WhatsApp via CallMeBot (gratis, persoonlijk gebruik). Elke ontvanger activeert de bot één keer
// en krijgt een eigen API-key; zie docs/handleiding.md.

export async function sendWhatsApp(phone: string, apiKey: string, text: string, fetchImpl: typeof fetch = fetch) {
  const url = new URL('https://api.callmebot.com/whatsapp.php');
  url.searchParams.set('phone', phone);
  url.searchParams.set('text', text);
  url.searchParams.set('apikey', apiKey);

  const res = await fetchImpl(url, { signal: AbortSignal.timeout(30_000) });
  const body = await res.text();
  // CallMeBot geeft ook bij fouten soms HTTP 200; de tekst zegt of het gelukt is.
  if (!res.ok || !/queued|sent/i.test(body)) {
    const reason = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
    throw new Error(`CallMeBot HTTP ${res.status}: ${reason}`);
  }
}
