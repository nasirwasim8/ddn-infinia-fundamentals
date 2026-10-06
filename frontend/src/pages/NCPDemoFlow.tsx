import { useState, useEffect, useRef, useCallback } from "react"

// ── SVG Icon set (no emojis) ───────────────────────────────────────────────
const icons = {
  server: (c: string) => (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="5" rx="2"/><rect x="2" y="10" width="20" height="5" rx="2"/>
      <rect x="2" y="17" width="20" height="5" rx="2"/>
      <circle cx="6" cy="5.5" r="1" fill={c} stroke="none"/>
      <circle cx="6" cy="12.5" r="1" fill={c} stroke="none"/>
      <circle cx="6" cy="19.5" r="1" fill={c} stroke="none"/>
    </svg>
  ),
  wand: (c: string) => (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 6.2l1.4-1.4M10.8 13.2l-1.4 1.4M17.8 11.8l1.4 1.4M10.8 4.8 9.4 3.4"/>
      <path d="M3 21l9-9"/>
    </svg>
  ),
  csv: (c: string) => (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/>
      <line x1="8" y1="9" x2="10" y2="9"/>
    </svg>
  ),
  folders: (c: string) => (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
      <path d="M22 12H2" opacity=".5"/>
    </svg>
  ),
  shield: (c: string) => (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      <path d="M9 12l2 2 4-4" strokeWidth="2"/>
    </svg>
  ),
  lock: (c: string) => (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
      <circle cx="12" cy="16" r="1.5" fill={c} stroke="none"/>
    </svg>
  ),
  trash: (c: string) => (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
      <path d="M10 11v6"/><path d="M14 11v6"/>
      <path d="M9 6V4h6v2"/>
    </svg>
  ),
  plug: (c: string) => (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6L6 18"/><path d="M7 17l-4 4"/><path d="M17 7l4-4"/>
      <path d="M9 9l6 6"/><path d="M9 3v4"/><path d="M15 3v4"/>
      <path d="M9 17v4"/><path d="M15 17v4"/>
    </svg>
  ),
}

const STEPS = [
  {
    id: "red", label: "Red", sublabel: "Anchor tenant — already live", icon: "server",
    color: "#ED2738", dwell: 10000,
    title: "Red — Existing Customer, Already Live",
    bullets: [
      "Admin Dashboard — cluster health, node status, all live API data",
      "Tenant Manager shows Red's endpoint, subtenant, and S3 config",
      "Red's buckets already have data: docs-archive, compliance-vault",
      "\"This is the anchor customer. Everything you see is a live API call.\"",
    ],
    quote: '"Nothing canned. Nothing pre-recorded. Every result is a live API call to real Infinia hardware."',
  },
  {
    id: "blue", label: "Provision Blue", sublabel: "Single tenant wizard", icon: "wand",
    color: "#3B82F6", dwell: 10000,
    title: "Provision Blue — Under 2 Minutes, Live Streaming",
    bullets: [
      "Provision Wizard: fill tenant, admin user, subtenant → Run Provision",
      "Streaming log: Tenant ✓ → Subtenant ✓ → S3 user ✓ → Service ✓ → DNS ✓ → Keys ✓",
      "Blue is fully operational. S3 endpoint live at s3.blue.infinia.io",
      "\"SSH in and verify every step — it's all real.\"",
    ],
    quote: '"The NCP\'s ops team normally runs five CLI commands. This wraps all of that into one guided flow."',
  },
  {
    id: "batch", label: "Batch", sublabel: "devops + research via CSV", icon: "csv",
    color: "#F59E0B", dwell: 10000,
    title: "Batch Provision — devops + research, One CSV File",
    bullets: [
      "CSV / YAML Import → toggle Full End-to-End Provisioning ON",
      "Upload 2-row CSV: devops row, research row",
      "Both tenants stream simultaneously: tenant, service, keys, DNS",
      "\"An NCP can hand ops a spreadsheet of new signups — batch provision overnight.\"",
    ],
    quote: '"Same exact provisioning under the hood. You just throw a spreadsheet at it."',
  },
  {
    id: "storage", label: "Storage Explorer", sublabel: "Browse all tenants", icon: "folders",
    color: "#8B5CF6", dwell: 5000,
    title: "Storage Explorer — One UI, Four Tenant Namespaces",
    bullets: [
      "Switch tenant: Red → docs-archive → quarterly reports, contracts, PDFs",
      "Switch to Blue → completely different bucket list, different objects",
      "Same cluster. Separate namespaces. One interface for the NCP admin.",
      "\"Each customer only ever sees their own stuff.\"",
    ],
    quote: '"The NCP admin sees all their customers from one UI. But tenants are completely blind to each other."',
  },
  {
    id: "isolation", label: "Isolation Proof", sublabel: "404 — Not 403", icon: "shield",
    color: "#10B981", dwell: 15000,
    title: "Tenant Isolation — Live API Proof. 404. Not 403.",
    bullets: [
      "Owner = Red, bucket = docs-archive, file = quarterly-report-q3-2026.pdf",
      "Attacker = Blue (provisioned 6 min ago, valid S3 credentials on this cluster)",
      "Two real boto3 calls — confirm file exists as Red, then Blue tries to get it",
      "Result: 404 NoSuchBucket — bucket does not even exist from Blue's perspective",
    ],
    quote: '"403 means the bucket is there but you can\'t get in. 404 means Infinia doesn\'t acknowledge it exists. Invisible."',
  },
  {
    id: "worm", label: "Object Lock", sublabel: "COMPLIANCE — Delete Blocked", icon: "lock",
    color: "#EC4899", dwell: 10000,
    title: "Object Lock / WORM — Nobody Deletes This. Nobody.",
    bullets: [
      "Bucket created with Object Lock enabled at creation time",
      "Set COMPLIANCE retention: 30 days — standard S3 API, nothing proprietary",
      "Attempt Delete → DELETE BLOCKED by storage layer enforcement",
      "Not application logic — the storage layer itself refuses the delete.",
    ],
    quote: '"Healthcare, financial services, legal — WORM is a premium NCP tier. Demo-able in 60 seconds."',
  },
  {
    id: "teardown", label: "Teardown", sublabel: "Full lifecycle — both directions", icon: "trash",
    color: "#6B7280", dwell: 10000,
    title: "Teardown Wizard — Prove the Full Lifecycle",
    bullets: [
      "Teardown Wizard: select tenant → run teardown",
      "Reverse stream: service removed → access removed → user removed → tenant gone",
      "Tenant Manager: tenant is gone. Storage Explorer: no longer in dropdown.",
      "\"Not just onboarding. Full lifecycle, both directions.\"",
    ],
    quote: '"An NCP doing customer churn, or decommissioning a dev environment — same workflow in reverse."',
  },
  {
    id: "connect", label: "Connection Settings", sublabel: "Behind the curtain", icon: "plug",
    color: "#0D9488", dwell: 10000,
    title: "Behind the Curtain — Two Endpoints, Real Hardware",
    bullets: [
      "Control Plane: Infinia Management API → realm_admin credentials → provisioning",
      "Data Plane: S3 API port 8111 → per-tenant credentials → storage operations",
      "Two endpoints. A set of credentials. Every feature you just saw is live.",
      "Open source on GitHub — clone it, point at your Infinia cluster.",
    ],
    quote: '"Clone it, point it at your Infinia cluster, and walk into any NCP conversation knowing you can prove everything live."',
  },
]

