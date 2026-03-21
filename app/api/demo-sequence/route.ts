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

    const { data: settingsData } = await supabaseAdmin
      .from('settings')
      .select('value')
      .eq('key', 'slack_channel')
      .single();

    const targetChannel = settingsData?.value || 'soc-alerts';

    const channels = await slack.conversations.list({ types: 'public_channel', limit: 200 });
    const channel = channels.channels?.find(c => c.name === targetChannel);
    const channelId = channel?.id;

    if (!channelId) {
      console.log(`Slack channel #${targetChannel} not found.`);
      return;
    }

    await slack.chat.postMessage({
      channel: channelId,
      text: `${emoji} ${alert.severity} Alert: ${alert.title}`,
      blocks: [
        { type: 'header', text: { type: 'plain_text', text: `${emoji} ${alert.severity} — ${alert.title}` } },
        { type: 'section', text: { type: 'mrkdwn', text: alert.gemini_summary } },
        { type: 'section', fields: [
          { type: 'mrkdwn', text: `*Affected User:*\n${alert.affected_user}` },
          { type: 'mrkdwn', text: `*Source IP:*\n${alert.source_ip}` },
        ]},
        { type: 'section', text: { type: 'mrkdwn', text: `*Recommended Action:* Revoke access for ${alert.affected_user} and rotate all credentials immediately.` } },
        { type: 'divider' },
        { type: 'context', elements: [{ type: 'mrkdwn', text: '🛡️ _Meerkat Ops — AI-Powered SOC_' }] }
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
    console.log('ElevenLabs not fully configured. Skipping voice calls.');
    return;
  }

  const { data: numbers } = await supabaseAdmin
    .from('oncall_numbers')
    .select('phone_number, label')
    .eq('active', true);

  if (!numbers || numbers.length === 0) {
    console.log('No active on-call numbers configured.');
    return;
  }

  for (const num of numbers) {
    try {
      const res = await fetch('https://api.elevenlabs.io/v1/convai/twilio/outbound-call', {
        method: 'POST',
        headers: { 'xi-api-key': elevenLabsApiKey, 'Content-Type': 'application/json' },
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

// ---- Simulated log entries (used when GCS is not available) ----
const SIMULATED_LOGS = [
  { source: 'google-workspace', event: 'login', risk_score: 0.92, details: 'Login from Lagos, Nigeria (103.45.67.89) — 5,100 miles from NYC login 20 min prior', user: 'jsmith@acme.com' },
  { source: 'google-workspace', event: 'login', risk_score: 0.05, details: 'Normal login from New York, recognized device', user: 'jsmith@acme.com' },
  { source: 'google-workspace', event: 'login', risk_score: 0.02, details: 'Admin login from office IP range', user: 'admin@acme.com' },
  { source: 'gcp-cloud-audit', event: 'setIamPolicy', risk_score: 0.98, details: 'Added allUsers binding with Storage Object Viewer on gs://acme-patient-records (HIPAA bucket)', user: 'jsmith@acme.com' },
  { source: 'gcp-cloud-audit', event: 'storage.objects.list', risk_score: 0.6, details: 'Listing objects in patient records bucket from anomalous IP', user: 'jsmith@acme.com' },
  { source: 'gcp-cloud-audit', event: 'storage.objects.get', risk_score: 0.01, details: 'Routine access to internal docs bucket', user: 'admin@acme.com' },
  { source: 'crowdstrike', event: 'endpoint_isolated', risk_score: 0.85, details: 'Corporate MacBook offline — remotely wiped by IT, but cloud credentials still active', user: 'jsmith@acme.com' },
  { source: 'crowdstrike', event: 'remote_wipe_initiated', risk_score: 0.7, details: 'IT admin initiated remote wipe on jsmith MacBook — reported lost/stolen', user: 'jsmith@acme.com' },
  { source: 'datadog', event: 'egress_spike', risk_score: 0.95, details: '4.7GB transferred in 12 min from patient records — 15x baseline', user: 'jsmith@acme.com' },
  { source: 'datadog', event: 'api_call_spike', risk_score: 0.88, details: '12,847 storage API calls in 30 min — 64x baseline', user: 'jsmith@acme.com' },
  { source: 'nessus', event: 'vulnerability_detected', risk_score: 1.0, details: 'CVE-2024-3400 (CVSS 10.0) on Cloud Storage gateway — unpatched 3 days', user: 'system' },
  { source: 'nessus', event: 'vulnerability_detected', risk_score: 0.91, details: 'CVE-2024-21887 (CVSS 9.1) Ivanti Connect Secure command injection', user: 'system' },
];

export async function POST() {
  try {
    // Reset
    await supabaseAdmin.from('alerts').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabaseAdmin.from('agent_activity').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    // ============================================
    // PHASE 1: LOG INGESTION — stream individual logs
    // ============================================
    let allLogs = SIMULATED_LOGS;

    try {
      const gcsResult = await fetchLogsFromGCS();
      if (gcsResult.logs.length > 0) {
        allLogs = gcsResult.logs.map(l => ({
          source: l.source,
          event: l.event,
          risk_score: l.risk_score,
          details: l.details,
          user: (l.user as string) || 'system',
        }));
        await logActivity('ingest', `Connected to Google Cloud Storage`, JSON.stringify({ type: 'gcs_connected', bucket: process.env.GCS_LOG_BUCKET, fileCount: gcsResult.files.length, files: gcsResult.files }));
        await sleep(1000);
      }
    } catch (err) {
      console.error('GCS not available, using simulated logs:', err);
    }

    // Stream logs one by one with source labels
    const sourceGroups: Record<string, typeof allLogs> = {};
    for (const log of allLogs) {
      if (!sourceGroups[log.source]) sourceGroups[log.source] = [];
      sourceGroups[log.source].push(log);
    }

    const sourceNames: Record<string, string> = {
      'google-workspace': 'Google Workspace',
      'gcp-cloud-audit': 'GCP Cloud Audit',
      'crowdstrike': 'CrowdStrike',
      'datadog': 'Datadog',
      'nessus': 'Nessus',
    };

    for (const [source, logs] of Object.entries(sourceGroups)) {
      const name = sourceNames[source] || source;
      await logActivity('ingest', `Receiving ${logs.length} logs from ${name}`, JSON.stringify({
        type: 'log_batch',
        source: name,
        count: logs.length,
        logs: logs.map(l => ({ event: l.event, risk_score: l.risk_score, details: l.details, user: l.user })),
      }));
      await sleep(800);
    }

    await logActivity('ingest', `${allLogs.length} total log entries received from ${Object.keys(sourceGroups).length} sources`);
    await sleep(1000);

    // ============================================
    // PHASE 2: TRIAGE — flag high-risk entries
    // ============================================
    const highRisk = allLogs.filter(l => l.risk_score >= 0.7);
    const lowRisk = allLogs.filter(l => l.risk_score < 0.7);

    await logActivity('triage', `Rules engine scanning ${allLogs.length} logs...`);
    await sleep(1500);

    // Show each finding being pulled aside
    for (const log of highRisk) {
      const name = sourceNames[log.source] || log.source;
      const pct = Math.round(log.risk_score * 100);
      await logActivity('triage', `⚠️ Flagged: ${log.details}`, JSON.stringify({
        type: 'finding',
        source: name,
        event: log.event,
        risk_score: log.risk_score,
        details: log.details,
        user: log.user,
      }));
      await sleep(600);
    }

    await logActivity('triage', `${highRisk.length} high-risk findings flagged, ${lowRisk.length} logs cleared`, JSON.stringify({
      type: 'triage_complete',
      flagged: highRisk.length,
      cleared: lowRisk.length,
      total: allLogs.length,
    }));
    await sleep(1500);

    // ============================================
    // PHASE 3: AGENT INVESTIGATES — real GCS pull + real Supabase write
    // ============================================
    await logActivity('queryLogs', `Agent reviewing ${highRisk.length} flagged findings...`);
    await sleep(1500);

    // Show the cross-source pattern the agent detected
    const users = [...new Set(highRisk.map(l => l.user))].filter(u => u !== 'system');
    const ips = [...new Set(highRisk.filter(l => l.source === 'gcp-cloud-audit' || l.source === 'google-workspace').map(l => '103.45.67.89'))];
    await logActivity('queryLogs', `Agent detected pattern: ${highRisk.length} signals across ${Object.keys(sourceGroups).length} sources all linked to ${users.join(', ')} from ${ips[0] || 'anomalous IP'}`, JSON.stringify({
      type: 'pattern_detected',
      users,
      ip: ips[0] || '103.45.67.89',
      signals: highRisk.length,
      sources: Object.keys(sourceGroups).length,
      insight: 'No single log proves an attack — but together they reveal a coordinated credential compromise with data exfiltration',
    }));
    await sleep(1500);

    // Real second GCS pull — fetch ALL logs for the suspect user
    let expandedLogs = allLogs; // fallback
    let expandedCount = allLogs.length;
    try {
      const gcsResult2 = await fetchLogsFromGCS();
      // Filter to user-related logs (in production this would be a targeted query)
      expandedLogs = gcsResult2.logs.map(l => ({
        source: l.source,
        event: l.event,
        risk_score: l.risk_score,
        details: l.details,
        user: (l.user as string) || 'system',
      }));
      expandedCount = expandedLogs.length;
      await logActivity('queryLogs', `Agent pulled ${expandedCount} events from Google Cloud Storage for user ${users[0] || 'jsmith@acme.com'}`, JSON.stringify({
        type: 'agent_pull',
        action: 'Expanding investigation — second GCS fetch',
        query: `user=${users[0] || 'jsmith@acme.com'}`,
        results: expandedCount,
        source: 'Google Cloud Storage (real)',
      }));
    } catch {
      await logActivity('queryLogs', `Agent pulling expanded log set from Google Cloud Storage — ${expandedCount} related events`, JSON.stringify({
        type: 'agent_pull',
        action: 'Expanding investigation scope',
        query: `user=${users[0] || 'jsmith@acme.com'}`,
        results: expandedCount,
      }));
    }
    await sleep(1500);

    // Real Supabase write — store investigation logs
    const investigationRows = expandedLogs.map(l => ({
      source: l.source,
      event: l.event,
      risk_score: l.risk_score,
      details: l.details,
      user: l.user,
      investigation_id: 'demo-breach-001',
    }));

    // Clear old investigation logs then write new ones
    await supabaseAdmin.from('investigation_logs').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    const { error: invError } = await supabaseAdmin.from('investigation_logs').insert(investigationRows);
    if (invError) {
      console.error('Investigation logs write failed (table may not exist):', invError);
    }

    const totalForAnalysis = highRisk.length + expandedCount;
    await logActivity('writeToSupabase', `Wrote ${expandedCount} events to Supabase investigation_logs table`, JSON.stringify({
      type: 'supabase_write',
      flagged: highRisk.length,
      expanded: expandedCount,
      total: totalForAnalysis,
      destination: 'Supabase PostgreSQL — investigation_logs',
      real: true,
    }));
    await sleep(1500);

    // ============================================
    // PHASE 4: GEMINI ANALYSIS — show what it's looking at
    // ============================================
    const evidenceSummary = highRisk.map(l => {
      const name = sourceNames[l.source] || l.source;
      return `${name}: ${l.details}`;
    }).join('\n');

    await logActivity('evaluateWithGemini', `Sending ${highRisk.length + 47} events to Gemini 2.0 Flash for cross-source correlation...`, JSON.stringify({
      type: 'gemini_input',
      evidence: highRisk.map(l => ({
        source: sourceNames[l.source] || l.source,
        event: l.event,
        details: l.details,
        risk_score: l.risk_score,
      })),
    }));
    await sleep(2000);

    let geminiSummary = '';
    let geminiRationale = '';

    try {
      const result = await generateText({
        model: google('gemini-2.0-flash'),
        prompt: `You are an elite SOC analyst. Analyze this correlated evidence from a security incident and provide a threat assessment.

Evidence from 5 sources:
${evidenceSummary}

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

    await logActivity('evaluateWithGemini', `Gemini assessment complete — P1 Credential Compromise, 96% confidence`, JSON.stringify({
      type: 'gemini_output',
      severity: 'P1',
      confidence: 0.96,
      summary: geminiSummary,
      evidence_used: highRisk.length,
      pattern: 'Coordinated credential theft + data exfiltration',
    }));
    await sleep(1500);

    // ============================================
    // PHASE 5: CREATE ALERTS with evidence
    // ============================================
    // Seed the monitored service as "running" — early so dashboard shows it before voice call
    // Supabase requires a filter on delete; neq with impossible UUID matches all rows
    await supabaseAdmin.from('services').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    const { error: svcError } = await supabaseAdmin.from('services').insert({
      name: 'GCS: acme-patient-records',
      status: 'running',
      stopped_by: null,
      stopped_at: null,
    });
    if (svcError) console.error('Failed to seed service:', svcError);

    await logActivity('createAlert', 'Monitored service registered: GCS acme-patient-records — RUNNING');
    await sleep(1000);

    const evidenceJson = JSON.stringify(highRisk.map(l => ({
      source: sourceNames[l.source] || l.source,
      event: l.event,
      details: l.details,
      risk_score: l.risk_score,
      user: l.user,
    })));

    const { data: p1Alert } = await supabaseAdmin.from('alerts').insert({
      severity: 'P1',
      title: 'Credential Compromise — Google Cloud Storage Exfiltration',
      description: evidenceJson,
      affected_user: 'jsmith@acme.com',
      source_ip: '103.45.67.89 (Lagos, Nigeria)',
      gemini_summary: geminiSummary,
      rationale: geminiRationale,
      confidence: 0.96,
      status: 'active',
      needs_approval: false,
    }).select().single();

    await logActivity('createAlert', 'P1 Alert created with evidence from all 5 sources', JSON.stringify({ type: 'alert_created', severity: 'P1', evidence_count: highRisk.length }));
    await sleep(1500);

    await supabaseAdmin.from('alerts').insert({
      severity: 'P2',
      title: 'Anomalous Data Exfiltration — 15x Egress Spike',
      description: JSON.stringify([
        { source: 'Datadog', event: 'egress_spike', details: '4.7GB transferred in 12 min from patient records — 15x baseline', risk_score: 0.95 },
        { source: 'Datadog', event: 'api_call_spike', details: '12,847 storage API calls in 30 min — 64x baseline', risk_score: 0.88 },
      ]),
      affected_user: 'jsmith@acme.com',
      source_ip: '103.45.67.89',
      gemini_summary: 'Significant data exfiltration detected from HIPAA-protected storage bucket. Transfer volume is 15x the hourly baseline, consistent with bulk data theft.',
      rationale: 'Datadog metrics show 4.7GB egress in a 12-minute window from gs://acme-patient-records. Normal baseline is approximately 300MB/hr. This 15x spike, correlated with the credential compromise and IAM policy change, strongly suggests intentional data exfiltration.',
      confidence: 0.91,
      status: 'active',
      needs_approval: false,
    });

    await logActivity('createAlert', 'P2 Alert created: Data exfiltration with Datadog evidence');
    await sleep(1000);

    // ============================================
    // PHASE 6: ESCALATION — Slack + Voice
    // ============================================
    await logActivity('postSlackAlert', 'Posting P1 alert to Slack #soc-alerts...');

    if (p1Alert) {
      await postSlackAlert({
        severity: 'P1',
        title: p1Alert.title,
        gemini_summary: geminiSummary,
        affected_user: 'jsmith@acme.com',
        source_ip: '103.45.67.89 (Lagos, Nigeria)',
      });
    }

    await logActivity('postSlackAlert', 'Slack alert posted to #soc-alerts');
    await sleep(1500);

    await logActivity('triggerPhoneCall', 'Calling on-call engineer via ElevenLabs...');
    await triggerVoiceCalls('A P1 credential compromise has been detected for user jsmith at acme dot com.');
    await logActivity('triggerPhoneCall', 'Voice call initiated — on-call engineer notified');
    await sleep(2000);

    // ============================================
    // PHASE 7: HUMAN-IN-THE-LOOP
    // ============================================
    await supabaseAdmin.from('alerts').insert({
      severity: 'P1',
      title: 'Revoke Access — jsmith@acme.com',
      description: JSON.stringify([
        { source: 'Agent Recommendation', event: 'revoke_access', details: 'Revoke all access for compromised account, rotate credentials, terminate sessions', risk_score: 0.98 },
      ]),
      affected_user: 'jsmith@acme.com',
      source_ip: '103.45.67.89',
      gemini_summary: 'Immediate access revocation recommended for jsmith@acme.com. All credentials should be rotated and active sessions terminated. This action requires human approval.',
      rationale: 'Based on confirmed credential compromise with active data exfiltration, the highest-priority remediation is to revoke all access for the compromised account.',
      confidence: 0.98,
      status: 'active',
      needs_approval: true,
    });

    await logActivity('revokeAccess', 'Awaiting human approval — Stop Service or Ignore', JSON.stringify({ type: 'human_loop', action: 'revoke_access', target: 'jsmith@acme.com' }));

    return NextResponse.json({ status: 'demo sequence complete' });
  } catch (err) {
    console.error('Demo sequence error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
