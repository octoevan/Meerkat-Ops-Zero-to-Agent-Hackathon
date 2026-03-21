# Service Control via Voice & Slack — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a simulated GCP service panel to the dashboard that can be stopped via ElevenLabs voice webhook or Slack @mention, with visible attribution ("Stopped by Voice" / "Stopped by Slack").

**Architecture:** A `services` table in Supabase holds one row (the GCS bucket). Two new webhook endpoints (`/api/webhooks/elevenlabs`, extended `/api/webhooks/slack`) update the service status. The existing polling loop in the dashboard picks up changes. The demo-sequence seeds the service as "running"; demo-reset clears it back.

**Tech Stack:** Next.js 15 API routes, Supabase (PostgreSQL), React (existing MeerkatOps.tsx component), ElevenLabs ConvAI server tools, Slack Events API.

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `app/api/services/stop/route.ts` | POST endpoint to stop the service, accepts `{ source: "voice" \| "slack" }` |
| Create | `app/api/services/route.ts` | GET endpoint to fetch current service status |
| Create | `app/api/webhooks/elevenlabs/route.ts` | ElevenLabs server tool webhook — receives voice command, calls stop logic |
| Modify | `app/api/webhooks/slack/route.ts` | Extend to detect "stop" in @mentions and call stop logic |
| Modify | `app/api/demo-sequence/route.ts` | Seed the service row as "running" at start of Phase 5 (before alerts) |
| Modify | `app/api/demo-reset/route.ts` | Delete service rows on reset |
| Modify | `components/MeerkatOps.tsx` | Add Cloud Services panel, poll for status |

---

## Pre-requisite: Supabase Table

Before any code, create the `services` table in Supabase.

Go to your Supabase dashboard → SQL Editor → run:

```sql
CREATE TABLE services (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  stopped_by TEXT,
  stopped_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for service role"
  ON services FOR ALL
  USING (true)
  WITH CHECK (true);
```

---

### Task 1: Service Status API — GET & Stop Endpoints

**Files:**
- Create: `app/api/services/route.ts`
- Create: `app/api/services/stop/route.ts`

- [ ] **Step 1: Create GET endpoint for service status**

```typescript
// app/api/services/route.ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('services')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
```

- [ ] **Step 2: Create POST stop endpoint**

```typescript
// app/api/services/stop/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  const { source } = await req.json();

  if (!source || !['voice', 'slack'].includes(source)) {
    return NextResponse.json({ error: 'source must be "voice" or "slack"' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('services')
    .update({
      status: 'stopped',
      stopped_by: source,
      stopped_at: new Date().toISOString(),
    })
    .eq('status', 'running')
    .select();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ stopped: data?.length ?? 0, services: data });
}
```

- [ ] **Step 3: Verify both files have no TypeScript errors**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add app/api/services/route.ts app/api/services/stop/route.ts
git commit -m "feat: add service status GET and stop POST endpoints"
```

---

### Task 2: ElevenLabs Voice Webhook

**Files:**
- Create: `app/api/webhooks/elevenlabs/route.ts`

- [ ] **Step 1: Create the ElevenLabs webhook endpoint**

ElevenLabs server tools send a POST with a JSON body. The exact payload shape depends on how the tool is configured in ElevenLabs, but for a simple "stop service" tool with no parameters, ElevenLabs sends the agent_id and any tool parameters. We just need to trigger the stop.

```typescript
// app/api/webhooks/elevenlabs/route.ts
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
```

- [ ] **Step 2: Smoke-test with curl**

With `npm run dev` running, test the endpoint:

```bash
curl -X POST http://localhost:3000/api/webhooks/elevenlabs \
  -H 'Content-Type: application/json' \
  -d '{}'
```

Expected: `{"message":"No running services found to stop. The service may have already been stopped."}` (since no service is seeded yet). Verify the response shape — ElevenLabs will use the `message` field as what the agent speaks back.

- [ ] **Step 3: Verify no TypeScript errors**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add app/api/webhooks/elevenlabs/route.ts
git commit -m "feat: add ElevenLabs server tool webhook for voice stop"
```

---

### Task 3: Extend Slack Webhook to Handle "Stop" Commands

**Files:**
- Modify: `app/api/webhooks/slack/route.ts`

- [ ] **Step 1: Add stop-service detection to the existing handler**

The existing handler processes `app_mention` events and sends them to Gemini. We make two surgical changes:

**(a)** Add the supabaseAdmin import at the top of the file (after the existing imports):

```typescript
import { supabaseAdmin } from '@/lib/supabase';
```

