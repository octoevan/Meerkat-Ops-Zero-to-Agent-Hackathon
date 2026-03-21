import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    // Log the incoming payload for debugging
    const body = await req.json();
    console.log('ElevenLabs webhook received:', JSON.stringify(body));

    // Stop the running service
    const { data, error } = await supabaseAdmin
      .from('services')
      .update({
        status: 'stopped',
        stopped_by: 'voice',
        stopped_at: new Date().toISOString(),
      })
      .eq('status', 'running')
      .select();

    if (error) {
      console.error('Service stop error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Return a message ElevenLabs will speak back to the caller
    return NextResponse.json({
      message: data && data.length > 0
        ? 'The service has been stopped successfully. The GCS bucket acme-patient-records is now offline.'
        : 'No running services found to stop. The service may have already been stopped.'
    });
  } catch (err) {
    console.error('ElevenLabs webhook error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
