import { NextRequest, NextResponse } from 'next/server';
import { stopRunningServices } from '@/lib/services';

export async function POST(req: NextRequest) {
  try {
    await req.json();

    const { data, error } = await stopRunningServices('voice');

    if (error) {
      console.error('Service stop error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      message: data && data.length > 0
        ? `The service has been stopped successfully. ${data[0].name} is now offline.`
        : 'No running services found to stop. The service may have already been stopped.'
    });
  } catch (err) {
    console.error('ElevenLabs webhook error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
