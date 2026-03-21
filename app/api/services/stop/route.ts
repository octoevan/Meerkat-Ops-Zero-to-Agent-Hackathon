import { NextRequest, NextResponse } from 'next/server';
import { stopRunningServices, type StopSource } from '@/lib/services';

export async function POST(req: NextRequest) {
  const { source } = await req.json();

  if (!source || !['voice', 'slack'].includes(source)) {
    return NextResponse.json({ error: 'source must be "voice" or "slack"' }, { status: 400 });
  }

  const { data, error } = await stopRunningServices(source as StopSource);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ stopped: data?.length ?? 0, services: data });
}
