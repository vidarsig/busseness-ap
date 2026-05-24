import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AppData } from '../types';

let cachedClient: SupabaseClient | null = null;
let cachedUrl = '';
let cachedKey = '';

function getClient(url: string, key: string): SupabaseClient | null {
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
