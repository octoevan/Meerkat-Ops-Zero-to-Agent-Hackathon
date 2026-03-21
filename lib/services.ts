import { supabaseAdmin } from '@/lib/supabase';

export type StopSource = 'voice' | 'slack';

export async function stopRunningServices(source: StopSource) {
  const { data, error } = await supabaseAdmin
    .from('services')
    .update({
      status: 'stopped',
      stopped_by: source,
      stopped_at: new Date().toISOString(),
    })
    .eq('status', 'running')
    .select();
  return { data, error };
}
