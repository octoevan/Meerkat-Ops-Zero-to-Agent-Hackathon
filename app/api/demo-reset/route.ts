import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST() {
  await supabaseAdmin.from('alerts').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabaseAdmin.from('agent_activity').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabaseAdmin.from('services').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  return NextResponse.json({ status: 'reset complete' });
}
