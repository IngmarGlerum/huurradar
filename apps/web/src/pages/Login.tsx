import { Alert, Box, Button, Card, Center, Field, Heading, Input, Stack, Text } from '@chakra-ui/react';
import { useState, type FormEvent } from 'react';
import { supabase } from '../supabase';

export function Login() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setState('sending');
    const { error } = await supabase.auth.signInWithOtp({
      email,
      // Alleen uitgenodigde gebruikers kunnen inloggen.
      options: { shouldCreateUser: false, emailRedirectTo: window.location.origin },
    });
    if (error) {
      setError(error.message);
      setState('error');
    } else {
      setState('sent');
    }
  }

  return (
    <Center minH="100vh" bg="gray.50" px={4}>
      <Card.Root w="full" maxW="sm">
        <Card.Body>
          <Stack gap={4} as="form" onSubmit={submit}>
            <Heading size="xl">🏠 huurradar</Heading>
            <Text color="fg.muted">Log in met je e-mailadres. Je krijgt een link toegestuurd.</Text>
            <Field.Root required>
              <Field.Label>E-mailadres</Field.Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </Field.Root>
            <Button type="submit" colorPalette="blue" loading={state === 'sending'}>
              Stuur inloglink
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
