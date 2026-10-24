import {
  Alert,
  Button,
  Card,
  Center,
  Checkbox,
  Field,
  Fieldset,
  Flex,
  Heading,
  Input,
  SimpleGrid,
  Spinner,
  Stack,
  Text,
} from '@chakra-ui/react';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { ALLOCATION_MODELS, type SearchProfile } from '../types';

type Draft = Omit<SearchProfile, 'id'> & { id?: string };

const EMPTY: Draft = {
  name: 'Mijn zoekprofiel',
  active: true,
  cities: ['Amsterdam'],
  min_rent: null,
  max_rent: 1250,
  min_area: null,
  min_rooms: null,
  allocation_models: ['Vrije sector'],
  exclude_contract_types: [],
  exclude_target_groups: [],
};

interface Options {
  cities: string[];
  contractTypes: string[];
  targetGroups: string[];
}

function distinct(values: (string | null)[]): string[] {
  return [...new Set(values.filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b, 'nl'));
}

const toNumber = (v: string) => (v.trim() === '' ? null : Number(v));

function CheckboxList({
  options,
  selected,
  onChange,
}: {
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  return (
    <SimpleGrid columns={{ base: 1, sm: 2 }} gap={2}>
      {options.map((o) => (
        <Checkbox.Root
          key={o.value}
          checked={selected.includes(o.value)}
          onCheckedChange={(e) =>
            onChange(e.checked ? [...selected, o.value] : selected.filter((v) => v !== o.value))
          }
        >
          <Checkbox.HiddenInput />
          <Checkbox.Control />
          <Checkbox.Label>{o.label}</Checkbox.Label>
        </Checkbox.Root>
      ))}
    </SimpleGrid>
  );
}

function ProfileForm({
  initial,
  options,
  onSaved,
  onCancel,
}: {
  initial: Draft;
  options: Options;
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const [d, setD] = useState<Draft>(initial);
  const [citiesText, setCitiesText] = useState(initial.cities.join(', '));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((prev) => ({ ...prev, [k]: v }));

  async function save() {
    setSaving(true);
    setError(null);
    const cities = citiesText
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);
    const { id, ...fields } = { ...d, cities };
    const { error } = id
      ? await supabase.from('search_profiles').update(fields).eq('id', id)
      : await supabase.from('search_profiles').insert(fields);
    setSaving(false);
    if (error) setError(error.message);
    else onSaved();
  }

  async function remove() {
    if (!d.id || !window.confirm(`Zoekprofiel "${d.name}" verwijderen?`)) return;
    const { error } = await supabase.from('search_profiles').delete().eq('id', d.id);
    if (error) setError(error.message);
    else onSaved();
  }

  return (
    <Card.Root>
      <Card.Body gap={5}>
        <Field.Root>
          <Field.Label>Naam</Field.Label>
          <Input value={d.name} onChange={(e) => set('name', e.target.value)} />
        </Field.Root>

        <Field.Root>
          <Field.Label>Plaatsen</Field.Label>
          <Input
            value={citiesText}
            onChange={(e) => setCitiesText(e.target.value)}
            placeholder="Amsterdam, Amstelveen"
            list="cities"
          />
          <datalist id="cities">
            {options.cities.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <Field.HelperText>
            Gescheiden door komma's. Leeg = alle plaatsen. Nu in het aanbod: {options.cities.join(', ') || '–'}
          </Field.HelperText>
        </Field.Root>

        <SimpleGrid columns={{ base: 2, md: 4 }} gap={4}>
          <Field.Root>
            <Field.Label>Min. huur (€)</Field.Label>
            <Input
              type="number"
              inputMode="numeric"
              value={d.min_rent ?? ''}
              onChange={(e) => set('min_rent', toNumber(e.target.value))}
            />
          </Field.Root>
          <Field.Root>
            <Field.Label>Max. huur (€)</Field.Label>
            <Input
              type="number"
              inputMode="numeric"
              value={d.max_rent ?? ''}
              onChange={(e) => set('max_rent', toNumber(e.target.value))}
            />
          </Field.Root>
          <Field.Root>
            <Field.Label>Min. m²</Field.Label>
            <Input
              type="number"
              inputMode="numeric"
              value={d.min_area ?? ''}
              onChange={(e) => set('min_area', toNumber(e.target.value))}
            />
          </Field.Root>
          <Field.Root>
            <Field.Label>Min. kamers</Field.Label>
            <Input
              type="number"
              inputMode="numeric"
              value={d.min_rooms ?? ''}
              onChange={(e) => set('min_rooms', toNumber(e.target.value))}
            />
          </Field.Root>
        </SimpleGrid>
        <Text fontSize="xs" color="fg.muted" mt={-3}>
          Huur = kale huur. Middenhuur in Amsterdam ligt tot ongeveer €1.185 (prijspeil 2025).
        </Text>

        <Fieldset.Root>
          <Fieldset.Legend>Soort aanbod (leeg = alles)</Fieldset.Legend>
          <CheckboxList
            options={ALLOCATION_MODELS}
            selected={d.allocation_models}
            onChange={(v) => set('allocation_models', v)}
          />
        </Fieldset.Root>

        {options.contractTypes.length > 0 && (
          <Fieldset.Root>
            <Fieldset.Legend>Contractvormen uitsluiten</Fieldset.Legend>
            <CheckboxList
              options={options.contractTypes.map((v) => ({ value: v, label: v }))}
              selected={d.exclude_contract_types}
              onChange={(v) => set('exclude_contract_types', v)}
            />
          </Fieldset.Root>
        )}

        {options.targetGroups.length > 0 && (
          <Fieldset.Root>
            <Fieldset.Legend>Doelgroepen uitsluiten</Fieldset.Legend>
            <CheckboxList
              options={options.targetGroups.map((v) => ({ value: v, label: v }))}
              selected={d.exclude_target_groups}
              onChange={(v) => set('exclude_target_groups', v)}
            />
          </Fieldset.Root>
        )}

        <Checkbox.Root checked={d.active} onCheckedChange={(e) => set('active', !!e.checked)}>
          <Checkbox.HiddenInput />
          <Checkbox.Control />
          <Checkbox.Label>Actief (meldingen voor dit profiel)</Checkbox.Label>
        </Checkbox.Root>

        {error && (
          <Alert.Root status="error">
            <Alert.Indicator />
            <Alert.Title>{error}</Alert.Title>
          </Alert.Root>
        )}

        <Flex gap={2} wrap="wrap">
          <Button colorPalette="blue" onClick={save} loading={saving}>
            Opslaan
          </Button>
          {onCancel && (
            <Button variant="ghost" onClick={onCancel}>
              Annuleren
            </Button>
          )}
          {d.id && (
            <Button variant="ghost" colorPalette="red" ml="auto" onClick={remove}>
              Verwijderen
            </Button>
          )}
        </Flex>
      </Card.Body>
    </Card.Root>
  );
}

export function Profiles() {
  const [profiles, setProfiles] = useState<SearchProfile[] | null>(null);
  const [options, setOptions] = useState<Options>({ cities: [], contractTypes: [], targetGroups: [] });
  const [adding, setAdding] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('search_profiles').select('*').order('created_at');
    if (error) setError(error.message);
    else setProfiles(data as SearchProfile[]);
  }, []);

  useEffect(() => {
    void load();
    void supabase
      .from('listings')
      .select('city, contract_type, target_group')
      .eq('status', 'active')
      .eq('unit_kind', 'Woonruimte')
      .limit(2000)
      .then(({ data }) => {
        if (!data) return;
        setOptions({
          cities: distinct(data.map((r) => r.city)),
          contractTypes: distinct(data.map((r) => r.contract_type)),
          targetGroups: distinct(data.map((r) => r.target_group)),
        });
      });
  }, [load]);

  const onSaved = () => {
    setAdding(false);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 3000);
    void load();
  };

  if (profiles === null && !error) {
    return (
      <Center py={12}>
        <Spinner />
      </Center>
    );
  }

  return (
    <Stack gap={6}>
      <Text color="fg.muted">
        Bij het opslaan worden je matches meteen bijgewerkt. Woningen die nu al online staan, verschijnen in je
        lijst maar geven geen WhatsApp; alleen nieuwe woningen geven een melding.
      </Text>
      {error && (
        <Alert.Root status="error">
          <Alert.Indicator />
          <Alert.Title>{error}</Alert.Title>
        </Alert.Root>
      )}
      {saved && (
        <Alert.Root status="success">
          <Alert.Indicator />
          <Alert.Title>Opgeslagen.</Alert.Title>
        </Alert.Root>
      )}
      {profiles?.map((p) => (
        <Stack key={p.id} gap={2}>
          <Heading size="md">{p.name}</Heading>
          <ProfileForm initial={p} options={options} onSaved={onSaved} />
        </Stack>
      ))}
      {(adding || profiles?.length === 0) && (
        <Stack gap={2}>
          <Heading size="md">Nieuw zoekprofiel</Heading>
          <ProfileForm
            initial={EMPTY}
            options={options}
            onSaved={onSaved}
            onCancel={profiles?.length ? () => setAdding(false) : undefined}
          />
        </Stack>
      )}
      {!adding && !!profiles?.length && (
        <Button variant="outline" alignSelf="start" onClick={() => setAdding(true)}>
          + Zoekprofiel toevoegen
        </Button>
      )}
    </Stack>
  );
}
