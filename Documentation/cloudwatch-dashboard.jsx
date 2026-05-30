import { useState, useCallback, useEffect } from "react";

/* ── Tokens ──────────────────────────────────────────────────────────────── */
const C = {
  bg:"#f4f6fb", surface:"#ffffff", border:"#e8ecf3", borderSoft:"#f0f3f8",
  text:"#1a1d2e", textSub:"#5a6478", textMute:"#9aa3b4",
  primary:"#4f6ef7", primaryLight:"#eef1ff",
  green:"#22c55e",  greenBg:"#f0fdf4",  greenBdr:"#bbf7d0",
  red:"#ef4444",    redBg:"#fff5f5",    redBdr:"#fecaca",
  amber:"#f59e0b",  amberBg:"#fffbeb",  amberBdr:"#fde68a",
  blue:"#3b82f6",   blueBg:"#eff6ff",   blueBdr:"#bfdbfe",
  purple:"#8b5cf6", purpleBg:"#f5f3ff",
  orange:"#f97316", orangeBg:"#fff7ed",
  shadow:"0 1px 3px rgba(0,0,0,0.06),0 1px 2px rgba(0,0,0,0.04)",
  shadowMd:"0 4px 16px rgba(0,0,0,0.08)",
  shadowLg:"0 12px 40px rgba(0,0,0,0.12)",
  r:"12px", rSm:"8px", rXs:"6px",
  font:"'DM Sans','Segoe UI',system-ui,sans-serif",
  mono:"'DM Mono','Fira Code',monospace",
};

/* ── Fetch Real AWS Alarms from backend ──────────────────────────────────── */
async function fetchRealAlarms() {
  try {
    const res  = await fetch("http://localhost:3001/alarms");
    const data = await res.json();
    return data;
  } catch (err) {
    console.error("Failed to fetch alarms:", err);
    return [];
  }
}

const NAV = [
  { id:"overview",    icon:"⊞",  label:"Overview"         },
  { id:"alarms",      icon:"🔔", label:"Alarms & Alerts",  badge:12, badgeColor:C.red    },
  { id:"incidents",   icon:"⚠",  label:"Incidents",        badge:4,  badgeColor:C.orange },
  { id:"services",    icon:"⊡",  label:"Services"          },
  { id:"performance", icon:"📈", label:"Performance"       },
  { id:"canary",      icon:"🐦", label:"Canary Monitoring" },
  { id:"infra",       icon:"☁",  label:"Infrastructure"    },
  { id:"security",    icon:"🛡", label:"Security"          },
  { id:"cost",        icon:"💰", label:"Cost Management"   },
  { id:"reports",     icon:"📋", label:"Reports"           },
  { id:"deploy",      icon:"🚀", label:"Deployment"        },
  { id:"requests",    icon:"⚙",  label:"Service Requests", badge:28, badgeColor:C.primary},
  { id:"settings",    icon:"⚙",  label:"Settings"          },
];

function genSparkline(n=20, base=50, variance=20, spike=false) {
  return Array.from({length:n}, (_,i) => {
    const s = spike && i > n-5 ? variance * 1.5 : 0;
    return Math.max(0, base + (Math.random()-0.5)*variance + s);
  });
}

