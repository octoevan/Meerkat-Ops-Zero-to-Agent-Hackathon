import { NextResponse } from 'next/server';
import { fetchLogsFromGCS, fetchHighRiskLogs } from '@/lib/gcs';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const highRiskOnly = searchParams.get('high_risk') === 'true';
    const threshold = parseFloat(searchParams.get('threshold') || '0.7');

    if (highRiskOnly) {
      const logs = await fetchHighRiskLogs(threshold);
      return NextResponse.json({ logs, count: logs.length });
    }

    const result = await fetchLogsFromGCS();
    return NextResponse.json(result);
  } catch (err) {
    console.error('GCS fetch error:', err);
    return NextResponse.json(
      { error: 'Failed to fetch logs from Google Cloud Storage', detail: String(err) },
      { status: 500 }
    );
  }
}
