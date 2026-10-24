import { Badge, Card, Center, Heading, Spinner, Stack, Table, Text } from '@chakra-ui/react';
import { useEffect, useState } from 'react';
import { formatDateTime, formatRelative } from '../format';
import { supabase } from '../supabase';
import type { ScrapeRun, SourceRow } from '../types';

export function Status() {
  const [sources, setSources] = useState<SourceRow[] | null>(null);
  const [runs, setRuns] = useState<ScrapeRun[]>([]);

  useEffect(() => {
    const load = async () => {
      const [s, r] = await Promise.all([
        supabase.from('sources').select('*').order('id'),
        supabase.from('scrape_runs').select('*').order('started_at', { ascending: false }).limit(25),
      ]);
      setSources((s.data as SourceRow[]) ?? []);
      setRuns((r.data as ScrapeRun[]) ?? []);
    };
    void load();
    const t = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(t);
  }, []);

  if (!sources) {
    return (
      <Center py={12}>
        <Spinner />
      </Center>
    );
  }

  return (
    <Stack gap={6}>
      {sources.map((s) => {
        // Geen run in 30 minuten: de worker draait waarschijnlijk niet.
        const stale = !s.last_checked_at || Date.now() - new Date(s.last_checked_at).getTime() > 30 * 60_000;
        const healthy = s.consecutive_failures === 0 && !stale;
        return (
          <Card.Root key={s.id}>
            <Card.Body gap={2}>
              <Heading size="md">
                {s.name}{' '}
                <Badge colorPalette={healthy ? 'green' : 'red'}>{healthy ? 'werkt' : stale ? 'geen runs' : 'fout'}</Badge>
              </Heading>
              <Text>Laatst gecheckt: {formatRelative(s.last_checked_at)}</Text>
              <Text>Laatst gelukt: {formatDateTime(s.last_success_at)}</Text>
              {s.consecutive_failures > 0 && (
                <Text color="red.600">
                  {s.consecutive_failures} fouten op rij: {s.last_error}
                </Text>
              )}
            </Card.Body>
          </Card.Root>
        );
      })}

      <Stack gap={2}>
        <Heading size="sm">Laatste runs</Heading>
        <Table.ScrollArea>
          <Table.Root size="sm">
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeader>Tijd</Table.ColumnHeader>
                <Table.ColumnHeader>Bron</Table.ColumnHeader>
                <Table.ColumnHeader>Resultaat</Table.ColumnHeader>
                <Table.ColumnHeader textAlign="end">Woningen</Table.ColumnHeader>
                <Table.ColumnHeader textAlign="end">Nieuw</Table.ColumnHeader>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {runs.map((r) => (
                <Table.Row key={r.id}>
                  <Table.Cell>{formatDateTime(r.started_at)}</Table.Cell>
                  <Table.Cell>{r.source_id}</Table.Cell>
                  <Table.Cell>
                    {r.ok ? (r.changed ? 'gewijzigd' : 'ongewijzigd') : <Text color="red.600">{r.error}</Text>}
                  </Table.Cell>
                  <Table.Cell textAlign="end">{r.items ?? '–'}</Table.Cell>
                  <Table.Cell textAlign="end">{r.new_items ?? '–'}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        </Table.ScrollArea>
      </Stack>
    </Stack>
  );
}