**(b)** Inside the `if (body.event?.type === 'app_mention')` block, wrap the existing Gemini logic in an `else` branch after a new "stop service" check. Replace the section from `const result = await generateText(...)` through the `slack.chat.postMessage` call with:

```typescript
      // Check if the message is a "stop service" command
      if (/\bstop\s+(the\s+)?service/i.test(userMessage)) {
        const { data } = await supabaseAdmin
          .from('services')
          .update({
            status: 'stopped',
            stopped_by: 'slack',
            stopped_at: new Date().toISOString(),
          })
          .eq('status', 'running')
          .select();

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
```

This replaces the current unconditional Gemini call with a branching check. The regex `/\bstop\s+(the\s+)?service/i` matches "stop service", "stop the service", etc. but won't false-positive on unrelated uses of "stop".

- [ ] **Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add app/api/webhooks/slack/route.ts
git commit -m "feat: extend Slack webhook to stop service on 'stop' command"
```

---

### Task 4: Seed Service in Demo Sequence & Clear on Reset

**Files:**
- Modify: `app/api/demo-sequence/route.ts` (after Phase 5 alert creation, ~line 340)
- Modify: `app/api/demo-reset/route.ts`

- [ ] **Step 1: Add service seeding to demo-sequence**

In `app/api/demo-sequence/route.ts`, at the **start** of Phase 5 — right before the P1 alert insert (line ~297, before `const evidenceJson = ...`), add:

```typescript
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
```

This goes right before `const evidenceJson = JSON.stringify(highRisk.map(l => ({` (line 299). Seeding early gives the dashboard several polling cycles to display the "running" state before the voice call is triggered in Phase 6.

- [ ] **Step 2: Add service cleanup to demo-reset**

In `app/api/demo-reset/route.ts`, add a delete for the services table. The full file becomes:

```typescript
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST() {
  await supabaseAdmin.from('alerts').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabaseAdmin.from('agent_activity').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabaseAdmin.from('services').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  return NextResponse.json({ status: 'reset complete' });
}
```

- [ ] **Step 3: Verify no TypeScript errors**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add app/api/demo-sequence/route.ts app/api/demo-reset/route.ts
git commit -m "feat: seed service in demo-sequence, clear on reset"
```

---

### Task 5: Dashboard — Cloud Services Panel

**Files:**
- Modify: `components/MeerkatOps.tsx`

- [ ] **Step 1: Add service state and polling**

At the top of the `MeerkatOps` component (after the existing state declarations around line 85), add:

```typescript
  const [services, setServices] = useState<{ id: string; name: string; status: string; stopped_by: string | null; stopped_at: string | null }[]>([]);
```

In the `fetchData` callback (around line 87), add `fetch('/api/services')` to the `Promise.all` and parse the result:

```typescript
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
```

Also add to `resetDemo` (around line 119):

```typescript
  const resetDemo = async () => {
    await fetch('/api/demo-reset', { method: 'POST' });
    setAlerts([]);
    setActivity([]);
    setServices([]);
  };
```

**(c)** Extend polling to stay active while any service is still "running". In the polling `useEffect` (around line 102), change the dependency to also check services:

After the existing polling `useEffect`, add a second effect that keeps polling alive while a service is running:

```typescript
  // Keep polling active while any service is still "running" (waiting for voice/slack stop)
  const hasRunningService = services.some(s => s.status === 'running');
  useEffect(() => {
    if (!hasRunningService) return;
    const interval = setInterval(fetchData, 1500);
    return () => clearInterval(interval);
  }, [hasRunningService, fetchData]);
```

This ensures that after the demo finishes and the 10-second polling window ends, if a service is still "running", the dashboard keeps polling until the voice or Slack stop command arrives.

- [ ] **Step 2: Add the Cloud Services panel to the dashboard tab**

Insert this new panel between the "Response Pipeline" section (ends around line 290) and the "LIVE FEED + FINDINGS" grid (starts around line 294). Place it right after the closing `</div>` of the Response Pipeline row:

```tsx
                {/* ---- ROW 3: CLOUD SERVICES ---- */}
                {services.length > 0 && (
                  <div className="rounded-2xl bg-zinc-900/50 border border-zinc-800 p-4">
                    <div className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold mb-3">Monitored Cloud Services</div>
                    <div className="space-y-2">
                      {services.map((svc) => {
                        const isRunning = svc.status === 'running';
                        const stoppedLabel = svc.stopped_by === 'voice'
                          ? 'Stopped by Voice Call'
                          : svc.stopped_by === 'slack'
                            ? 'Stopped by Slack'
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
```

- [ ] **Step 3: Verify no TypeScript errors and build passes**

Run: `npm run build`

- [ ] **Step 4: Commit**

```bash
git add components/MeerkatOps.tsx
git commit -m "feat: add Cloud Services panel to dashboard"
```

---

### Task 6: Manual Configuration — ElevenLabs & Slack (No Code)

These are manual steps the user must perform in external services.

#### 6A: ElevenLabs — Add a Server Tool to Your Agent

- [ ] **Step 1: Open ElevenLabs dashboard**

Go to https://elevenlabs.io/app/conversational-ai → select your agent (ID: the one in your `ELEVENLABS_AGENT_ID` env var).

- [ ] **Step 2: Navigate to Tools**

In the agent editor, click the **"Tools"** tab in the left sidebar (or scroll to the Tools section).

- [ ] **Step 3: Add a new Server Tool (Custom Tool / Webhook)**

Click **"+ Add Tool"** → select **"Webhook"** (also called "Server Tool" or "Custom Tool" depending on the UI version).

Configure it:

| Field | Value |
|-------|-------|
| **Tool Name** | `stop_service` |
| **Description** | `Stops the compromised Google Cloud Storage service. Use this when the on-call engineer confirms they want to stop or shut down the service.` |
| **Method** | `POST` |
| **URL** | `https://<your-vercel-domain>/api/webhooks/elevenlabs` |
| **Headers** | (none needed — or add a secret header if you want auth later) |
| **Request Body** | Leave empty / no parameters needed |

The description is critical — it tells the ElevenLabs AI agent *when* to call this tool. With this description, when the on-call engineer says something like "yes, stop the service" or "shut it down", the agent will invoke this tool.

- [ ] **Step 4: Test the tool**

You can test by clicking "Test" in the ElevenLabs tool editor, or by calling the agent and saying "stop the service". The webhook should fire to your endpoint.

- [ ] **Step 5: Verify the agent's system prompt**

Make sure your ElevenLabs agent's system prompt includes context about being a security operations agent. Something like:

> "You are Meerkat, an AI security operations agent. You are calling an on-call engineer about a critical P1 security alert. A credential compromise has been detected for user jsmith@acme.com. You have the ability to stop compromised cloud services if the engineer confirms. Ask the engineer if they want you to stop the affected GCS bucket."

The agent should:
- Explain the alert
- Ask the engineer if they want to stop the service
- Call the `stop_service` tool when they confirm
- Confirm the service was stopped after the tool returns

#### 6B: Slack — Verify Webhook Is Configured

- [ ] **Step 1: Open Slack App settings**

Go to https://api.slack.com/apps → select your Meerkat Ops app.

- [ ] **Step 2: Verify Event Subscriptions**

Go to **"Event Subscriptions"** in the sidebar:

- **Enable Events**: Should be ON
- **Request URL**: Should be `https://<your-vercel-domain>/api/webhooks/slack`
  - Must show "Verified" ✓
- **Subscribe to bot events**: Must include `app_mention`

If the Request URL isn't verified yet, enter your deployed URL and Slack will send a challenge request that our existing handler already responds to.

- [ ] **Step 3: Verify Bot Token Scopes**

Go to **"OAuth & Permissions"** → **"Scopes"** → **"Bot Token Scopes"**:

Required scopes:
- `app_mentions:read` — to receive @mention events
- `chat:write` — to reply in channels
- `channels:read` — to list channels (used by demo-sequence for posting alerts)

- [ ] **Step 4: Verify the bot is in the channel**

In Slack, go to the channel where alerts are posted (e.g., `#soc-alerts`). Type `/invite @MeerkatOps` (or whatever your bot is named) if it's not already there.

- [ ] **Step 5: Test the stop command**

In the alert thread (or any channel where the bot is present), type:

```
@MeerkatOps stop the service
```

The bot should reply:
> 🛑 Service stopped. GCS bucket `acme-patient-records` is now offline.
> _Stopped via Slack by your command._

And the dashboard should update to show "Stopped by Slack".

---

## Demo Playbook

For the hackathon demo, run through this sequence:

### Run 1: Voice Stop
1. Click **"Simulate Breach"** on the dashboard
2. Watch the pipeline animate through all phases
3. On-call engineer receives the voice call from ElevenLabs
4. Engineer says **"stop the service"** on the phone
5. Dashboard updates: service panel shows **"Stopped by Voice Call"** with a red indicator
6. Click **"Reset Demo"**

### Run 2: Slack Stop
1. Click **"Simulate Breach"** again
2. Watch the pipeline animate
3. In Slack, in the alert thread, type **`@MeerkatOps stop the service`**
4. Bot replies with confirmation
5. Dashboard updates: service panel shows **"Stopped by Slack"** with a red indicator
6. Click **"Reset Demo"**
