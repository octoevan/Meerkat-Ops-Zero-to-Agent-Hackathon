import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  const { alert_id, decision } = await req.json();

  const status = decision === 'confirm' ? 'resolved' : 'suppressed';

  const { data, error } = await supabaseAdmin
    .from('alerts')
    .update({ status, needs_approval: false })
    .eq('id', alert_id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
