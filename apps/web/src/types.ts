export type ListingStatus = 'active' | 'closed' | 'offline';
export type UserStatus = 'new' | 'seen' | 'reacted' | 'dismissed';

export interface Listing {
  id: number;
  source_id: string;
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
  published_at: string | null;
  deadline_at: string | null;
  status: ListingStatus;
  first_seen_at: string;
  status_changed_at: string;
}

export interface MatchRow {
  id: number;
  profile_id: string;
  listing_id: number;
  user_status: UserStatus;
  created_at: string;
  listing: Listing;
}

export interface SearchProfile {
  id: string;
  name: string;
  active: boolean;
  cities: string[];
  min_rent: number | null;
  max_rent: number | null;
  min_area: number | null;
  min_rooms: number | null;
  allocation_models: string[];
  exclude_contract_types: string[];
  exclude_target_groups: string[];
}

export interface NotificationSettings {
  user_id: string;
  whatsapp_phone: string | null;
  callmebot_apikey: string | null;
  enabled: boolean;
}

export interface SourceRow {
  id: string;
  name: string;
  last_checked_at: string | null;
  last_success_at: string | null;
  consecutive_failures: number;
  last_error: string | null;
}

export interface ScrapeRun {
  id: number;
  source_id: string;
  started_at: string;
  ok: boolean;
  changed: boolean | null;
  items: number | null;
  new_items: number | null;
  error: string | null;
}

export const ALLOCATION_MODELS: { value: string; label: string }[] = [
  { value: 'Vrije sector', label: 'Vrije sector / middenhuur' },
  { value: 'Aanbodmodel', label: 'Sociale huur (inschrijfduur)' },
  { value: 'Lotingmodel', label: 'Sociale huur (loting)' },
];
