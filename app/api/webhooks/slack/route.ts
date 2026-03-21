import { NextRequest, NextResponse } from 'next/server';
import { google } from '@ai-sdk/google';
import { generateText } from 'ai';
import { stopRunningServices } from '@/lib/services';

export async function POST(req: NextRequest) {
  const body = await req.json();

  // Handle Slack URL verification challenge
  if (body.type === 'url_verification') {
    return NextResponse.json({ challenge: body.challenge });
  }

  // Handle app_mention events
  if (body.event?.type === 'app_mention') {
    const userMessage = body.event.text.replace(/<@[^>]+>/g, '').trim();
    const channel = body.event.channel;
    const threadTs = body.event.ts;

    try {
      const { WebClient } = await import('@slack/web-api');
      const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

      // Check if the message is a "stop service" command
      if (/\bstop\s+(the\s+)?(service|breach|attack)/i.test(userMessage)) {
        const { data } = await stopRunningServices('slack');

        const stoppedCount = data?.length ?? 0;
        const replyText = stoppedCount > 0
          ? '🛑 Service stopped. GCS bucket `acme-patient-records` is now offline.\n_Stopped via Slack by your command._'
          : '⚠️ No running services found to stop. The service may have already been stopped.';

        await slack.chat.postMessage({
          channel,
          thread_ts: threadTs,
          text: replyText,
        });
      } else {
        // Default: respond with Gemini analysis
        const result = await generateText({
          model: google('gemini-2.0-flash'),
          system: 'You are Meerkat, an AI SOC analyst. Respond concisely to security questions. Reference specific data when possible.',
          prompt: userMessage,
        });

        await slack.chat.postMessage({
          channel,
          thread_ts: threadTs,
          text: result.text,
        });
      }
    } catch (err) {
      console.error('Slack webhook error:', err);
    }
  }

  return NextResponse.json({ ok: true });
}
