import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { AppData } from '../types';

let cachedClient: SupabaseClient | null = null;
let cachedUrl = '';
let cachedKey = '';

export function getClient(url: string, key: string): SupabaseClient | null {
  if (!url || !key) return null;
  if (cachedClient && cachedUrl === url && cachedKey === key) return cachedClient;
  try {
    cachedClient = createClient(url, key);
    cachedUrl = url;
    cachedKey = key;
    return cachedClient;
  } catch {
    return null;
  }
}

// ── Auth ─────────────────────────────────────────────────────

export async function signUp(url: string, key: string, email: string, password: string, name: string) {
  const sb = getClient(url, key);
  if (!sb) return { error: 'Supabase not configured' };
  const { data, error } = await sb.auth.signUp({
    email, password,
    options: { data: { name, role: 'owner' } },
  });
  if (error) return { error: error.message };
  // When the email already exists (and confirmation is on), Supabase returns an
  // obfuscated user with an empty identities array and no error — surface it so
  // we can tell the person to sign in instead of silently doing nothing.
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    return { alreadyExists: true as const };
  }
  // data.session is null when email confirmation is required; the caller uses
  // its presence to decide "straight in" vs "check your email to confirm".
  return { user: data.user, session: data.session };
}

export async function signIn(url: string, key: string, email: string, password: string) {
  const sb = getClient(url, key);
  if (!sb) return { error: 'Supabase not configured' };
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };
  return { user: data.user, session: data.session };
}

export async function signOut(url: string, key: string) {
  const sb = getClient(url, key);
  if (!sb) return;
  await sb.auth.signOut();
}

