import { Alert, Box, Button, Card, Center, Field, Heading, Input, Stack, Text } from '@chakra-ui/react';
import { useState, type FormEvent } from 'react';
import { supabase } from '../supabase';

type Mode = 'password' | 'link';

function translate(message: string): string {
  // Supabase meldt een onbekend adres (bij uitgeschakelde registratie) als "Signups not allowed".
  if (/signups not allowed/i.test(message)) {
    return 'Dit e-mailadres heeft (nog) geen toegang. Vraag de beheerder om je toe te voegen in Supabase.';
  }
  if (/invalid login credentials/i.test(message)) return 'E-mailadres of wachtwoord klopt niet.';
  if (/email not confirmed/i.test(message)) {
    return 'Dit account is nog niet bevestigd. De beheerder kan het in Supabase opnieuw aanmaken met "Auto Confirm User".';
  }
  if (/rate limit/i.test(message)) {
    return 'Er zijn te veel mails verstuurd. Probeer het over een uur opnieuw, of log in met je wachtwoord.';
  }
  return message;
}

export function Login() {
  const [mode, setMode] = useState<Mode>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'sent' | 'error'>('idle');
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setState('busy');
    const { error } =
      mode === 'password'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signInWithOtp({
            email,
            // Alleen bestaande gebruikers kunnen inloggen.
            options: { shouldCreateUser: false, emailRedirectTo: window.location.origin },
          });
    if (error) {
      setError(translate(error.message));
      setState('error');
    } else {
      // Bij wachtwoord neemt App het over via onAuthStateChange.
      setState(mode === 'link' ? 'sent' : 'idle');
    }
  }

  function switchMode(m: Mode) {
    setMode(m);
    setState('idle');
  }

  return (
    <Center minH="100vh" bg="gray.50" px={4}>
      <Card.Root w="full" maxW="sm">
        <Card.Body>
          <Stack gap={4} as="form" onSubmit={submit}>
            <Heading size="xl">🏠 huurradar</Heading>
            <Field.Root required>
              <Field.Label>E-mailadres</Field.Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </Field.Root>
            {mode === 'password' && (
              <Field.Root required>
                <Field.Label>Wachtwoord</Field.Label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </Field.Root>
            )}
            {mode === 'link' && <Text color="fg.muted">Je krijgt een inloglink per mail.</Text>}
            <Button type="submit" colorPalette="blue" loading={state === 'busy'}>
              {mode === 'password' ? 'Inloggen' : 'Stuur inloglink'}
            </Button>
            <Button
              variant="plain"
              size="sm"
              color="fg.muted"
              onClick={() => switchMode(mode === 'password' ? 'link' : 'password')}
            >
              {mode === 'password' ? 'Liever een inloglink per mail' : 'Inloggen met wachtwoord'}
            </Button>
            {state === 'sent' && (
              <Alert.Root status="success">
                <Alert.Indicator />
                <Alert.Title>Check je mail voor de inloglink.</Alert.Title>
              </Alert.Root>
            )}
            {state === 'error' && (
              <Alert.Root status="error">
                <Alert.Indicator />
                <Box>
                  <Alert.Title>Inloggen lukt niet</Alert.Title>
                  <Alert.Description>{error}</Alert.Description>
                </Box>
              </Alert.Root>
            )}
          </Stack>
        </Card.Body>
      </Card.Root>
    </Center>
  );
}
