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
  return { user: data.user };
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

// ── Data sync ────────────────────────────────────────────────

export async function pushData(url: string, key: string, userKey: string, data: AppData): Promise<{ error?: string }> {
  const sb = getClient(url, key);
  if (!sb) return { error: 'not_configured' };
  const { error } = await sb
    .from('app_data')
    .upsert({ user_key: userKey, payload: data, updated_at: new Date().toISOString() }, { onConflict: 'user_key' });
  return error ? { error: error.message } : {};
}

export async function pullData(url: string, key: string, userKey: string): Promise<{ data?: AppData; updatedAt?: string; error?: string }> {
  const sb = getClient(url, key);
  if (!sb) return { error: 'not_configured' };
  const { data, error } = await sb
    .from('app_data')
    .select('payload, updated_at')
    .eq('user_key', userKey)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: 'no_data' };
  return { data: data.payload as AppData, updatedAt: data.updated_at };
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
