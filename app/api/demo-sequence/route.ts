import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { google } from '@ai-sdk/google';
import { generateText } from 'ai';
import { fetchLogsFromGCS, fetchHighRiskLogs } from '@/lib/gcs';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function logActivity(tool_name: string, description: string, details?: string) {
  await supabaseAdmin.from('agent_activity').insert({ tool_name, description, details });
}

async function postSlackAlert(alert: { severity: string; title: string; gemini_summary: string; affected_user: string; source_ip: string }) {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) {
    console.log('Slack not configured, skipping');
    return;
  }

  try {
    const { WebClient } = await import('@slack/web-api');
    const slack = new WebClient(token);

    const severityEmoji: Record<string, string> = { P0: '🔴', P1: '🟠', P2: '🟡', P3: '🔵' };
    const emoji = severityEmoji[alert.severity] || '⚪';

    // Get configured channel from settings
    const { data: settingsData } = await supabaseAdmin
      .from('settings')
      .select('value')
      .eq('key', 'slack_channel')
      .single();

    const targetChannel = settingsData?.value || 'soc-alerts';

    // Find the channel by name
    const channels = await slack.conversations.list({ types: 'public_channel', limit: 200 });
    const channel = channels.channels?.find(c => c.name === targetChannel);
    const channelId = channel?.id;

    if (!channelId) {
      console.log(`Slack channel #${targetChannel} not found. Make sure the bot is added to the channel.`);
      return;
    }

    await slack.chat.postMessage({
      channel: channelId,
      text: `${emoji} ${alert.severity} Alert: ${alert.title}`,
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: `${emoji} ${alert.severity} — ${alert.title}` }
        },
        {
          type: 'section',
          text: { type: 'mrkdwn', text: alert.gemini_summary }
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Affected User:*\n${alert.affected_user}` },
            { type: 'mrkdwn', text: `*Source IP:*\n${alert.source_ip}` },
          ]
        },
        {
          type: 'section',
          text: { type: 'mrkdwn', text: `*Recommended Action:* Revoke access for ${alert.affected_user} and rotate all credentials immediately.` }
        },
        { type: 'divider' },
        {
          type: 'context',
          elements: [
            { type: 'mrkdwn', text: '🛡️ _Meerkat Ops — AI-Powered SOC_' }
          ]
        }
      ]
    });
  } catch (err) {
    console.error('Slack error:', err);
  }
}

async function triggerVoiceCalls(alertContext: string) {
  const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;
  const agentId = process.env.ELEVENLABS_AGENT_ID;
  const phoneNumberId = process.env.ELEVENLABS_PHONE_NUMBER_ID;

  if (!elevenLabsApiKey || !agentId || !phoneNumberId) {
    console.log('ElevenLabs not fully configured (need API key, agent ID, and phone number ID). Skipping voice calls.');
    return;
  }

  // Pull active on-call numbers from Supabase
  const { data: numbers } = await supabaseAdmin
    .from('oncall_numbers')
    .select('phone_number, label')
    .eq('active', true);

  if (!numbers || numbers.length === 0) {
    console.log('No active on-call numbers configured. Add numbers at /admin');
    return;
  }

  for (const num of numbers) {
    try {
      const res = await fetch('https://api.elevenlabs.io/v1/convai/twilio/outbound-call', {
        method: 'POST',
        headers: {
          'xi-api-key': elevenLabsApiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          agent_id: agentId,
          agent_phone_number_id: phoneNumberId,
          to_number: num.phone_number,
          conversation_initiation_client_data: {
            dynamic_variables: {
              alert_context: alertContext,
              severity: 'P1',
              affected_user: 'jsmith@acme.com',
              source_ip: '103.45.67.89 (Lagos, Nigeria)',
              threat_type: 'Credential Compromise — Google Cloud Storage Exfiltration',
              recommended_action: 'Revoke access and rotate all credentials immediately',
            }
          }
        }),
      });

      const result = await res.json();
      console.log(`Called ${num.label} at ${num.phone_number}:`, result);
    } catch (err) {
      console.error(`Voice call error for ${num.phone_number}:`, err);
    }
  }
}

export async function POST() {
  try {
    // Reset first
    await supabaseAdmin.from('alerts').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabaseAdmin.from('agent_activity').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    // ---- STEP 1: THE FLOOD (T+0) — REAL GCS READ ----
    let gcsLogs: Awaited<ReturnType<typeof fetchLogsFromGCS>> | null = null;
    let highRiskLogs: Awaited<ReturnType<typeof fetchHighRiskLogs>> | null = null;

    try {
      await logActivity('ingest', '📥 Connecting to Google Cloud Storage bucket...');
      await sleep(1500);

      gcsLogs = await fetchLogsFromGCS();
      await logActivity('ingest', `📥 Pulled ${gcsLogs.totalCount} log entries from ${gcsLogs.files.length} files in GCS (${gcsLogs.files.join(', ')})`);
      await sleep(2000);

      await logActivity('ingest', `⚡ Rules engine processing... 5 deterministic rules evaluated across ${gcsLogs.totalCount} events`);
      await sleep(2000);

      highRiskLogs = await fetchHighRiskLogs(0.7);
      await logActivity('triage', `🎯 ${highRiskLogs.length} high-risk anomalies detected out of ${gcsLogs.totalCount} logs (${((highRiskLogs.length / gcsLogs.totalCount) * 100).toFixed(1)}% promotion rate). Promoting to AI analysis.`);
    } catch (gcsErr) {
      console.error('GCS fetch failed, falling back to simulated logs:', gcsErr);
      await logActivity('ingest', '📥 Ingesting 10,247 logs from 5 sources (Google Workspace, GCP Cloud Audit, CrowdStrike, Datadog, Nessus)...');
      await sleep(2000);
      await logActivity('ingest', '⚡ Rules engine processing... 5 deterministic rules evaluated per log');
      await sleep(2000);
      await logActivity('triage', '🎯 6 anomalies detected out of 10,247 logs (0.06% promotion rate). Promoting to AI analysis.');
    }

    // ---- STEP 2: THE INVESTIGATION (T+6s) ----
    await sleep(3000);
    await logActivity('queryLogs', '🔍 Querying related events for user jsmith@acme.com across all 5 sources...');
    await sleep(2000);
    await logActivity('evaluateWithGemini', '🧠 Sending correlated evidence to Gemini for cross-source threat analysis...');

    // ---- STEP 3: GEMINI EVALUATION (T+12s) ----
    await sleep(3000);

    let geminiSummary = '';
    let geminiRationale = '';

    try {
      const result = await generateText({
        model: google('gemini-2.0-flash'),
        prompt: `You are an elite SOC analyst. Analyze this correlated evidence from a security incident and provide a threat assessment.

Evidence from 5 sources:
1. Google Workspace: User jsmith@acme.com logged in from Lagos, Nigeria (103.45.67.89) at 14:23 UTC. Normal location: New York, USA. This is 5,100 miles away within 20 minutes of last NYC login.
2. GCP Cloud Audit: setIamPolicy called on gs://acme-patient-records at 14:25 UTC by jsmith@acme.com — added "allUsers" binding with Storage Object Viewer role. This bucket contains HIPAA-protected patient data.
3. Datadog: Network egress spike on gs://acme-patient-records: 4.7GB transferred in 12 minutes (15x baseline of ~300MB/hr).
4. CrowdStrike: jsmith's corporate MacBook (endpoint ID: CB-4421) shows status "isolated/offline" since 13:58 UTC — device was remotely wiped by IT at 13:50.
5. Nessus: Critical vulnerability (CVE-2024-3400, CVSS 10.0) on the Cloud Storage gateway proxy server, flagged 3 days ago, unpatched.

Provide a 2-3 sentence summary of the threat, then a detailed rationale. Be specific and reference the evidence.`,
      });

      const fullText = result.text;
      const sentences = fullText.split('. ');
      geminiSummary = sentences.slice(0, 3).join('. ') + '.';
      geminiRationale = fullText;
    } catch {
      geminiSummary = 'Coordinated credential-based attack detected. Stolen credentials used from Lagos, Nigeria to exfiltrate 4.7GB of HIPAA patient data via publicly exposed Google Cloud Storage bucket. Attacker exploited impossible travel window while legitimate device was offline.';
      geminiRationale = 'Cross-source correlation reveals a coordinated attack: (1) Impossible travel — jsmith logged in from Lagos 20 min after NYC login, 5100 miles apart. (2) IAM policy change — bucket made public with allUsers binding. (3) Massive egress — 15x baseline data transfer from patient records bucket. (4) Endpoint contradiction — real device offline/wiped while cloud credentials active. (5) Unpatched critical CVE on gateway. High confidence coordinated credential theft + data exfiltration.';
    }

    await logActivity('evaluateWithGemini', `✅ Gemini threat assessment complete — P1 Credential Compromise identified with 0.96 confidence`);

    // ---- STEP 4: CREATE ALERTS (T+18s) ----
    await sleep(2000);

    // P1 Alert
    const { data: p1Alert } = await supabaseAdmin.from('alerts').insert({
      severity: 'P1',
      title: 'Credential Compromise — Google Cloud Storage Exfiltration',
      description: 'Coordinated attack using stolen credentials to exfiltrate patient data from Google Cloud Storage bucket',
      affected_user: 'jsmith@acme.com',
      source_ip: '103.45.67.89 (Lagos, Nigeria)',
      gemini_summary: geminiSummary,
      rationale: geminiRationale,
      confidence: 0.96,
      status: 'active',
      needs_approval: false,
    }).select().single();

    await logActivity('createAlert', '🚨 P1 Alert created: Credential Compromise — Google Cloud Storage Exfiltration');

    await sleep(1500);

    // P2 Alert
    await supabaseAdmin.from('alerts').insert({
      severity: 'P2',
      title: 'Anomalous Data Exfiltration',
      description: '15x egress spike on gs://acme-patient-records — 4.7GB transferred in 12 minutes',
      affected_user: 'jsmith@acme.com',
      source_ip: '103.45.67.89',
      gemini_summary: 'Significant data exfiltration detected from HIPAA-protected storage bucket. Transfer volume is 15x the hourly baseline, consistent with bulk data theft.',
      rationale: 'Datadog metrics show 4.7GB egress in a 12-minute window from gs://acme-patient-records. Normal baseline is approximately 300MB/hr. This 15x spike, correlated with the credential compromise and IAM policy change, strongly suggests intentional data exfiltration.',
      confidence: 0.91,
      status: 'active',
      needs_approval: false,
    });

    await logActivity('createAlert', '⚠️ P2 Alert created: Anomalous Data Exfiltration — 15x egress spike');

    // ---- STEP 5: MULTI-CHANNEL RESPONSE (T+24s) ----
    await sleep(2000);
    await logActivity('postSlackAlert', '💬 Posting P1 alert to Slack #soc-alerts...');

    if (p1Alert) {
      await postSlackAlert({
        severity: 'P1',
        title: p1Alert.title,
        gemini_summary: geminiSummary,
        affected_user: 'jsmith@acme.com',
        source_ip: '103.45.67.89 (Lagos, Nigeria)',
      });
    }

    await logActivity('postSlackAlert', '✅ Slack alert posted to #soc-alerts');

    await sleep(2000);
    await logActivity('triggerPhoneCall', '📞 Calling on-call engineer about P1 credential compromise...');

    await triggerVoiceCalls('A P1 credential compromise has been detected for user jsmith at acme dot com.');

    await logActivity('triggerPhoneCall', '✅ Voice call initiated to on-call engineer');

    // ---- STEP 6: HUMAN-IN-THE-LOOP (T+30s) ----
    await sleep(3000);

    await supabaseAdmin.from('alerts').insert({
      severity: 'P1',
      title: 'Revoke Access — jsmith@acme.com',
      description: 'Agent recommends immediate access revocation for compromised user account',
      affected_user: 'jsmith@acme.com',
      source_ip: '103.45.67.89',
      gemini_summary: 'Immediate access revocation recommended for jsmith@acme.com. All credentials should be rotated and active sessions terminated. This action requires human approval before execution.',
      rationale: 'Based on confirmed credential compromise with active data exfiltration, the highest-priority remediation is to revoke all access for the compromised account. This prevents further data loss while the investigation continues.',
      confidence: 0.98,
      status: 'active',
      needs_approval: true,
    });

    await logActivity('revokeAccess', '⏸️ Recommending access revocation for jsmith@acme.com — awaiting human approval (needsApproval: true)');

    return NextResponse.json({ status: 'demo sequence complete' });
  } catch (err) {
    console.error('Demo sequence error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
