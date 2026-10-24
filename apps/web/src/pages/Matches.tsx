import { Alert, Button, Center, Flex, Spinner, Stack, Text } from '@chakra-ui/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ListingCard } from '../components/ListingCard';
import { supabase } from '../supabase';
import type { Listing, MatchRow, UserStatus } from '../types';

type Filter = 'open' | 'reacted' | 'all';

// Eén woning kan op meerdere profielen matchen; in de lijst telt hij één keer.
interface Item {
  listing: Listing;
  matchIds: number[];
  userStatus: UserStatus;
  createdAt: string;
}

const STATUS_RANK: Record<UserStatus, number> = { dismissed: 0, new: 1, seen: 2, reacted: 3 };

function group(rows: MatchRow[]): Item[] {
  const byListing = new Map<number, Item>();
  for (const r of rows) {
    const item = byListing.get(r.listing_id);
    if (!item) {
      byListing.set(r.listing_id, {
        listing: r.listing,
        matchIds: [r.id],
        userStatus: r.user_status,
        createdAt: r.created_at,
      });
    } else {
      item.matchIds.push(r.id);
      if (STATUS_RANK[r.user_status] > STATUS_RANK[item.userStatus]) item.userStatus = r.user_status;
      if (r.created_at < item.createdAt) item.createdAt = r.created_at;
    }
  }
  return [...byListing.values()].sort((a, b) => {
    // Beschikbaar eerst, daarna nieuwste eerst.
    const av = a.listing.status === 'active' ? 0 : 1;
    const bv = b.listing.status === 'active' ? 0 : 1;
    if (av !== bv) return av - bv;
    return (b.listing.published_at ?? b.createdAt).localeCompare(a.listing.published_at ?? a.createdAt);
  });
}

export function Matches({ userId }: { userId: string }) {
  const [rows, setRows] = useState<MatchRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('open');
  const reloadTimer = useRef<number | undefined>(undefined);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('matches')
      .select('id, profile_id, listing_id, user_status, created_at, listing:listings(*)')
      .neq('user_status', 'dismissed')
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) setError(error.message);
    else {
      setError(null);
      setRows(data as unknown as MatchRow[]);
    }
  }, []);

  useEffect(() => {
    void load();
    // Realtime: bij elke wijziging in matches of woningen opnieuw laden (gebundeld).
    const scheduleReload = () => {
      window.clearTimeout(reloadTimer.current);
      reloadTimer.current = window.setTimeout(() => void load(), 500);
    };
    const channel = supabase
      .channel('matches')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches', filter: `user_id=eq.${userId}` }, scheduleReload)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'listings' }, scheduleReload)
      .subscribe();
    // Na terugkeren naar het tabblad ook verversen (bijv. telefoon uit slaapstand).
    const onVisible = () => document.visibilityState === 'visible' && scheduleReload();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearTimeout(reloadTimer.current);
      document.removeEventListener('visibilitychange', onVisible);
      void supabase.removeChannel(channel);
    };
  }, [load, userId]);

  const items = useMemo(() => group(rows ?? []), [rows]);
  const visible = items.filter((i) =>
    filter === 'all' ? true : filter === 'reacted' ? i.userStatus === 'reacted' : i.userStatus !== 'reacted',
  );
  const counts = {
    open: items.filter((i) => i.userStatus !== 'reacted').length,
    reacted: items.filter((i) => i.userStatus === 'reacted').length,
    all: items.length,
  };

  async function setStatus(item: Item, status: UserStatus) {
    // Optimistisch bijwerken; realtime en herladen corrigeren bij een fout.
    setRows((prev) =>
      (prev ?? [])
        .map((r) => (item.matchIds.includes(r.id) ? { ...r, user_status: status } : r))
        .filter((r) => r.user_status !== 'dismissed'),
    );
    const { error } = await supabase.from('matches').update({ user_status: status }).in('id', item.matchIds);
    if (error) {
      setError(error.message);
      void load();
    }
  }

  if (rows === null && !error) {
    return (
      <Center py={12}>
        <Spinner />
      </Center>
    );
  }

  return (
    <Stack gap={4}>
      {error && (
        <Alert.Root status="error">
          <Alert.Indicator />
          <Alert.Title>{error}</Alert.Title>
        </Alert.Root>
      )}
      <Flex gap={2} wrap="wrap">
        {(
          [
            ['open', 'Te doen'],
            ['reacted', 'Gereageerd'],
            ['all', 'Alles'],
          ] as const
        ).map(([value, label]) => (
          <Button
            key={value}
            size="sm"
            variant={filter === value ? 'solid' : 'outline'}
            onClick={() => setFilter(value)}
          >
            {label} ({counts[value]})
          </Button>
        ))}
      </Flex>
      {visible.length === 0 ? (
        <Text color="fg.muted" py={8} textAlign="center">
          {items.length === 0
            ? 'Nog geen passende woningen. Controleer je zoekprofiel; nieuwe woningen verschijnen hier vanzelf.'
            : 'Niets in deze lijst.'}
        </Text>
      ) : (
        visible.map((item) => (
          <ListingCard
            key={item.listing.id}
            listing={item.listing}
            userStatus={item.userStatus}
            onStatus={(s) => void setStatus(item, s)}
          />
        ))
      )}
    </Stack>
  );
}
