import { Alert, Button, Card, Center, Checkbox, Code, Field, Input, List, Spinner, Stack, Text } from '@chakra-ui/react';
import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import type { NotificationSettings } from '../types';

export function Notifications({ userId }: { userId: string }) {
  const [s, setS] = useState<NotificationSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    void supabase
      .from('notification_settings')
      .select('*')
      .maybeSingle()
      .then(({ data }) =>
        setS((data as NotificationSettings | null) ?? { user_id: userId, whatsapp_phone: '', callmebot_apikey: '', enabled: true }),
      );
  }, [userId]);

  async function save() {
    if (!s) return;
    const phone = (s.whatsapp_phone ?? '').replace(/[\s-]/g, '');
    if (phone && !/^\+\d{8,15}$/.test(phone)) {
      setMessage({ ok: false, text: 'Telefoonnummer in internationaal formaat, bijvoorbeeld +31612345678.' });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('notification_settings').upsert({
      user_id: userId,
      whatsapp_phone: phone || null,
      callmebot_apikey: s.callmebot_apikey?.trim() || null,
      enabled: s.enabled,
      updated_at: new Date().toISOString(),
    });
    setSaving(false);
    setMessage(error ? { ok: false, text: error.message } : { ok: true, text: 'Opgeslagen.' });
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
      <Card.Root>
        <Card.Body gap={3}>
          <Text fontWeight="semibold">WhatsApp-meldingen instellen (eenmalig, via CallMeBot)</Text>
          <List.Root as="ol" ps={5} gap={1}>
            <List.Item>
              Open de{' '}
              <a href="https://www.callmebot.com/blog/free-api-whatsapp-messages/" target="_blank" rel="noreferrer">
                <u>WhatsApp-instructies van CallMeBot</u>
              </a>{' '}
              en zet het telefoonnummer van de bot dat daar staat in je contacten.
            </List.Item>
            <List.Item>
              Stuur dat nummer via WhatsApp het activatiebericht dat op de site staat (iets als <Code>I allow callmebot to send me messages</Code>).
            </List.Item>
            <List.Item>Je krijgt een antwoord met je API-key. Vul die hieronder in.</List.Item>
          </List.Root>
        </Card.Body>
      </Card.Root>

      <Card.Root>
        <Card.Body gap={4}>
          <Field.Root>
            <Field.Label>WhatsApp-nummer</Field.Label>
            <Input
              type="tel"
              placeholder="+31612345678"
              value={s.whatsapp_phone ?? ''}
              onChange={(e) => setS({ ...s, whatsapp_phone: e.target.value })}
            />
          </Field.Root>
          <Field.Root>
            <Field.Label>CallMeBot API-key</Field.Label>
            <Input
              value={s.callmebot_apikey ?? ''}
              onChange={(e) => setS({ ...s, callmebot_apikey: e.target.value })}
              autoComplete="off"
            />
          </Field.Root>
          <Checkbox.Root checked={s.enabled} onCheckedChange={(e) => setS({ ...s, enabled: !!e.checked })}>
            <Checkbox.HiddenInput />
            <Checkbox.Control />
            <Checkbox.Label>Meldingen aan</Checkbox.Label>
          </Checkbox.Root>
          {message && (
            <Alert.Root status={message.ok ? 'success' : 'error'}>
              <Alert.Indicator />
              <Alert.Title>{message.text}</Alert.Title>
            </Alert.Root>
          )}
          <Button colorPalette="blue" alignSelf="start" onClick={save} loading={saving}>
            Opslaan
          </Button>
        </Card.Body>
      </Card.Root>
    </Stack>
  );
}
