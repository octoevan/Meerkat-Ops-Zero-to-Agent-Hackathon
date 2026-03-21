'use client';

import React, { useState, useEffect } from 'react';
import { 
  Activity, 
  Terminal, 
  Shield, 
  Zap, 
  Cpu, 
  Globe, 
  Search, 
  Bell, 
  Settings,
  ChevronRight,
  Command,
  MessageSquare,
  BarChart3,
  Server,
  Cloud,
  Lock
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Mock data for the dashboard
const cpuData = Array.from({ length: 20 }, (_, i) => ({
  time: i,
  usage: 30 + Math.random() * 40,
  latency: 10 + Math.random() * 15
}));

const logs = [
  { id: 1, time: '16:08:10', type: 'INFO', msg: 'Agent Meerkat-01 initialized successfully.' },
  { id: 2, time: '16:08:12', type: 'WARN', msg: 'High memory usage detected on node-us-west-2.' },
  { id: 3, time: '16:08:15', type: 'INFO', msg: 'Auto-scaling group triggered: +2 instances.' },
  { id: 4, time: '16:08:20', type: 'ERROR', msg: 'Database connection timeout on replica-03.' },
  { id: 5, time: '16:08:22', type: 'INFO', msg: 'Meerkat Ops: Resolving database timeout automatically...' },
];

export default function MeerkatOps() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isCommandOpen, setIsCommandOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hello! I am Meerkat, your AI Ops Agent. How can I help you manage your infrastructure today?' }
  ]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const newMessages = [...messages, { role: 'user', content: chatInput }];
    setMessages(newMessages);
    setChatInput('');

    // Simulate AI response
    setTimeout(() => {
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: `I've analyzed the logs for "${chatInput}". Everything looks stable, but I noticed a slight increase in latency on the edge nodes. Would you like me to optimize the cache headers?` 
      }]);
    }, 1000);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#0A0A0B] font-sans text-zinc-100">
      {/* Sidebar */}
      <aside className="w-64 border-r border-zinc-800 bg-[#0D0D0E] flex flex-none flex-col">
        <div className="p-6 flex items-center gap-3">
          <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center shadow-[0_0_15px_rgba(16,185,129,0.3)]">
            <Shield className="w-5 h-5 text-black" strokeWidth={2.5} />
          </div>
          <h1 className="text-xl font-bold tracking-tight">Meerkat <span className="text-emerald-500">Ops</span></h1>
        </div>

        <nav className="flex-1 px-4 space-y-1">
          <NavItem 
            icon={<Activity className="w-4 h-4" />} 
            label="Dashboard" 
            active={activeTab === 'dashboard'} 
            onClick={() => setActiveTab('dashboard')} 
          />
          <NavItem 
            icon={<Terminal className="w-4 h-4" />} 
            label="Agent Console" 
            active={activeTab === 'console'} 
            onClick={() => setActiveTab('console')} 
          />
          <NavItem 
            icon={<Server className="w-4 h-4" />} 
            label="Infrastructure" 
            active={activeTab === 'infra'} 
            onClick={() => setActiveTab('infra')} 
          />
          <NavItem 
            icon={<Shield className="w-4 h-4" />} 
            label="Security" 
            active={activeTab === 'security'} 
            onClick={() => setActiveTab('security')} 
          />
          <NavItem 
            icon={<BarChart3 className="w-4 h-4" />} 
            label="Analytics" 
            active={activeTab === 'analytics'} 
            onClick={() => setActiveTab('analytics')} 
          />
        </nav>

        <div className="p-4 border-t border-zinc-800">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-zinc-900/50 border border-zinc-800">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-cyan-400" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">ejennings@meerkat</p>
              <p className="text-xs text-zinc-500 truncate">Admin Access</p>
            </div>
            <Settings className="w-4 h-4 text-zinc-500 cursor-pointer hover:text-zinc-300 transition-colors" />
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        {/* Header */}
        <header className="h-16 border-bottom border-zinc-800 flex items-center justify-between px-8 bg-[#0A0A0B]/80 backdrop-blur-md z-10">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 rounded-lg border border-emerald-500/20 text-[10px] font-bold text-emerald-500 uppercase tracking-widest">
              <Zap className="w-3 h-3" />
              <span>Hackathon Submission</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900 rounded-lg border border-zinc-800 text-xs font-mono text-zinc-400">
              <Cloud className="w-3 h-3 text-emerald-500" />
              <span>us-west-2-prod</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900 rounded-lg border border-zinc-800 text-xs font-mono text-zinc-400">
              <Activity className="w-3 h-3 text-emerald-500 animate-pulse" />
              <span>System Healthy</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsCommandOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-zinc-900 hover:bg-zinc-800 rounded-lg border border-zinc-800 transition-colors text-sm text-zinc-400"
            >
              <Search className="w-4 h-4" />
              <span>Search or run command...</span>
              <kbd className="ml-2 px-1.5 py-0.5 bg-zinc-800 rounded text-[10px] font-mono">⌘K</kbd>
            </button>
            <button className="p-2 hover:bg-zinc-900 rounded-lg transition-colors relative">
              <Bell className="w-5 h-5 text-zinc-400" />
              <span className="absolute top-2 right-2 w-2 h-2 bg-emerald-500 rounded-full border-2 border-[#0A0A0B]" />
            </button>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-8">
          <AnimatePresence mode="wait">
            {activeTab === 'dashboard' && (
              <motion.div 
                key="dashboard"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-8"
              >
                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <StatCard label="CPU Usage" value="42.8%" trend="+2.4%" icon={<Cpu className="text-emerald-500" />} />
                  <StatCard label="Memory" value="12.4 GB" trend="-1.2%" icon={<Server className="text-cyan-500" />} />
                  <StatCard label="Requests" value="1.2k/s" trend="+15%" icon={<Zap className="text-amber-500" />} />
                  <StatCard label="Error Rate" value="0.02%" trend="Stable" icon={<Shield className="text-rose-500" />} />
                </div>

                {/* Charts Section */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2 p-6 rounded-2xl bg-zinc-900/50 border border-zinc-800">
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="text-lg font-semibold">System Performance</h3>
                      <div className="flex gap-2">
                        <span className="flex items-center gap-1.5 text-xs text-zinc-400">
                          <div className="w-2 h-2 rounded-full bg-emerald-500" /> Usage
                        </span>
                        <span className="flex items-center gap-1.5 text-xs text-zinc-400">
                          <div className="w-2 h-2 rounded-full bg-cyan-500" /> Latency
                        </span>
                      </div>
                    </div>
                    <div className="h-[300px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={cpuData}>
                          <defs>
                            <linearGradient id="colorUsage" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                          <XAxis dataKey="time" hide />
                          <YAxis hide />
                          <Tooltip 
                            contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px' }}
                            itemStyle={{ color: '#f4f4f5' }}
                          />
                          <Area type="monotone" dataKey="usage" stroke="#10b981" fillOpacity={1} fill="url(#colorUsage)" strokeWidth={2} />
                          <Line type="monotone" dataKey="latency" stroke="#06b6d4" strokeWidth={2} dot={false} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="p-6 rounded-2xl bg-zinc-900/50 border border-zinc-800 flex flex-col">
                    <h3 className="text-lg font-semibold mb-6">Active Agents</h3>
                    <div className="space-y-4 flex-1">
                      <AgentItem name="Meerkat-01" status="Active" task="Log Analysis" />
                      <AgentItem name="Meerkat-02" status="Idle" task="Security Scan" />
                      <AgentItem name="Meerkat-03" status="Active" task="Auto-Scaling" />
                      <AgentItem name="Meerkat-04" status="Warning" task="DB Recovery" />
                    </div>
                    <button className="mt-6 w-full py-2.5 bg-emerald-500 hover:bg-emerald-600 text-black font-semibold rounded-xl transition-colors">
                      Deploy New Agent
                    </button>
                  </div>
                </div>

                {/* Logs Section */}
                <div className="p-6 rounded-2xl bg-zinc-900/50 border border-zinc-800">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-semibold">System Logs</h3>
                    <button className="text-xs text-emerald-500 hover:underline">View all logs</button>
                  </div>
                  <div className="space-y-3 font-mono text-sm">
                    {logs.map(log => (
                      <div key={log.id} className="flex gap-4 py-2 border-b border-zinc-800/50 last:border-0">
                        <span className="text-zinc-500 w-20 flex-none">{log.time}</span>
                        <span className={cn(
                          "w-16 flex-none font-bold",
                          log.type === 'ERROR' ? 'text-rose-500' : 
                          log.type === 'WARN' ? 'text-amber-500' : 'text-emerald-500'
                        )}>[{log.type}]</span>
                        <span className="text-zinc-300">{log.msg}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'console' && (
              <motion.div 
                key="console"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="h-full flex flex-col"
              >
                <div className="flex-1 overflow-y-auto space-y-6 pb-8 pr-4">
                  {messages.map((msg, i) => (
                    <div key={i} className={cn(
                      "flex gap-4 max-w-3xl",
                      msg.role === 'user' ? "ml-auto flex-row-reverse" : ""
                    )}>
                      <div className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center flex-none",
                        msg.role === 'assistant' ? "bg-emerald-500 text-black" : "bg-zinc-800 text-zinc-400"
                      )}>
                        {msg.role === 'assistant' ? <Shield className="w-5 h-5" /> : <Command className="w-5 h-5" />}
                      </div>
                      <div className={cn(
                        "p-4 rounded-2xl text-sm leading-relaxed",
                        msg.role === 'assistant' ? "bg-zinc-900 border border-zinc-800" : "bg-emerald-500 text-black font-medium"
                      )}>
                        {msg.content}
                      </div>
                    </div>
                  ))}
                </div>

                <form onSubmit={handleSendMessage} className="mt-auto p-4 bg-zinc-900/50 border border-zinc-800 rounded-2xl flex items-center gap-4">
                  <div className="p-2 bg-zinc-800 rounded-lg text-zinc-400">
                    <MessageSquare className="w-5 h-5" />
                  </div>
                  <input 
                    type="text" 
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Ask Meerkat to optimize, monitor, or fix..."
                    className="flex-1 bg-transparent border-none focus:ring-0 text-sm placeholder:text-zinc-600"
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

      {/* Command Palette Overlay */}
      <AnimatePresence>
        {isCommandOpen && (
          <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh] bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: -20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -20 }}
              className="w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="p-4 border-b border-zinc-800 flex items-center gap-3">
                <Search className="w-5 h-5 text-zinc-500" />
                <input 
                  autoFocus
                  placeholder="Type a command or search..."
                  className="flex-1 bg-transparent border-none focus:ring-0 text-lg"
                  onKeyDown={(e) => e.key === 'Escape' && setIsCommandOpen(false)}
                />
                <button onClick={() => setIsCommandOpen(false)} className="text-xs text-zinc-500 hover:text-zinc-300">ESC</button>
              </div>
              <div className="p-4 space-y-2">
                <CommandItem icon={<Terminal />} label="Open Agent Console" shortcut="G C" />
                <CommandItem icon={<Activity />} label="View Performance Metrics" shortcut="G D" />
                <CommandItem icon={<Shield />} label="Run Security Audit" shortcut="S A" />
                <CommandItem icon={<Server />} label="List Active Instances" shortcut="L I" />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function NavItem({ icon, label, active, onClick }: { icon: React.ReactNode, label: string, active?: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all",
        active 
          ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20" 
          : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function StatCard({ label, value, trend, icon }: { label: string, value: string, trend: string, icon: React.ReactNode }) {
  const isPositive = trend.startsWith('+');
  return (
    <div className="p-6 rounded-2xl bg-zinc-900/50 border border-zinc-800 hover:border-zinc-700 transition-colors group">
      <div className="flex items-center justify-between mb-4">
        <div className="p-2 bg-zinc-800 rounded-lg group-hover:scale-110 transition-transform">
          {icon}
        </div>
        <span className={cn(
          "text-xs font-bold px-2 py-0.5 rounded-full",
          trend === 'Stable' ? 'bg-zinc-800 text-zinc-400' :
          isPositive ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'
        )}>
          {trend}
        </span>
      </div>
      <p className="text-sm text-zinc-500 mb-1">{label}</p>
      <p className="text-2xl font-bold tracking-tight">{value}</p>
    </div>
  );
}

function AgentItem({ name, status, task }: { name: string, status: string, task: string }) {
  return (
    <div className="flex items-center gap-4 p-3 rounded-xl bg-zinc-800/30 border border-transparent hover:border-zinc-700 transition-colors">
      <div className={cn(
        "w-2 h-2 rounded-full shadow-[0_0_8px_rgba(0,0,0,0.5)]",
        status === 'Active' ? 'bg-emerald-500 shadow-emerald-500/50' :
        status === 'Warning' ? 'bg-rose-500 shadow-rose-500/50' : 'bg-zinc-600'
      )} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{name}</p>
        <p className="text-xs text-zinc-500 truncate">{task}</p>
      </div>
      <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-600">{status}</span>
    </div>
  );
}

function CommandItem({ icon, label, shortcut }: { icon: React.ReactNode, label: string, shortcut: string }) {
  return (
    <div className="flex items-center justify-between p-3 rounded-xl hover:bg-zinc-800 cursor-pointer group transition-colors">
      <div className="flex items-center gap-3">
        <div className="text-zinc-500 group-hover:text-emerald-500 transition-colors">
          {icon}
        </div>
        <span className="text-sm font-medium">{label}</span>
      </div>
      <span className="text-[10px] font-mono text-zinc-600">{shortcut}</span>
    </div>
  );
}
