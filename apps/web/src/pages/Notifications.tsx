import { Alert, Badge, Button, Card, Center, Checkbox, Code, Field, Flex, Heading, Input, List, Spinner, Stack, Text } from '@chakra-ui/react';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabase';
import type { NotificationSettings } from '../types';

const BOT_USERNAME = import.meta.env.VITE_TELEGRAM_BOT_USERNAME as string | undefined;

function Telegram({ s, reload }: { s: NotificationSettings; reload: () => Promise<void> }) {
  const [waiting, setWaiting] = useState(false);
  const linked = s.telegram_chat_id != null;

  // Na het openen van de bot elke 3 seconden kijken of de koppeling gelukt is (max. 3 minuten).
  useEffect(() => {
    if (!waiting || linked) return;
    const started = Date.now();
    const t = window.setInterval(() => {
      if (Date.now() - started > 180_000) setWaiting(false);
      else void reload();
    }, 3_000);
    return () => window.clearInterval(t);
  }, [waiting, linked, reload]);

  async function unlink() {
    await supabase.rpc('unlink_telegram');
    await reload();
  }

  return (
    <Card.Root>
      <Card.Body gap={3}>
        <Flex align="center" gap={2}>
          <Heading size="md">Telegram</Heading>
          {linked ? <Badge colorPalette="green">gekoppeld</Badge> : <Badge>niet gekoppeld</Badge>}
        </Flex>
        {!BOT_USERNAME ? (
          <Text color="red.600">VITE_TELEGRAM_BOT_USERNAME ontbreekt in de configuratie van de web-app.</Text>
        ) : linked ? (
          <>
            <Text>Je krijgt meldingen via Telegram, met knoppen om een woning als gereageerd of niet interessant te markeren.</Text>
            <Button size="sm" variant="outline" alignSelf="start" onClick={unlink}>
              Ontkoppelen
            </Button>
          </>
        ) : (
          <>
            <List.Root as="ol" ps={5} gap={1}>
              <List.Item>Installeer Telegram als je dat nog niet hebt.</List.Item>
              <List.Item>
                Klik op <b>Koppel Telegram</b>. De bot <Code>@{BOT_USERNAME}</Code> opent.
              </List.Item>
              <List.Item>
                Tik in Telegram op <b>Start</b>. Je krijgt het bericht "Gekoppeld!" en deze pagina werkt zichzelf bij.
              </List.Item>
            </List.Root>
            <Flex gap={2} align="center" wrap="wrap">
              <Button asChild colorPalette="blue" alignSelf="start">
                <a
                  href={`https://t.me/${BOT_USERNAME}?start=${s.telegram_link_code}`}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setWaiting(true)}
                >
                  Koppel Telegram
                </a>
              </Button>
              {waiting && (
                <Text fontSize="sm" color="fg.muted">
                  <Spinner size="xs" mr={2} />
                  Wachten op Start in Telegram…
                </Text>
              )}
            </Flex>
            {/* Als je de bot al eerder hebt gestart, stuurt Telegram de code soms niet mee. */}
            <Text fontSize="sm" color="fg.muted">
              Gebeurt er niets? Stuur de bot <Code>@{BOT_USERNAME}</Code> dan zelf dit bericht:{' '}
              <Code userSelect="all">/start {s.telegram_link_code}</Code>
            </Text>
          </>
        )}
      </Card.Body>
    </Card.Root>
  );
}

function WhatsApp({ s, userId }: { s: NotificationSettings; userId: string }) {
  const [phone, setPhone] = useState(s.whatsapp_phone ?? '');
  const [apiKey, setApiKey] = useState(s.callmebot_apikey ?? '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function save() {
    const p = phone.replace(/[\s-]/g, '');
    if (p && !/^\+\d{8,15}$/.test(p)) {
      setMessage({ ok: false, text: 'Telefoonnummer in internationaal formaat, bijvoorbeeld +31612345678.' });
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from('notification_settings')
      .update({ whatsapp_phone: p || null, callmebot_apikey: apiKey.trim() || null, updated_at: new Date().toISOString() })
      .eq('user_id', userId);
    setSaving(false);
    setMessage(error ? { ok: false, text: error.message } : { ok: true, text: 'Opgeslagen.' });
  }

  return (
    <Card.Root>
      <Card.Body gap={4}>
        <Heading size="md">WhatsApp (via CallMeBot)</Heading>
        <Text fontSize="sm" color="fg.muted">
          Alleen nodig als je geen Telegram gebruikt; Telegram gaat voor. Activeer eerst de bot volgens de{' '}
          <a href="https://www.callmebot.com/blog/free-api-whatsapp-messages/" target="_blank" rel="noreferrer">
            <u>instructies van CallMeBot</u>
          </a>
          ; je krijgt dan een API-key.
        </Text>
        <Field.Root>
          <Field.Label>WhatsApp-nummer</Field.Label>
          <Input type="tel" placeholder="+31612345678" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field.Root>
        <Field.Root>
          <Field.Label>CallMeBot API-key</Field.Label>
          <Input value={apiKey} onChange={(e) => setApiKey(e.target.value)} autoComplete="off" />
        </Field.Root>
        {message && (
          <Alert.Root status={message.ok ? 'success' : 'error'}>
            <Alert.Indicator />
            <Alert.Title>{message.text}</Alert.Title>
          </Alert.Root>
        )}
        <Button colorPalette="blue" variant="outline" alignSelf="start" onClick={save} loading={saving}>
          Opslaan
        </Button>
      </Card.Body>
    </Card.Root>
  );
}

export function Notifications({ userId }: { userId: string }) {
  const [s, setS] = useState<NotificationSettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const { data, error } = await supabase.from('notification_settings').select('*').maybeSingle();
    if (error) return setError(error.message);
    if (data) return setS(data as NotificationSettings);
    // Eerste keer: rij aanmaken, zodat er een Telegram-koppelcode is.
    const { error: insertError } = await supabase.from('notification_settings').insert({ user_id: userId });
    if (insertError) return setError(insertError.message);
    const again = await supabase.from('notification_settings').select('*').single();
    if (again.error) setError(again.error.message);
    else setS(again.data as NotificationSettings);
  }, [userId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function toggle(enabled: boolean) {
    setS((prev) => (prev ? { ...prev, enabled } : prev));
    await supabase.from('notification_settings').update({ enabled }).eq('user_id', userId);
  }

  if (error) {
    return (
      <Alert.Root status="error">
        <Alert.Indicator />
        <Alert.Title>{error}</Alert.Title>
      </Alert.Root>
    );
  }
  if (!s) {
    return (
      <Center py={12}>
        <Spinner />
      </Center>
    );
  }

  return (
    <Stack gap={6}>
      <Checkbox.Root checked={s.enabled} onCheckedChange={(e) => void toggle(!!e.checked)}>
        <Checkbox.HiddenInput />
        <Checkbox.Control />
        <Checkbox.Label>Meldingen aan</Checkbox.Label>
      </Checkbox.Root>
      <Telegram s={s} reload={reload} />
      <WhatsApp s={s} userId={userId} />
    </Stack>
  );
}
