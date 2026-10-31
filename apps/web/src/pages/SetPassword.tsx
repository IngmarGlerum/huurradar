import { Alert, Button, Card, Center, Field, Flex, Heading, Input, Stack, Text } from '@chakra-ui/react';
import { useState, type FormEvent } from 'react';
import { supabase } from '../supabase';

export const MIN_PASSWORD = 8;

// Nieuw wachtwoord instellen: na de herstellink uit de mail, of ingelogd via "Wachtwoord wijzigen".
export function SetPassword({ onDone, onCancel }: { onDone: () => void; onCancel?: () => void }) {
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password.length < MIN_PASSWORD) return setError(`Kies een wachtwoord van minimaal ${MIN_PASSWORD} tekens.`);
    if (password !== repeat) return setError('De wachtwoorden zijn niet gelijk.');
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setError(
        /different from the old/i.test(error.message)
          ? 'Kies een ander wachtwoord dan je huidige.'
          : /session|jwt|expired/i.test(error.message)
            ? 'De herstellink is verlopen. Vraag op het inlogscherm een nieuwe aan.'
            : error.message,
      );
      return;
    }
    setSaved(true);
  }

  return (
    <Center minH="100vh" bg="gray.50" px={4}>
      <Card.Root w="full" maxW="sm">
        <Card.Body>
          {saved ? (
            <Stack gap={4}>
              <Heading size="lg">Wachtwoord opgeslagen</Heading>
              <Text>Je kunt voortaan inloggen met je nieuwe wachtwoord.</Text>
              <Button colorPalette="blue" onClick={onDone}>
                Naar huurradar
              </Button>
            </Stack>
          ) : (
            <Stack gap={4} as="form" onSubmit={submit}>
              <Heading size="lg">Nieuw wachtwoord instellen</Heading>
              <Field.Root required>
                <Field.Label>Nieuw wachtwoord</Field.Label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                />
                <Field.HelperText>Minimaal {MIN_PASSWORD} tekens.</Field.HelperText>
              </Field.Root>
              <Field.Root required>
                <Field.Label>Herhaal wachtwoord</Field.Label>
                <Input
                  type="password"
                  value={repeat}
                  onChange={(e) => setRepeat(e.target.value)}
                  autoComplete="new-password"
                />
              </Field.Root>
              {error && (
                <Alert.Root status="error">
                  <Alert.Indicator />
                  <Alert.Title>{error}</Alert.Title>
                </Alert.Root>
              )}
              <Flex gap={2}>
                <Button type="submit" colorPalette="blue" loading={busy}>
                  Opslaan
                </Button>
                {onCancel && (
                  <Button variant="ghost" onClick={onCancel}>
                    Annuleren
                  </Button>
                )}
              </Flex>
            </Stack>
          )}
        </Card.Body>
      </Card.Root>
    </Center>
  );
}
