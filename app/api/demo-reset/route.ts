import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST() {
  await Promise.all([
    supabaseAdmin.from('alerts').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
    supabaseAdmin.from('agent_activity').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
    supabaseAdmin.from('services').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
  ]);

  return NextResponse.json({ status: 'reset complete' });
}
