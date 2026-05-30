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

/* ── Mock Data ───────────────────────────────────────────────────────────── */
const ALARMS = [
  { name:"RDS Deadlock High",        resource:"elit-prod-db-01",  type:"Database",    severity:"CRITICAL", time:"10:15 AM", namespace:"AWS/RDS",    metric:"DatabaseConnections", threshold:100, avg:134, max:178, breaches:14, state:"ALARM"  },
  { name:"API Response Time High",   resource:"elit-api-gateway", type:"Application", severity:"MAJOR",    time:"09:48 AM", namespace:"AWS/ApiGateway", metric:"Latency",         threshold:2000,avg:2340,max:3100,breaches:8,  state:"ALARM"  },
  { name:"High CPU Usage",           resource:"elit-web-02",      type:"EC2 Instance",severity:"WARNING",  time:"09:30 AM", namespace:"AWS/EC2",    metric:"CPUUtilization",      threshold:80,  avg:84,  max:91,  breaches:5,  state:"ALARM"  },
  { name:"Canary Test Failed",       resource:"elit-login-canary",type:"Canary",      severity:"WARNING",  time:"09:10 AM", namespace:"CloudWatchSynthetics", metric:"SuccessPercent", threshold:95, avg:92, max:100, breaches:3, state:"ALARM" },
  { name:"Lambda Timeout",           resource:"fn-order-processor",type:"Lambda",     severity:"MAJOR",    time:"08:55 AM", namespace:"AWS/Lambda", metric:"Duration",            threshold:3000,avg:2100,max:2980,breaches:2,  state:"OK"     },
  { name:"SQS Queue Depth",          resource:"prod-order-queue", type:"SQS",         severity:"INFO",     time:"08:30 AM", namespace:"AWS/SQS",    metric:"ApproximateNumberOfMessages", threshold:1000,avg:340,max:890,breaches:0, state:"OK" },
  { name:"ECS Memory High",          resource:"prod-cluster",     type:"ECS",         severity:"WARNING",  time:"08:10 AM", namespace:"AWS/ECS",    metric:"MemoryUtilization",   threshold:85,  avg:72,  max:83,  breaches:0,  state:"OK"     },
  { name:"CloudFront Error Rate",    resource:"E1ABCD1234XYZ",    type:"CloudFront",  severity:"INFO",     time:"07:45 AM", namespace:"AWS/CloudFront", metric:"5xxErrorRate",    threshold:5,   avg:1.2, max:2.8, breaches:0,  state:"OK"     },
];

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
  const sevColor={CRITICAL:C.red,MAJOR:C.orange,WARNING:C.amber,INFO:C.blue}[alarm.severity]||C.blue;
  const spark24=genSparkline(48, alarm.avg, alarm.avg*0.3, alarm.state==="ALARM");
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
            {[["Metric",alarm.metric,false],["Threshold",`${alarm.threshold}`,false],["24h Avg",`${alarm.avg}`,alarm.avg>alarm.threshold],["24h Max",`${alarm.max}`,alarm.max>alarm.threshold]].map(([l,v,hi])=>(
              <div key={l} style={{background:hi?C.redBg:C.bg,border:`1px solid ${hi?C.redBdr:C.border}`,borderRadius:C.rSm,padding:"10px 12px"}}>
                <div style={{fontSize:9,color:C.textMute,fontFamily:C.mono,marginBottom:3,textTransform:"uppercase",letterSpacing:"0.07em"}}>{l}</div>
                <div style={{fontSize:14,fontWeight:700,color:hi?C.red:C.text,fontFamily:C.mono}}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{background:C.bg,borderRadius:C.rSm,padding:14,border:`1px solid ${C.border}`,marginBottom:14}}>
            <div style={{fontSize:10,color:C.textMute,fontFamily:C.mono,marginBottom:10,textTransform:"uppercase",letterSpacing:"0.07em"}}>48-Hour Trend</div>
            <Spark data={spark24} color={alarm.state==="ALARM"?C.red:C.green} w={560} h={64}/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            {[["Metric",alarm.metric],["Namespace",alarm.namespace],["Resource",alarm.resource],["Type",alarm.type],["Severity",alarm.severity],["Breach Count (3d)",alarm.breaches]].map(([k,v])=>(
              <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:`1px solid ${C.borderSoft}`}}>
                <span style={{fontSize:12,color:C.textSub}}>{k}</span>
                <span style={{fontSize:12,color:C.text,fontFamily:C.mono,fontWeight:500}}>{v}</span>
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
  const [activeNav, setActiveNav]   = useState("overview");
  const [selected,  setSelected]    = useState(null);
  const [showAI,    setShowAI]      = useState(false);
  const [aiTarget,  setAiTarget]    = useState(null);

  const alarmCount  = ALARMS.filter(a=>a.state==="ALARM").length;
  const critCount   = ALARMS.filter(a=>a.severity==="CRITICAL").length;
  const warnCount   = ALARMS.filter(a=>a.severity==="WARNING").length;
  const majorCount  = ALARMS.filter(a=>a.severity==="MAJOR").length;

  const sysDonut = [
    {label:"Applications", value:23, color:"#4f6ef7"},
    {label:"Databases",    value:12, color:"#22c55e"},
    {label:"Infrastructure",value:198,color:"#a78bfa"},
    {label:"Integrations", value:3,  color:"#f59e0b"},
    {label:"Ext. Services", value:2, color:"#ef4444"},
  ];
  const sevDonut = [
    {label:"Critical", value:critCount||4, color:"#ef4444"},
    {label:"Major",    value:majorCount||3,color:"#f97316"},
    {label:"Warning",  value:warnCount||5, color:"#f59e0b"},
    {label:"Info",     value:0,            color:"#3b82f6"},
  ];
  const costDonut = [
    {label:"EC2",    value:36, color:"#4f6ef7"},
    {label:"RDS",    value:26, color:"#a78bfa"},
    {label:"S3",     value:15, color:"#f59e0b"},
    {label:"Others", value:23, color:"#22c55e"},
  ];

  const perfData = {
    avgLatency:   genSparkline(20,1.35,0.4),
    reqPerMin:    genSparkline(20,2456,400),
    errorRate:    genSparkline(20,0.24,0.08),
    throughput:   genSparkline(20,98,12),
  };
  const canaryLine = genSparkline(30,99.2,1.5);
  const costLine   = genSparkline(20,12340,2000);

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
        {/* Logo */}
        <div style={{padding:"20px 18px 16px",borderBottom:`1px solid ${C.border}`}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{width:32,height:32,background:"linear-gradient(135deg,#4f6ef7,#7c3aed)",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:15,fontWeight:800}}>☁</div>
            <span style={{fontSize:18,fontWeight:800,color:C.primary,letterSpacing:"-0.03em"}}>eLit</span>
          </div>
        </div>
        {/* Nav */}
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
        {/* AI Assistant */}
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
            <div style={{fontSize:11,color:C.textMute}}>Real-time overview of systems, performance and operations</div>
          </div>
          <div style={{flex:1}}/>
          {/* Search */}
          <div style={{position:"relative"}}>
            <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:C.textMute,fontSize:13}}>🔍</span>
            <input placeholder="Search anything…" style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:C.rSm,padding:"7px 12px 7px 32px",fontSize:12,color:C.text,width:200,fontFamily:C.font}}/>
          </div>
          {/* Date */}
          <div style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:C.rSm,padding:"7px 12px",fontSize:12,color:C.textSub,display:"flex",alignItems:"center",gap:6}}>
            📅 {new Date().toLocaleDateString("en-SG",{month:"short",day:"numeric",year:"numeric"})}
          </div>
          {/* Refresh */}
          <button style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:C.rSm,padding:"7px 10px",cursor:"pointer",fontSize:14,color:C.textSub}}>↻</button>
          {/* Bell */}
          <div style={{position:"relative"}}>
            <button style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:C.rSm,padding:"7px 10px",cursor:"pointer",fontSize:14,color:C.textSub}}>🔔</button>
            <span style={{position:"absolute",top:-4,right:-4,background:C.red,color:"#fff",borderRadius:10,padding:"1px 5px",fontSize:9,fontWeight:700}}>12</span>
          </div>
          {/* User */}
          <div style={{display:"flex",alignItems:"center",gap:8,padding:"4px 10px 4px 4px",background:C.bg,border:`1px solid ${C.border}`,borderRadius:30}}>
            <div style={{width:30,height:30,borderRadius:"50%",background:"linear-gradient(135deg,#4f6ef7,#7c3aed)",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:12,fontWeight:700}}>JD</div>
            <div>
              <div style={{fontSize:11,fontWeight:700,color:C.text,lineHeight:1}}>John Dela Cruz</div>
              <div style={{fontSize:9,color:C.textMute}}>IT Operations Manager</div>
            </div>
          </div>
        </div>

        {/* ── Dashboard Content ── */}
        <div style={{padding:"22px 24px",flex:1}}>

          {/* ── Row 1: KPI Cards ── */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:22}}>
            {/* System Health */}
            <div style={{background:C.surface,borderRadius:C.r,padding:"18px 20px",boxShadow:C.shadow,border:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:14}}>
              <div style={{width:44,height:44,borderRadius:10,background:C.greenBg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>💚</div>
              <div style={{flex:1}}>
                <div style={{fontSize:11,color:C.green,fontWeight:700,marginBottom:2}}>System Health</div>
                <div style={{fontSize:22,fontWeight:800,color:C.green}}>Healthy</div>
                <div style={{fontSize:11,color:C.textMute}}>All systems operational</div>
              </div>
            </div>
            {/* Active Alarms */}
            <div style={{background:C.surface,borderRadius:C.r,padding:"18px 20px",boxShadow:C.shadow,border:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:14}}>
              <div style={{width:44,height:44,borderRadius:10,background:"#fff8e7",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>🔔</div>
              <div style={{flex:1}}>
                <div style={{fontSize:11,color:C.textSub,fontWeight:600,marginBottom:2}}>Active Alarms</div>
                <div style={{fontSize:28,fontWeight:800,color:C.text,fontFamily:C.mono}}>{alarmCount+4}</div>
                <div style={{fontSize:11,marginTop:2}}><span style={{color:C.red,fontWeight:700}}>{critCount} Critical</span><span style={{color:C.textMute}}> • </span><span style={{color:C.amber,fontWeight:700}}>{warnCount} Warning</span></div>
              </div>
            </div>
            {/* Open Incidents */}
            <div style={{background:C.surface,borderRadius:C.r,padding:"18px 20px",boxShadow:C.shadow,border:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:14}}>
              <div style={{width:44,height:44,borderRadius:10,background:C.redBg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>⚠️</div>
              <div style={{flex:1}}>
                <div style={{fontSize:11,color:C.textSub,fontWeight:600,marginBottom:2}}>Open Incidents</div>
                <div style={{fontSize:28,fontWeight:800,color:C.text,fontFamily:C.mono}}>4</div>
                <div style={{fontSize:11,marginTop:2}}><span style={{color:C.red,fontWeight:700}}>2 Critical</span><span style={{color:C.textMute}}> • </span><span style={{color:C.orange,fontWeight:700}}>2 Major</span></div>
              </div>
            </div>
            {/* Services Online */}
            <div style={{background:C.surface,borderRadius:C.r,padding:"18px 20px",boxShadow:C.shadow,border:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:14}}>
              <div style={{width:44,height:44,borderRadius:10,background:C.blueBg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>🖥</div>
              <div style={{flex:1}}>
                <div style={{fontSize:11,color:C.green,fontWeight:700,marginBottom:2}}>Services Online</div>
                <div style={{fontSize:28,fontWeight:800,color:C.text,fontFamily:C.mono}}>98.6%</div>
                <div style={{fontSize:11,color:C.textMute,marginTop:2}}>236 / 239 Services</div>
              </div>
            </div>
          </div>

          {/* ── Row 2: System Overview + Alarms by Severity + Top Incidents ── */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1.4fr",gap:14,marginBottom:22}}>

            {/* System Overview */}
            <div style={{background:C.surface,borderRadius:C.r,padding:"18px 20px",boxShadow:C.shadow,border:`1px solid ${C.border}`}}>
              <SectionHeader title="System Overview"/>
              <div style={{display:"flex",alignItems:"center",gap:20}}>
                <Donut segments={sysDonut} size={130} thickness={20} label="98.6%" sublabel="Overall Uptime"/>
                <div style={{flex:1}}>
                  {[{label:"Applications",val:"23 / 24",color:"#4f6ef7"},{label:"Databases",val:"12 / 12",color:"#22c55e"},{label:"Infrastructure",val:"198 / 202",color:"#a78bfa"},{label:"Integrations",val:"3 / 3",color:"#f59e0b"},{label:"Ext. Services",val:"2 / 3",color:"#ef4444"}].map(r=>(
                    <div key={r.label} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"3px 0"}}>
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <div style={{width:8,height:8,borderRadius:"50%",background:r.color,flexShrink:0}}/>
                        <span style={{fontSize:11,color:C.textSub}}>{r.label}</span>
                      </div>
                      <span style={{fontSize:11,fontWeight:600,color:C.text,fontFamily:C.mono}}>{r.val}</span>
                    </div>
                  ))}
                  <div style={{marginTop:8,fontSize:10,color:C.textMute,display:"flex",alignItems:"center",gap:4}}>📅 Last 24 Hours</div>
                </div>
              </div>
            </div>

            {/* Alarms by Severity */}
            <div style={{background:C.surface,borderRadius:C.r,padding:"18px 20px",boxShadow:C.shadow,border:`1px solid ${C.border}`}}>
              <SectionHeader title="Alarms by Severity" action={{label:"View All Alarms",fn:()=>{}}}/>
              <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:24}}>
                <Donut segments={sevDonut} size={130} thickness={20} label="12" sublabel="Total"/>
                <div>
                  {[{label:"Critical",value:critCount||4,color:C.red},{label:"Major",value:majorCount||3,color:C.orange},{label:"Warning",value:warnCount||5,color:C.amber},{label:"Info",value:0,color:C.blue}].map(s=>(
                    <div key={s.label} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 0",borderBottom:`1px solid ${C.borderSoft}`}}>
                      <div style={{width:10,height:10,borderRadius:"50%",background:s.color,flexShrink:0}}/>
                      <span style={{fontSize:12,color:C.textSub,flex:1}}>{s.label}</span>
                      <span style={{fontSize:14,fontWeight:700,color:C.text,fontFamily:C.mono}}>{s.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Top Active Incidents */}
            <div style={{background:C.surface,borderRadius:C.r,padding:"18px 20px",boxShadow:C.shadow,border:`1px solid ${C.border}`}}>
              <SectionHeader title="Top Active Incidents" action={{label:"View All",fn:()=>{}}}/>
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {ALARMS.filter(a=>a.state==="ALARM").slice(0,4).map(a=>(
                  <div key={a.name} onClick={()=>setSelected(a)} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",borderRadius:C.rSm,background:C.bg,cursor:"pointer",border:`1px solid ${C.border}`,transition:"all 0.15s"}}
                    onMouseEnter={e=>e.currentTarget.style.background=C.primaryLight}
                    onMouseLeave={e=>e.currentTarget.style.background=C.bg}>
                    <SevBadge sev={a.severity}/>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:12,fontWeight:700,color:C.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{a.name}</div>
                      <div style={{fontSize:10,color:C.textMute,fontFamily:C.mono}}>{a.resource} · {a.type}</div>
                    </div>
                    <div style={{textAlign:"right",flexShrink:0}}>
                      <div style={{fontSize:10,color:C.textMute,marginBottom:3}}>{a.time}</div>
                      <Spark data={genSparkline(12,a.avg,a.avg*0.3,true)} color={a.severity==="CRITICAL"?C.red:a.severity==="MAJOR"?C.orange:C.amber} w={56} h={18}/>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Row 3: Canary + Performance + Cost ── */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1.4fr 1.2fr",gap:14,marginBottom:22}}>

            {/* Canary Monitoring */}
            <div style={{background:C.surface,borderRadius:C.r,padding:"18px 20px",boxShadow:C.shadow,border:`1px solid ${C.border}`}}>
              <SectionHeader title="Canary Monitoring" action={{label:"View All",fn:()=>{}}}/>
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
                <div style={{display:"flex",justifyContent:"space-between",marginTop:4}}>
                  {["00:00","06:00","12:00","18:00","24:00"].map(t=><span key={t} style={{fontSize:8,color:C.textMute,fontFamily:C.mono}}>{t}</span>)}
                </div>
              </div>
            </div>

            {/* Performance Overview */}
            <div style={{background:C.surface,borderRadius:C.r,padding:"18px 20px",boxShadow:C.shadow,border:`1px solid ${C.border}`}}>
              <SectionHeader title="Performance Overview (Last 24 Hours)"/>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                {[
                  {label:"Avg Response Time", val:"1.35s", delta:"↓ 12%", up:true, data:perfData.avgLatency, color:C.blue},
                  {label:"Requests Per Min",  val:"2,456", delta:"↑ 8%",  up:false,data:perfData.reqPerMin,  color:C.green},
                  {label:"Error Rate",         val:"0.24%",delta:"↓ 5%",  up:true, data:perfData.errorRate,  color:C.red},
                  {label:"Throughput",         val:"98.7 req/s",delta:"↑ 15%",up:false,data:perfData.throughput,color:C.purple},
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
              <SectionHeader title="AWS Cost Summary" action={{label:"View Details",fn:()=>{}}}/>
              <div style={{marginBottom:10}}>
                <div style={{fontSize:10,color:C.textSub}}>This Month</div>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <span style={{fontSize:26,fontWeight:800,color:C.text,fontFamily:C.mono}}>$12,340</span>
                  <span style={{fontSize:11,color:C.green,fontWeight:700}}>↓ 18% vs last month</span>
                </div>
              </div>
              <div style={{marginBottom:12}}>
                <Spark data={costLine} color={C.primary} w={280} h={44}/>
                <div style={{display:"flex",justifyContent:"space-between",marginTop:3}}>
                  {["May 1","May 8","May 15","May 22","May 29"].map(t=><span key={t} style={{fontSize:8,color:C.textMute,fontFamily:C.mono}}>{t}</span>)}
                </div>
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

          {/* ── Row 4: Deployments + Security + Service Status + Quick Actions ── */}
          <div style={{display:"grid",gridTemplateColumns:"1.2fr 1fr 1fr 1fr",gap:14}}>

            {/* Recent Deployments */}
            <div style={{background:C.surface,borderRadius:C.r,padding:"18px 20px",boxShadow:C.shadow,border:`1px solid ${C.border}`}}>
              <SectionHeader title="Recent Deployments" action={{label:"View All",fn:()=>{}}}/>
              {[
                {name:"eLit Web Application v2.4.1",env:"Production",ver:"v2.4.1",by:"jsmith",time:"10:20 AM",date:"Today",status:"SUCCESS"},
                {name:"API Gateway Config Update",env:"Staging",ver:"v1.9.0",by:"alee",time:"09:05 AM",date:"Today",status:"SUCCESS"},
                {name:"Lambda Function Deploy",env:"Production",ver:"v3.1.2",by:"mchen",time:"08:30 AM",date:"Today",status:"FAILED"},
              ].map(d=>(
                <div key={d.name} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"8px 0",borderBottom:`1px solid ${C.borderSoft}`}}>
                  <div style={{width:28,height:28,borderRadius:"50%",background:d.status==="SUCCESS"?C.greenBg:C.redBg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,flexShrink:0}}>{d.status==="SUCCESS"?"✓":"✕"}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:12,fontWeight:700,color:C.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{d.name}</div>
                    <div style={{fontSize:10,color:C.textMute,fontFamily:C.mono}}>{d.env} · {d.ver} · by {d.by}</div>
                  </div>
                  <div style={{textAlign:"right",flexShrink:0}}>
                    <span style={{background:d.status==="SUCCESS"?C.greenBg:C.redBg,color:d.status==="SUCCESS"?C.green:C.red,border:`1px solid ${d.status==="SUCCESS"?C.greenBdr:C.redBdr}`,borderRadius:4,padding:"2px 7px",fontSize:9,fontWeight:700,fontFamily:C.mono}}>{d.status}</span>
                    <div style={{fontSize:9,color:C.textMute,marginTop:2,fontFamily:C.mono}}>{d.time}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Security Summary */}
            <div style={{background:C.surface,borderRadius:C.r,padding:"18px 20px",boxShadow:C.shadow,border:`1px solid ${C.border}`}}>
              <SectionHeader title="Security Summary" action={{label:"View All",fn:()=>{}}}/>
              {[
                {icon:"🟡",label:"Open Security Groups",count:2,color:C.amber},
                {icon:"🔴",label:"Critical Vulnerabilities",count:1,color:C.red},
                {icon:"🟠",label:"Patches Pending",count:5,color:C.orange},
                {icon:"🔵",label:"IAM Policy Issues",count:3,color:C.blue},
                {icon:"🟢",label:"Compliant Resources",count:187,color:C.green},
              ].map(s=>(
                <div key={s.label} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:`1px solid ${C.borderSoft}`}}>
                  <div style={{display:"flex",alignItems:"center",gap:7}}>
                    <span style={{fontSize:13}}>{s.icon}</span>
                    <span style={{fontSize:11,color:C.textSub}}>{s.label}</span>
                  </div>
                  <span style={{fontSize:14,fontWeight:800,color:s.color,fontFamily:C.mono}}>{s.count}</span>
                </div>
              ))}
            </div>

            {/* Service Status */}
            <div style={{background:C.surface,borderRadius:C.r,padding:"18px 20px",boxShadow:C.shadow,border:`1px solid ${C.border}`}}>
              <SectionHeader title="Service Status" action={{label:"View All",fn:()=>{}}}/>
              {[
                {name:"RDS Database",  status:"Operational"},
                {name:"EKS Cluster",   status:"Operational"},
                {name:"ElastiCache",   status:"Operational"},
                {name:"API Gateway",   status:"Degraded"},
                {name:"Lambda",        status:"Operational"},
                {name:"CloudFront",    status:"Operational"},
              ].map(s=>{
                const op=s.status==="Operational";
                return (
                  <div key={s.name} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:`1px solid ${C.borderSoft}`}}>
                    <div style={{display:"flex",alignItems:"center",gap:7}}>
                      <div style={{width:7,height:7,borderRadius:"50%",background:op?C.green:C.amber,flexShrink:0,animation:!op?"pulse 1.5s ease-in-out infinite":"none"}}/>
                      <span style={{fontSize:11,color:C.text,fontWeight:500}}>{s.name}</span>
                    </div>
                    <span style={{fontSize:11,color:op?C.green:C.amber,fontWeight:700}}>{s.status}</span>
                  </div>
                );
              })}
            </div>

            {/* Quick Actions */}
            <div style={{background:C.surface,borderRadius:C.r,padding:"18px 20px",boxShadow:C.shadow,border:`1px solid ${C.border}`}}>
              <SectionHeader title="Quick Actions"/>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                {[
                  {icon:"⚠️",label:"Create Incident",bg:"#fff5f5",color:C.red},
                  {icon:"🐦",label:"Run Canary Test",bg:C.blueBg,color:C.blue},
                  {icon:"📋",label:"View Logs",bg:C.purpleBg,color:C.purple},
                  {icon:"💰",label:"Cost Report",bg:C.greenBg,color:C.green},
                  {icon:"⚡",label:"AI Analysis",bg:C.primaryLight,color:C.primary,fn:()=>{setAiTarget(null);setShowAI(true);}},
                  {icon:"🔄",label:"Refresh All",bg:C.bg,color:C.textSub},
                ].map(a=>(
                  <button key={a.label} onClick={a.fn||undefined} style={{background:a.bg,border:`1px solid ${C.border}`,borderRadius:C.rSm,padding:"12px 8px",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:5,transition:"all 0.15s"}}
                    onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow=C.shadowMd;}}
                    onMouseLeave={e=>{e.currentTarget.style.transform="";e.currentTarget.style.boxShadow="";}}>
                    <span style={{fontSize:20}}>{a.icon}</span>
                    <span style={{fontSize:10,fontWeight:700,color:a.color,textAlign:"center",lineHeight:1.2}}>{a.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div style={{textAlign:"center",padding:"20px 0 0",fontSize:11,color:C.textMute}}>
            © 2024 eLit. All rights reserved. &nbsp;·&nbsp; Dashboard v3.0
          </div>
        </div>
      </div>

      {/* ── Modals ── */}
      {selected && (
        <AlarmDetail alarm={selected} onClose={()=>setSelected(null)}
          onAnalyze={()=>{setAiTarget(selected);setSelected(null);setShowAI(true);}}/>
      )}
      {showAI && (
        <AIModal alarms={ALARMS} target={aiTarget} onClose={()=>{setShowAI(false);setAiTarget(null);}}/>
      )}
    </div>
  );
}