const ArrowIcon = () => (
  <svg width="16" height="10" viewBox="0 0 18 10" fill="none">
    <path d="M1 5h15M11 1l5 4-5 4" stroke="var(--text-muted)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

const CheckIcon = ({ color }: { color: string }) => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
)

export default function NCPDemoFlow() {
  const [activeStep, setActiveStep] = useState(0)
  const [playing, setPlaying] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimer = () => { if (timerRef.current) clearTimeout(timerRef.current) }

  const advance = useCallback((from: number) => {
    const next = from + 1
    if (next >= STEPS.length) { setPlaying(false); return }
    setActiveStep(next)
    timerRef.current = setTimeout(() => advance(next), STEPS[next].dwell)
  }, [])

  const startPlay = useCallback((from: number) => {
    setPlaying(true)
    clearTimer()
    timerRef.current = setTimeout(() => advance(from), STEPS[from].dwell)
  }, [advance])

  const handlePlay = () => {
    if (playing) { clearTimer(); setPlaying(false) }
    else {
      const start = activeStep >= STEPS.length - 1 ? 0 : activeStep
      setActiveStep(start)
      startPlay(start)
    }
  }

  useEffect(() => () => clearTimer(), [])

  const step = STEPS[activeStep]
  const IconComp = icons[step.icon as keyof typeof icons]

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

      {/* Header */}
      <div>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: "0 0 6px 0" }}>NCP Demo Flow</h1>
        <p style={{ color: "var(--text-muted)", margin: 0, fontSize: 15 }}>
          What every NCP customer needs to see <strong style={{ color: "var(--text-primary)" }}>live</strong> — not on a slide deck.
        </p>
      </div>

      {/* Tagline banner */}
      <div style={{
        background: "linear-gradient(135deg, rgba(237,39,56,0.07) 0%, rgba(13,148,136,0.07) 100%)",
        border: "1px solid rgba(237,39,56,0.2)", borderRadius: 14,
        padding: "18px 24px", display: "flex", alignItems: "center", gap: 18,
      }}>
        <div style={{
          width: 46, height: 46, borderRadius: 12, flexShrink: 0,
          background: "#ED2738", display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {icons.shield("#fff")}
        </div>
        <div>
          <p style={{ margin: "0 0 4px 0", fontSize: 17, fontWeight: 700, color: "var(--text-primary)" }}>
            Provision fast. Isolate completely. Prove it in the room.
          </p>
          <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>
            Walk through this flow before every NCP conversation — then run it live against a real Infinia cluster.
          </p>
        </div>
      </div>

      {/* Flow strip */}
      <div style={{ background: "var(--surface-card)", borderRadius: 16, border: "1px solid var(--border-subtle)", padding: "18px 20px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <span style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.08em", color: "var(--text-muted)" }}>
            Demo Sequence — {STEPS.length} Steps
          </span>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {playing ? `Step ${activeStep + 1} / ${STEPS.length}` : "Click a step or press Play"}
            </span>
            <button onClick={handlePlay} style={{
              padding: "7px 18px", borderRadius: 8, border: "none", cursor: "pointer",
              background: playing ? "#374151" : "#ED2738", color: "white",
              fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 6,
              transition: "background 0.2s",
            }}>
              {playing ? "⏸ Pause" : activeStep >= STEPS.length - 1 && !playing ? "↺ Replay" : "▶ Play"}
            </button>
          </div>
        </div>

        {/* Pills */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" as const, justifyContent: "center" }}>
          {STEPS.map((s, i) => {
            const isActive = i === activeStep
            const isDone = i < activeStep
            return (
              <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <button onClick={() => { clearTimer(); setPlaying(false); setActiveStep(i) }}
                  style={{
                    display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 5,
                    padding: "10px 10px 8px", borderRadius: 12, cursor: "pointer",
                    border: `2px solid ${isActive ? s.color : isDone ? s.color + "60" : "var(--border-subtle)"}`,
                    background: isActive ? s.color + "18" : isDone ? s.color + "0a" : "transparent",
                    minWidth: 76, maxWidth: 86,
                    transform: isActive ? "scale(1.07)" : "scale(1)",
                    boxShadow: isActive ? `0 0 0 3px ${s.color}28` : "none",
                    opacity: isDone ? 0.72 : isActive ? 1 : 0.42,
                    transition: "all 0.3s cubic-bezier(0.4,0,0.2,1)",
                  }}>
                  <div style={{ opacity: isActive ? 1 : isDone ? 0.9 : 0.6 }}>
                    {icons[s.icon as keyof typeof icons](isActive || isDone ? s.color : "var(--text-muted)")}
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: isActive ? s.color : "var(--text-primary)", textAlign: "center", lineHeight: 1.2 }}>{s.label}</div>
                </button>
                {i < STEPS.length - 1 && (
                  <div style={{ opacity: i < activeStep ? 0.8 : 0.22, transition: "opacity 0.4s" }}>
                    <ArrowIcon />
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Progress bar */}
        <div style={{ marginTop: 14, height: 3, borderRadius: 4, background: "var(--border-subtle)", overflow: "hidden" }}>
          <div style={{
            height: "100%", borderRadius: 4,
            background: `linear-gradient(90deg, #ED2738, ${step.color})`,
            width: `${((activeStep + 1) / STEPS.length) * 100}%`,
            transition: "width 0.5s ease, background 0.5s ease",
          }} />
        </div>
      </div>

      {/* Active step detail */}
      <div style={{
        background: "var(--surface-card)", borderRadius: 16,
        border: `1.5px solid ${step.color}40`,
        padding: "24px 28px",
        boxShadow: `0 4px 24px ${step.color}10`,
        transition: "border-color 0.4s, box-shadow 0.4s",
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 18, marginBottom: 20 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14, flexShrink: 0,
            background: step.color + "18", border: `1.5px solid ${step.color}40`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <IconComp color={step.color} />
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.3 }}>{step.title}</h2>
          </div>
        </div>

        {/* Bullets */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
          {step.bullets.map((b, i) => (
            <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <div style={{
                width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                background: step.color + "18", border: `1px solid ${step.color}30`,
                display: "flex", alignItems: "center", justifyContent: "center", marginTop: 1,
              }}>
                <CheckIcon color={step.color} />
              </div>
              <p style={{ margin: 0, fontSize: 14, color: "var(--text-primary)", lineHeight: 1.6 }}>{b}</p>
            </div>
          ))}
        </div>

        {/* Quote */}
        <div style={{
          borderLeft: `3px solid ${step.color}`,
          background: step.color + "08", borderRadius: "0 8px 8px 0",
          padding: "12px 16px",
        }}>
          <p style={{ margin: 0, fontSize: 14, fontStyle: "italic", color: "var(--text-muted)", lineHeight: 1.6 }}>{step.quote}</p>
        </div>
      </div>

      {/* Grid overview */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(215px, 1fr))", gap: 10 }}>
        {STEPS.map((s, i) => {
          const IcoComp = icons[s.icon as keyof typeof icons]
          return (
            <button key={s.id} onClick={() => { clearTimer(); setPlaying(false); setActiveStep(i) }}
              style={{
                textAlign: "left", padding: "14px 16px", cursor: "pointer",
                background: i === activeStep ? s.color + "12" : "var(--surface-card)",
                border: `1.5px solid ${i === activeStep ? s.color : "var(--border-subtle)"}`,
                borderRadius: 12, transition: "all 0.2s",
              }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: s.color + "18", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <IcoComp color={s.color} />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{s.label}</div>
                </div>
              </div>
              <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)", lineHeight: 1.4 }}>{s.sublabel}</p>
            </button>
          )
        })}
      </div>

    </div>
  )
}
