'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  Terminal,
  Shield,
  Zap,
  Bell,
  Settings,
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
  Send,
  UserCheck,
  ArrowDown,
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

  const fetchData = useCallback(async () => {
    try {
      const [alertsRes, activityRes] = await Promise.all([
        fetch('/api/alerts'),
        fetch('/api/agent-activity'),
      ]);
      const alertsData = await alertsRes.json();
      const activityData = await activityRes.json();
      if (Array.isArray(alertsData)) setAlerts(alertsData);
      if (Array.isArray(activityData)) setActivity(activityData);
    } catch {}
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!isPolling) return;
    const interval = setInterval(fetchData, 2000);
    return () => clearInterval(interval);
  }, [isPolling, fetchData]);

  const startDemo = async () => {
    setIsRunning(true);
    setIsPolling(true);
    try {
      await fetch('/api/demo-sequence', { method: 'POST' });
    } catch {}
    setIsRunning(false);
    // Keep polling for a bit after to catch final updates
    setTimeout(() => setIsPolling(false), 10000);
    fetchData();
  };

  const resetDemo = async () => {
    await fetch('/api/demo-reset', { method: 'POST' });
    setAlerts([]);
    setActivity([]);
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
        body: JSON.stringify({
          messages: [...chatMessages, { role: 'user', content: userMsg }],
        }),
      });
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let assistantMsg = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value);
          // Parse SSE data chunks for text content
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.startsWith('0:')) {
              try {
                const text = JSON.parse(line.slice(2));
                assistantMsg += text;
              } catch {}
            }
          }
        }
      }

      if (assistantMsg) {
        setChatMessages(prev => [...prev, { role: 'assistant', content: assistantMsg }]);
      }
    } catch {
      setChatMessages(prev => [...prev, { role: 'assistant', content: 'I encountered an error processing your request.' }]);
    }
  };

  const activeAlerts = alerts.filter(a => a.status === 'active' && !a.needs_approval);
  const pendingReviews = alerts.filter(a => a.needs_approval && a.status === 'active');

  const severityColor: Record<string, string> = {
    P0: 'bg-red-500',
    P1: 'bg-orange-500',
    P2: 'bg-yellow-500',
    P3: 'bg-blue-500',
  };

  const severityBorder: Record<string, string> = {
    P0: 'border-red-500/30',
    P1: 'border-orange-500/30',
    P2: 'border-yellow-500/30',
    P3: 'border-blue-500/30',
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#0A0A0B] font-sans text-zinc-100">
      {/* Sidebar */}
      <aside className="w-64 border-r border-zinc-800 bg-[#0D0D0E] flex flex-none flex-col">
        <div className="p-6 flex items-center gap-3">
          <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center shadow-[0_0_15px_rgba(16,185,129,0.3)]">
            <Shield className="w-5 h-5 text-black" strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Meerkat <span className="text-emerald-500">Ops</span></h1>
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest">AI-Powered SOC</p>
          </div>
        </div>

        <nav className="flex-1 px-4 space-y-1">
          <NavItem icon={<Activity className="w-4 h-4" />} label="Dashboard" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
          <NavItem icon={<AlertTriangle className="w-4 h-4" />} label="Alerts" count={activeAlerts.length} active={activeTab === 'alerts'} onClick={() => setActiveTab('alerts')} />
          <NavItem icon={<Eye className="w-4 h-4" />} label="Review Queue" count={pendingReviews.length} active={activeTab === 'reviews'} onClick={() => setActiveTab('reviews')} />
          <NavItem icon={<Terminal className="w-4 h-4" />} label="Agent Console" active={activeTab === 'console'} onClick={() => setActiveTab('console')} />
          <NavItem icon={<Phone className="w-4 h-4" />} label="Admin / On-Call" active={false} onClick={() => window.location.href = '/admin'} />
        </nav>

        <div className="p-4 border-t border-zinc-800 space-y-2">
          <button
            onClick={startDemo}
            disabled={isRunning}
            className={cn(
              "w-full py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2",
              isRunning
                ? "bg-orange-500/20 text-orange-400 border border-orange-500/30 animate-pulse"
                : "bg-red-500 hover:bg-red-600 text-white shadow-[0_0_20px_rgba(239,68,68,0.3)]"
            )}
          >
            {isRunning ? (
              <><RefreshCw className="w-4 h-4 animate-spin" /> Demo Running...</>
            ) : (
              <><Zap className="w-4 h-4" /> Simulate Breach</>
            )}
          </button>
          <button onClick={resetDemo} className="w-full py-2 rounded-xl text-xs text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 transition-all">
            Reset Demo
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="h-14 border-b border-zinc-800 flex items-center justify-between px-8 bg-[#0A0A0B]/80 backdrop-blur-md z-10 flex-none">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1 bg-emerald-500/10 rounded-lg border border-emerald-500/20 text-[10px] font-bold text-emerald-500 uppercase tracking-widest">
              <Zap className="w-3 h-3" />
              Zero to Agent Hackathon
            </div>
            {isPolling && (
              <div className="flex items-center gap-2 px-3 py-1 bg-orange-500/10 rounded-lg border border-orange-500/20 text-[10px] font-bold text-orange-400 uppercase tracking-widest animate-pulse">
                <Activity className="w-3 h-3" />
                Live
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Vercel AI SDK • Gemini • Supabase
            </div>
            <Bell className="w-4 h-4 text-zinc-500" />
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <AnimatePresence mode="wait">
            {/* ===== DASHBOARD TAB ===== */}
            {activeTab === 'dashboard' && (
              <motion.div key="dashboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
                {/* Stat Cards */}
                <div className="grid grid-cols-4 gap-4">
                  <StatCard label="Logs Ingested" value={activity.length > 0 ? "10,247" : "0"} icon={<Activity className="w-5 h-5 text-emerald-500" />} accent="emerald" />
                  <StatCard label="Anomalies Detected" value={activity.length > 0 ? "6" : "0"} icon={<AlertTriangle className="w-5 h-5 text-amber-500" />} accent="amber" />
                  <StatCard label="Active Alerts" value={String(activeAlerts.length)} icon={<Shield className="w-5 h-5 text-red-500" />} accent="red" />
                  <StatCard label="Pending Review" value={String(pendingReviews.length)} icon={<Eye className="w-5 h-5 text-purple-500" />} accent="purple" />
                </div>

                {/* Two Column: Alerts + Activity */}
                <div className="grid grid-cols-5 gap-6">
                  {/* Active Alerts */}
                  <div className="col-span-3 rounded-2xl bg-zinc-900/50 border border-zinc-800 p-5">
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-red-400" /> Active Alerts
                    </h3>
                    {activeAlerts.length === 0 ? (
                      <p className="text-zinc-500 text-sm py-8 text-center">No active alerts. Click &quot;Simulate Breach&quot; to start the demo.</p>
                    ) : (
                      <div className="space-y-3">
                        {activeAlerts.map((alert) => (
                          <motion.div
                            key={alert.id}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            className={cn("p-4 rounded-xl border bg-zinc-800/30 cursor-pointer hover:bg-zinc-800/60 transition-all", severityBorder[alert.severity])}
                            onClick={() => setSelectedAlert(alert)}
                          >
                            <div className="flex items-start gap-3">
                              <span className={cn("px-2 py-0.5 rounded text-xs font-bold text-white", severityColor[alert.severity])}>
                                {alert.severity}
                              </span>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm">{alert.title}</p>
                                <p className="text-xs text-zinc-400 mt-1">{alert.affected_user} • {alert.source_ip}</p>
                                <p className="text-xs text-zinc-500 mt-2 line-clamp-2">{alert.gemini_summary}</p>
                              </div>
                              <div className="text-right flex-none">
                                <div className="text-xs font-bold text-emerald-400">{Math.round((alert.confidence || 0) * 100)}%</div>
                                <div className="text-[10px] text-zinc-600">confidence</div>
                              </div>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Pipeline Flow */}
                  <div className="col-span-2 rounded-2xl bg-zinc-900/50 border border-zinc-800 p-5">
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                      <Terminal className="w-4 h-4 text-emerald-400" /> Pipeline Flow
                    </h3>
                    <PipelineFlow activity={activity} isRunning={isRunning || isPolling} />
                  </div>
                </div>

                {/* Pending Reviews on Dashboard */}
                {pendingReviews.length > 0 && (
                  <div className="rounded-2xl bg-purple-500/5 border border-purple-500/20 p-5">
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                      <Eye className="w-4 h-4 text-purple-400" /> Pending Human Review
                      <span className="ml-2 px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400 text-xs font-bold">{pendingReviews.length}</span>
                    </h3>
                    {pendingReviews.map((alert) => (
                      <div key={alert.id} className="p-4 rounded-xl bg-zinc-800/30 border border-purple-500/20 flex items-center gap-4">
                        <span className={cn("px-2 py-0.5 rounded text-xs font-bold text-white flex-none", severityColor[alert.severity])}>
                          {alert.severity}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">{alert.title}</p>
                          <p className="text-xs text-zinc-400 mt-1">{alert.gemini_summary}</p>
                        </div>
                        <div className="flex gap-2 flex-none">
                          <button
                            onClick={() => handleReview(alert.id, 'confirm')}
                            className="px-4 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white text-sm font-bold transition-colors flex items-center gap-1"
                          >
                            <XCircle className="w-4 h-4" /> Stop Service
                          </button>
                          <button
                            onClick={() => handleReview(alert.id, 'suppress')}
                            className="px-4 py-2 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-sm font-medium transition-colors flex items-center gap-1"
                          >
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
                  alerts.map((alert) => (
                    <div key={alert.id} className={cn("p-5 rounded-xl border bg-zinc-900/50", severityBorder[alert.severity])}>
                      <div className="flex items-start gap-3">
                        <span className={cn("px-2 py-0.5 rounded text-xs font-bold text-white", severityColor[alert.severity])}>
                          {alert.severity}
                        </span>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold">{alert.title}</p>
                            <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold uppercase",
                              alert.status === 'resolved' ? 'bg-emerald-500/20 text-emerald-400' :
                              alert.status === 'suppressed' ? 'bg-zinc-700 text-zinc-400' :
                              alert.needs_approval ? 'bg-purple-500/20 text-purple-400' :
                              'bg-red-500/20 text-red-400'
                            )}>
                              {alert.needs_approval ? 'Needs Review' : alert.status}
                            </span>
                          </div>
                          <p className="text-sm text-zinc-400 mt-1">{alert.affected_user} • {alert.source_ip}</p>
                          <p className="text-sm text-zinc-300 mt-3">{alert.gemini_summary}</p>
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
                  ))
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
                <p className="text-sm text-zinc-400">Actions flagged by the AI agent that require human approval before execution. This uses Vercel AI SDK&apos;s <code className="text-emerald-400">needsApproval</code> pattern.</p>
                {pendingReviews.length === 0 ? (
                  <p className="text-zinc-500 py-12 text-center">No pending reviews. The agent will queue critical actions here.</p>
                ) : (
                  pendingReviews.map((alert) => (
                    <motion.div key={alert.id} layout className="p-6 rounded-xl border border-purple-500/20 bg-zinc-900/50">
                      <div className="flex items-start gap-3 mb-4">
                        <span className={cn("px-2 py-0.5 rounded text-xs font-bold text-white", severityColor[alert.severity])}>
                          {alert.severity}
                        </span>
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
                      {alert.rationale && (
                        <div className="p-4 rounded-lg bg-zinc-800/30 mb-4">
                          <p className="text-xs text-zinc-500 uppercase font-bold mb-2">Gemini Rationale</p>
                          <p className="text-xs text-zinc-400">{alert.rationale}</p>
                        </div>
                      )}
                      <div className="flex gap-3">
                        <button
                          onClick={() => handleReview(alert.id, 'confirm')}
                          className="px-6 py-3 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold transition-all shadow-[0_0_15px_rgba(239,68,68,0.2)] flex items-center gap-2"
                        >
                          <XCircle className="w-5 h-5" /> Stop Service
                        </button>
                        <button
                          onClick={() => handleReview(alert.id, 'suppress')}
                          className="px-6 py-3 rounded-xl bg-zinc-700 hover:bg-zinc-600 text-zinc-300 font-medium transition-all flex items-center gap-2"
                        >
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
                        msg.role === 'assistant' ? "bg-zinc-900 border border-zinc-800" : "bg-emerald-500 text-black font-medium"
                      )}>
                        {msg.content}
                      </div>
                    </div>
                  ))}
                </div>
                <form onSubmit={handleChat} className="mt-auto p-4 bg-zinc-900/50 border border-zinc-800 rounded-xl flex items-center gap-3">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Ask Meerkat about security events..."
                    className="flex-1 bg-transparent border-none focus:outline-none text-sm placeholder:text-zinc-600"
                  />
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
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-2xl bg-zinc-900 border border-zinc-700 rounded-2xl p-6 shadow-2xl mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start gap-3 mb-4">
                <span className={cn("px-2 py-0.5 rounded text-xs font-bold text-white", severityColor[selectedAlert.severity])}>
                  {selectedAlert.severity}
                </span>
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
                {selectedAlert.rationale && (
                  <div className="p-4 rounded-lg bg-zinc-800/30">
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

function NavItem({ icon, label, active, onClick, count }: { icon: React.ReactNode; label: string; active?: boolean; onClick: () => void; count?: number }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all",
        active ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20" : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
      )}
    >
      {icon}
      <span className="flex-1 text-left">{label}</span>
      {count !== undefined && count > 0 && (
        <span className="px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400 text-[10px] font-bold">{count}</span>
      )}
    </button>
  );
}

function PipelineFlow({ activity, isRunning }: { activity: AgentActivity[]; isRunning: boolean }) {
  const toolNames = activity.map(a => a.tool_name);
  const hasIngest = toolNames.includes('ingest');
  const hasTriage = toolNames.includes('triage');
  const hasGemini = toolNames.includes('evaluateWithGemini');
  const hasAlert = toolNames.includes('createAlert');
  const hasSlack = toolNames.includes('postSlackAlert');
  const hasPhone = toolNames.includes('triggerPhoneCall');
  const hasRevoke = toolNames.includes('revokeAccess');

  const latestFor = (tool: string) => {
    const items = activity.filter(a => a.tool_name === tool);
    return items.length > 0 ? items[items.length - 1].description : '';
  };

  const stages = [
    {
      id: 'ingest',
      vendor: 'Google Cloud',
      vendorDetail: 'Cloud Storage',
      action: 'Ingesting logs from 5 sources',
      stat: '10,247 events',
      icon: <Database className="w-4 h-4" />,
      active: hasIngest,
      detail: latestFor('ingest'),
      color: '#4285F4', // Google blue
    },
    {
      id: 'triage',
      vendor: 'Vercel',
      vendorDetail: 'AI SDK + Edge Runtime',
      action: 'Rules engine triage',
      stat: '6 anomalies',
      icon: <Filter className="w-4 h-4" />,
      active: hasTriage,
      detail: latestFor('triage'),
      color: '#ffffff', // Vercel white
    },
    {
      id: 'store',
      vendor: 'Supabase',
      vendorDetail: 'PostgreSQL',
      action: 'Storing promoted alerts',
      stat: '3 alerts written',
      icon: <Database className="w-4 h-4" />,
      active: hasAlert,
      detail: latestFor('createAlert'),
      color: '#3ECF8E', // Supabase green
    },
    {
      id: 'gemini',
      vendor: 'Google',
      vendorDetail: 'Gemini 2.0 Flash',
      action: 'Cross-source threat analysis',
      stat: '92% confidence',
      icon: <Brain className="w-4 h-4" />,
      active: hasGemini,
      detail: latestFor('evaluateWithGemini'),
      color: '#8B5CF6', // Google AI purple
    },
    {
      id: 'slack',
      vendor: 'Slack',
      vendorDetail: '#soc-alerts',
      action: 'Posting alert to channel',
      stat: 'Block Kit message',
      icon: <MessageSquare className="w-4 h-4" />,
      active: hasSlack,
      detail: latestFor('postSlackAlert'),
      color: '#E01E5A', // Slack aubergine/pink
    },
    {
      id: 'voice',
      vendor: 'ElevenLabs',
      vendorDetail: 'Conversational AI + Twilio',
      action: 'Calling on-call engineer',
      stat: 'Voice agent active',
      icon: <Phone className="w-4 h-4" />,
      active: hasPhone,
      detail: latestFor('triggerPhoneCall'),
      color: '#F59E0B', // ElevenLabs amber
    },
    {
      id: 'human',
      vendor: 'Human-in-the-Loop',
      vendorDetail: 'Vercel AI SDK needsApproval',
      action: 'Awaiting human decision',
      stat: 'Stop Service / Ignore',
      icon: <UserCheck className="w-4 h-4" />,
      active: hasRevoke,
      detail: latestFor('revokeAccess'),
      color: '#F97316', // Orange
    },
  ];

  const allInactive = activity.length === 0;

  return (
    <div className="flex flex-col gap-1">
      {stages.map((stage, i) => {
        const isActive = stage.active;
        const isCurrentStage = isActive && (i === stages.length - 1 || !stages[i + 1].active);

        return (
          <React.Fragment key={stage.id}>
            <motion.div
              initial={isActive ? { opacity: 0, x: -10 } : {}}
              animate={{ opacity: 1, x: 0 }}
              className={cn(
                "px-3 py-2 rounded-xl border transition-all",
                isActive
                  ? "bg-zinc-800/40 border-zinc-700/60"
                  : "bg-zinc-800/10 border-zinc-800/30"
              )}
              style={isActive ? {
                borderColor: `${stage.color}40`,
                boxShadow: isCurrentStage && isRunning ? `0 0 12px ${stage.color}30` : undefined,
              } : undefined}
            >
              <div className="flex items-center gap-2.5">
                {/* Vendor icon circle */}
                <div
                  className={cn(
                    "w-7 h-7 rounded-lg flex items-center justify-center flex-none",
                    isActive ? "" : "bg-zinc-800/60 text-zinc-600"
                  )}
                  style={isActive ? {
                    backgroundColor: `${stage.color}18`,
                    color: stage.color,
                  } : undefined}
                >
                  {stage.icon}
                </div>

                <div className="flex-1 min-w-0">
                  {/* Vendor name — big and bold */}
                  <div className="flex items-center gap-1.5">
                    <span
                      className={cn("text-xs font-black tracking-wide", !isActive && "text-zinc-600")}
                      style={isActive ? { color: stage.color } : undefined}
                    >
                      {stage.vendor}
                    </span>
                    {isActive && isCurrentStage && isRunning && (
                      <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: stage.color }} />
                    )}
                    {isActive && !isCurrentStage && (
                      <CheckCircle className="w-3 h-3 text-emerald-500" />
                    )}
                  </div>
                  {/* Vendor detail + status */}
                  <div className="flex items-center gap-1.5">
                    <span className={cn("text-[10px]", isActive ? "text-zinc-500" : "text-zinc-700")}>
                      {stage.vendorDetail}
                    </span>
                    {isActive && (
                      <>
                        <span className="text-zinc-700">·</span>
                        <span className="text-[10px] text-zinc-400 truncate">
                          {stage.stat}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Connector line */}
            {i < stages.length - 1 && (
              <div className="flex justify-center">
                <div
                  className="w-0.5 h-1.5 rounded-full"
                  style={{
                    backgroundColor: isActive && stages[i + 1].active ? stage.color : '#27272a',
                  }}
                />
              </div>
            )}
          </React.Fragment>
        );
      })}

      {/* Idle state overlay text */}
      {allInactive && (
        <p className="text-zinc-600 text-[10px] text-center mt-2">
          Click &quot;Simulate Breach&quot; to watch the pipeline
        </p>
      )}
    </div>
  );
}

function StatCard({ label, value, icon, accent }: { label: string; value: string; icon: React.ReactNode; accent: string }) {
  return (
    <div className="p-5 rounded-2xl bg-zinc-900/50 border border-zinc-800 hover:border-zinc-700 transition-colors">
      <div className="flex items-center justify-between mb-3">
        <div className="p-2 bg-zinc-800 rounded-lg">{icon}</div>
      </div>
      <p className="text-xs text-zinc-500 uppercase tracking-wider">{label}</p>
      <p className="text-3xl font-bold tracking-tight mt-1">{value}</p>
    </div>
  );
}
