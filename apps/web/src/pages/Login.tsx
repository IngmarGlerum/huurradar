import { Alert, Box, Button, Card, Center, Field, Flex, Heading, Input, Stack, Text } from '@chakra-ui/react';
import { useState, type FormEvent } from 'react';
import { supabase } from '../supabase';

type Mode = 'password' | 'link' | 'signup';

const MIN_PASSWORD = 8;

function translate(message: string): string {
  // Supabase meldt een onbekend adres (bij uitgeschakelde registratie) als "Signups not allowed".
  if (/signups not allowed/i.test(message)) {
    return 'Registreren staat uit, of dit e-mailadres heeft nog geen account. Vraag de beheerder om een uitnodigingscode.';
  }
  if (/invalid login credentials/i.test(message)) return 'E-mailadres of wachtwoord klopt niet.';
  if (/email not confirmed/i.test(message)) {
    return 'Je e-mailadres is nog niet bevestigd. Klik op de link in de bevestigingsmail.';
  }
  if (/already registered|already exists/i.test(message)) {
    return 'Er bestaat al een account met dit e-mailadres. Log in met je wachtwoord.';
  }
  if (/password should be at least/i.test(message)) return `Kies een wachtwoord van minimaal ${MIN_PASSWORD} tekens.`;
  if (/rate limit/i.test(message)) {
    return 'Er zijn te veel mails verstuurd. Probeer het over een uur opnieuw, of log in met je wachtwoord.';
  }
  // De database weigert een nieuwe gebruiker zonder geldige uitnodigingscode; Supabase geeft dan
  // alleen deze algemene melding door.
  if (/database error saving new user/i.test(message)) return 'De uitnodigingscode klopt niet.';
  return message;
}

const TITLES: Record<Mode, string> = {
  password: 'Inloggen',
  link: 'Stuur inloglink',
  signup: 'Account aanmaken',
};

export function Login() {
  const [mode, setMode] = useState<Mode>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'sent' | 'confirm' | 'error'>('idle');
  const [error, setError] = useState('');

  function fail(message: string) {
    setError(translate(message));
    setState('error');
  }

  async function signup() {
    if (password.length < MIN_PASSWORD) return fail(`password should be at least ${MIN_PASSWORD}`);
    const { data: ok, error: rpcError } = await supabase.rpc('check_invite_code', { p_code: inviteCode.trim() });
    if (rpcError) return fail(rpcError.message);
    if (!ok) return fail('Database error saving new user');

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { invite_code: inviteCode.trim() }, emailRedirectTo: window.location.origin },
    });
    if (error) return fail(error.message);
    // Zonder sessie staat "Confirm email" aan in Supabase: eerst de mail bevestigen.
    setState(data.session ? 'idle' : 'confirm');
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setState('busy');
    if (mode === 'signup') return signup();

    const { error } =
      mode === 'password'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signInWithOtp({
            email,
            // Alleen bestaande gebruikers kunnen een inloglink krijgen.
            options: { shouldCreateUser: false, emailRedirectTo: window.location.origin },
          });
    if (error) return fail(error.message);
    // Bij wachtwoord neemt App het over via onAuthStateChange.
    setState(mode === 'link' ? 'sent' : 'idle');
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
            {mode === 'signup' && (
              <Text color="fg.muted">Maak een account aan met de uitnodigingscode die je hebt gekregen.</Text>
            )}
            <Field.Root required>
              <Field.Label>E-mailadres</Field.Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </Field.Root>
            {mode !== 'link' && (
              <Field.Root required>
                <Field.Label>Wachtwoord</Field.Label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                />
                {mode === 'signup' && <Field.HelperText>Minimaal {MIN_PASSWORD} tekens.</Field.HelperText>}
              </Field.Root>
            )}
            {mode === 'signup' && (
              <Field.Root required>
                <Field.Label>Uitnodigingscode</Field.Label>
                <Input value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} autoComplete="off" />
              </Field.Root>
            )}
            {mode === 'link' && <Text color="fg.muted">Je krijgt een inloglink per mail.</Text>}
            <Button type="submit" colorPalette="blue" loading={state === 'busy'}>
              {TITLES[mode]}
            </Button>
            <Flex direction="column" gap={1}>
              {mode !== 'password' && (
                <Button variant="plain" size="sm" color="fg.muted" onClick={() => switchMode('password')}>
                  Inloggen met wachtwoord
                </Button>
              )}
              {mode !== 'signup' && (
                <Button variant="plain" size="sm" color="fg.muted" onClick={() => switchMode('signup')}>
                  Nog geen account? Account aanmaken
                </Button>
              )}
              {mode === 'password' && (
                <Button variant="plain" size="sm" color="fg.muted" onClick={() => switchMode('link')}>
                  Liever een inloglink per mail
                </Button>
              )}
            </Flex>
            {state === 'sent' && (
              <Alert.Root status="success">
                <Alert.Indicator />
                <Alert.Title>Check je mail voor de inloglink.</Alert.Title>
              </Alert.Root>
            )}
            {state === 'confirm' && (
              <Alert.Root status="success">
                <Alert.Indicator />
                <Alert.Title>Account aangemaakt. Bevestig je e-mailadres via de link in je mail.</Alert.Title>
              </Alert.Root>
            )}
            {state === 'error' && (
              <Alert.Root status="error">
                <Alert.Indicator />
                <Box>
                  <Alert.Title>{mode === 'signup' ? 'Account aanmaken lukt niet' : 'Inloggen lukt niet'}</Alert.Title>
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
