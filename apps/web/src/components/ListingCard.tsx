import { Badge, Box, Button, Card, Flex, HStack, Link, Stack, Text, Wrap } from '@chakra-ui/react';
import { address, formatDateTime, formatEuro, formatRelative } from '../format';
import type { Listing, UserStatus } from '../types';

interface Props {
  listing: Listing;
  userStatus: UserStatus;
  onStatus: (status: UserStatus) => void;
}

const SOURCE_NAMES: Record<string, string> = {
  dak: 'DAK',
  vesteda: 'Vesteda',
  mvgm: 'MVGM',
  vanderlinden: 'Van der Linden',
  vbt: 'VB&T',
};

const UNAVAILABLE_TEXT: Record<Exclude<Listing['status'], 'active'>, string> = {
  closed: 'Niet meer beschikbaar · reactietermijn verlopen',
  offline: 'Niet meer beschikbaar · staat niet meer online',
};

export function ListingCard({ listing: l, userStatus, onStatus }: Props) {
  const available = l.status === 'active';
  const isNew = userStatus === 'new';

  return (
    <Card.Root
      className="group"
      position="relative"
      borderWidth={available ? '1px' : '2px'}
      borderColor={available ? (isNew ? 'blue.300' : 'border') : 'red.500'}
      bg={available ? 'bg' : 'red.50'}
    >
      <Card.Body gap={3} p={4}>
        {!available && (
          <Flex justify="space-between" align="center" gap={2} wrap="wrap">
            <Text color="red.600" fontWeight="semibold" fontSize="sm">
              {UNAVAILABLE_TEXT[l.status as keyof typeof UNAVAILABLE_TEXT]}
            </Text>
            {/* Op apparaten met muis pas zichtbaar bij hover, op touch altijd. */}
            <Button
              size="xs"
              colorPalette="red"
              variant="solid"
              onClick={() => onStatus('dismissed')}
              opacity={{ base: 1, md: 0 }}
              _groupHover={{ opacity: 1 }}
              css={{ '@media (hover: none)': { opacity: 1 } }}
            >
              Verwijder
            </Button>
          </Flex>
        )}

        <Flex justify="space-between" gap={3} wrap="wrap">
          <Box>
            <HStack gap={2}>
              <Text fontWeight="bold" fontSize="lg">
                {address(l)}
              </Text>
              {isNew && available && <Badge colorPalette="blue">nieuw</Badge>}
              {userStatus === 'reacted' && <Badge colorPalette="green">gereageerd</Badge>}
            </HStack>
            <Text color="fg.muted">
              {[[l.postcode, l.city].filter(Boolean).join(' '), l.district !== l.city ? l.district : null]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </Box>
          <Box textAlign={{ base: 'left', sm: 'right' }}>
            <Text fontWeight="bold" fontSize="xl">
              {formatEuro(l.rent_net)}
            </Text>
            <Text fontSize="xs" color="fg.muted">
              kaal{l.rent_gross ? ` · ${formatEuro(l.rent_gross)} bruto` : ''}
            </Text>
          </Box>
        </Flex>

        <Text>
          {[
            l.area_m2 != null ? `${Math.round(l.area_m2)} m²` : null,
            l.rooms != null ? `${l.rooms} kamers` : null,
            l.dwelling_type,
            l.energy_label ? `label ${l.energy_label}` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>

        <Wrap gap={2}>
          {l.allocation_model && <Badge variant="outline">{l.allocation_model}</Badge>}
          {l.label && l.label !== l.allocation_model && <Badge variant="subtle">{l.label}</Badge>}
          {l.contract_type && <Badge variant="subtle">{l.contract_type}</Badge>}
          {l.target_group && <Badge variant="subtle">{l.target_group}</Badge>}
          {l.landlord && <Badge variant="subtle">{l.landlord}</Badge>}
        </Wrap>

        <Stack gap={0} fontSize="sm" color="fg.muted">
          <Text>Online: {formatRelative(l.published_at ?? l.first_seen_at)}</Text>
          {l.deadline_at && (
            <Text color={available ? 'fg' : undefined} fontWeight={available ? 'medium' : undefined}>
              Reageren tot {formatDateTime(l.deadline_at)} ({formatRelative(l.deadline_at)})
            </Text>
          )}
        </Stack>

        <Flex gap={2} wrap="wrap">
          <Button asChild size="sm" colorPalette="blue" disabled={!available}>
            <Link href={l.url} target="_blank" rel="noreferrer" onClick={() => isNew && onStatus('seen')}>
              Bekijk bij {SOURCE_NAMES[l.source_id] ?? l.landlord ?? 'aanbieder'}
            </Link>
          </Button>
          {available && userStatus !== 'reacted' && (
            <Button size="sm" variant="outline" colorPalette="green" onClick={() => onStatus('reacted')}>
              Gereageerd
            </Button>
          )}
          {available && userStatus === 'reacted' && (
            <Button size="sm" variant="ghost" onClick={() => onStatus('seen')}>
              Toch niet gereageerd
            </Button>
          )}
          {available && (
            <Button size="sm" variant="ghost" color="fg.muted" onClick={() => onStatus('dismissed')}>
              Niet interessant
            </Button>
          )}
        </Flex>
      </Card.Body>
    </Card.Root>
  );
}
