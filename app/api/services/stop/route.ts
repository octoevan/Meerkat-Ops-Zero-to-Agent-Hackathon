import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  const { source } = await req.json();

  if (!source || !['voice', 'slack'].includes(source)) {
    return NextResponse.json({ error: 'source must be "voice" or "slack"' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('services')
    .update({
      status: 'stopped',
      stopped_by: source,
      stopped_at: new Date().toISOString(),
    })
    .eq('status', 'running')
    .select();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ stopped: data?.length ?? 0, services: data });
}