export async function resetPassword(url: string, key: string, email: string) {
  const sb = getClient(url, key);
  if (!sb) return { error: 'Supabase not configured' };
  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/?reset=true`,
  });
  return error ? { error: error.message } : {};
}

export async function getSession(url: string, key: string) {
  const sb = getClient(url, key);
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session;
}

export async function getCurrentUser(url: string, key: string): Promise<User | null> {
  const sb = getClient(url, key);
  if (!sb) return null;
  const { data } = await sb.auth.getUser();
  return data.user ?? null;
}

// Multi-user: the data-partition key ("company") for the logged-in user, from
// the company_members table. New users claim their own company (key = their
// uid); a migrated owner already has a membership pointing at their real data.
// Returns null if not logged in or the table isn't set up yet — callers then
// fall back to the legacy manual key, so nothing breaks pre-migration.
export async function resolveCompanyKey(url: string, key: string): Promise<string | null> {
  const sb = getClient(url, key);
  if (!sb) return null;
  const { data: userData } = await sb.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) return null;
  const { data: rows, error } = await sb.from('company_members').select('company_key').eq('user_id', uid).limit(1);
  if (error) return null; // table missing or no access — fall back to legacy key
  if (rows && rows.length > 0) return rows[0].company_key as string;
  // No membership yet — claim a fresh company keyed to this user.
  const { error: insErr } = await sb.from('company_members').insert({ user_id: uid, company_key: uid, role: 'owner' });
  if (insErr) return null;
  return uid;
}

// ── Data sync ────────────────────────────────────────────────

// WHAT A COPY OF THE BOOKS SAYS ABOUT ITSELF. Written into the payload, so it needs
// no column of its own and travels with the data it describes.
//   `version` counts writes, not minutes: every push stores one more than the copy it
// replaced. `count` is how many færslur the copy holds — the sanity check that catches
// the case a version alone would not.
export interface SyncStamp { version: number; count: number }

export const SYNC_FIELD = '__sync';

type Stamped = AppData & { [SYNC_FIELD]?: SyncStamp };

export function readStamp(payload: unknown): SyncStamp | null {
  const raw = (payload as Stamped | null)?.[SYNC_FIELD];
  if (!raw || typeof raw.version !== 'number') return null;
  return { version: raw.version, count: typeof raw.count === 'number' ? raw.count : 0 };
}

export function stampOf(data: AppData, version: number): SyncStamp {
  return { version, count: (data.transactions ?? []).length };
}

export async function pushData(url: string, key: string, userKey: string, data: AppData, stamp?: SyncStamp): Promise<{ error?: string }> {
  const sb = getClient(url, key);
  if (!sb) return { error: 'not_configured' };
  const payload: Stamped = stamp ? { ...data, [SYNC_FIELD]: stamp } : data;
  const { error } = await sb
    .from('app_data')
    .upsert({ user_key: userKey, payload, updated_at: new Date().toISOString() }, { onConflict: 'user_key' });
  return error ? { error: error.message } : {};
}

export async function pullData(url: string, key: string, userKey: string): Promise<{ data?: AppData; updatedAt?: string; stamp?: SyncStamp | null; error?: string }> {
  const sb = getClient(url, key);
  if (!sb) return { error: 'not_configured' };
  const { data, error } = await sb
    .from('app_data')
    .select('payload, updated_at')
    .eq('user_key', userKey)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: 'no_data' };
  return { data: data.payload as AppData, updatedAt: data.updated_at, stamp: readStamp(data.payload) };
}

// The cloud copy's stamp WITHOUT its books — one JSON field, a few bytes, so a device
// can ask "did you move since I last saw you?" without pulling megabytes to find out.
// A row written before stamps existed answers `stamp: null`, which the caller must
// treat as "unknown" and settle with a full pull.
export async function remoteStamp(url: string, key: string, userKey: string): Promise<{ stamp?: SyncStamp | null; updatedAt?: string; error?: string }> {
  const sb = getClient(url, key);
  if (!sb) return { error: 'not_configured' };
  const { data, error } = await sb
    .from('app_data')
    .select(`updated_at, sync:payload->${SYNC_FIELD}`)
    .eq('user_key', userKey)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: 'no_data' };
  const raw = (data as { sync?: SyncStamp | null }).sync ?? null;
  return {
    stamp: raw && typeof raw.version === 'number'
      ? { version: raw.version, count: typeof raw.count === 'number' ? raw.count : 0 }
      : null,
    updatedAt: (data as { updated_at?: string }).updated_at,
  };
}

export type SyncMove = 'push' | 'pull' | 'conflict' | 'unknown';

// WHICH WAY A SYNC MUST GO — DECIDED ON WRITES AND ROW COUNTS, NEVER ON A CLOCK.
// The first version of this asked which side carried the later timestamp, and the
// owner's phone showed why that is not good enough: it stamped itself 17:09 while
// holding 9.584 færslur from 10 July, against a cloud stamped 03:45 holding 11.652.
// By the clock the stale device was "newer" and would have been allowed to push July
// over August. A clock says when a device last did something; it says nothing about
// what it holds.
//
//   `base`  — the version this device last agreed with the cloud on
//   `count` — how many færslur this device holds right now
//   `dirty` — this device has changes that have not been sent yet
//
// The cloud moved past us      → fetch, unless we also have unsent changes (a real
//                                conflict, which must be shown, never resolved by force)
// We hold fewer rows and have
// nothing of our own to send   → fetch. This is the stale phone, and no timestamp
//                                it writes about itself can talk it out of this.
// Otherwise                    → send.
export function syncDecision(
  mine: { base: number; count: number; dirty: boolean },
  theirs: SyncStamp | null | undefined,
): SyncMove {
  // A row from before stamps existed tells us nothing — the caller settles it by
  // pulling the whole payload and comparing what is actually in it.
  if (!theirs) return 'unknown';
  if (theirs.version > mine.base) return mine.dirty ? 'conflict' : 'pull';
  if (!mine.dirty && theirs.count > mine.count) return 'pull';
  return 'push';
}

export const SETUP_SQL = `-- Run this in your Supabase SQL Editor:
create table if not exists app_data (
  user_key text primary key,
  payload  jsonb not null,
  updated_at timestamptz default now()
);

alter table app_data enable row level security;

create policy "allow_all" on app_data
  for all using (true) with check (true);`;