/* ── Tiny Sparkline SVG ──────────────────────────────────────────────────── */
function Spark({ data, color="#4f6ef7", w=80, h=28 }) {
  const min=Math.min(...data), max=Math.max(...data,min+1);
  const sy = v => h - ((v-min)/(max-min))*h;
  const pts = data.map((v,i)=>`${(i/(data.length-1))*w},${sy(v)}`).join(" ");
  return (
    <svg width={w} height={h} style={{display:"block",overflow:"visible"}}>
      <defs>
        <linearGradient id={`sg${color.replace("#","")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.18}/>
          <stop offset="100%" stopColor={color} stopOpacity={0}/>
        </linearGradient>
      </defs>
      <polygon points={`0,${h} ${pts} ${w},${h}`} fill={`url(#sg${color.replace("#","")})`}/>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round"/>
    </svg>
  );
}

/* ── Donut Chart ─────────────────────────────────────────────────────────── */
function Donut({ segments, size=120, thickness=18, label, sublabel }) {
  const r = (size-thickness)/2, cx=size/2, cy=size/2, circ=2*Math.PI*r;
  let offset = 0;
  const total = segments.reduce((s,x)=>s+x.value,0);
  return (
    <svg width={size} height={size}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={C.border} strokeWidth={thickness}/>
      {segments.map((seg,i) => {
        const dash=(seg.value/total)*circ, gap=circ-dash;
        const el = (
          <circle key={i} cx={cx} cy={cy} r={r} fill="none"
            stroke={seg.color} strokeWidth={thickness}
            strokeDasharray={`${dash} ${gap}`}
            strokeDashoffset={-offset}
            strokeLinecap="butt"
            style={{transform:`rotate(-90deg)`,transformOrigin:`${cx}px ${cy}px`}}/>
        );
        offset += dash;
        return el;
      })}
      {label && <>
        <text x={cx} y={cy-2} textAnchor="middle" fontSize={size>100?16:12} fontWeight="800" fill={C.text} fontFamily={C.font}>{label}</text>
        {sublabel && <text x={cx} y={cy+14} textAnchor="middle" fontSize={9} fill={C.textMute} fontFamily={C.font}>{sublabel}</text>}
      </>}
    </svg>
  );
}

/* ── Severity Badge ──────────────────────────────────────────────────────── */
function SevBadge({sev}) {
  const map={CRITICAL:{bg:"#fef2f2",color:"#dc2626",bdr:"#fecaca"},MAJOR:{bg:"#fff7ed",color:"#ea580c",bdr:"#fed7aa"},WARNING:{bg:"#fffbeb",color:"#d97706",bdr:"#fde68a"},INFO:{bg:"#eff6ff",color:"#2563eb",bdr:"#bfdbfe"}};
  const s=map[sev]||map.INFO;
  return <span style={{background:s.bg,color:s.color,border:`1px solid ${s.bdr}`,borderRadius:4,padding:"2px 8px",fontSize:10,fontWeight:700,fontFamily:C.mono,letterSpacing:"0.04em"}}>{sev}</span>;
}

/* ── State Dot ───────────────────────────────────────────────────────────── */
function StateDot({state}) {
  const c=state==="ALARM"?C.red:state==="OK"?C.green:C.amber;
  return <span style={{width:8,height:8,borderRadius:"50%",background:c,display:"inline-block",boxShadow:state==="ALARM"?`0 0 0 3px ${c}28`:"none"}}/>;
}

/* ── KPI Card ────────────────────────────────────────────────────────────── */
function KpiCard({icon,iconBg,title,titleColor,value,valueColor,sub,subColor,spark,sparkColor,children}) {
  return (
    <div style={{background:C.surface,borderRadius:C.r,padding:"18px 20px",boxShadow:C.shadow,border:`1px solid ${C.border}`,display:"flex",alignItems:"flex-start",gap:14,flex:1}}>
      {icon && <div style={{width:44,height:44,borderRadius:10,background:iconBg||C.primaryLight,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{icon}</div>}
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:11,color:titleColor||C.textSub,fontWeight:600,marginBottom:2,letterSpacing:"0.02em"}}>{title}</div>
        <div style={{fontSize:26,fontWeight:800,color:valueColor||C.text,lineHeight:1.1,fontFamily:C.mono}}>{value}</div>
        {sub && <div style={{fontSize:11,color:subColor||C.textMute,marginTop:3}}>{sub}</div>}
        {children}
      </div>
      {spark && <div style={{alignSelf:"flex-end"}}><Spark data={spark} color={sparkColor||C.primary} w={64} h={28}/></div>}
    </div>
  );
}

/* ── Section Header ──────────────────────────────────────────────────────── */
function SectionHeader({title, action}) {
  return (
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
      <span style={{fontSize:14,fontWeight:700,color:C.text}}>{title}</span>
      {action && <button onClick={action.fn} style={{background:"none",border:"none",color:C.primary,fontSize:12,cursor:"pointer",fontWeight:600,display:"flex",alignItems:"center",gap:4,fontFamily:C.font}}>{action.label} →</button>}
    </div>
  );
}

/* ── AI Analysis Modal ───────────────────────────────────────────────────── */
function AIModal({alarms, target, onClose}) {
  const [text,setText]=useState(""); const [loading,setLoading]=useState(true);
  const run=useCallback(async()=>{
    setLoading(true);setText("");
    const prompt=target
      ?`Analyze this AWS CloudWatch alarm:\n${JSON.stringify({name:target.name,resource:target.resource,type:target.type,severity:target.severity,namespace:target.namespace,metric:target.metric,threshold:target.threshold,avg:target.avg,max:target.max,breaches:target.breaches},null,2)}\n\nProvide:\n1. **Root Cause** — most likely reason\n2. **Blast Radius** — downstream impact\n3. **Immediate Fix** — 3 concrete steps\n4. **Long-term Remedy** — architecture fix\n5. **Canary Signal** — earlier detection\n\nBe specific, production-grade, ap-southeast-1.`
      :`Analyze this AWS CloudWatch alarm fleet:\n${JSON.stringify(alarms.map(a=>({name:a.name,severity:a.severity,state:a.state,namespace:a.namespace,metric:a.metric,breaches:a.breaches})),null,2)}\n\n1. **Critical Issues** — root causes for ALARM items\n2. **Correlated Failures** — linked alarms\n3. **3-Day Pattern** — trend analysis\n4. **Priority Actions** — top 5 by urgency\n5. **Canary Additions** — 3 recommended checks\n\nMarkdown. AWS-specific. Production ap-southeast-1.`;
    try {
      const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1000,messages:[{role:"user",content:prompt}]})});
      const d=await res.json();
      setText(d.content?.map(b=>b.text||"").join("")||"No response.");
    } catch { setText("⚠ Could not reach analysis API. Check your API key."); }
    setLoading(false);
  },[alarms,target]);
  useEffect(()=>{run();},[run]);

  const md=t=>t
    .replace(/\*\*(.+?)\*\*/g,`<strong style="color:${C.text}">$1</strong>`)
    .replace(/^## (.+)$/gm,`<div style="color:${C.text};font-size:14px;font-weight:700;margin:14px 0 6px;padding-bottom:5px;border-bottom:1px solid ${C.border}">$1</div>`)
    .replace(/^### (.+)$/gm,`<div style="color:${C.primary};font-size:11px;font-weight:700;margin:12px 0 4px;text-transform:uppercase;letter-spacing:0.07em;font-family:${C.mono}">$1</div>`)
    .replace(/^(\d+)\. (.+)$/gm,`<div style="display:flex;gap:10px;margin:5px 0;color:${C.textSub}"><span style="color:${C.primary};font-weight:700;min-width:18px;font-family:${C.mono}">$1.</span><span>$2</span></div>`)
    .replace(/^- (.+)$/gm,`<div style="display:flex;gap:8px;margin:4px 0;color:${C.textSub}"><span style="color:${C.primary}">▸</span><span>$1</span></div>`)
    .replace(/`(.+?)`/g,`<code style="background:${C.blueBg};color:${C.blue};padding:1px 5px;border-radius:4px;font-family:${C.mono};font-size:11px">$1</code>`)
    .replace(/\n/g,"<br/>");

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(15,20,40,0.45)",backdropFilter:"blur(6px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000}}>
      <div style={{background:C.surface,borderRadius:C.r,width:"min(760px,95vw)",maxHeight:"86vh",display:"flex",flexDirection:"column",boxShadow:C.shadowLg,border:`1px solid ${C.border}`}}>
        <div style={{padding:"18px 24px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:10,color:C.primary,fontFamily:C.mono,fontWeight:700,letterSpacing:"0.1em",marginBottom:3}}>⚡ CLAUDE AI · ANALYSIS ENGINE</div>
            <div style={{fontSize:16,fontWeight:800,color:C.text}}>{target?`Deep-Dive: ${target.name}`:"Fleet-Wide Alarm Analysis"}</div>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={run} style={{background:C.primaryLight,border:`1px solid ${C.blueBdr}`,borderRadius:C.rSm,color:C.primary,padding:"7px 14px",cursor:"pointer",fontSize:12,fontFamily:C.mono,fontWeight:600}}>↺ Re-run</button>
            <button onClick={onClose} style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:C.rSm,color:C.textSub,padding:"7px 14px",cursor:"pointer",fontSize:12}}>✕ Close</button>
          </div>
        </div>
        <div style={{padding:"22px 24px",overflowY:"auto",flex:1,fontSize:13,color:C.textSub,lineHeight:1.8,fontFamily:C.font}}>
          {loading
            ? <div style={{textAlign:"center",padding:"48px 0"}}>
                <div style={{fontSize:32,marginBottom:14,animation:"spin 1.4s linear infinite",display:"inline-block"}}>⚡</div>
                <div style={{color:C.primary,fontFamily:C.mono,fontSize:13,fontWeight:600}}>Analysing alarm patterns…</div>
                <div style={{color:C.textMute,fontSize:12,marginTop:6}}>Correlating metrics and identifying root causes</div>
              </div>
            : <div dangerouslySetInnerHTML={{__html:md(text)}}/>}
        </div>
      </div>
    </div>
  );
}

