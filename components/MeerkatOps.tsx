'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  Terminal,
  Shield,
  Zap,
  Bell,
  ChevronRight,
  MessageSquare,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Phone,
  Clock,
  Eye,
  RefreshCw,
  Database,
  Filter,
  Brain,
  UserCheck,
  ArrowRight,
  FileText,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Alert {
  id: string;
  severity: string;
  title: string;
  description: string;
  affected_user: string;
  source_ip: string;
  gemini_summary: string;
  rationale: string;
  confidence: number;
  status: string;
  needs_approval: boolean;
  created_at: string;
}

interface AgentActivity {
  id: string;
  tool_name: string;
  description: string;
  details: string;
  created_at: string;
}

// Parse evidence from alert.description (JSON array of evidence objects)
function parseEvidence(desc: string): { source: string; event: string; details: string; risk_score: number }[] {
  try {
    const parsed = JSON.parse(desc);
    if (Array.isArray(parsed)) return parsed;
  } catch {}
  return [];
}

// Parse structured details from activity
function parseDetails(details: string): Record<string, unknown> | null {
  if (!details) return null;
  try {
    return JSON.parse(details);
  } catch {}
  return null;
}

export default function MeerkatOps() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [activity, setActivity] = useState<AgentActivity[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<{ role: string; content: string }[]>([
    { role: 'assistant', content: 'Hello! I\'m Meerkat, your AI SOC analyst. Ask me about any security events or threats.' }
  ]);
  const [isPolling, setIsPolling] = useState(false);
  const [services, setServices] = useState<{ id: string; name: string; status: string; stopped_by: string | null; stopped_at: string | null }[]>([]);

  const fetchData = useCallback(async () => {
    try {
      const [alertsRes, activityRes, servicesRes] = await Promise.all([
        fetch('/api/alerts'),
        fetch('/api/agent-activity'),
        fetch('/api/services'),
      ]);
      const alertsData = await alertsRes.json();
      const activityData = await activityRes.json();
      const servicesData = await servicesRes.json();
      if (Array.isArray(alertsData)) setAlerts(alertsData);
      if (Array.isArray(activityData)) setActivity(activityData);
      if (Array.isArray(servicesData)) setServices(servicesData);
    } catch {}
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const hasRunningService = services.some(s => s.status === 'running');
  const shouldPoll = isPolling || hasRunningService;
  useEffect(() => {
    if (!shouldPoll) return;
    const interval = setInterval(fetchData, 1500);
    return () => clearInterval(interval);
  }, [shouldPoll, fetchData]);

  const startDemo = async () => {
    setIsRunning(true);
    setIsPolling(true);
    try {
      await fetch('/api/demo-sequence', { method: 'POST' });
    } catch {}
    setIsRunning(false);
    setTimeout(() => setIsPolling(false), 10000);
    fetchData();
  };

  const resetDemo = async () => {
    await fetch('/api/demo-reset', { method: 'POST' });
    setAlerts([]);
    setActivity([]);
    setServices([]);
  };

  const handleReview = async (alertId: string, decision: string) => {
    await fetch('/api/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alert_id: alertId, decision }),
    });
    fetchData();
  };

  const handleChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const userMsg = chatInput;
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    try {
      const res = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [...chatMessages, { role: 'user', content: userMsg }] }),
      });
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let assistantMsg = '';
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.startsWith('0:')) {
              try { assistantMsg += JSON.parse(line.slice(2)); } catch {}
            }
          }
        }
      }
      if (assistantMsg) setChatMessages(prev => [...prev, { role: 'assistant', content: assistantMsg }]);
    } catch {
      setChatMessages(prev => [...prev, { role: 'assistant', content: 'Error processing request.' }]);
    }
  };

  const activeAlerts = alerts.filter(a => a.status === 'active' && !a.needs_approval);
  const pendingReviews = alerts.filter(a => a.needs_approval && a.status === 'active');

  // Derive pipeline state from activity
  const toolNames = activity.map(a => a.tool_name);
  const hasIngest = toolNames.includes('ingest');
  const hasTriage = toolNames.includes('triage');
  const hasQueryLogs = toolNames.includes('queryLogs');
  const hasWriteSupabase = toolNames.includes('writeToSupabase');
  const hasGemini = toolNames.includes('evaluateWithGemini');
  const hasCreateAlert = toolNames.includes('createAlert');
  const hasSlack = toolNames.includes('postSlackAlert');
  const hasPhone = toolNames.includes('triggerPhoneCall');
  const hasRevoke = toolNames.includes('revokeAccess');
  const agentActive = hasQueryLogs || hasWriteSupabase || hasGemini || hasCreateAlert;

  // Extract findings from activity details
  const findings = activity
    .filter(a => a.tool_name === 'triage' && a.details)
    .map(a => parseDetails(a.details))
    .filter(d => d && d.type === 'finding') as Record<string, unknown>[];

  // Extract log batches
  const logBatches = activity
    .filter(a => a.tool_name === 'ingest' && a.details)
    .map(a => parseDetails(a.details))
    .filter(d => d && d.type === 'log_batch') as Record<string, unknown>[];

  const severityColor: Record<string, string> = {
    P0: 'bg-red-500', P1: 'bg-orange-500', P2: 'bg-yellow-500', P3: 'bg-blue-500',
  };
  const severityBorder: Record<string, string> = {
    P0: 'border-red-500/50', P1: 'border-orange-500/50', P2: 'border-yellow-500/50', P3: 'border-blue-500/50',
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#141420] font-sans text-zinc-100">
      {/* Sidebar */}
      <aside className="w-56 border-r border-zinc-700/50 bg-[#111118] flex flex-none flex-col">
        <div className="p-5 flex items-center gap-3">
          <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center shadow-[0_0_15px_rgba(16,185,129,0.3)]">
            <Shield className="w-5 h-5 text-black" strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">Meerkat <span className="text-emerald-500">Ops</span></h1>
            <p className="text-[9px] text-zinc-400 uppercase tracking-widest">Agentic SOC</p>
          </div>
        </div>

        <nav className="flex-1 px-3 space-y-1">
          <NavItem icon={<Activity className="w-4 h-4" />} label="Dashboard" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
          <NavItem icon={<AlertTriangle className="w-4 h-4" />} label="Alerts" count={activeAlerts.length} active={activeTab === 'alerts'} onClick={() => setActiveTab('alerts')} />
          <NavItem icon={<Eye className="w-4 h-4" />} label="Review Queue" count={pendingReviews.length} active={activeTab === 'reviews'} onClick={() => setActiveTab('reviews')} />
          <NavItem icon={<Terminal className="w-4 h-4" />} label="Agent Console" active={activeTab === 'console'} onClick={() => setActiveTab('console')} />
          <NavItem icon={<Phone className="w-4 h-4" />} label="Admin / On-Call" active={false} onClick={() => window.location.href = '/admin'} />
        </nav>

        <div className="p-3 border-t border-zinc-700/50 space-y-2">
          <button onClick={startDemo} disabled={isRunning}
            className={cn("w-full py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2",
              isRunning ? "bg-orange-500/20 text-orange-400 border border-orange-500/50 animate-pulse" : "bg-red-500 hover:bg-red-600 text-white shadow-[0_0_20px_rgba(239,68,68,0.3)]"
            )}>
            {isRunning ? <><RefreshCw className="w-4 h-4 animate-spin" /> Running...</> : <><Zap className="w-4 h-4" /> Simulate Breach</>}
          </button>
          <button onClick={resetDemo} className="w-full py-2 rounded-xl text-xs text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 transition-all">Reset Demo</button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="h-12 border-b border-zinc-700/50 flex items-center justify-between px-6 bg-[#141420]/80 backdrop-blur-md z-10 flex-none">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1 bg-emerald-500/10 rounded-lg border border-emerald-500/20 text-[10px] font-bold text-emerald-500 uppercase tracking-widest">
              <Zap className="w-3 h-3" /> Zero to Agent Hackathon
            </div>
            {isPolling && (
              <div className="flex items-center gap-2 px-3 py-1 bg-orange-500/10 rounded-lg border border-orange-500/20 text-[10px] font-bold text-orange-400 uppercase tracking-widest animate-pulse">
                <Activity className="w-3 h-3" /> Live
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Vercel AI SDK · Gemini · Supabase · ElevenLabs · Slack
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          <AnimatePresence mode="wait">
            {/* ===== DASHBOARD TAB ===== */}
            {activeTab === 'dashboard' && (
              <motion.div key="dashboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">

                {/* ---- ROW 1: PIPELINE — Ingestion through Analysis ---- */}
                <div className="rounded-2xl bg-zinc-800/40 border border-zinc-700/50 p-4">
                  <div className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold mb-3">Data Pipeline — Ingestion → Analysis</div>
                  <div className="flex items-center gap-2">
                    <PipelineNode label="Google Cloud Storage" sublabel="Log Ingestion" active={hasIngest} current={hasIngest && !hasTriage} running={isRunning || isPolling} color="#4285F4" icon={<Database className="w-5 h-5" />} stat={logBatches.length > 0 ? `${logBatches.length} sources` : ''} />
                    <PipelineArrow active={hasIngest && hasTriage} color="#4285F4" />
                    <PipelineNode label="Rules Engine" sublabel="Triage" active={hasTriage} current={hasTriage && !agentActive} running={isRunning || isPolling} color="#F59E0B" icon={<Filter className="w-5 h-5" />} stat={findings.length > 0 ? `${findings.length} flagged` : ''} />
                    <PipelineArrow active={hasTriage && agentActive} color="#F59E0B" />
                    <PipelineNode label="Meerkat Ops Agent" sublabel="Vercel AI SDK" active={agentActive} current={agentActive && !hasCreateAlert} running={isRunning || isPolling} color="#10B981" icon={<Shield className="w-5 h-5" />} stat={hasGemini ? 'Analyzing' : hasQueryLogs ? 'Investigating' : ''} large />
                    <PipelineArrow active={agentActive && hasWriteSupabase} color="#10B981" />
                    <PipelineNode label="Supabase" sublabel="PostgreSQL" active={hasWriteSupabase || hasCreateAlert} current={hasWriteSupabase && !hasGemini} running={isRunning || isPolling} color="#3ECF8E" icon={<Database className="w-5 h-5" />} stat={hasCreateAlert ? 'Alerts stored' : hasWriteSupabase ? 'Writing events' : ''} />
                    <PipelineArrow active={(hasWriteSupabase || hasCreateAlert) && hasGemini} color="#3ECF8E" />
                    <PipelineNode label="Gemini 2.0 Flash" sublabel="Threat Analysis" active={hasGemini} current={hasGemini && !hasCreateAlert} running={isRunning || isPolling} color="#8B5CF6" icon={<Brain className="w-5 h-5" />} stat={hasGemini ? '96% confidence' : ''} />
                  </div>
                </div>

                {/* ---- ROW 2: PIPELINE — Alert through Action ---- */}
                <div className="rounded-2xl bg-zinc-800/40 border border-zinc-700/50 p-4">
                  <div className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold mb-3">Response Pipeline — Alert → Action</div>
                  <div className="flex items-center gap-2">
                    <PipelineNode label="Alert Created" sublabel="P1 + P2" active={hasCreateAlert} current={hasCreateAlert && !hasSlack} running={isRunning || isPolling} color="#EF4444" icon={<AlertTriangle className="w-5 h-5" />} stat={hasCreateAlert ? `${activeAlerts.length} alerts` : ''} />
                    <PipelineArrow active={hasCreateAlert && hasSlack} color="#EF4444" />
                    <PipelineNode label="Slack" sublabel="#soc-alerts" active={hasSlack} current={hasSlack && !hasPhone} running={isRunning || isPolling} color="#E01E5A" icon={<MessageSquare className="w-5 h-5" />} stat={hasSlack ? 'Posted' : ''} />
                    <PipelineArrow active={hasSlack && hasPhone} color="#E01E5A" />
                    <PipelineNode label="ElevenLabs + Twilio" sublabel="Voice Call" active={hasPhone} current={hasPhone && !hasRevoke} running={isRunning || isPolling} color="#F59E0B" icon={<Phone className="w-5 h-5" />} stat={hasPhone ? 'On-call dialed' : ''} />
                    <PipelineArrow active={hasPhone && hasRevoke} color="#F59E0B" />
                    <PipelineNode label="Human-in-the-Loop" sublabel="needsApproval" active={hasRevoke} current={hasRevoke} running={isRunning || isPolling} color="#F97316" icon={<UserCheck className="w-5 h-5" />} stat={hasRevoke ? 'Awaiting decision' : ''} />
                  </div>
                </div>

                {/* ---- ROW 3: CLOUD SERVICES ---- */}
                {services.length > 0 && (
                  <div className="rounded-2xl bg-zinc-800/40 border border-zinc-700/50 p-4">
                    <div className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold mb-3">Monitored Cloud Services</div>
                    <div className="space-y-2">
                      {services.map((svc) => {
                        const isRunning = svc.status === 'running';
                        const stoppedLabel = svc.stopped_by === 'voice'
                          ? 'Stopped by Voice Call'
                          : svc.stopped_by === 'slack'
                            ? 'Stopped by Slack'
                            : svc.stopped_by === 'dashboard'
                              ? 'Stopped by Dashboard'
                              : 'Stopped';
                        return (
                          <motion.div
                            key={svc.id}
                            layout
                            className={cn(
                              "flex items-center gap-4 p-4 rounded-xl border transition-all",
                              isRunning
                                ? "bg-emerald-500/5 border-emerald-500/20"
                                : "bg-red-500/5 border-red-500/20"
                            )}
                          >
                            {/* Status indicator */}
                            <div className={cn(
                              "w-3 h-3 rounded-full flex-none",
                              isRunning ? "bg-emerald-500 animate-pulse" : "bg-red-500"
                            )} />

                            {/* Service name */}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-zinc-200">{svc.name}</p>
                              <p className="text-[11px] text-zinc-500">Google Cloud Storage Bucket</p>
                            </div>

                            {/* Status badge */}
                            <div className={cn(
                              "px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide",
                              isRunning
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                : "bg-red-500/10 text-red-400 border border-red-500/20"
                            )}>
                              {isRunning ? 'Running' : stoppedLabel}
                            </div>

                            {/* Timestamp */}
                            {!isRunning && svc.stopped_at && (
                              <div className="text-[10px] text-zinc-500 flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {new Date(svc.stopped_at).toLocaleTimeString()}
                              </div>
                            )}
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ---- LIVE FEED + FINDINGS ---- */}
                <div className="grid grid-cols-2 gap-4">
                  {/* Left: Log Stream + Findings */}
                  <div className="rounded-2xl bg-zinc-800/40 border border-zinc-700/50 p-4">
                    <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
                      <FileText className="w-4 h-4 text-blue-400" /> Log Stream &amp; Findings
                    </h3>
                    <div className="space-y-2 max-h-[340px] overflow-y-auto">
                      {activity.length === 0 ? (
                        <p className="text-zinc-500 text-sm text-center py-8">Waiting for logs...</p>
                      ) : (
                        [...activity].reverse().map((item) => {
                          const details = parseDetails(item.details);
                          const isFinding = details?.type === 'finding';
                          const isLogBatch = details?.type === 'log_batch';
                          const isPattern = details?.type === 'pattern_detected';
                          const isAgentPull = details?.type === 'agent_pull';
                          const isSupabaseWrite = details?.type === 'supabase_write';
                          const isGeminiInput = details?.type === 'gemini_input';
                          const isGeminiOutput = details?.type === 'gemini_output';

                          return (
                            <motion.div key={item.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                              className={cn("px-3 py-2 rounded-lg border text-xs",
                                isPattern ? "bg-emerald-500/10 border-emerald-500/30" :
                                isFinding ? "bg-amber-500/5 border-amber-500/20" :
                                isLogBatch ? "bg-blue-500/5 border-blue-500/20" :
                                isAgentPull ? "bg-emerald-500/5 border-emerald-500/20" :
                                isSupabaseWrite ? "bg-green-500/5 border-green-500/20" :
                                isGeminiInput || isGeminiOutput ? "bg-purple-500/5 border-purple-500/20" :
                                "bg-zinc-800/50 border-zinc-700/50"
                              )}>
                              {isLogBatch && (
                                <div>
                                  <span className="text-blue-400 font-bold">{String(details?.source)}</span>
                                  <span className="text-zinc-500"> — {String(details?.count)} logs received</span>
                                  <div className="mt-1 space-y-0.5">
                                    {(details?.logs as Array<{event: string; details: string; risk_score: number}>)?.slice(0, 3).map((l, i) => (
                                      <div key={i} className="text-[10px] text-zinc-500 flex items-center gap-1.5">
                                        <span className={cn("w-1.5 h-1.5 rounded-full flex-none", l.risk_score >= 0.7 ? "bg-red-500" : "bg-zinc-600")} />
                                        {l.details?.slice(0, 80)}{l.details?.length > 80 ? '...' : ''}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {isPattern && (
                                <div className="px-2 py-1.5 rounded-lg bg-emerald-500/5">
                                  <div className="flex items-center gap-2 mb-1.5">
                                    <Shield className="w-4 h-4 text-emerald-400 flex-none" />
                                    <span className="text-emerald-400 font-bold text-xs">Cross-Source Pattern Detected</span>
                                  </div>
                                  <p className="text-[11px] text-zinc-300 leading-relaxed">{String(details?.insight)}</p>
                                  <div className="flex items-center gap-3 mt-1.5 text-[10px]">
                                    <span className="text-emerald-400">{String(details?.signals)} signals</span>
                                    <span className="text-zinc-500">·</span>
                                    <span className="text-emerald-400">{String(details?.sources)} sources</span>
                                    <span className="text-zinc-500">·</span>
                                    <span className="text-zinc-400">User: {(details?.users as string[])?.[0]}</span>
                                  </div>
                                </div>
                              )}
                              {isFinding && (
                                <div className="flex items-start gap-2">
                                  <AlertTriangle className="w-3 h-3 text-amber-400 mt-0.5 flex-none" />
                                  <div>
                                    <span className="text-amber-400 font-bold">{String(details?.source)}</span>
                                    <span className="text-zinc-400"> — {String(details?.details)}</span>
                                    <div className="text-[10px] text-amber-500/60 mt-0.5">Risk: {Math.round(Number(details?.risk_score) * 100)}%</div>
                                  </div>
                                </div>
                              )}
                              {isAgentPull && (
                                <div className="flex items-start gap-2">
                                  <Shield className="w-3 h-3 text-emerald-400 mt-0.5 flex-none" />
                                  <div>
                                    <span className="text-emerald-400 font-bold">Agent</span>
                                    <span className="text-zinc-400"> pulling {String(details?.results)} related events from GCS</span>
                                  </div>
                                </div>
                              )}
                              {isSupabaseWrite && (
                                <div className="flex items-start gap-2">
                                  <Database className="w-3 h-3 text-green-400 mt-0.5 flex-none" />
                                  <div>
                                    <span className="text-green-400 font-bold">Supabase</span>
                                    <span className="text-zinc-400"> — writing {String(details?.total)} events for analysis</span>
                                  </div>
                                </div>
                              )}
                              {isGeminiOutput && (
                                <div className="flex items-start gap-2">
                                  <Brain className="w-3 h-3 text-purple-400 mt-0.5 flex-none" />
                                  <div>
                                    <span className="text-purple-400 font-bold">Gemini</span>
                                    <span className="text-zinc-400"> — {String(details?.severity)} {String(details?.pattern)}</span>
                                    <div className="text-[10px] text-purple-400/60 mt-0.5">Confidence: {Math.round(Number(details?.confidence) * 100)}% · {String(details?.evidence_used)} evidence sources</div>
                                  </div>
                                </div>
                              )}
                              {!isPattern && !isFinding && !isLogBatch && !isAgentPull && !isSupabaseWrite && !isGeminiInput && !isGeminiOutput && (
                                <div className="text-zinc-400">{item.description.replace(/^[📥⚡🎯🔍🧠✅🚨⚠️💬📞⏸️]\s?/, '')}</div>
                              )}
                            </motion.div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Right: Active Alerts with Evidence */}
                  <div className="rounded-2xl bg-zinc-800/40 border border-zinc-700/50 p-4">
                    <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-red-400" /> Active Alerts
                    </h3>
                    {activeAlerts.length === 0 ? (
                      <p className="text-zinc-500 text-sm text-center py-8">No active alerts yet.</p>
                    ) : (
                      <div className="space-y-3 max-h-[340px] overflow-y-auto">
                        {activeAlerts.map((alert) => {
                          const evidence = parseEvidence(alert.description);
                          return (
                            <motion.div key={alert.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
                              className={cn("p-3 rounded-xl border bg-zinc-800/50 cursor-pointer hover:bg-zinc-800/60 transition-all", severityBorder[alert.severity])}
                              onClick={() => setSelectedAlert(alert)}>
                              <div className="flex items-start gap-2 mb-2">
                                <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-bold text-white", severityColor[alert.severity])}>{alert.severity}</span>
                                <p className="font-medium text-xs flex-1">{alert.title}</p>
                                <div className="text-[10px] font-bold text-emerald-400">{Math.round((alert.confidence || 0) * 100)}%</div>
                              </div>
                              <p className="text-[11px] text-zinc-400 mb-2">{alert.gemini_summary?.slice(0, 120)}...</p>
                              {evidence.length > 0 && (
                                <div className="border-t border-zinc-700/50 pt-2 mt-2">
                                  <div className="text-[9px] text-zinc-500 uppercase font-bold mb-1">Evidence ({evidence.length} sources)</div>
                                  {evidence.slice(0, 3).map((e, i) => (
                                    <div key={i} className="text-[10px] text-zinc-500 flex items-center gap-1.5 py-0.5">
                                      <span className="w-1 h-1 rounded-full bg-amber-500 flex-none" />
                                      <span className="text-zinc-400 font-medium">{e.source}:</span> {e.details?.slice(0, 60)}...
                                    </div>
                                  ))}
                                  {evidence.length > 3 && <div className="text-[9px] text-zinc-500 mt-1">+ {evidence.length - 3} more</div>}
                                </div>
                              )}
                            </motion.div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* ---- PENDING REVIEWS ---- */}
                {pendingReviews.length > 0 && (
                  <div className="rounded-2xl bg-purple-500/5 border border-purple-500/20 p-4">
                    <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
                      <Eye className="w-4 h-4 text-purple-400" /> Pending Human Review
                      <span className="ml-2 px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400 text-[10px] font-bold">{pendingReviews.length}</span>
                    </h3>
                    {pendingReviews.map((alert) => (
                      <div key={alert.id} className="p-4 rounded-xl bg-zinc-800/50 border border-purple-500/20 flex items-center gap-4">
                        <span className={cn("px-2 py-0.5 rounded text-xs font-bold text-white flex-none", severityColor[alert.severity])}>{alert.severity}</span>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">{alert.title}</p>
                          <p className="text-xs text-zinc-400 mt-1">{alert.gemini_summary}</p>
                        </div>
                        <div className="flex gap-2 flex-none">
                          <button onClick={() => handleReview(alert.id, 'confirm')}
                            className="px-4 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white text-sm font-bold transition-colors flex items-center gap-1">
                            <XCircle className="w-4 h-4" /> Stop Service
                          </button>
                          <button onClick={() => handleReview(alert.id, 'suppress')}
                            className="px-4 py-2 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-sm font-medium transition-colors flex items-center gap-1">
                            <Eye className="w-4 h-4" /> Ignore
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {/* ===== ALERTS TAB ===== */}
            {activeTab === 'alerts' && (
              <motion.div key="alerts" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
                <h2 className="text-xl font-bold">All Alerts</h2>
                {alerts.length === 0 ? (
                  <p className="text-zinc-500 py-12 text-center">No alerts yet.</p>
                ) : (
                  alerts.map((alert) => {
                    const evidence = parseEvidence(alert.description);
                    return (
                      <div key={alert.id} className={cn("p-5 rounded-xl border bg-zinc-800/40", severityBorder[alert.severity])}>
                        <div className="flex items-start gap-3">
                          <span className={cn("px-2 py-0.5 rounded text-xs font-bold text-white", severityColor[alert.severity])}>{alert.severity}</span>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <p className="font-semibold">{alert.title}</p>
                              <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold uppercase",
                                alert.status === 'resolved' ? 'bg-emerald-500/20 text-emerald-400' :
                                alert.status === 'suppressed' ? 'bg-zinc-700 text-zinc-400' :
                                alert.needs_approval ? 'bg-purple-500/20 text-purple-400' :
                                'bg-red-500/20 text-red-400'
                              )}>{alert.needs_approval ? 'Needs Review' : alert.status}</span>
                            </div>
                            <p className="text-sm text-zinc-400 mt-1">{alert.affected_user} · {alert.source_ip}</p>
                            <p className="text-sm text-zinc-300 mt-3">{alert.gemini_summary}</p>

                            {/* Evidence Section */}
                            {evidence.length > 0 && (
                              <div className="mt-3 p-3 rounded-lg bg-zinc-800/50 border border-zinc-700/30">
                                <p className="text-xs text-amber-400 uppercase font-bold mb-2">Evidence ({evidence.length} sources)</p>
                                {evidence.map((e, i) => (
                                  <div key={i} className="text-xs text-zinc-400 py-1 flex items-start gap-2 border-b border-zinc-700/50 last:border-0">
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 flex-none" />
                                    <div>
                                      <span className="font-bold text-zinc-300">{e.source}</span>
                                      <span className="text-zinc-500"> ({e.event})</span>
                                      <p className="text-zinc-500 mt-0.5">{e.details}</p>
                                      <span className="text-amber-500/60 text-[10px]">Risk: {Math.round(e.risk_score * 100)}%</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            {alert.rationale && (
                              <details className="mt-3">
                                <summary className="text-xs text-emerald-400 cursor-pointer">View Gemini Rationale</summary>
                                <p className="text-xs text-zinc-500 mt-2 p-3 rounded-lg bg-zinc-800/50">{alert.rationale}</p>
                              </details>
                            )}
                            <div className="flex items-center gap-4 mt-3 text-xs text-zinc-500">
                              <span>Confidence: <strong className="text-emerald-400">{Math.round((alert.confidence || 0) * 100)}%</strong></span>
                              <span>{new Date(alert.created_at).toLocaleString()}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </motion.div>
            )}

            {/* ===== REVIEW QUEUE TAB ===== */}
            {activeTab === 'reviews' && (
              <motion.div key="reviews" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  Review Queue
                  {pendingReviews.length > 0 && <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400 text-sm font-bold">{pendingReviews.length}</span>}
                </h2>
                <p className="text-sm text-zinc-400">Actions flagged by the AI agent that require human approval. Uses Vercel AI SDK&apos;s <code className="text-emerald-400">needsApproval</code> pattern.</p>
                {pendingReviews.length === 0 ? (
                  <p className="text-zinc-500 py-12 text-center">No pending reviews.</p>
                ) : (
                  pendingReviews.map((alert) => (
                    <motion.div key={alert.id} layout className="p-6 rounded-xl border border-purple-500/20 bg-zinc-800/40">
                      <div className="flex items-start gap-3 mb-4">
                        <span className={cn("px-2 py-0.5 rounded text-xs font-bold text-white", severityColor[alert.severity])}>{alert.severity}</span>
                        <div className="flex-1">
                          <p className="font-semibold text-lg">{alert.title}</p>
                          <p className="text-sm text-zinc-400 mt-1">{alert.affected_user}</p>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold text-emerald-400">{Math.round((alert.confidence || 0) * 100)}%</div>
                          <div className="text-xs text-zinc-500">confidence</div>
                        </div>
                      </div>
                      <div className="p-4 rounded-lg bg-zinc-800/50 mb-4">
                        <p className="text-xs text-zinc-500 uppercase font-bold mb-2">Agent Recommendation</p>
                        <p className="text-sm text-zinc-300">{alert.gemini_summary}</p>
                      </div>
                      <div className="flex gap-3">
                        <button onClick={() => handleReview(alert.id, 'confirm')}
                          className="px-6 py-3 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold transition-all shadow-[0_0_15px_rgba(239,68,68,0.2)] flex items-center gap-2">
                          <XCircle className="w-5 h-5" /> Stop Service
                        </button>
                        <button onClick={() => handleReview(alert.id, 'suppress')}
                          className="px-6 py-3 rounded-xl bg-zinc-700 hover:bg-zinc-600 text-zinc-300 font-medium transition-all flex items-center gap-2">
                          <Eye className="w-5 h-5" /> Ignore
                        </button>
                      </div>
                    </motion.div>
                  ))
                )}
              </motion.div>
            )}

            {/* ===== AGENT CONSOLE TAB ===== */}
            {activeTab === 'console' && (
              <motion.div key="console" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full flex flex-col">
                <h2 className="text-xl font-bold mb-4">Agent Console</h2>
                <div className="flex-1 overflow-y-auto space-y-4 pb-4">
                  {chatMessages.map((msg, i) => (
                    <div key={i} className={cn("flex gap-3 max-w-3xl", msg.role === 'user' ? "ml-auto flex-row-reverse" : "")}>
                      <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center flex-none",
                        msg.role === 'assistant' ? "bg-emerald-500 text-black" : "bg-zinc-700 text-zinc-300"
                      )}>
                        {msg.role === 'assistant' ? <Shield className="w-4 h-4" /> : <MessageSquare className="w-4 h-4" />}
                      </div>
                      <div className={cn("p-4 rounded-xl text-sm",
                        msg.role === 'assistant' ? "bg-zinc-900 border border-zinc-700/50" : "bg-emerald-500 text-black font-medium"
                      )}>{msg.content}</div>
                    </div>
                  ))}
                </div>
                <form onSubmit={handleChat} className="mt-auto p-4 bg-zinc-800/40 border border-zinc-700/50 rounded-xl flex items-center gap-3">
                  <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Ask Meerkat about security events..."
                    className="flex-1 bg-transparent border-none focus:outline-none text-sm placeholder:text-zinc-500" />
                  <button type="submit" className="p-2 bg-emerald-500 text-black rounded-lg hover:bg-emerald-400 transition-colors">
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Alert Detail Modal */}
      <AnimatePresence>
        {selectedAlert && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setSelectedAlert(null)}>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-2xl bg-zinc-900 border border-zinc-700 rounded-2xl p-6 shadow-2xl mx-4"
              onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start gap-3 mb-4">
                <span className={cn("px-2 py-0.5 rounded text-xs font-bold text-white", severityColor[selectedAlert.severity])}>{selectedAlert.severity}</span>
                <h3 className="text-lg font-bold flex-1">{selectedAlert.title}</h3>
                <button onClick={() => setSelectedAlert(null)} className="text-zinc-500 hover:text-zinc-300">✕</button>
              </div>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><span className="text-zinc-500">Affected User:</span> <span className="text-zinc-200">{selectedAlert.affected_user}</span></div>
                  <div><span className="text-zinc-500">Source IP:</span> <span className="text-zinc-200">{selectedAlert.source_ip}</span></div>
                  <div><span className="text-zinc-500">Confidence:</span> <span className="text-emerald-400 font-bold">{Math.round((selectedAlert.confidence || 0) * 100)}%</span></div>
                  <div><span className="text-zinc-500">Status:</span> <span className="text-zinc-200">{selectedAlert.status}</span></div>
                </div>
                <div className="p-4 rounded-lg bg-zinc-800/50">
                  <p className="text-xs text-zinc-500 uppercase font-bold mb-2">Gemini Summary</p>
                  <p className="text-sm text-zinc-300">{selectedAlert.gemini_summary}</p>
                </div>

                {/* Evidence in Modal */}
                {(() => {
                  const evidence = parseEvidence(selectedAlert.description);
                  if (evidence.length === 0) return null;
                  return (
                    <div className="p-4 rounded-lg bg-amber-500/5 border border-amber-500/20">
                      <p className="text-xs text-amber-400 uppercase font-bold mb-3">Evidence — {evidence.length} Sources</p>
                      {evidence.map((e, i) => (
                        <div key={i} className="py-2 border-b border-zinc-700/50 last:border-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="w-2 h-2 rounded-full bg-amber-500" />
                            <span className="text-sm font-bold text-zinc-200">{e.source}</span>
                            <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded">{e.event}</span>
                            <span className="ml-auto text-xs text-amber-400 font-bold">{Math.round(e.risk_score * 100)}% risk</span>
                          </div>
                          <p className="text-xs text-zinc-400 ml-4">{e.details}</p>
                        </div>
                      ))}
                    </div>
                  );
                })()}

                {selectedAlert.rationale && (
                  <div className="p-4 rounded-lg bg-zinc-800/50">
                    <p className="text-xs text-zinc-500 uppercase font-bold mb-2">Full Rationale</p>
                    <p className="text-xs text-zinc-400 leading-relaxed">{selectedAlert.rationale}</p>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---- Pipeline Components ----

function PipelineNode({ label, sublabel, active, current, running, color, icon, stat, large }: {
  label: string; sublabel: string; active: boolean; current: boolean; running: boolean;
  color: string; icon: React.ReactNode; stat: string; large?: boolean;
}) {
  return (
    <motion.div
      initial={active ? { opacity: 0, y: -5 } : {}}
      animate={{ opacity: 1, y: 0 }}
      className={cn("flex flex-col items-center text-center flex-1 min-w-0 py-2 px-1 rounded-xl border transition-all",
        active ? "" : "bg-zinc-800/10 border-zinc-700/50/30",
        large ? "flex-[1.3]" : "",
      )}
      style={active ? {
        backgroundColor: `${color}08`,
        borderColor: `${color}30`,
        boxShadow: current && running ? `0 0 20px ${color}25` : undefined,
      } : undefined}
    >
      {/* Icon */}
      <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center mb-1 transition-all",
          active ? "" : "bg-zinc-800/40 text-zinc-500",
          current && running ? "animate-pulse" : "",
          large ? "w-12 h-12" : "",
        )}
        style={active ? { backgroundColor: `${color}15`, color } : undefined}
      >
        {icon}
      </div>

      {/* Vendor name — BIG */}
      <span className={cn("text-xs font-black leading-tight", !active && "text-zinc-500", large ? "text-sm" : "")}
        style={active ? { color } : undefined}
      >
        {label}
      </span>

      {/* Product detail */}
      <span className={cn("text-[10px] leading-tight mt-0.5", active ? "text-zinc-400" : "text-zinc-500")}>
        {sublabel}
      </span>

      {/* Status */}
      {active && stat && (
        <span className="text-[10px] text-zinc-500 mt-1 font-medium">{stat}</span>
      )}

      {/* Indicators */}
      {active && current && running && (
        <span className="w-2 h-2 rounded-full animate-pulse mt-1" style={{ backgroundColor: color }} />
      )}
      {active && !current && (
        <CheckCircle className="w-3.5 h-3.5 text-emerald-500 mt-1" />
      )}
    </motion.div>
  );
}

function PipelineArrow({ active, color }: { active: boolean; color: string }) {
  return (
    <div className="flex items-center flex-none">
      <svg width="24" height="16" viewBox="0 0 24 16">
        <path d="M2 8 L18 8 M14 3 L19 8 L14 13"
          fill="none" stroke={active ? color : '#3f3f46'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          style={{ transition: 'stroke 0.3s ease' }}
        />
      </svg>
    </div>
  );
}

function NavItem({ icon, label, active, onClick, count }: { icon: React.ReactNode; label: string; active?: boolean; onClick: () => void; count?: number }) {
  return (
    <button onClick={onClick}
      className={cn("w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all",
        active ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20" : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
      )}>
      {icon}
      <span className="flex-1 text-left">{label}</span>
      {count !== undefined && count > 0 && (
        <span className="px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400 text-[10px] font-bold">{count}</span>
      )}
    </button>
  );
}
