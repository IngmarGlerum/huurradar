import { Box, Button, Center, Container, Flex, Heading, Spinner, Tabs, Text } from '@chakra-ui/react';
import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { Login } from './pages/Login';
import { Matches } from './pages/Matches';
import { Notifications } from './pages/Notifications';
import { Profiles } from './pages/Profiles';
import { Status } from './pages/Status';
import { supabase } from './supabase';

const TABS = ['woningen', 'profielen', 'meldingen', 'status'] as const;
type Tab = (typeof TABS)[number];

function initialTab(): Tab {
  const hash = window.location.hash.slice(1);
  return (TABS as readonly string[]).includes(hash) ? (hash as Tab) : 'woningen';
}

export function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [tab, setTab] = useState<Tab>(initialTab);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (session === undefined) {
    return (
      <Center minH="100vh">
        <Spinner />
      </Center>
    );
  }
  if (!session) return <Login />;

  const userId = session.user.id;

  return (
    <Box minH="100vh" bg="gray.50">
      <Container maxW="4xl" py={{ base: 4, md: 8 }} px={4}>
        <Flex justify="space-between" align="center" mb={4} gap={2} wrap="wrap">
          <Heading size="2xl">🏠 huurradar</Heading>
          <Flex align="center" gap={3}>
            <Text fontSize="sm" color="fg.muted">
              {session.user.email}
            </Text>
            <Button size="xs" variant="outline" onClick={() => supabase.auth.signOut()}>
              Uitloggen
            </Button>
          </Flex>
        </Flex>

        <Tabs.Root
          value={tab}
          onValueChange={(e) => {
            setTab(e.value as Tab);
            window.history.replaceState(null, '', `#${e.value}`);
          }}
          lazyMount
          unmountOnExit
        >
          <Tabs.List mb={4} overflowX="auto">
            <Tabs.Trigger value="woningen">Woningen</Tabs.Trigger>
            <Tabs.Trigger value="profielen">Zoekprofielen</Tabs.Trigger>
            <Tabs.Trigger value="meldingen">WhatsApp</Tabs.Trigger>
            <Tabs.Trigger value="status">Status</Tabs.Trigger>
          </Tabs.List>
          <Tabs.Content value="woningen">
            <Matches userId={userId} />
          </Tabs.Content>
          <Tabs.Content value="profielen">
            <Profiles />
          </Tabs.Content>
          <Tabs.Content value="meldingen">
            <Notifications userId={userId} />
          </Tabs.Content>
          <Tabs.Content value="status">
            <Status />
          </Tabs.Content>
        </Tabs.Root>
      </Container>
    </Box>
  );
}
