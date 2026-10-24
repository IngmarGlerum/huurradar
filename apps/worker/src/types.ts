// Woning in het formaat van de tabel `listings` (kolomnamen gelijk aan de database).
export interface NormalizedListing {
  external_id: string;
  url: string;
  street: string | null;
  house_number: string | null;
  postcode: string | null;
  city: string | null;
  district: string | null;
  rent_net: number | null;
  rent_gross: number | null;
  area_m2: number | null;
  rooms: number | null;
  unit_kind: string | null;
  dwelling_type: string | null;
  energy_label: string | null;
  landlord: string | null;
  allocation_model: string | null;
  label: string | null;
  contract_type: string | null;
  target_group: string | null;
  lat: number | null;
  lng: number | null;
  published_at: string | null;
  deadline_at: string | null;
  raw: unknown;
}

export interface FetchResult {
  items: NormalizedListing[];
  // true als `items` het volledige aanbod is, zodat ontbrekende woningen als gemist tellen.
  complete: boolean;
}

export interface Source {
  id: string;
  name: string;
  fetchAll(): Promise<FetchResult>;
  // Milliseconden tot de volgende run, gegeven het huidige tijdstip.
  nextDelay(now: Date): number;
}

// Fout die betekent dat de adapter moet worden bijgewerkt (niet tijdelijk).
export class SourceChangedError extends Error {
  override name = 'SourceChangedError';
}
