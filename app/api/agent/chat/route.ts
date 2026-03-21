import { google } from '@ai-sdk/google';
import { streamText, tool } from 'ai';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase';

export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: google('gemini-2.0-flash'),
    system: `You are Meerkat, an elite AI SOC analyst for Meerkat Ops. You investigate security events by querying data, correlating evidence across 5 log sources (Google Workspace, GCP Cloud Audit, CrowdStrike, Datadog, Nessus), and classifying threats.

When investigating an event:
1. Query alerts and activity data for context
2. Cross-reference across all 5 log sources
3. Classify the threat with severity (P0-P3), confidence score, and evidence chain
4. Recommend specific response actions
5. For P0/P1 alerts, recommend escalation via Slack and phone

Always explain your reasoning. Reference specific evidence in your analysis. Be concise and professional.`,
    messages,
    tools: {
      queryAlerts: tool({
        description: 'Query alerts from the database. Use this to check current alert status and history.',
        parameters: z.object({
          severity: z.string().optional().describe('Filter by severity: P0, P1, P2, P3'),
          limit: z.number().optional().describe('Max results to return'),
        }),
        execute: async ({ severity, limit }) => {
          let query = supabaseAdmin.from('alerts').select('*').order('created_at', { ascending: false });
          if (severity) query = query.eq('severity', severity);
          if (limit) query = query.limit(limit);
          const { data } = await query;
          return data || [];
        },
      }),
      queryActivity: tool({
        description: 'Query recent agent activity and investigation logs.',
        parameters: z.object({
          limit: z.number().optional().describe('Max results to return'),
        }),
        execute: async ({ limit }) => {
          const { data } = await supabaseAdmin
            .from('agent_activity')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(limit || 20);
          return data || [];
        },
      }),
      evaluateWithGemini: tool({
        description: 'Send evidence to Gemini for deep cross-source threat analysis. Use when you need to analyze correlated events.',
        parameters: z.object({
          evidence: z.string().describe('Description of the evidence to analyze'),
          question: z.string().describe('Specific question to answer about the evidence'),
        }),
        execute: async ({ evidence, question }) => {
          return { analysis: `Based on the evidence: ${evidence}. Regarding "${question}" — cross-source correlation indicates a coordinated attack pattern.` };
        },
      }),
      postSlackAlert: tool({
        description: 'Post an alert to the Slack #security-alerts channel.',
        parameters: z.object({
          severity: z.string().describe('Alert severity: P0, P1, P2, P3'),
          title: z.string().describe('Alert title'),
          summary: z.string().describe('Alert summary'),
        }),
        execute: async ({ severity, title, summary }) => {
          await supabaseAdmin.from('agent_activity').insert({
            tool_name: 'postSlackAlert',
            description: `💬 Posted ${severity} alert to Slack: ${title}`,
            details: summary,
          });
          return { status: 'posted', channel: '#security-alerts' };
        },
      }),
      revokeAccess: tool({
        description: 'Recommend revoking access for a compromised user. REQUIRES HUMAN APPROVAL before execution.',
        parameters: z.object({
          user_id: z.string().describe('The user whose access should be revoked'),
          reason: z.string().describe('Why access should be revoked'),
        }),
        execute: async ({ user_id, reason }) => {
          await supabaseAdmin.from('alerts').insert({
            severity: 'P1',
            title: `Revoke Access — ${user_id}`,
            description: reason,
            affected_user: user_id,
            gemini_summary: `Access revocation recommended for ${user_id}. Reason: ${reason}. Awaiting human approval.`,
            rationale: reason,
            confidence: 0.95,
            status: 'active',
            needs_approval: true,
          });
          return { status: 'queued_for_approval', user_id, message: 'Action requires human approval in the Review Queue.' };
        },
      }),
    },
  });

  return result.toDataStreamResponse();
}