/* ── Alarm Detail Modal ──────────────────────────────────────────────────── */
function AlarmDetail({alarm, onClose, onAnalyze}) {
  const spark24=genSparkline(48, alarm.threshold||50, (alarm.threshold||50)*0.3, alarm.state==="ALARM");
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(15,20,40,0.40)",backdropFilter:"blur(4px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:900}}>
      <div style={{background:C.surface,borderRadius:C.r,width:"min(680px,95vw)",maxHeight:"88vh",overflowY:"auto",boxShadow:C.shadowLg,border:`1px solid ${C.border}`}}>
        <div style={{padding:"20px 24px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}><SevBadge sev={alarm.severity}/><StateDot state={alarm.state}/><span style={{fontSize:11,color:C.textMute,fontFamily:C.mono}}>{alarm.state}</span></div>
            <div style={{fontSize:18,fontWeight:800,color:C.text}}>{alarm.name}</div>
            <div style={{fontSize:12,color:C.textMute,fontFamily:C.mono,marginTop:2}}>{alarm.namespace} · {alarm.resource}</div>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={onAnalyze} style={{background:C.primary,border:"none",borderRadius:C.rSm,color:"#fff",padding:"8px 16px",cursor:"pointer",fontSize:12,fontFamily:C.mono,fontWeight:700}}>⚡ AI Analyze</button>
            <button onClick={onClose} style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:C.rSm,color:C.textSub,padding:"8px 14px",cursor:"pointer"}}>✕</button>
          </div>
        </div>
        <div style={{padding:"20px 24px"}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:18}}>
            {[
              ["Metric",  alarm.metric,    false],
              ["Threshold",`${alarm.threshold||"N/A"}`,false],
              ["Region",  alarm.region,    false],
              ["Period",  `${alarm.period||300}s`, false],
            ].map(([l,v,hi])=>(
              <div key={l} style={{background:hi?C.redBg:C.bg,border:`1px solid ${hi?C.redBdr:C.border}`,borderRadius:C.rSm,padding:"10px 12px"}}>
                <div style={{fontSize:9,color:C.textMute,fontFamily:C.mono,marginBottom:3,textTransform:"uppercase",letterSpacing:"0.07em"}}>{l}</div>
                <div style={{fontSize:13,fontWeight:700,color:hi?C.red:C.text,fontFamily:C.mono,wordBreak:"break-all"}}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{background:C.bg,borderRadius:C.rSm,padding:14,border:`1px solid ${C.border}`,marginBottom:14}}>
            <div style={{fontSize:10,color:C.textMute,fontFamily:C.mono,marginBottom:10,textTransform:"uppercase",letterSpacing:"0.07em"}}>Metric Trend (simulated)</div>
            <Spark data={spark24} color={alarm.state==="ALARM"?C.red:alarm.state==="OK"?C.green:C.amber} w={560} h={64}/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            {[
              ["Metric",              alarm.metric],
              ["Namespace",           alarm.namespace],
              ["Resource",            alarm.resource],
              ["Type",                alarm.type],
              ["Severity",            alarm.severity],
              ["State",               alarm.state],
              ["Comparison",          alarm.comparisonOperator],
              ["Eval Periods",        alarm.evaluationPeriods],
            ].map(([k,v])=>(
              <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:`1px solid ${C.borderSoft}`}}>
                <span style={{fontSize:12,color:C.textSub}}>{k}</span>
                <span style={{fontSize:12,color:C.text,fontFamily:C.mono,fontWeight:500}}>{v||"N/A"}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  MAIN APP                                                                  */
/* ══════════════════════════════════════════════════════════════════════════ */
export default function App() {
  const [activeNav, setActiveNav] = useState("overview");
  const [selected,  setSelected]  = useState(null);
  const [showAI,    setShowAI]    = useState(false);
  const [aiTarget,  setAiTarget]  = useState(null);
  const [alarms,    setAlarms]    = useState([]);       // ← real AWS data
  const [loading,   setLoading]   = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);

  /* ── Fetch real alarms on mount + every 60s ── */
  useEffect(() => {
    const load = () => {
      setLoading(true);
      fetchRealAlarms().then(data => {
        setAlarms(data);
        setLoading(false);
        setLastRefresh(new Date());
      });
    };
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, []);

  /* ── Derived counts from real data ── */
  const alarmCount = alarms.filter(a=>a.state==="ALARM").length;
  const critCount  = alarms.filter(a=>a.severity==="CRITICAL").length;
  const warnCount  = alarms.filter(a=>a.severity==="WARNING").length;
  const majorCount = alarms.filter(a=>a.severity==="MAJOR").length;
  const okCount    = alarms.filter(a=>a.state==="OK").length;

  const sevDonut = [
    {label:"Critical", value:critCount||1,  color:"#ef4444"},
    {label:"Major",    value:majorCount||1, color:"#f97316"},
    {label:"Warning",  value:warnCount||1,  color:"#f59e0b"},
    {label:"Info",     value:Math.max(1, alarms.length - critCount - majorCount - warnCount), color:"#3b82f6"},
  ];

  const sysDonut = [
    {label:"OK",               value:Math.max(okCount,1),    color:"#22c55e"},
    {label:"Alarm",            value:Math.max(alarmCount,1), color:"#ef4444"},
    {label:"Insufficient Data",value:Math.max(alarms.filter(a=>a.state==="INSUFFICIENT_DATA").length,1), color:"#f59e0b"},
  ];

  const costDonut = [
    {label:"EC2",    value:36, color:"#4f6ef7"},
    {label:"RDS",    value:26, color:"#a78bfa"},
    {label:"S3",     value:15, color:"#f59e0b"},
    {label:"Others", value:23, color:"#22c55e"},
  ];

  const perfData = {
    avgLatency: genSparkline(20,1.35,0.4),
    reqPerMin:  genSparkline(20,2456,400),
    errorRate:  genSparkline(20,0.24,0.08),
    throughput: genSparkline(20,98,12),
  };
  const canaryLine = genSparkline(30,99.2,1.5);
  const costLine   = genSparkline(20,12340,2000);

  const systemHealth = alarmCount === 0 ? "Healthy" : alarmCount < 3 ? "Degraded" : "Critical";
  const systemHealthColor = alarmCount === 0 ? C.green : alarmCount < 3 ? C.amber : C.red;

  return (
    <div style={{display:"flex",minHeight:"100vh",background:C.bg,fontFamily:C.font,color:C.text}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500;600&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}
        ::-webkit-scrollbar{width:5px;height:5px}
        ::-webkit-scrollbar-track{background:${C.bg}}
        ::-webkit-scrollbar-thumb{background:${C.border};border-radius:3px}
        button:focus,input:focus{outline:none}
      `}</style>

      {/* ── Sidebar ── */}
      <div style={{width:200,background:C.surface,borderRight:`1px solid ${C.border}`,display:"flex",flexDirection:"column",flexShrink:0,position:"sticky",top:0,height:"100vh",overflowY:"auto"}}>
        <div style={{padding:"20px 18px 16px",borderBottom:`1px solid ${C.border}`}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{width:32,height:32,background:"linear-gradient(135deg,#4f6ef7,#7c3aed)",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:15,fontWeight:800}}>☁</div>
            <span style={{fontSize:18,fontWeight:800,color:C.primary,letterSpacing:"-0.03em"}}>eLit</span>
          </div>
        </div>
        <nav style={{flex:1,padding:"10px 8px"}}>
          {NAV.map(n=>{
            const active=activeNav===n.id;
            return (
              <button key={n.id} onClick={()=>setActiveNav(n.id)} style={{
                width:"100%",display:"flex",alignItems:"center",gap:10,padding:"9px 10px",
                borderRadius:C.rSm,border:"none",cursor:"pointer",marginBottom:2,
                background:active?"linear-gradient(90deg,#eef1ff,#f0f3ff)":"transparent",
                color:active?C.primary:C.textSub,fontWeight:active?700:500,fontSize:13,fontFamily:C.font,
                transition:"all 0.15s",textAlign:"left"
              }}>
                <span style={{fontSize:15,width:18,textAlign:"center"}}>{n.icon}</span>
                <span style={{flex:1}}>{n.label}</span>
                {n.badge && <span style={{background:n.badgeColor,color:"#fff",borderRadius:10,padding:"1px 6px",fontSize:10,fontWeight:700,minWidth:18,textAlign:"center"}}>{n.badge}</span>}
              </button>
            );
          })}
        </nav>
        <div style={{margin:"0 8px 8px",background:"linear-gradient(135deg,#eef1ff,#f5f3ff)",borderRadius:C.r,padding:"14px 12px",border:`1px solid ${C.blueBdr}`}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
            <div style={{width:28,height:28,background:"linear-gradient(135deg,#4f6ef7,#7c3aed)",borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>🤖</div>
            <span style={{fontSize:12,fontWeight:700,color:C.text}}>AI Assistant</span>
          </div>
          <p style={{fontSize:11,color:C.textSub,lineHeight:1.5,marginBottom:10}}>Ask me anything about your systems, incidents, or performance.</p>
          <button onClick={()=>{setAiTarget(null);setShowAI(true);}} style={{width:"100%",background:C.primary,border:"none",borderRadius:C.rXs,color:"#fff",padding:"7px",fontSize:11,fontFamily:C.mono,fontWeight:700,cursor:"pointer"}}>✦ Ask AI</button>
        </div>
      </div>

      {/* ── Main ── */}
      <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0,overflow:"auto"}}>

        {/* ── Top Bar ── */}
        <div style={{background:C.surface,borderBottom:`1px solid ${C.border}`,padding:"0 24px",display:"flex",alignItems:"center",gap:16,height:60,flexShrink:0,position:"sticky",top:0,zIndex:10}}>
          <div>
            <div style={{fontSize:18,fontWeight:800,color:C.text,lineHeight:1.1}}>eLit Management Dashboard</div>
            <div style={{fontSize:11,color:C.textMute}}>
              Real-time AWS CloudWatch · {lastRefresh ? `Last refresh: ${lastRefresh.toLocaleTimeString("en-SG")}` : "Loading…"}
            </div>
          </div>
          <div style={{flex:1}}/>
          <div style={{position:"relative"}}>
            <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:C.textMute,fontSize:13}}>🔍</span>
            <input placeholder="Search anything…" style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:C.rSm,padding:"7px 12px 7px 32px",fontSize:12,color:C.text,width:200,fontFamily:C.font}}/>
          </div>
          <div style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:C.rSm,padding:"7px 12px",fontSize:12,color:C.textSub,display:"flex",alignItems:"center",gap:6}}>
            📅 {new Date().toLocaleDateString("en-SG",{month:"short",day:"numeric",year:"numeric"})}
          </div>
          <button
            onClick={()=>{ setLoading(true); fetchRealAlarms().then(d=>{setAlarms(d);setLoading(false);setLastRefresh(new Date());}); }}
            style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:C.rSm,padding:"7px 10px",cursor:"pointer",fontSize:14,color:C.textSub}}>
            {loading ? <span style={{animation:"spin 1s linear infinite",display:"inline-block"}}>↻</span> : "↻"}
          </button>
          <div style={{position:"relative"}}>
            <button style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:C.rSm,padding:"7px 10px",cursor:"pointer",fontSize:14,color:C.textSub}}>🔔</button>
            {alarmCount>0 && <span style={{position:"absolute",top:-4,right:-4,background:C.red,color:"#fff",borderRadius:10,padding:"1px 5px",fontSize:9,fontWeight:700}}>{alarmCount}</span>}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8,padding:"4px 10px 4px 4px",background:C.bg,border:`1px solid ${C.border}`,borderRadius:30}}>
            <div style={{width:30,height:30,borderRadius:"50%",background:"linear-gradient(135deg,#4f6ef7,#7c3aed)",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:12,fontWeight:700}}>JD</div>
            <div>
              <div style={{fontSize:11,fontWeight:700,color:C.text,lineHeight:1}}>John Dela Cruz</div>
              <div style={{fontSize:9,color:C.textMute}}>IT Operations Manager</div>
            </div>
          </div>
        </div>

        {/* ── Loading Banner ── */}
        {loading && (
          <div style={{background:C.primaryLight,borderBottom:`1px solid ${C.blueBdr}`,padding:"8px 24px",fontSize:12,color:C.primary,display:"flex",alignItems:"center",gap:8}}>
            <span style={{animation:"spin 1s linear infinite",display:"inline-block"}}>↻</span>
            Fetching real-time alarm data from AWS CloudWatch…
          </div>
        )}

        {/* ── Empty State ── */}
        {!loading && alarms.length === 0 && (
          <div style={{background:C.amberBg,borderBottom:`1px solid ${C.amberBdr}`,padding:"10px 24px",fontSize:12,color:C.amber,fontWeight:600}}>
            ⚠ No alarms found. Make sure your backend is running at http://localhost:3001 and your AWS account has CloudWatch alarms configured.
          </div>
        )}

        {/* ── Dashboard Content ── */}
        <div style={{padding:"22px 24px",flex:1}}>

          {/* ── Row 1: KPI Cards ── */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:22}}>
            {/* System Health */}
            <div style={{background:C.surface,borderRadius:C.r,padding:"18px 20px",boxShadow:C.shadow,border:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:14}}>
              <div style={{width:44,height:44,borderRadius:10,background:alarmCount===0?C.greenBg:C.redBg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>
                {alarmCount===0?"💚":"⚠️"}
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:11,color:systemHealthColor,fontWeight:700,marginBottom:2}}>System Health</div>
                <div style={{fontSize:22,fontWeight:800,color:systemHealthColor}}>{systemHealth}</div>
                <div style={{fontSize:11,color:C.textMute}}>{alarmCount===0?"All systems operational":`${alarmCount} alarm${alarmCount>1?"s":""} active`}</div>
              </div>
            </div>
            {/* Active Alarms — real count */}
            <div style={{background:C.surface,borderRadius:C.r,padding:"18px 20px",boxShadow:C.shadow,border:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:14}}>
              <div style={{width:44,height:44,borderRadius:10,background:"#fff8e7",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>🔔</div>
              <div style={{flex:1}}>
                <div style={{fontSize:11,color:C.textSub,fontWeight:600,marginBottom:2}}>Active Alarms</div>
                <div style={{fontSize:28,fontWeight:800,color:C.text,fontFamily:C.mono}}>{alarms.length}</div>
                <div style={{fontSize:11,marginTop:2}}>
                  <span style={{color:C.red,fontWeight:700}}>{alarmCount} In Alarm</span>
                  <span style={{color:C.textMute}}> · </span>
                  <span style={{color:C.green,fontWeight:700}}>{okCount} OK</span>
                </div>
              </div>
            </div>
            {/* ALARM state count */}
            <div style={{background:C.surface,borderRadius:C.r,padding:"18px 20px",boxShadow:C.shadow,border:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:14}}>
              <div style={{width:44,height:44,borderRadius:10,background:C.redBg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>🚨</div>
              <div style={{flex:1}}>
                <div style={{fontSize:11,color:C.textSub,fontWeight:600,marginBottom:2}}>In ALARM State</div>
                <div style={{fontSize:28,fontWeight:800,color:alarmCount>0?C.red:C.text,fontFamily:C.mono}}>{alarmCount}</div>
                <div style={{fontSize:11,marginTop:2}}>
                  <span style={{color:C.red,fontWeight:700}}>{critCount} Critical</span>
                  <span style={{color:C.textMute}}> · </span>
                  <span style={{color:C.amber,fontWeight:700}}>{warnCount} Warning</span>
                </div>
              </div>
            </div>
            {/* Region */}
            <div style={{background:C.surface,borderRadius:C.r,padding:"18px 20px",boxShadow:C.shadow,border:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:14}}>
              <div style={{width:44,height:44,borderRadius:10,background:C.blueBg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>🌏</div>
              <div style={{flex:1}}>
                <div style={{fontSize:11,color:C.primary,fontWeight:700,marginBottom:2}}>AWS Region</div>
                <div style={{fontSize:16,fontWeight:800,color:C.text,fontFamily:C.mono}}>ap-southeast-1</div>
                <div style={{fontSize:11,color:C.textMute,marginTop:2}}>Singapore · Live</div>
              </div>
            </div>
          </div>

          {/* ── Row 2: System Overview + Alarms by Severity + Top Incidents ── */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1.4fr",gap:14,marginBottom:22}}>

            {/* System Overview — real state breakdown */}
            <div style={{background:C.surface,borderRadius:C.r,padding:"18px 20px",boxShadow:C.shadow,border:`1px solid ${C.border}`}}>
              <SectionHeader title="Alarm State Overview"/>
              <div style={{display:"flex",alignItems:"center",gap:20}}>
                <Donut segments={sysDonut} size={130} thickness={20}
                  label={`${alarms.length}`} sublabel="Total Alarms"/>
                <div style={{flex:1}}>
                  {[
                    {label:"In Alarm",         val:alarmCount,                                                  color:C.red},
                    {label:"OK",               val:okCount,                                                     color:C.green},
                    {label:"Insufficient Data",val:alarms.filter(a=>a.state==="INSUFFICIENT_DATA").length,      color:C.amber},
                  ].map(r=>(
                    <div key={r.label} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 0",borderBottom:`1px solid ${C.borderSoft}`}}>
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <div style={{width:8,height:8,borderRadius:"50%",background:r.color,flexShrink:0}}/>
                        <span style={{fontSize:11,color:C.textSub}}>{r.label}</span>
                      </div>
                      <span style={{fontSize:13,fontWeight:700,color:r.color,fontFamily:C.mono}}>{r.val}</span>
                    </div>
                  ))}
                  <div style={{marginTop:8,fontSize:10,color:C.textMute,display:"flex",alignItems:"center",gap:4}}>
                    🔄 Auto-refresh every 60s
                  </div>
                </div>
              </div>
            </div>

            {/* Alarms by Severity */}
            <div style={{background:C.surface,borderRadius:C.r,padding:"18px 20px",boxShadow:C.shadow,border:`1px solid ${C.border}`}}>
              <SectionHeader title="Alarms by Severity"/>
              <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:24}}>
                <Donut segments={sevDonut} size={130} thickness={20} label={`${alarms.length}`} sublabel="Total"/>
                <div>
                  {[
                    {label:"Critical", value:critCount,  color:C.red},
                    {label:"Major",    value:majorCount, color:C.orange},
                    {label:"Warning",  value:warnCount,  color:C.amber},
                    {label:"Info/OK",  value:okCount,    color:C.blue},
                  ].map(s=>(
                    <div key={s.label} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 0",borderBottom:`1px solid ${C.borderSoft}`}}>
                      <div style={{width:10,height:10,borderRadius:"50%",background:s.color,flexShrink:0}}/>
                      <span style={{fontSize:12,color:C.textSub,flex:1}}>{s.label}</span>
                      <span style={{fontSize:14,fontWeight:700,color:C.text,fontFamily:C.mono}}>{s.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Top Active Incidents — real alarms in ALARM state */}
            <div style={{background:C.surface,borderRadius:C.r,padding:"18px 20px",boxShadow:C.shadow,border:`1px solid ${C.border}`}}>
              <SectionHeader title="Top Active Alarms"/>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {alarms.filter(a=>a.state==="ALARM").slice(0,4).length > 0
                  ? alarms.filter(a=>a.state==="ALARM").slice(0,4).map(a=>(
                    <div key={a.name} onClick={()=>setSelected(a)}
                      style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",borderRadius:C.rSm,background:C.bg,cursor:"pointer",border:`1px solid ${C.border}`,transition:"all 0.15s"}}
                      onMouseEnter={e=>e.currentTarget.style.background=C.primaryLight}
                      onMouseLeave={e=>e.currentTarget.style.background=C.bg}>
                      <SevBadge sev={a.severity||"INFO"}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:12,fontWeight:700,color:C.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{a.name}</div>
                        <div style={{fontSize:10,color:C.textMute,fontFamily:C.mono}}>{a.resource} · {a.type}</div>
                      </div>
                      <div style={{textAlign:"right",flexShrink:0}}>
                        <div style={{fontSize:10,color:C.textMute,marginBottom:3}}>{a.time}</div>
                        <Spark data={genSparkline(12,50,20,true)} color={C.red} w={56} h={18}/>
                      </div>
                    </div>
                  ))
                  : <div style={{textAlign:"center",padding:"20px 0",color:C.textMute,fontSize:12}}>
                      ✅ No alarms currently in ALARM state
                    </div>
                }
              </div>
            </div>
          </div>

          {/* ── Row 3: All Alarms Table ── */}
          <div style={{background:C.surface,borderRadius:C.r,padding:"18px 20px",boxShadow:C.shadow,border:`1px solid ${C.border}`,marginBottom:22}}>
            <SectionHeader title={`All CloudWatch Alarms (${alarms.length})`}/>
            {alarms.length === 0
              ? <div style={{textAlign:"center",padding:"30px 0",color:C.textMute,fontSize:13}}>
                  No alarms found. Make sure the backend server is running.
                </div>
              : <div style={{overflowX:"auto"}}>
                  <table style={{width:"100%",borderCollapse:"collapse"}}>
                    <thead>
                      <tr style={{background:C.bg}}>
                        {["Alarm Name","Namespace","Metric","Resource","Threshold","State","Severity","Last Updated"].map(h=>(
                          <th key={h} style={{padding:"9px 12px",color:C.textMute,fontSize:10,fontFamily:C.mono,textAlign:"left",fontWeight:600,letterSpacing:"0.07em",borderBottom:`1px solid ${C.border}`,whiteSpace:"nowrap",textTransform:"uppercase"}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {alarms.map((a,i)=>(
                        <tr key={a.name} onClick={()=>setSelected(a)}
                          style={{background:i%2===0?C.surface:C.bg,cursor:"pointer",transition:"background 0.15s"}}
                          onMouseEnter={e=>e.currentTarget.style.background=C.primaryLight}
                          onMouseLeave={e=>e.currentTarget.style.background=i%2===0?C.surface:C.bg}>
                          <td style={{padding:"9px 12px",fontSize:12,fontWeight:700,color:C.text,fontFamily:C.mono,whiteSpace:"nowrap"}}>{a.name}</td>
                          <td style={{padding:"9px 12px",fontSize:11,color:C.textSub,fontFamily:C.mono}}>{a.namespace?.replace("AWS/","")}</td>
                          <td style={{padding:"9px 12px",fontSize:11,color:C.textSub,fontFamily:C.mono}}>{a.metric}</td>
                          <td style={{padding:"9px 12px",fontSize:11,color:C.textSub,fontFamily:C.mono,maxWidth:140,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.resource}</td>
                          <td style={{padding:"9px 12px",fontSize:11,color:C.text,fontFamily:C.mono}}>{a.threshold}</td>
                          <td style={{padding:"9px 12px"}}>
                            <span style={{
                              background:a.state==="ALARM"?C.redBg:a.state==="OK"?C.greenBg:C.amberBg,
                              color:a.state==="ALARM"?C.red:a.state==="OK"?C.green:C.amber,
                              border:`1px solid ${a.state==="ALARM"?C.redBdr:a.state==="OK"?C.greenBdr:C.amberBdr}`,
                              borderRadius:4,padding:"2px 8px",fontSize:10,fontWeight:700,fontFamily:C.mono
                            }}>{a.state}</span>
                          </td>
                          <td style={{padding:"9px 12px"}}><SevBadge sev={a.severity||"INFO"}/></td>
                          <td style={{padding:"9px 12px",fontSize:10,color:C.textMute,fontFamily:C.mono}}>{a.time}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
            }
          </div>

          {/* ── Row 4: Canary + Performance + Cost ── */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1.4fr 1.2fr",gap:14,marginBottom:22}}>
            {/* Canary Monitoring */}
            <div style={{background:C.surface,borderRadius:C.r,padding:"18px 20px",boxShadow:C.shadow,border:`1px solid ${C.border}`}}>
              <SectionHeader title="Canary Monitoring"/>
              <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:16}}>
                <div style={{position:"relative",width:90,height:90}}>
                  <svg width={90} height={90} style={{transform:"rotate(-90deg)"}}>
                    <circle cx={45} cy={45} r={36} fill="none" stroke={C.border} strokeWidth={8}/>
                    <circle cx={45} cy={45} r={36} fill="none" stroke={C.green} strokeWidth={8} strokeDasharray={`${0.992*2*Math.PI*36} ${2*Math.PI*36}`} strokeLinecap="round"/>
                  </svg>
                  <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
                    <div style={{fontSize:16,fontWeight:800,color:C.green,fontFamily:C.mono}}>99.2%</div>
                    <div style={{fontSize:8,color:C.textMute}}>Success</div>
                  </div>
                </div>
                <div style={{flex:1}}>
                  {[["Total Tests","120",C.text],["Passed","119",C.green],["Failed","1",C.red]].map(([l,v,c])=>(
                    <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"3px 0",borderBottom:`1px solid ${C.borderSoft}`}}>
                      <span style={{fontSize:11,color:C.textSub}}>{l}</span>
                      <span style={{fontSize:12,fontWeight:700,color:c,fontFamily:C.mono}}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{background:C.bg,borderRadius:C.rXs,padding:"8px 10px",border:`1px solid ${C.border}`}}>
                <div style={{fontSize:9,color:C.textMute,marginBottom:4,fontFamily:C.mono}}>SUCCESS RATE TREND</div>
                <Spark data={canaryLine} color={C.green} w={220} h={36}/>
              </div>
            </div>

            {/* Performance Overview */}
            <div style={{background:C.surface,borderRadius:C.r,padding:"18px 20px",boxShadow:C.shadow,border:`1px solid ${C.border}`}}>
              <SectionHeader title="Performance Overview (Last 24 Hours)"/>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                {[
                  {label:"Avg Response Time",val:"1.35s", delta:"↓ 12%",up:true, data:perfData.avgLatency,color:C.blue},
                  {label:"Requests Per Min", val:"2,456", delta:"↑ 8%", up:false,data:perfData.reqPerMin, color:C.green},
                  {label:"Error Rate",        val:"0.24%",delta:"↓ 5%", up:true, data:perfData.errorRate, color:C.red},
                  {label:"Throughput",        val:"98.7 req/s",delta:"↑ 15%",up:false,data:perfData.throughput,color:C.purple},
                ].map(p=>(
                  <div key={p.label} style={{background:C.bg,borderRadius:C.rSm,padding:"10px 12px",border:`1px solid ${C.border}`}}>
                    <div style={{fontSize:10,color:C.textSub,marginBottom:4}}>{p.label}</div>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                      <span style={{fontSize:18,fontWeight:800,color:C.text,fontFamily:C.mono}}>{p.val}</span>
                      <span style={{fontSize:10,fontWeight:700,color:p.up?C.green:C.red}}>{p.delta}</span>
                    </div>
                    <Spark data={p.data} color={p.color} w={160} h={28}/>
                  </div>
                ))}
              </div>
            </div>

            {/* AWS Cost Summary */}
            <div style={{background:C.surface,borderRadius:C.r,padding:"18px 20px",boxShadow:C.shadow,border:`1px solid ${C.border}`}}>
              <SectionHeader title="AWS Cost Summary"/>
              <div style={{marginBottom:10}}>
                <div style={{fontSize:10,color:C.textSub}}>This Month</div>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <span style={{fontSize:26,fontWeight:800,color:C.text,fontFamily:C.mono}}>$12,340</span>
                  <span style={{fontSize:11,color:C.green,fontWeight:700}}>↓ 18%</span>
                </div>
              </div>
              <div style={{marginBottom:12}}>
                <Spark data={costLine} color={C.primary} w={280} h={44}/>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <Donut segments={costDonut} size={80} thickness={14} label="$12K" sublabel="Total"/>
                <div style={{flex:1}}>
                  {[{label:"EC2",val:"$4,500",pct:"36%",color:"#4f6ef7"},{label:"RDS",val:"$3,200",pct:"26%",color:"#a78bfa"},{label:"S3",val:"$1,800",pct:"15%",color:"#f59e0b"},{label:"Others",val:"$2,840",pct:"23%",color:"#22c55e"}].map(r=>(
                    <div key={r.label} style={{display:"flex",justifyContent:"space-between",padding:"2px 0",fontSize:11}}>
                      <div style={{display:"flex",alignItems:"center",gap:5}}><div style={{width:7,height:7,borderRadius:"50%",background:r.color}}/><span style={{color:C.textSub}}>{r.label}</span></div>
                      <div style={{display:"flex",gap:6}}><span style={{color:C.text,fontWeight:600,fontFamily:C.mono}}>{r.val}</span><span style={{color:C.textMute}}>{r.pct}</span></div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ── Row 5: Service Status + Quick Actions ── */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
            {/* Service Status — derived from real alarm namespaces */}
            <div style={{background:C.surface,borderRadius:C.r,padding:"18px 20px",boxShadow:C.shadow,border:`1px solid ${C.border}`}}>
              <SectionHeader title="Service Status (from CloudWatch)"/>
              {["AWS/RDS","AWS/EC2","AWS/Lambda","AWS/ApiGateway","AWS/ECS","AWS/CloudFront"].map(ns=>{
                const nsAlarms = alarms.filter(a=>a.namespace===ns);
                const hasAlarm = nsAlarms.some(a=>a.state==="ALARM");
                const status   = nsAlarms.length===0?"No Data":hasAlarm?"Degraded":"Operational";
                const color    = status==="Operational"?C.green:status==="Degraded"?C.red:C.amber;
                return (
                  <div key={ns} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:`1px solid ${C.borderSoft}`}}>
                    <div style={{display:"flex",alignItems:"center",gap:7}}>
                      <div style={{width:7,height:7,borderRadius:"50%",background:color,flexShrink:0,animation:status==="Degraded"?"pulse 1.5s ease-in-out infinite":"none"}}/>
                      <span style={{fontSize:11,color:C.text,fontWeight:500}}>{ns.replace("AWS/","")}</span>
                    </div>
                    <span style={{fontSize:11,color:color,fontWeight:700}}>{status}</span>
                  </div>
                );
              })}
            </div>

            {/* Quick Actions */}
            <div style={{background:C.surface,borderRadius:C.r,padding:"18px 20px",boxShadow:C.shadow,border:`1px solid ${C.border}`}}>
              <SectionHeader title="Quick Actions"/>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                {[
                  {icon:"⚠️",label:"Create Incident",  bg:"#fff5f5",  color:C.red},
                  {icon:"🐦",label:"Run Canary Test",  bg:C.blueBg,   color:C.blue},
                  {icon:"📋",label:"View Logs",         bg:C.purpleBg, color:C.purple},
                  {icon:"💰",label:"Cost Report",       bg:C.greenBg,  color:C.green},
                  {icon:"⚡",label:"AI Analysis",       bg:C.primaryLight,color:C.primary,fn:()=>{setAiTarget(null);setShowAI(true);}},
                  {icon:"🔄",label:"Refresh Alarms",   bg:C.bg,       color:C.textSub,
                    fn:()=>{ setLoading(true); fetchRealAlarms().then(d=>{setAlarms(d);setLoading(false);setLastRefresh(new Date());}); }},
                ].map(a=>(
                  <button key={a.label} onClick={a.fn||undefined}
                    style={{background:a.bg,border:`1px solid ${C.border}`,borderRadius:C.rSm,padding:"12px 8px",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:5,transition:"all 0.15s"}}
                    onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow=C.shadowMd;}}
                    onMouseLeave={e=>{e.currentTarget.style.transform="";e.currentTarget.style.boxShadow="";}}>
                    <span style={{fontSize:20}}>{a.icon}</span>
                    <span style={{fontSize:10,fontWeight:700,color:a.color,textAlign:"center",lineHeight:1.2}}>{a.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div style={{textAlign:"center",padding:"20px 0 0",fontSize:11,color:C.textMute}}>
            © 2024 eLit. All rights reserved. &nbsp;·&nbsp; Dashboard v3.0 &nbsp;·&nbsp; AWS CloudWatch Live
          </div>
        </div>
      </div>

      {/* ── Modals ── */}
      {selected && (
        <AlarmDetail alarm={selected} onClose={()=>setSelected(null)}
          onAnalyze={()=>{setAiTarget(selected);setSelected(null);setShowAI(true);}}/>
      )}
      {showAI && (
        <AIModal alarms={alarms} target={aiTarget} onClose={()=>{setShowAI(false);setAiTarget(null);}}/>
      )}
    </div>
  );
}
