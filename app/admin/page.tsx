'use client';

import React, { useState, useEffect } from 'react';
import { Shield, Plus, Trash2, Phone, ArrowLeft, Hash, Save } from 'lucide-react';
import Link from 'next/link';

interface OncallNumber {
  id: string;
  phone_number: string;
  label: string;
  active: boolean;
  created_at: string;
}

export default function AdminPage() {
  const [numbers, setNumbers] = useState<OncallNumber[]>([]);
  const [newNumber, setNewNumber] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [loading, setLoading] = useState(false);
  const [slackChannel, setSlackChannel] = useState('');
  const [slackSaved, setSlackSaved] = useState(false);

  const fetchNumbers = async () => {
    const res = await fetch('/api/oncall-numbers');
    const data = await res.json();
    if (Array.isArray(data)) setNumbers(data);
  };

  const fetchSettings = async () => {
    const res = await fetch('/api/settings');
    const data = await res.json();
    if (data.slack_channel) setSlackChannel(data.slack_channel);
  };

  useEffect(() => {
    fetchNumbers();
    fetchSettings();
  }, []);

  const addNumber = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNumber.trim()) return;
    setLoading(true);

    let formatted = newNumber.trim();
    if (/^\d{10}$/.test(formatted)) {
      formatted = '+1' + formatted;
    } else if (/^1\d{10}$/.test(formatted)) {
      formatted = '+' + formatted;
    }

    await fetch('/api/oncall-numbers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone_number: formatted, label: newLabel || 'On-call Engineer' }),
    });
    setNewNumber('');
    setNewLabel('');
    setLoading(false);
    fetchNumbers();
  };

  const toggleNumber = async (id: string, active: boolean) => {
    await fetch('/api/oncall-numbers', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, active: !active }),
    });
    fetchNumbers();
  };

  const deleteNumber = async (id: string) => {
    await fetch('/api/oncall-numbers', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    fetchNumbers();
  };

  const saveSlackChannel = async () => {
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'slack_channel', value: slackChannel.replace(/^#/, '') }),
    });
    setSlackSaved(true);
    setTimeout(() => setSlackSaved(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#0C0C10] text-zinc-100 p-8">
      <div className="max-w-2xl mx-auto">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-emerald-400 mb-8 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </Link>

        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 bg-emerald-500 rounded-lg flex items-center justify-center">
            <Shield className="w-6 h-6 text-black" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Admin Settings</h1>
            <p className="text-sm text-zinc-500">Configure escalation channels and on-call numbers</p>
          </div>
        </div>

        {/* Slack Channel Config */}
        <div className="p-6 rounded-2xl bg-zinc-900/50 border border-zinc-800 mb-6">
          <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-4 flex items-center gap-2">
            <Hash className="w-4 h-4" /> Slack Alert Channel
          </h2>
          <div className="flex gap-3">
            <div className="flex-1 flex items-center gap-2 px-4 py-3 rounded-xl bg-zinc-800 border border-zinc-700">
              <span className="text-zinc-500 text-sm">#</span>
              <input
                type="text"
                value={slackChannel}
                onChange={(e) => setSlackChannel(e.target.value)}
                placeholder="soc-alerts"
                className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-zinc-600"
              />
            </div>
            <button
              onClick={saveSlackChannel}
              className={`px-6 py-3 rounded-xl font-bold text-sm transition-all flex items-center gap-2 ${
                slackSaved
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-emerald-500 hover:bg-emerald-600 text-black'
              }`}
            >
              {slackSaved ? <><Save className="w-4 h-4" /> Saved!</> : <><Save className="w-4 h-4" /> Save</>}
            </button>
          </div>
          <p className="text-xs text-zinc-600 mt-2">The Slack channel where P0/P1 alerts will be posted. Don&apos;t include the #. The Meerkat Ops bot must be added to this channel.</p>
        </div>

        {/* Add Number Form */}
        <form onSubmit={addNumber} className="p-6 rounded-2xl bg-zinc-900/50 border border-zinc-800 mb-6">
          <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-4 flex items-center gap-2">
            <Phone className="w-4 h-4" /> Add On-Call Number
          </h2>
          <div className="flex gap-3">
            <div className="flex-1">
              <input
                type="text"
                value={newNumber}
                onChange={(e) => setNewNumber(e.target.value)}
                placeholder="Phone number (e.g. 2125551234)"
                className="w-full px-4 py-3 rounded-xl bg-zinc-800 border border-zinc-700 text-sm focus:outline-none focus:border-emerald-500 placeholder:text-zinc-600"
              />
            </div>
            <div className="w-48">
              <input
                type="text"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Label (optional)"
                className="w-full px-4 py-3 rounded-xl bg-zinc-800 border border-zinc-700 text-sm focus:outline-none focus:border-emerald-500 placeholder:text-zinc-600"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !newNumber.trim()}
              className="px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-black font-bold text-sm transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> Add
            </button>
          </div>
          <p className="text-xs text-zinc-600 mt-2">Enter 10 digits and we&apos;ll add the +1 automatically. Or enter full international format.</p>
        </form>

        {/* Numbers List */}
        <div className="p-6 rounded-2xl bg-zinc-900/50 border border-zinc-800">
          <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-4">Active On-Call Numbers</h2>
          {numbers.length === 0 ? (
            <p className="text-zinc-500 text-sm py-8 text-center">No numbers configured. Add one above to enable voice escalation.</p>
          ) : (
            <div className="space-y-3">
              {numbers.map((num) => (
                <div key={num.id} className="flex items-center gap-4 p-4 rounded-xl bg-zinc-800/30 border border-zinc-800">
                  <Phone className={`w-5 h-5 ${num.active ? 'text-emerald-400' : 'text-zinc-600'}`} />
                  <div className="flex-1">
                    <p className="font-mono text-sm">{num.phone_number}</p>
                    <p className="text-xs text-zinc-500">{num.label}</p>
                  </div>
                  <button
                    onClick={() => toggleNumber(num.id, num.active)}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                      num.active
                        ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
                        : 'bg-zinc-700 text-zinc-500 hover:bg-zinc-600'
                    }`}
                  >
                    {num.active ? 'Active' : 'Inactive'}
                  </button>
                  <button
                    onClick={() => deleteNumber(num.id)}
                    className="p-2 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
