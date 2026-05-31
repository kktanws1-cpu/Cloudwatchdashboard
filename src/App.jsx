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

/* ── API Helpers ─────────────────────────────────────────────────────────── */
async function fetchRealAlarms() {
  try {
    const res  = await fetch("https://54.255.177.224.nip.io/alarms");
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}

async function fetchPerformance() {
  try {
    const res  = await fetch("https://54.255.177.224.nip.io/performance");
    const data = await res.json();
    return data;
  } catch { return null; }
}

async function fetchCost() {
  try {
    const res  = await fetch("https://54.255.177.224.nip.io/cost");
    const data = await res.json();
    return data;
  } catch { return null; }
}

async function fetchCanary() {
  try {
    const res  = await fetch("https://54.255.177.224.nip.io/canary");
    const data = await res.json();
    return data;
  } catch { return null; }
}

async function fetchServices() {
  try {
    const res  = await fetch("https://54.255.177.224.nip.io/services");
    const data = await res.json();
    return data;
  } catch { return null; }
}

async function fetchRdsPerf() {
  try {
    const res  = await fetch("https://54.255.177.224.nip.io/rds-performance");
    const data = await res.json();
    return data;
  } catch { return null; }
}

/* ── Nav ─────────────────────────────────────────────────────────────────── */
const NAV = [
  { id:"overview",    icon:"⊞",  label:"Overview"          },
  { id:"alarms",      icon:"🔔", label:"Alarms & Alerts",   badge:12, badgeColor:C.red     },
  { id:"incidents",   icon:"⚠",  label:"Incidents",         badge:4,  badgeColor:C.orange  },
  { id:"services",    icon:"⊡",  label:"Services"           },
  { id:"performance", icon:"📈", label:"Performance"        },
  { id:"canary",      icon:"🐦", label:"Canary Monitoring"  },
  { id:"infra",       icon:"☁",  label:"Infrastructure"     },
  { id:"security",    icon:"🛡", label:"Security"           },
  { id:"cost",        icon:"💰", label:"Cost Management"    },
  { id:"settings",    icon:"⚙",  label:"Settings"           },
];

function genSparkline(n=20, base=50, variance=20) {
  return Array.from({length:n}, () =>
    Math.max(0, base + (Math.random()-0.5)*variance));
}

/* ── Sparkline SVG ───────────────────────────────────────────────────────── */
function Spark({ data, color="#4f6ef7", w=80, h=28 }) {
  if (!data || data.length < 2) return <svg width={w} height={h}/>;
  const min=Math.min(...data), max=Math.max(...data, min+0.01);
  const sy = v => h - ((v-min)/(max-min))*h;
  const pts = data.map((v,i)=>`${(i/(data.length-1))*w},${sy(v)}`).join(" ");
  const id  = `sg${color.replace(/[^a-zA-Z0-9]/g,"")}${w}`;
  return (
    <svg width={w} height={h} style={{display:"block",overflow:"visible"}}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.18}/>
          <stop offset="100%" stopColor={color} stopOpacity={0}/>
        </linearGradient>
      </defs>
      <polygon points={`0,${h} ${pts} ${w},${h}`} fill={`url(#${id})`}/>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round"/>
    </svg>
  );
}

/* ── Donut ───────────────────────────────────────────────────────────────── */
function Donut({ segments, size=120, thickness=18, label, sublabel }) {
  const r=size/2-thickness/2, cx=size/2, cy=size/2, circ=2*Math.PI*r;
  const total=segments.reduce((s,x)=>s+x.value,0)||1;
  let offset=0;
  return (
    <svg width={size} height={size}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={C.border} strokeWidth={thickness}/>
      {segments.map((seg,i)=>{
        const dash=(seg.value/total)*circ, gap=circ-dash;
        const el=<circle key={i} cx={cx} cy={cy} r={r} fill="none"
          stroke={seg.color} strokeWidth={thickness}
          strokeDasharray={`${dash} ${gap}`} strokeDashoffset={-offset}
          style={{transform:`rotate(-90deg)`,transformOrigin:`${cx}px ${cy}px`}}/>;
        offset+=dash; return el;
      })}
      {label&&<>
        <text x={cx} y={cy-2} textAnchor="middle" fontSize={size>100?16:12} fontWeight="800" fill={C.text} fontFamily={C.font}>{label}</text>
        {sublabel&&<text x={cx} y={cy+14} textAnchor="middle" fontSize={9} fill={C.textMute} fontFamily={C.font}>{sublabel}</text>}
      </>}
    </svg>
  );
}

/* ── Badges ──────────────────────────────────────────────────────────────── */
function SevBadge({sev}) {
  const map={CRITICAL:{bg:"#fef2f2",color:"#dc2626",bdr:"#fecaca"},MAJOR:{bg:"#fff7ed",color:"#ea580c",bdr:"#fed7aa"},WARNING:{bg:"#fffbeb",color:"#d97706",bdr:"#fde68a"},INFO:{bg:"#eff6ff",color:"#2563eb",bdr:"#bfdbfe"}};
  const s=map[sev]||map.INFO;
  return <span style={{background:s.bg,color:s.color,border:`1px solid ${s.bdr}`,borderRadius:4,padding:"2px 8px",fontSize:10,fontWeight:700,fontFamily:C.mono,letterSpacing:"0.04em"}}>{sev}</span>;
}
function StateDot({state}) {
  const c=state==="ALARM"?C.red:state==="OK"?C.green:C.amber;
  return <span style={{width:8,height:8,borderRadius:"50%",background:c,display:"inline-block",boxShadow:state==="ALARM"?`0 0 0 3px ${c}28`:"none"}}/>;
}

/* ── Section Header ──────────────────────────────────────────────────────── */
function SectionHeader({title,action,badge}) {
  return (
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <span style={{fontSize:14,fontWeight:700,color:C.text}}>{title}</span>
        {badge && <span style={{background:C.primaryLight,color:C.primary,border:`1px solid ${C.blueBdr}`,borderRadius:10,padding:"1px 8px",fontSize:10,fontWeight:700,fontFamily:C.mono}}>{badge}</span>}
      </div>
      {action&&<button onClick={action.fn} style={{background:"none",border:"none",color:C.primary,fontSize:12,cursor:"pointer",fontWeight:600,fontFamily:C.font}}>{action.label} →</button>}
    </div>
  );
}

/* ── Rule-Based Analysis Engine ─────────────────────────────────────────── */
function analyseEC2(perf) {
  const s = perf.summary; const instances = perf.instances || [];
  const findings = []; const actions = []; let health = "GOOD";

  // CPU
  if (s.avgCpu > 90)  { health="CRITICAL"; findings.push({sev:"CRITICAL", metric:"CPU Utilization", val:`${s.avgCpu}%`, msg:"CPU is critically high (>90%). Instances are overloaded and may become unresponsive."}); actions.push("🔴 Immediately scale up instance type (e.g. t3.micro → t3.medium) or add instances behind a load balancer.","🔴 Identify the runaway process: SSH in and run `top` or `htop` to find CPU-heavy processes.","🔴 Enable EC2 Auto Scaling with a CPU threshold of 70% to automatically add capacity."); }
  else if (s.avgCpu > 80) { health="WARNING"; findings.push({sev:"WARNING", metric:"CPU Utilization", val:`${s.avgCpu}%`, msg:"CPU is high (>80%). Performance degradation is likely under load."}); actions.push("🟠 Consider upgrading instance type or enabling Auto Scaling.","🟠 Review application for inefficient loops or blocking operations."); }
  else if (s.avgCpu < 5)  { findings.push({sev:"INFO", metric:"CPU Utilization", val:`${s.avgCpu}%`, msg:"CPU is very low (<5%). Instance may be over-provisioned."}); actions.push("🔵 Consider downsizing to a smaller instance type to reduce cost (e.g. use AWS Compute Optimizer)."); }
  else { findings.push({sev:"OK", metric:"CPU Utilization", val:`${s.avgCpu}%`, msg:"CPU is within normal range."}); }

  // Network
  if (s.avgNetworkIn > 500)  { findings.push({sev:"WARNING", metric:"Network In", val:`${s.avgNetworkIn} MB/hr`, msg:"High inbound network traffic. Check for unexpected data ingestion or DDoS activity."}); actions.push("🟠 Review VPC Flow Logs for unexpected traffic sources.","🟠 Consider enabling AWS Shield or WAF if traffic is external."); }
  if (s.avgNetworkOut > 500) { findings.push({sev:"WARNING", metric:"Network Out", val:`${s.avgNetworkOut} MB/hr`, msg:"High outbound network traffic. May incur significant data transfer costs."}); actions.push("🟠 Use CloudFront CDN to reduce origin data transfer costs.","🟠 Review application for unnecessary large payload responses."); }
  if (s.avgNetworkIn <= 500 && s.avgNetworkOut <= 500) { findings.push({sev:"OK", metric:"Network", val:`In: ${s.avgNetworkIn}MB / Out: ${s.avgNetworkOut}MB/hr`, msg:"Network traffic is within normal range."}); }

  // Disk
  if (s.avgDiskRead > 100 || s.avgDiskWrite > 100) { findings.push({sev:"WARNING", metric:"Disk I/O", val:`Read: ${s.avgDiskRead}MB / Write: ${s.avgDiskWrite}MB/hr`, msg:"Disk I/O is elevated. May indicate disk-intensive workloads or insufficient IOPS provisioning."}); actions.push("🟠 Consider upgrading from gp2 to gp3 EBS volumes for better IOPS performance.","🟠 Use EC2 Instance Store for temporary data if latency is critical."); }
  else { findings.push({sev:"OK", metric:"Disk I/O", val:`Read: ${s.avgDiskRead}MB / Write: ${s.avgDiskWrite}MB/hr`, msg:"Disk I/O is normal."}); }

  // Per-instance anomalies
  const hotInstances = instances.filter(i => i.cpu.avg > 80);
  if (hotInstances.length) { findings.push({sev:"WARNING", metric:"Hot Instances", val:hotInstances.map(i=>`${i.instanceId} (${i.cpu.avg}%)`).join(", "), msg:`${hotInstances.length} instance(s) have CPU > 80%. Uneven load distribution detected.`}); actions.push("🟠 Review load balancer configuration to ensure even traffic distribution across instances."); }

  if (!actions.length) actions.push("✅ No immediate actions required. Continue monitoring.");
  return { health, findings, actions, type: "ec2" };
}

function analyseRDS(rdsPerf) {
  const clusters = rdsPerf.clusters || [];
  const allFindings = []; const allActions = []; let health = "GOOD";

  clusters.forEach(c => {
    const m = c.metrics; const label = `[${c.clusterId}]`;

    // CPU
    if (m.cpu.avg > 90)      { health="CRITICAL"; allFindings.push({sev:"CRITICAL", metric:`${label} CPU`, val:`${m.cpu.avg}%`, msg:"Database CPU critically high. Queries may timeout."}); allActions.push(`🔴 ${label} Immediately upgrade instance class (e.g. db.t3.micro → db.t3.medium).`,`🔴 ${label} Run slow query log analysis: enable \`log_min_duration_statement\` in Parameter Group.`); }
    else if (m.cpu.avg > 70) { health="WARNING";  allFindings.push({sev:"WARNING",  metric:`${label} CPU`, val:`${m.cpu.avg}%`, msg:"Database CPU is high. Risk of query slowdowns under load."}); allActions.push(`🟠 ${label} Review and optimise slow queries using Performance Insights.`,`🟠 ${label} Add missing indexes on frequently queried columns.`); }
    else { allFindings.push({sev:"OK", metric:`${label} CPU`, val:`${m.cpu.avg}%`, msg:"CPU is normal."}); }

    // Free Storage
    if (m.freeStorage.avg < 2)       { health="CRITICAL"; allFindings.push({sev:"CRITICAL", metric:`${label} Free Storage`, val:`${m.freeStorage.avg} GB`, msg:"Critically low storage. Database may stop accepting writes soon."}); allActions.push(`🔴 ${label} Immediately increase allocated storage in RDS console (storage auto-scaling recommended).`); }
    else if (m.freeStorage.avg < 10) { health=health==="CRITICAL"?health:"WARNING"; allFindings.push({sev:"WARNING", metric:`${label} Free Storage`, val:`${m.freeStorage.avg} GB`, msg:"Storage is running low (<10GB)."}); allActions.push(`🟠 ${label} Enable RDS Storage Auto Scaling with a maximum threshold.`,`🟠 ${label} Purge old data or archive to S3 using AWS DMS.`); }
    else { allFindings.push({sev:"OK", metric:`${label} Free Storage`, val:`${m.freeStorage.avg} GB`, msg:"Storage is adequate."}); }

    // IOPS
    const totalIOPS = m.readIOPS.avg + m.writeIOPS.avg;
    if (totalIOPS > 1000)      { health=health==="CRITICAL"?health:"WARNING"; allFindings.push({sev:"WARNING", metric:`${label} IOPS`, val:`Read: ${m.readIOPS.avg}/s  Write: ${m.writeIOPS.avg}/s`, msg:`Total IOPS is high (${totalIOPS.toFixed(0)}/s). Risk of I/O bottleneck.`}); allActions.push(`🟠 ${label} Add indexes to reduce full table scans (check via slow query log).`,`🟠 ${label} Enable ElastiCache (Redis) to cache frequent read queries and reduce DB load.`,`🟠 ${label} Consider Read Replicas to offload read traffic.`,`🟠 ${label} Upgrade to gp3 storage with provisioned IOPS if on gp2.`); }
    else if (totalIOPS > 500)  { allFindings.push({sev:"INFO", metric:`${label} IOPS`, val:`Read: ${m.readIOPS.avg}/s  Write: ${m.writeIOPS.avg}/s`, msg:"IOPS is moderately elevated. Monitor for increases."}); allActions.push(`🔵 ${label} Review query execution plans with EXPLAIN ANALYZE.`); }
    else { allFindings.push({sev:"OK", metric:`${label} IOPS`, val:`Read: ${m.readIOPS.avg}/s  Write: ${m.writeIOPS.avg}/s`, msg:"IOPS is within normal range."}); }

    // Latency
    if (m.readLatency.avg > 20 || m.writeLatency.avg > 20) { health=health==="CRITICAL"?health:"WARNING"; allFindings.push({sev:"WARNING", metric:`${label} Latency`, val:`Read: ${m.readLatency.avg}ms  Write: ${m.writeLatency.avg}ms`, msg:"Query latency is high (>20ms). Users may experience slow responses."}); allActions.push(`🟠 ${label} Enable RDS Performance Insights to identify the top SQL statements by load.`,`🟠 ${label} Check for lock contention and long-running transactions.`); }
    else if (m.readLatency.avg > 5 || m.writeLatency.avg > 5) { allFindings.push({sev:"INFO", metric:`${label} Latency`, val:`Read: ${m.readLatency.avg}ms  Write: ${m.writeLatency.avg}ms`, msg:"Latency is slightly elevated. Keep monitoring."}); }
    else { allFindings.push({sev:"OK", metric:`${label} Latency`, val:`Read: ${m.readLatency.avg}ms  Write: ${m.writeLatency.avg}ms`, msg:"Latency is excellent."}); }

    // Memory
    if (m.memory.avg < 0.2)      { health=health==="CRITICAL"?health:"WARNING"; allFindings.push({sev:"WARNING", metric:`${label} Freeable Memory`, val:`${m.memory.avg} GB`, msg:"Very low freeable memory. Risk of swap usage and performance degradation."}); allActions.push(`🟠 ${label} Upgrade instance class for more RAM.`,`🟠 ${label} Tune \`shared_buffers\` and \`work_mem\` in Parameter Group.`); }
    else { allFindings.push({sev:"OK", metric:`${label} Freeable Memory`, val:`${m.memory.avg} GB`, msg:"Memory is adequate."}); }

    // Connections
    if (m.connections.avg > 100) { allFindings.push({sev:"INFO", metric:`${label} DB Connections`, val:`${m.connections.avg}`, msg:"Connection count is elevated. Consider connection pooling."}); allActions.push(`🔵 ${label} Implement RDS Proxy to pool and manage database connections efficiently.`); }
    else { allFindings.push({sev:"OK", metric:`${label} DB Connections`, val:`${m.connections.avg}`, msg:"Connection count is normal."}); }
  });

  if (!allActions.length) allActions.push("✅ All RDS metrics are within healthy thresholds. No actions required.");
  return { health, findings: allFindings, actions: allActions, type: "rds" };
}

function PerfAnalysisModal({perfTarget, onClose}) {
  const result = perfTarget.type === "ec2" ? analyseEC2(perfTarget) : analyseRDS(perfTarget);
  const sevColor = s => s==="CRITICAL"?C.red:s==="WARNING"?C.amber:s==="OK"?C.green:C.blue;
  const sevBg    = s => s==="CRITICAL"?"#fff5f5":s==="WARNING"?C.amberBg:s==="OK"?C.greenBg:C.blueBg;
  const healthColor = result.health==="CRITICAL"?C.red:result.health==="WARNING"?C.amber:C.green;

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(15,20,40,0.45)",backdropFilter:"blur(6px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000}}>
      <div style={{background:C.surface,borderRadius:C.r,width:"min(780px,96vw)",maxHeight:"88vh",display:"flex",flexDirection:"column",boxShadow:C.shadowLg,border:`1px solid ${C.border}`}}>

        {/* Header */}
        <div style={{padding:"18px 24px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:10,color:C.primary,fontFamily:C.mono,fontWeight:700,letterSpacing:"0.1em",marginBottom:3}}>⚡ RULE-BASED · ANALYSIS ENGINE</div>
            <div style={{fontSize:16,fontWeight:800,color:C.text}}>{perfTarget.type==="ec2"?"EC2 Performance Analysis":"RDS Performance Analysis"}</div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <span style={{background:healthColor+"22",color:healthColor,border:`1px solid ${healthColor}44`,borderRadius:8,padding:"4px 14px",fontSize:12,fontWeight:800}}>{result.health}</span>
            <button onClick={onClose} style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:C.rSm,color:C.textSub,padding:"7px 14px",cursor:"pointer",fontSize:12}}>✕ Close</button>
          </div>
        </div>

        <div style={{padding:"22px 24px",overflowY:"auto",flex:1}}>

          {/* Findings */}
          <div style={{fontSize:12,fontWeight:700,color:C.textMute,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:10}}>Metric Assessment</div>
          <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:24}}>
            {result.findings.map((f,i)=>(
              <div key={i} style={{background:sevBg(f.sev),border:`1px solid ${sevColor(f.sev)}33`,borderRadius:C.rSm,padding:"10px 14px",display:"flex",gap:12,alignItems:"flex-start"}}>
                <span style={{background:sevColor(f.sev),color:"#fff",borderRadius:4,padding:"1px 7px",fontSize:10,fontWeight:800,flexShrink:0,marginTop:1}}>{f.sev}</span>
                <div style={{flex:1}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:2}}>
                    <span style={{fontSize:12,fontWeight:700,color:C.text}}>{f.metric}</span>
                    <span style={{fontSize:11,fontFamily:C.mono,fontWeight:700,color:sevColor(f.sev)}}>{f.val}</span>
                  </div>
                  <div style={{fontSize:12,color:C.textSub}}>{f.msg}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Recommended Actions */}
          <div style={{fontSize:12,fontWeight:700,color:C.textMute,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:10}}>Recommended Actions</div>
          <div style={{background:C.bg,borderRadius:C.rSm,padding:"14px 16px",border:`1px solid ${C.border}`}}>
            {result.actions.map((a,i)=>(
              <div key={i} style={{display:"flex",gap:10,padding:"7px 0",borderBottom:i<result.actions.length-1?`1px solid ${C.borderSoft}`:"none",fontSize:13,color:C.textSub,lineHeight:1.5}}>
                <span style={{color:C.primary,fontWeight:700,minWidth:20,fontFamily:C.mono}}>{i+1}.</span>
                <span>{a}</span>
              </div>
            ))}
          </div>

        </div>
      </div>
    </div>
  );
}

/* ── AI Modal ────────────────────────────────────────────────────────────── */
function AIModal({alarms,target,perfTarget,onClose}) {
  const [text,setText]=useState(""); const [loading,setLoading]=useState(true);
  const run=useCallback(async()=>{
    setLoading(true);setText("");
    let prompt;
    if(perfTarget?.type==="ec2"){
      const s=perfTarget.summary; const instances=perfTarget.instances||[];
      prompt=`You are an AWS infrastructure expert. Analyze the following EC2 performance metrics from CloudWatch (ap-southeast-1, last 24 hours) and provide actionable recommendations.\n\n**Fleet Summary (${instances.length} instance${instances.length!==1?"s":""}):**\n- Avg CPU: ${s.avgCpu}%\n- Avg Network In: ${s.avgNetworkIn} MB/hr\n- Avg Network Out: ${s.avgNetworkOut} MB/hr\n- Avg Disk Read: ${s.avgDiskRead} MB/hr\n- Avg Disk Write: ${s.avgDiskWrite} MB/hr\n\n**Per-Instance Breakdown:**\n${instances.map(i=>`- ${i.instanceId}: CPU ${i.cpu.avg}%, NetIn ${i.networkIn.avg}MB, NetOut ${i.networkOut.avg}MB, DiskRead ${i.diskRead.avg}MB, DiskWrite ${i.diskWrite.avg}MB`).join("\n")}\n\nProvide analysis in this format:\n## Overall Health Assessment\n## Anomalies & Concerns\n(flag any metric that looks high, low, or unusual with specific values)\n## Root Cause Analysis\n(explain WHY each anomaly might be happening)\n## Recommended Actions\n(numbered, specific, actionable steps to improve performance)\n## Cost Optimisation Tips\n(based on the usage patterns)\n\nBe specific with AWS service names, CLI commands where relevant, and ap-southeast-1 region context.`;
    } else if(perfTarget?.type==="rds"){
      const clusters=perfTarget.clusters||[];
      prompt=`You are an AWS database expert. Analyze the following RDS performance metrics from CloudWatch (ap-southeast-1, last 24 hours) and provide actionable recommendations.\n\n**RDS Instances/Clusters:**\n${clusters.map(c=>`\n### ${c.clusterId} (${c.engine} / ${c.class} / ${c.status})\n- CPU: ${c.metrics.cpu.avg}%\n- DB Connections: ${c.metrics.connections.avg}\n- Freeable Memory: ${c.metrics.memory.avg} GB\n- Free Storage: ${c.metrics.freeStorage.avg} GB\n- Read IOPS: ${c.metrics.readIOPS.avg}/s\n- Write IOPS: ${c.metrics.writeIOPS.avg}/s\n- Read Latency: ${c.metrics.readLatency.avg}ms\n- Write Latency: ${c.metrics.writeLatency.avg}ms\n- DB Load: ${c.metrics.dbLoad.avg}`).join("\n")}\n\nProvide analysis in this format:\n## Overall Database Health\n## Anomalies & Concerns\n(flag any metric that is high, low, or unusual — e.g. high IOPS, high latency, low free storage)\n## Root Cause Analysis\n(explain WHY each anomaly is likely happening)\n## Recommended Actions\n(numbered, specific steps — e.g. add indexes, tune queries, resize instance, enable caching)\n## Preventive Measures\n(long-term architectural recommendations)\n\nBe specific with RDS/Aurora tuning advice, SQL optimisation hints, and AWS-specific solutions.`;
    } else if(target){
      prompt=`Analyze this AWS CloudWatch alarm:\n${JSON.stringify({name:target.name,resource:target.resource,type:target.type,severity:target.severity,namespace:target.namespace,metric:target.metric,threshold:target.threshold},null,2)}\n\n1. **Root Cause** — most likely reason\n2. **Blast Radius** — downstream impact\n3. **Immediate Fix** — 3 concrete steps\n4. **Long-term Remedy** — architecture fix\n5. **Canary Signal** — earlier detection\n\nBe specific, production-grade, ap-southeast-1.`;
    } else {
      prompt=`Analyze these AWS CloudWatch alarms:\n${JSON.stringify(alarms.map(a=>({name:a.name,severity:a.severity,state:a.state,namespace:a.namespace,metric:a.metric})),null,2)}\n\n1. **Critical Issues** — root causes for ALARM items\n2. **Correlated Failures** — linked alarms\n3. **Pattern** — trend analysis\n4. **Priority Actions** — top 5 by urgency\n5. **Canary Additions** — 3 recommended checks\n\nMarkdown. AWS-specific. Production ap-southeast-1.`;
    }
    try {
      const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1500,messages:[{role:"user",content:prompt}]})});
      const d=await res.json();
      setText(d.content?.map(b=>b.text||"").join("")||"No response.");
    } catch { setText("⚠ Could not reach analysis API. Check your API key."); }
    setLoading(false);
  },[alarms,target,perfTarget]);
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
            <div style={{fontSize:16,fontWeight:800,color:C.text}}>{perfTarget?.type==="ec2"?"EC2 Performance Analysis":perfTarget?.type==="rds"?"RDS Performance Analysis":target?`Deep-Dive: ${target.name}`:"Fleet-Wide Alarm Analysis"}</div>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={run} style={{background:C.primaryLight,border:`1px solid ${C.blueBdr}`,borderRadius:C.rSm,color:C.primary,padding:"7px 14px",cursor:"pointer",fontSize:12,fontFamily:C.mono,fontWeight:600}}>↺ Re-run</button>
            <button onClick={onClose} style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:C.rSm,color:C.textSub,padding:"7px 14px",cursor:"pointer",fontSize:12}}>✕ Close</button>
          </div>
        </div>
        <div style={{padding:"22px 24px",overflowY:"auto",flex:1,fontSize:13,color:C.textSub,lineHeight:1.8,fontFamily:C.font}}>
          {loading
            ?<div style={{textAlign:"center",padding:"48px 0"}}>
               <div style={{fontSize:32,marginBottom:14,animation:"spin 1.4s linear infinite",display:"inline-block"}}>⚡</div>
               <div style={{color:C.primary,fontFamily:C.mono,fontSize:13,fontWeight:600}}>Analysing alarm patterns…</div>
             </div>
            :<div dangerouslySetInnerHTML={{__html:md(text)}}/>}
        </div>
      </div>
    </div>
  );
}

/* ── Alarm Detail Modal ──────────────────────────────────────────────────── */
function AlarmDetail({alarm,onClose,onAnalyze}) {
  const spark=genSparkline(48,alarm.threshold||50,(alarm.threshold||50)*0.3);
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
            {[["Metric",alarm.metric,false],["Threshold",`${alarm.threshold||"N/A"}`,false],["Region",alarm.region,false],["Period",`${alarm.period||300}s`,false]].map(([l,v,hi])=>(
              <div key={l} style={{background:hi?C.redBg:C.bg,border:`1px solid ${hi?C.redBdr:C.border}`,borderRadius:C.rSm,padding:"10px 12px"}}>
                <div style={{fontSize:9,color:C.textMute,fontFamily:C.mono,marginBottom:3,textTransform:"uppercase",letterSpacing:"0.07em"}}>{l}</div>
                <div style={{fontSize:13,fontWeight:700,color:hi?C.red:C.text,fontFamily:C.mono,wordBreak:"break-all"}}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{background:C.bg,borderRadius:C.rSm,padding:14,border:`1px solid ${C.border}`,marginBottom:14}}>
            <div style={{fontSize:10,color:C.textMute,fontFamily:C.mono,marginBottom:10,textTransform:"uppercase",letterSpacing:"0.07em"}}>Metric Trend</div>
            <Spark data={spark} color={alarm.state==="ALARM"?C.red:alarm.state==="OK"?C.green:C.amber} w={560} h={64}/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            {[["Metric",alarm.metric],["Namespace",alarm.namespace],["Resource",alarm.resource],["Type",alarm.type],["Severity",alarm.severity],["State",alarm.state],["Comparison",alarm.comparisonOperator],["Eval Periods",alarm.evaluationPeriods]].map(([k,v])=>(
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

/* ── Performance Metric Card ─────────────────────────────────────────────── */
function PerfCard({label, value, unit, delta, deltaUp, sparkData, color, loading}) {
  return (
    <div style={{background:C.bg,borderRadius:C.rSm,padding:"12px 14px",border:`1px solid ${C.border}`}}>
      <div style={{fontSize:10,color:C.textSub,marginBottom:6,fontWeight:500}}>{label}</div>
      {loading
        ? <div style={{fontSize:13,color:C.textMute,fontFamily:C.mono,marginBottom:6}}>Loading…</div>
        : <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
            <span style={{fontSize:20,fontWeight:800,color:C.text,fontFamily:C.mono,lineHeight:1}}>{value}</span>
            <span style={{fontSize:10,color:C.textMute,fontFamily:C.mono}}>{unit}</span>
            {delta!=null && <span style={{fontSize:10,fontWeight:700,color:deltaUp?C.green:C.red,marginLeft:"auto"}}>{delta}</span>}
          </div>}
      <Spark data={sparkData||genSparkline(24,Number(value)||10,Number(value)*0.2||2)} color={color} w={160} h={28}/>
    </div>
  );
}

/* ── EC2 Instance Table ───────────────────────────────────────────────────── */
function EC2Table({instances}) {
  if(!instances||!instances.length) return (
    <div style={{textAlign:"center",padding:"20px",color:C.textMute,fontSize:12}}>No EC2 instance metrics available</div>
  );
  return (
    <div style={{overflowX:"auto"}}>
      <table style={{width:"100%",borderCollapse:"collapse"}}>
        <thead>
          <tr style={{background:C.bg}}>
            {["Instance ID","CPU Avg %","Network In (MB)","Network Out (MB)","Disk Read (MB)","Disk Write (MB)","Trend"].map(h=>(
              <th key={h} style={{padding:"8px 12px",color:C.textMute,fontSize:10,fontFamily:C.mono,textAlign:"left",fontWeight:600,letterSpacing:"0.07em",borderBottom:`1px solid ${C.border}`,whiteSpace:"nowrap",textTransform:"uppercase"}}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {instances.map((inst,i)=>{
            const cpuHigh = inst.cpu.avg > 80;
            return (
              <tr key={inst.instanceId} style={{background:i%2===0?C.surface:C.bg}}>
                <td style={{padding:"8px 12px",fontSize:11,fontWeight:700,color:C.text,fontFamily:C.mono}}>{inst.instanceId}</td>
                <td style={{padding:"8px 12px",fontSize:12,fontFamily:C.mono,fontWeight:700,color:cpuHigh?C.red:C.text}}>{inst.cpu.avg}%</td>
                <td style={{padding:"8px 12px",fontSize:12,fontFamily:C.mono,color:C.text}}>{inst.networkIn.avg}</td>
                <td style={{padding:"8px 12px",fontSize:12,fontFamily:C.mono,color:C.text}}>{inst.networkOut.avg}</td>
                <td style={{padding:"8px 12px",fontSize:12,fontFamily:C.mono,color:C.text}}>{inst.diskRead.avg}</td>
                <td style={{padding:"8px 12px",fontSize:12,fontFamily:C.mono,color:C.text}}>{inst.diskWrite.avg}</td>
                <td style={{padding:"8px 12px"}}>
                  <Spark data={inst.cpu.points.length?inst.cpu.points:genSparkline(24,inst.cpu.avg,5)} color={cpuHigh?C.red:C.green} w={80} h={22}/>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  MAIN APP                                                                  */
/* ══════════════════════════════════════════════════════════════════════════ */
export default function App() {
  const [activeNav,    setActiveNav]    = useState("overview");
  const [selected,     setSelected]     = useState(null);
  const [showAI,       setShowAI]       = useState(false);
  const [aiTarget,     setAiTarget]     = useState(null);
  const [aiPerfTarget, setAiPerfTarget] = useState(null);
  const [alarms,       setAlarms]       = useState([]);
  const [perf,         setPerf]         = useState(null);
  const [costData,     setCostData]     = useState(null);
  const [canaryData,   setCanaryData]   = useState(null);
  const [serviceData,  setServiceData]  = useState(null);
  const [rdsPerf,      setRdsPerf]      = useState(null);
  const [loadingAlarms,setLoadingAlarms]= useState(true);
  const [loadingPerf,  setLoadingPerf]  = useState(true);
  const [lastRefresh,  setLastRefresh]  = useState(null);

  const loadCostIfStale = useCallback(() => {
    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
    // Clear old cache format that doesn't have history
    try { const c = JSON.parse(localStorage.getItem("costCache")); if (c?.data && !c.data.history) localStorage.removeItem("costCache"); } catch {}
    try {
      const cached = localStorage.getItem("costCache");
      if (cached) {
        const { ts, data } = JSON.parse(cached);
        if (Date.now() - ts < SEVEN_DAYS) { setCostData(data); return; }
      }
    } catch {}
    fetchCost().then(d => {
      if (d && !d.error) {
        setCostData(d);
        localStorage.setItem("costCache", JSON.stringify({ ts: Date.now(), data: d }));
      }
    });
  }, []);

  const loadAll = useCallback(() => {
    setLoadingAlarms(true);
    setLoadingPerf(true);
    fetchRealAlarms().then(d => { setAlarms(d); setLoadingAlarms(false); });
    fetchPerformance().then(d => { setPerf(d);  setLoadingPerf(false);  });
    loadCostIfStale();
    fetchCanary().then(d => { if (d && !d.error) setCanaryData(d); });
    fetchServices().then(d => { if (d) setServiceData(d); });
    fetchRdsPerf().then(d => { if (d && !d.error) setRdsPerf(d); });
    setLastRefresh(new Date());
  }, [loadCostIfStale]);

  useEffect(() => {
    loadAll();
    const t = setInterval(loadAll, 60000);
    return () => clearInterval(t);
  }, [loadAll]);

  /* Derived counts */
  const alarmCount = alarms.filter(a=>a.state==="ALARM").length;
  const critCount  = alarms.filter(a=>a.severity==="CRITICAL").length;
  const warnCount  = alarms.filter(a=>a.severity==="WARNING").length;
  const majorCount = alarms.filter(a=>a.severity==="MAJOR").length;
  const okCount    = alarms.filter(a=>a.state==="OK").length;
  const systemHealth      = alarmCount===0?"Healthy":alarmCount<3?"Degraded":"Critical";
  const systemHealthColor = alarmCount===0?C.green:alarmCount<3?C.amber:C.red;

  // Compute real service status from live data + alarms
  const getServiceStatus = (ns) => {
    if (ns === "AWS/RDS") {
      if (!serviceData) return { status: "Loading", color: C.textMute };
      const instances = serviceData.RDS || [];
      if (!instances.length || instances.error) return { status: "No Data", color: C.amber };
      const allUp = instances.every(i => i.status === "available");
      return allUp ? { status: "Operational", color: C.green } : { status: "Degraded", color: C.red };
    }
    if (ns === "AWS/EC2") {
      if (!serviceData) return { status: "Loading", color: C.textMute };
      const instances = serviceData.EC2 || [];
      if (!instances.length) return { status: "Stopped", color: C.amber };
      return { status: "Operational", color: C.green };
    }
    // For other services fall back to alarm-based status
    const nsAlarms = alarms.filter(a => a.namespace === ns);
    if (!nsAlarms.length) return { status: "No Data", color: C.amber };
    return nsAlarms.some(a => a.state === "ALARM")
      ? { status: "Degraded", color: C.red }
      : { status: "Operational", color: C.green };
  };

  const sevDonut = [
    {label:"Critical",value:Math.max(critCount,1),  color:"#ef4444"},
    {label:"Major",   value:Math.max(majorCount,1), color:"#f97316"},
    {label:"Warning", value:Math.max(warnCount,1),  color:"#f59e0b"},
    {label:"Info/OK", value:Math.max(okCount,1),    color:"#3b82f6"},
  ];
  const sysDonut = [
    {label:"OK",               value:Math.max(okCount,1),                                              color:"#22c55e"},
    {label:"Alarm",            value:Math.max(alarmCount,1),                                           color:"#ef4444"},
    {label:"Insufficient Data",value:Math.max(alarms.filter(a=>a.state==="INSUFFICIENT_DATA").length,1),color:"#f59e0b"},
  ];
  const DONUT_COLORS = ["#4f6ef7","#a78bfa","#f59e0b","#22c55e","#ef4444","#06b6d4"];
  const costDonut = costData?.services?.length
    ? costData.services.slice(0, 5).map((s, i) => ({ label: s.name, value: s.amount, color: DONUT_COLORS[i] }))
    : [{label:"EC2",value:36,color:"#4f6ef7"},{label:"RDS",value:26,color:"#a78bfa"},{label:"S3",value:15,color:"#f59e0b"},{label:"Others",value:23,color:"#22c55e"}];
  const canaryLine = genSparkline(30,99.2,1.5);
  const costLine   = costData?.trend?.length ? costData.trend : genSparkline(20,12340,2000);
  const costTotal  = costData?.total ?? null;

  /* Performance display values — real if available, else show dashes */
  const cpu      = perf?.summary?.avgCpu      ?? null;
  const netIn    = perf?.summary?.avgNetworkIn ?? null;
  const netOut   = perf?.summary?.avgNetworkOut?? null;
  const diskRead = perf?.summary?.avgDiskRead  ?? null;
  const diskWrite= perf?.summary?.avgDiskWrite ?? null;

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
        tr:hover td{background:${C.primaryLight}!important}
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
              <button key={n.id} onClick={()=>setActiveNav(n.id)} style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"9px 10px",borderRadius:C.rSm,border:"none",cursor:"pointer",marginBottom:2,background:active?"linear-gradient(90deg,#eef1ff,#f0f3ff)":"transparent",color:active?C.primary:C.textSub,fontWeight:active?700:500,fontSize:13,fontFamily:C.font,transition:"all 0.15s",textAlign:"left"}}>
                <span style={{fontSize:15,width:18,textAlign:"center"}}>{n.icon}</span>
                <span style={{flex:1}}>{n.label}</span>
                {n.badge&&<span style={{background:n.badgeColor,color:"#fff",borderRadius:10,padding:"1px 6px",fontSize:10,fontWeight:700,minWidth:18,textAlign:"center"}}>{n.badge}</span>}
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

        {/* Top Bar */}
        <div style={{background:C.surface,borderBottom:`1px solid ${C.border}`,padding:"0 24px",display:"flex",alignItems:"center",gap:16,height:60,flexShrink:0,position:"sticky",top:0,zIndex:10}}>
          <div>
            <div style={{fontSize:18,fontWeight:800,color:C.text,lineHeight:1.1}}>eLit Management Dashboard</div>
            <div style={{fontSize:11,color:C.textMute}}>Real-time AWS CloudWatch · {lastRefresh?`Last refresh: ${lastRefresh.toLocaleTimeString("en-SG")}`:"Loading…"}</div>
          </div>
          <div style={{flex:1}}/>
          <div style={{position:"relative"}}>
            <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:C.textMute,fontSize:13}}>🔍</span>
            <input placeholder="Search anything…" style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:C.rSm,padding:"7px 12px 7px 32px",fontSize:12,color:C.text,width:200,fontFamily:C.font}}/>
          </div>
          <div style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:C.rSm,padding:"7px 12px",fontSize:12,color:C.textSub,display:"flex",alignItems:"center",gap:6}}>
            📅 {new Date().toLocaleDateString("en-SG",{month:"short",day:"numeric",year:"numeric"})}
          </div>
          <button onClick={loadAll} style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:C.rSm,padding:"7px 10px",cursor:"pointer",fontSize:14,color:C.textSub}}>
            {(loadingAlarms||loadingPerf)?<span style={{animation:"spin 1s linear infinite",display:"inline-block"}}>↻</span>:"↻"}
          </button>
          <div style={{position:"relative"}}>
            <button style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:C.rSm,padding:"7px 10px",cursor:"pointer",fontSize:14,color:C.textSub}}>🔔</button>
            {alarmCount>0&&<span style={{position:"absolute",top:-4,right:-4,background:C.red,color:"#fff",borderRadius:10,padding:"1px 5px",fontSize:9,fontWeight:700}}>{alarmCount}</span>}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8,padding:"4px 10px 4px 4px",background:C.bg,border:`1px solid ${C.border}`,borderRadius:30}}>
            <div style={{width:30,height:30,borderRadius:"50%",background:"linear-gradient(135deg,#4f6ef7,#7c3aed)",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:12,fontWeight:700}}>JD</div>
            <div>
              <div style={{fontSize:11,fontWeight:700,color:C.text,lineHeight:1}}>John Dela Cruz</div>
              <div style={{fontSize:9,color:C.textMute}}>IT Operations Manager</div>
            </div>
          </div>
        </div>

        {/* Loading / empty banners */}
        {(loadingAlarms||loadingPerf)&&(
          <div style={{background:C.primaryLight,borderBottom:`1px solid ${C.blueBdr}`,padding:"8px 24px",fontSize:12,color:C.primary,display:"flex",alignItems:"center",gap:8}}>
            <span style={{animation:"spin 1s linear infinite",display:"inline-block"}}>↻</span>
            Fetching real-time data from AWS CloudWatch…
          </div>
        )}
        {!loadingAlarms&&alarms.length===0&&(
          <div style={{background:C.amberBg,borderBottom:`1px solid ${C.amberBdr}`,padding:"10px 24px",fontSize:12,color:C.amber,fontWeight:600}}>
            ⚠ No alarms found. Make sure the backend is running at https://54.255.177.224.nip.io
          </div>
        )}

        <div style={{padding:"22px 24px",flex:1}}>

          {/* ── Non-overview placeholder views ── */}
          {activeNav==="alarms" && (
            <div>
              <div style={{fontSize:20,fontWeight:800,color:C.text,marginBottom:18}}>Alarms & Alerts</div>
              <div style={{background:C.surface,borderRadius:C.r,padding:"18px 20px",boxShadow:C.shadow,border:`1px solid ${C.border}`}}>
                <SectionHeader title={`All CloudWatch Alarms (${alarms.length})`} badge={alarms.length}/>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                  <thead><tr style={{borderBottom:`2px solid ${C.border}`}}>{["ALARM NAME","NAMESPACE","METRIC","RESOURCE","THRESHOLD","STATE","SEVERITY","LAST UPDATED"].map(h=><th key={h} style={{textAlign:"left",padding:"8px 10px",color:C.textMute,fontWeight:700,fontSize:10,letterSpacing:"0.06em"}}>{h}</th>)}</tr></thead>
                  <tbody>{alarms.map((a,i)=>(
                    <tr key={i} onClick={()=>setSelected(a)} style={{borderBottom:`1px solid ${C.borderSoft}`,cursor:"pointer"}} onMouseEnter={e=>e.currentTarget.style.background=C.bg} onMouseLeave={e=>e.currentTarget.style.background=""}>
                      <td style={{padding:"10px 10px",fontWeight:700,color:C.text}}>{a.name}</td>
                      <td style={{padding:"10px 10px",color:C.textSub}}>{a.namespace}</td>
                      <td style={{padding:"10px 10px",color:C.textSub}}>{a.metric}</td>
                      <td style={{padding:"10px 10px",color:C.textSub,fontFamily:C.mono,fontSize:11}}>{a.resource}</td>
                      <td style={{padding:"10px 10px",color:C.textSub}}>{a.threshold}</td>
                      <td style={{padding:"10px 10px"}}><span style={{background:a.state==="OK"?C.greenBg:C.redBg,color:a.state==="OK"?C.green:C.red,padding:"2px 8px",borderRadius:6,fontWeight:700,fontSize:11}}>{a.state}</span></td>
                      <td style={{padding:"10px 10px"}}><span style={{background:a.severity==="CRITICAL"?C.redBg:C.primaryLight,color:a.severity==="CRITICAL"?C.red:C.primary,padding:"2px 8px",borderRadius:6,fontWeight:700,fontSize:11}}>{a.severity}</span></td>
                      <td style={{padding:"10px 10px",color:C.textMute,fontFamily:C.mono,fontSize:11}}>{a.time}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          )}

          {activeNav==="canary" && canaryData && (
            <div>
              <div style={{fontSize:20,fontWeight:800,color:C.text,marginBottom:18}}>Canary Monitoring</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:20}}>
                {[{label:"Total Canaries",val:canaryData.summary.total,color:C.text,bg:C.surface},{label:"Running",val:canaryData.summary.running,color:C.blue,bg:C.blueBg},{label:"Passed",val:canaryData.summary.passed,color:C.green,bg:C.greenBg},{label:"Failed",val:canaryData.summary.failed,color:C.red,bg:"#fff5f5"}].map(k=>(
                  <div key={k.label} style={{background:k.bg,borderRadius:C.r,padding:"18px 20px",border:`1px solid ${C.border}`}}>
                    <div style={{fontSize:11,color:C.textMute,marginBottom:6}}>{k.label}</div>
                    <div style={{fontSize:32,fontWeight:800,color:k.color,fontFamily:C.mono}}>{k.val}</div>
                  </div>
                ))}
              </div>
              <div style={{background:C.surface,borderRadius:C.r,padding:"18px 20px",boxShadow:C.shadow,border:`1px solid ${C.border}`}}>
                <SectionHeader title="All Canaries"/>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                  <thead><tr style={{borderBottom:`2px solid ${C.border}`}}>{["NAME","STATE","SCHEDULE","LAST RUN","STATUS","SUCCESS RATE (5 runs)"].map(h=><th key={h} style={{textAlign:"left",padding:"8px 10px",color:C.textMute,fontWeight:700,fontSize:10,letterSpacing:"0.06em"}}>{h}</th>)}</tr></thead>
                  <tbody>{canaryData.canaries.map((c,i)=>(
                    <tr key={i} style={{borderBottom:`1px solid ${C.borderSoft}`}}>
                      <td style={{padding:"10px 10px",fontWeight:700,color:C.text}}>{c.name}</td>
                      <td style={{padding:"10px 10px"}}><span style={{display:"flex",alignItems:"center",gap:5}}><div style={{width:7,height:7,borderRadius:"50%",background:c.state==="RUNNING"?C.green:C.textMute}}/><span style={{color:C.textSub}}>{c.state}</span></span></td>
                      <td style={{padding:"10px 10px",color:C.textMute,fontFamily:C.mono,fontSize:11}}>{c.schedule}</td>
                      <td style={{padding:"10px 10px",color:C.textMute,fontFamily:C.mono,fontSize:11}}>{c.lastRun ? new Date(c.lastRun.startedAt).toLocaleString("en-SG") : "—"}</td>
                      <td style={{padding:"10px 10px"}}>{c.lastRun
                        ? <span style={{background:c.lastRun.status==="PASSED"?C.greenBg:"#fff5f5",color:c.lastRun.status==="PASSED"?C.green:C.red,padding:"2px 8px",borderRadius:6,fontWeight:700,fontSize:11}}>{c.lastRun.status}</span>
                        : <span style={{background:C.bg,color:C.textMute,padding:"2px 8px",borderRadius:6,fontWeight:700,fontSize:11}}>No Data</span>}
                      </td>
                      <td style={{padding:"10px 10px"}}>
                        {c.successRate !== null
                          ? <div style={{display:"flex",alignItems:"center",gap:8}}><div style={{flex:1,height:6,background:C.border,borderRadius:3,overflow:"hidden"}}><div style={{width:`${c.successRate}%`,height:"100%",background:c.successRate>=80?C.green:c.successRate>=50?C.amber:C.red,borderRadius:3}}/></div><span style={{fontSize:11,fontWeight:700,color:c.successRate>=80?C.green:c.successRate>=50?C.amber:C.red,fontFamily:C.mono,minWidth:36}}>{c.successRate}%</span></div>
                          : <span style={{color:C.textMute,fontSize:11}}>—</span>}
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          )}

          {activeNav==="performance" && (
            <div>
              {/* ── EC2 ── */}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
                <div style={{fontSize:20,fontWeight:800,color:C.text}}>EC2 Performance (Last 24h)</div>
                {perf && <button onClick={()=>{setAiPerfTarget({type:"ec2",summary:perf.summary,instances:perf.instances});setAiTarget(null);setShowAI(true);}}
                  style={{background:C.primaryLight,border:`1px solid ${C.blueBdr}`,borderRadius:C.rSm,color:C.primary,padding:"8px 16px",cursor:"pointer",fontSize:12,fontWeight:700,display:"flex",alignItems:"center",gap:6}}>
                  ⚡ Analyse EC2 with AI
                </button>}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:12,marginBottom:20}}>
                <PerfCard label="Avg CPU Utilization" value={perf?.summary?.avgCpu??0} unit="%" sparkData={perf?.sparklines?.cpu} color={C.blue} loading={loadingPerf}/>
                <PerfCard label="Network In (MB/hr)" value={perf?.summary?.avgNetworkIn??0} unit="MB" sparkData={perf?.sparklines?.networkIn} color={C.green} loading={loadingPerf}/>
                <PerfCard label="Network Out (MB/hr)" value={perf?.summary?.avgNetworkOut??0} unit="MB" sparkData={perf?.sparklines?.networkOut} color={C.purple} loading={loadingPerf}/>
                <PerfCard label="Disk Read (MB/hr)" value={perf?.summary?.avgDiskRead??0} unit="MB" sparkData={perf?.sparklines?.diskRead} color={C.orange} loading={loadingPerf}/>
                <PerfCard label="Disk Write (MB/hr)" value={perf?.summary?.avgDiskWrite??0} unit="MB" sparkData={perf?.sparklines?.diskWrite} color={C.primary} loading={loadingPerf}/>
              </div>
              <div style={{background:C.surface,borderRadius:C.r,padding:"18px 20px",boxShadow:C.shadow,border:`1px solid ${C.border}`,marginBottom:28}}>
                <SectionHeader title="Per-Instance Breakdown"/>
                {loadingPerf ? <div style={{textAlign:"center",padding:"20px",color:C.textMute,fontSize:12}}>Loading EC2 metrics…</div> : <EC2Table instances={perf?.instances}/>}
              </div>

              {/* ── RDS ── */}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
                <div style={{fontSize:20,fontWeight:800,color:C.text}}>RDS / Aurora Performance (Last 24h)</div>
                {rdsPerf?.clusters?.length > 0 && <button onClick={()=>{setAiPerfTarget({type:"rds",clusters:rdsPerf.clusters});setAiTarget(null);setShowAI(true);}}
                  style={{background:C.greenBg,border:`1px solid ${C.green}44`,borderRadius:C.rSm,color:C.green,padding:"8px 16px",cursor:"pointer",fontSize:12,fontWeight:700,display:"flex",alignItems:"center",gap:6}}>
                  ⚡ Analyse RDS with AI
                </button>}
              </div>
              {!rdsPerf
                ? <div style={{textAlign:"center",padding:"30px",color:C.textMute,fontSize:12}}>Loading RDS metrics…</div>
                : rdsPerf.clusters.map(cluster => (
                  <div key={cluster.clusterId} style={{marginBottom:24}}>
                    <div style={{fontSize:13,fontWeight:700,color:C.textSub,marginBottom:12,display:"flex",alignItems:"center",gap:8}}>
                      <span style={{background:cluster.status==="available"?C.greenBg:"#fff5f5",color:cluster.status==="available"?C.green:C.red,padding:"2px 8px",borderRadius:6,fontSize:11,fontWeight:700}}>{cluster.status}</span>
                      {cluster.clusterId} <span style={{color:C.textMute,fontWeight:400}}>({cluster.engine})</span>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:12}}>
                      <PerfCard label="CPU Utilization"     value={cluster.metrics.cpu.avg}         unit="%"  sparkData={cluster.metrics.cpu.points}         color={C.blue}   loading={false}/>
                      <PerfCard label="DB Connections"      value={cluster.metrics.connections.avg}  unit=""   sparkData={cluster.metrics.connections.points}  color={C.green}  loading={false}/>
                      <PerfCard label="Freeable Memory"     value={cluster.metrics.memory.avg}       unit="GB" sparkData={cluster.metrics.memory.points}       color={C.purple} loading={false}/>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:12}}>
                      <PerfCard label="Read IOPS"           value={cluster.metrics.readIOPS.avg}     unit="/s" sparkData={cluster.metrics.readIOPS.points}     color={C.orange} loading={false}/>
                      <PerfCard label="Write IOPS"          value={cluster.metrics.writeIOPS.avg}    unit="/s" sparkData={cluster.metrics.writeIOPS.points}    color={C.red}    loading={false}/>
                      <PerfCard label="DB Load"             value={cluster.metrics.dbLoad.avg}       unit=""   sparkData={cluster.metrics.dbLoad.points}       color={C.primary}loading={false}/>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
                      <PerfCard label="Read Latency"        value={cluster.metrics.readLatency.avg}  unit="ms" sparkData={cluster.metrics.readLatency.points}  color={C.amber}  loading={false}/>
                      <PerfCard label="Write Latency"       value={cluster.metrics.writeLatency.avg} unit="ms" sparkData={cluster.metrics.writeLatency.points} color={C.orange} loading={false}/>
                      <PerfCard label="Free Storage"        value={cluster.metrics.freeStorage.avg}  unit="GB" sparkData={cluster.metrics.freeStorage.points}  color={C.green}  loading={false}/>
                    </div>
                  </div>
                ))
              }
            </div>
          )}

          {activeNav==="cost" && (
            <div>
              <div style={{fontSize:20,fontWeight:800,color:C.text,marginBottom:18}}>Cost Management</div>

              {/* ── 3-month comparison cards ── */}
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14,marginBottom:20}}>
                {(costData?.history || []).map((m, i) => {
                  const isCurrentMonth = i === (costData.history.length - 1);
                  const pct = m.pctVsPrev;
                  const isHigher = pct > 0;
                  const isLower  = pct < 0;
                  const pctColor = isHigher ? C.red : isLower ? C.green : C.textMute;
                  const pctBg    = isHigher ? "#fff5f5" : isLower ? C.greenBg : C.bg;
                  const arrow    = isHigher ? "▲" : isLower ? "▼" : "—";
                  return (
                    <div key={m.month} style={{background:isCurrentMonth?C.primaryLight:C.surface,borderRadius:C.r,padding:"20px 24px",boxShadow:C.shadow,border:`1px solid ${isCurrentMonth?C.blueBdr:C.border}`}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                        <div style={{fontSize:11,color:C.textMute,fontWeight:600}}>{isCurrentMonth?"THIS MONTH":i===costData.history.length-2?"LAST MONTH":"2 MONTHS AGO"}</div>
                        {isCurrentMonth && <span style={{fontSize:9,background:C.primary,color:"#fff",borderRadius:4,padding:"1px 6px",fontWeight:700}}>CURRENT</span>}
                      </div>
                      <div style={{fontSize:11,color:C.textMute,marginBottom:8}}>{m.month}</div>
                      <div style={{fontSize:36,fontWeight:900,color:C.text,fontFamily:C.mono,marginBottom:10}}>${m.total?.toLocaleString() ?? "0"}</div>
                      {pct !== null
                        ? <div style={{display:"inline-flex",alignItems:"center",gap:6,background:pctBg,borderRadius:6,padding:"4px 10px"}}>
                            <span style={{fontSize:14,color:pctColor}}>{arrow}</span>
                            <span style={{fontSize:13,fontWeight:700,color:pctColor,fontFamily:C.mono}}>{Math.abs(pct)}%</span>
                            <span style={{fontSize:11,color:C.textMute}}>{isHigher?"higher":"lower"} than prev month</span>
                          </div>
                        : <div style={{fontSize:11,color:C.textMute}}>No previous month data</div>
                      }
                    </div>
                  );
                })}
              </div>

              {/* ── Service breakdown + donut ── */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 2fr",gap:20,marginBottom:20}}>
                <div style={{background:C.surface,borderRadius:C.r,padding:"24px",boxShadow:C.shadow,border:`1px solid ${C.border}`}}>
                  <div style={{fontSize:12,color:C.textSub,marginBottom:4}}>This Month Total</div>
                  <div style={{fontSize:36,fontWeight:900,color:C.text,fontFamily:C.mono,marginBottom:16}}>${costData?.total?.toLocaleString()??0}</div>
                  <Donut segments={costDonut} size={120} thickness={18} label={`$${costData?.total??0}`} sublabel="Total"/>
                </div>
                <div style={{background:C.surface,borderRadius:C.r,padding:"24px",boxShadow:C.shadow,border:`1px solid ${C.border}`}}>
                  <SectionHeader title="Cost by Service"/>
                  {costDonut.map((s,i)=>(
                    <div key={s.label} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderBottom:`1px solid ${C.borderSoft}`}}>
                      <div style={{width:10,height:10,borderRadius:"50%",background:s.color,flexShrink:0}}/>
                      <span style={{flex:1,color:C.text,fontWeight:500}}>{s.label}</span>
                      <div style={{flex:2,height:8,background:C.border,borderRadius:4,overflow:"hidden"}}><div style={{width:`${costData?.total?Math.round(s.value/costData.total*100):0}%`,height:"100%",background:s.color,borderRadius:4}}/></div>
                      <span style={{fontFamily:C.mono,fontWeight:700,color:C.text,minWidth:60,textAlign:"right"}}>${s.value.toLocaleString()}</span>
                      <span style={{color:C.textMute,minWidth:36,textAlign:"right"}}>{costData?.total?Math.round(s.value/costData.total*100):0}%</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Daily trend ── */}
              <div style={{background:C.surface,borderRadius:C.r,padding:"18px 20px",boxShadow:C.shadow,border:`1px solid ${C.border}`}}>
                <SectionHeader title="Daily Spend Trend (Last 30 Days)"/>
                <Spark data={costLine} color={C.primary} w={900} h={60}/>
              </div>
            </div>
          )}

          {activeNav==="services" && (
            <div>
              <div style={{fontSize:20,fontWeight:800,color:C.text,marginBottom:18}}>Service Status</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14,marginBottom:20}}>
                {["AWS/RDS","AWS/EC2","AWS/Lambda","AWS/ApiGateway","AWS/ECS","AWS/CloudFront"].map(ns=>{
                  const {status,color}=getServiceStatus(ns);
                  const nsAlarms=alarms.filter(a=>a.namespace===ns);
                  return (
                    <div key={ns} style={{background:C.surface,borderRadius:C.r,padding:"20px",boxShadow:C.shadow,border:`1px solid ${C.border}`}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                        <span style={{fontWeight:700,color:C.text}}>{ns.replace("AWS/","")}</span>
                        <span style={{fontSize:12,fontWeight:700,color,background:status==="Operational"?C.greenBg:status==="Degraded"?"#fff5f5":C.bg,padding:"3px 10px",borderRadius:8}}>{status}</span>
                      </div>
                      <div style={{fontSize:12,color:C.textMute}}>{nsAlarms.length} alarm{nsAlarms.length!==1?"s":""} configured</div>
                    </div>
                  );
                })}
              </div>
              {/* RDS instance details */}
              {serviceData?.RDS?.length > 0 && (
                <div style={{background:C.surface,borderRadius:C.r,padding:"18px 20px",boxShadow:C.shadow,border:`1px solid ${C.border}`}}>
                  <SectionHeader title="RDS Instances"/>
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                    <thead><tr style={{borderBottom:`2px solid ${C.border}`}}>{["IDENTIFIER","ENGINE","CLASS","STATUS"].map(h=><th key={h} style={{textAlign:"left",padding:"8px 10px",color:C.textMute,fontWeight:700,fontSize:10,letterSpacing:"0.06em"}}>{h}</th>)}</tr></thead>
                    <tbody>{serviceData.RDS.map((db,i)=>(
                      <tr key={i} style={{borderBottom:`1px solid ${C.borderSoft}`}}>
                        <td style={{padding:"10px",fontWeight:700,color:C.text,fontFamily:C.mono,fontSize:11}}>{db.id}</td>
                        <td style={{padding:"10px",color:C.textSub}}>{db.engine}</td>
                        <td style={{padding:"10px",color:C.textSub,fontFamily:C.mono,fontSize:11}}>{db.class}</td>
                        <td style={{padding:"10px"}}><span style={{background:db.status==="available"?C.greenBg:"#fff5f5",color:db.status==="available"?C.green:C.red,padding:"2px 8px",borderRadius:6,fontWeight:700,fontSize:11}}>{db.status}</span></td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {["incidents","infra","security","settings"].includes(activeNav) && (
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:400,color:C.textMute}}>
              <div style={{fontSize:48,marginBottom:16}}>{NAV.find(n=>n.id===activeNav)?.icon}</div>
              <div style={{fontSize:20,fontWeight:700,color:C.text,marginBottom:8}}>{NAV.find(n=>n.id===activeNav)?.label}</div>
              <div style={{fontSize:13}}>This section is coming soon.</div>
            </div>
          )}

          {activeNav==="overview" && <div>{/* ── Row 1: KPI Cards ── */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:22}}>
            <div style={{background:C.surface,borderRadius:C.r,padding:"18px 20px",boxShadow:C.shadow,border:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:14}}>
              <div style={{width:44,height:44,borderRadius:10,background:alarmCount===0?C.greenBg:C.redBg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>{alarmCount===0?"💚":"⚠️"}</div>
              <div style={{flex:1}}>
                <div style={{fontSize:11,color:systemHealthColor,fontWeight:700,marginBottom:2}}>System Health</div>
                <div style={{fontSize:22,fontWeight:800,color:systemHealthColor}}>{systemHealth}</div>
                <div style={{fontSize:11,color:C.textMute}}>{alarmCount===0?"All systems operational":`${alarmCount} alarm${alarmCount>1?"s":""} active`}</div>
              </div>
            </div>
            <div style={{background:C.surface,borderRadius:C.r,padding:"18px 20px",boxShadow:C.shadow,border:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:14}}>
              <div style={{width:44,height:44,borderRadius:10,background:"#fff8e7",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>🔔</div>
              <div style={{flex:1}}>
                <div style={{fontSize:11,color:C.textSub,fontWeight:600,marginBottom:2}}>Active Alarms</div>
                <div style={{fontSize:28,fontWeight:800,color:C.text,fontFamily:C.mono}}>{alarms.length}</div>
                <div style={{fontSize:11,marginTop:2}}><span style={{color:C.red,fontWeight:700}}>{alarmCount} In Alarm</span><span style={{color:C.textMute}}> · </span><span style={{color:C.green,fontWeight:700}}>{okCount} OK</span></div>
              </div>
            </div>
            {/* EC2 CPU Card — real data */}
            <div style={{background:C.surface,borderRadius:C.r,padding:"18px 20px",boxShadow:C.shadow,border:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:14}}>
              <div style={{width:44,height:44,borderRadius:10,background:cpu>80?C.redBg:C.blueBg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>💻</div>
              <div style={{flex:1}}>
                <div style={{fontSize:11,color:C.primary,fontWeight:700,marginBottom:2}}>EC2 Avg CPU</div>
                <div style={{fontSize:28,fontWeight:800,color:cpu>80?C.red:C.text,fontFamily:C.mono}}>{loadingPerf?"…":cpu!=null?`${cpu}%`:"N/A"}</div>
                <div style={{fontSize:11,color:C.textMute,marginTop:2}}>{perf?.instanceCount??0} instance{perf?.instanceCount!==1?"s":""} · Live</div>
              </div>
            </div>
            <div style={{background:C.surface,borderRadius:C.r,padding:"18px 20px",boxShadow:C.shadow,border:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:14}}>
              <div style={{width:44,height:44,borderRadius:10,background:C.blueBg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>🌏</div>
              <div style={{flex:1}}>
                <div style={{fontSize:11,color:C.primary,fontWeight:700,marginBottom:2}}>AWS Region</div>
                <div style={{fontSize:16,fontWeight:800,color:C.text,fontFamily:C.mono}}>ap-southeast-1</div>
                <div style={{fontSize:11,color:C.textMute,marginTop:2}}>Singapore · Live</div>
              </div>
            </div>
          </div>

          {/* ── Row 2: Overview + Severity + Top Alarms ── */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1.4fr",gap:14,marginBottom:22}}>
            <div style={{background:C.surface,borderRadius:C.r,padding:"18px 20px",boxShadow:C.shadow,border:`1px solid ${C.border}`}}>
              <SectionHeader title="Alarm State Overview"/>
              <div style={{display:"flex",alignItems:"center",gap:20}}>
                <Donut segments={sysDonut} size={130} thickness={20} label={`${alarms.length}`} sublabel="Total Alarms"/>
                <div style={{flex:1}}>
                  {[{label:"In Alarm",value:alarmCount,color:C.red},{label:"OK",value:okCount,color:C.green},{label:"Insufficient Data",value:alarms.filter(a=>a.state==="INSUFFICIENT_DATA").length,color:C.amber}].map(r=>(
                    <div key={r.label} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 0",borderBottom:`1px solid ${C.borderSoft}`}}>
                      <div style={{display:"flex",alignItems:"center",gap:6}}><div style={{width:8,height:8,borderRadius:"50%",background:r.color,flexShrink:0}}/><span style={{fontSize:11,color:C.textSub}}>{r.label}</span></div>
                      <span style={{fontSize:13,fontWeight:700,color:r.color,fontFamily:C.mono}}>{r.value}</span>
                    </div>
                  ))}
                  <div style={{marginTop:8,fontSize:10,color:C.textMute}}>🔄 Auto-refresh every 60s</div>
                </div>
              </div>
            </div>
            <div style={{background:C.surface,borderRadius:C.r,padding:"18px 20px",boxShadow:C.shadow,border:`1px solid ${C.border}`}}>
              <SectionHeader title="Alarms by Severity"/>
              <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:24}}>
                <Donut segments={sevDonut} size={130} thickness={20} label={`${alarms.length}`} sublabel="Total"/>
                <div>
                  {[{label:"Critical",value:critCount,color:C.red},{label:"Major",value:majorCount,color:C.orange},{label:"Warning",value:warnCount,color:C.amber},{label:"Info/OK",value:okCount,color:C.blue}].map(s=>(
                    <div key={s.label} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 0",borderBottom:`1px solid ${C.borderSoft}`}}>
                      <div style={{width:10,height:10,borderRadius:"50%",background:s.color,flexShrink:0}}/>
                      <span style={{fontSize:12,color:C.textSub,flex:1}}>{s.label}</span>
                      <span style={{fontSize:14,fontWeight:700,color:C.text,fontFamily:C.mono}}>{s.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div style={{background:C.surface,borderRadius:C.r,padding:"18px 20px",boxShadow:C.shadow,border:`1px solid ${C.border}`}}>
              <SectionHeader title="Top Active Alarms"/>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {alarms.filter(a=>a.state==="ALARM").slice(0,4).length>0
                  ?alarms.filter(a=>a.state==="ALARM").slice(0,4).map(a=>(
                    <div key={a.name} onClick={()=>setSelected(a)} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",borderRadius:C.rSm,background:C.bg,cursor:"pointer",border:`1px solid ${C.border}`,transition:"all 0.15s"}}
                      onMouseEnter={e=>e.currentTarget.style.background=C.primaryLight}
                      onMouseLeave={e=>e.currentTarget.style.background=C.bg}>
                      <SevBadge sev={a.severity||"INFO"}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:12,fontWeight:700,color:C.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{a.name}</div>
                        <div style={{fontSize:10,color:C.textMute,fontFamily:C.mono}}>{a.resource} · {a.type}</div>
                      </div>
                      <div style={{textAlign:"right",flexShrink:0}}>
                        <div style={{fontSize:10,color:C.textMute,marginBottom:3}}>{a.time}</div>
                        <Spark data={genSparkline(12,50,20)} color={C.red} w={56} h={18}/>
                      </div>
                    </div>
                  ))
                  :<div style={{textAlign:"center",padding:"20px 0",color:C.textMute,fontSize:12}}>✅ No alarms currently in ALARM state</div>
                }
              </div>
            </div>
          </div>

          {/* ── Row 3: All Alarms Table ── */}
          <div style={{background:C.surface,borderRadius:C.r,padding:"18px 20px",boxShadow:C.shadow,border:`1px solid ${C.border}`,marginBottom:22}}>
            <SectionHeader title="All CloudWatch Alarms" badge={`${alarms.length}`}/>
            {alarms.length===0
              ?<div style={{textAlign:"center",padding:"30px 0",color:C.textMute,fontSize:13}}>No alarms found. Make sure the backend server is running.</div>
              :<div style={{overflowX:"auto"}}>
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
                      <tr key={a.name} onClick={()=>setSelected(a)} style={{background:i%2===0?C.surface:C.bg,cursor:"pointer",transition:"background 0.15s"}}>
                        <td style={{padding:"9px 12px",fontSize:12,fontWeight:700,color:C.text,fontFamily:C.mono,whiteSpace:"nowrap"}}>{a.name}</td>
                        <td style={{padding:"9px 12px",fontSize:11,color:C.textSub,fontFamily:C.mono}}>{a.namespace?.replace("AWS/","")}</td>
                        <td style={{padding:"9px 12px",fontSize:11,color:C.textSub,fontFamily:C.mono}}>{a.metric}</td>
                        <td style={{padding:"9px 12px",fontSize:11,color:C.textSub,fontFamily:C.mono,maxWidth:140,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.resource}</td>
                        <td style={{padding:"9px 12px",fontSize:11,color:C.text,fontFamily:C.mono}}>{a.threshold}</td>
                        <td style={{padding:"9px 12px"}}>
                          <span style={{background:a.state==="ALARM"?C.redBg:a.state==="OK"?C.greenBg:C.amberBg,color:a.state==="ALARM"?C.red:a.state==="OK"?C.green:C.amber,border:`1px solid ${a.state==="ALARM"?C.redBdr:a.state==="OK"?C.greenBdr:C.amberBdr}`,borderRadius:4,padding:"2px 8px",fontSize:10,fontWeight:700,fontFamily:C.mono}}>{a.state}</span>
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

          {/* ── Row 4: Performance Overview — REAL EC2 DATA ── */}
          <div style={{background:C.surface,borderRadius:C.r,padding:"18px 20px",boxShadow:C.shadow,border:`1px solid ${C.border}`,marginBottom:22}}>
            <SectionHeader
              title="EC2 Performance Overview (Last 24 Hours)"
              badge={perf?.instanceCount?`${perf.instanceCount} instance${perf.instanceCount!==1?"s":""}`:null}
            />
            {/* Summary metric cards */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:12,marginBottom:20}}>
              <PerfCard label="Avg CPU Utilization"   value={cpu??0}      unit="%"  delta={cpu>80?"HIGH":cpu>60?"WARN":null}  deltaUp={false} sparkData={perf?.sparklines?.cpu}       color={cpu>80?C.red:cpu>60?C.amber:C.blue}   loading={loadingPerf}/>
              <PerfCard label="Network In (MB/hr)"    value={netIn??0}    unit="MB" delta={null}                               deltaUp={true}  sparkData={perf?.sparklines?.networkIn}  color={C.green}   loading={loadingPerf}/>
              <PerfCard label="Network Out (MB/hr)"   value={netOut??0}   unit="MB" delta={null}                               deltaUp={true}  sparkData={perf?.sparklines?.networkOut} color={C.purple}  loading={loadingPerf}/>
              <PerfCard label="Disk Read (MB/hr)"     value={diskRead??0} unit="MB" delta={null}                               deltaUp={true}  sparkData={perf?.sparklines?.diskRead}   color={C.orange}  loading={loadingPerf}/>
              <PerfCard label="Disk Write (MB/hr)"    value={diskWrite??0}unit="MB" delta={null}                               deltaUp={true}  sparkData={perf?.sparklines?.diskWrite}  color={C.primary} loading={loadingPerf}/>
            </div>
            {/* Per-instance breakdown table */}
            <div style={{background:C.bg,borderRadius:C.rSm,padding:"14px 16px",border:`1px solid ${C.border}`}}>
              <div style={{fontSize:10,color:C.textMute,fontFamily:C.mono,marginBottom:10,textTransform:"uppercase",letterSpacing:"0.07em"}}>Per-Instance Breakdown</div>
              {loadingPerf
                ?<div style={{textAlign:"center",padding:"20px",color:C.textMute,fontSize:12}}>Loading EC2 metrics from CloudWatch…</div>
                :<EC2Table instances={perf?.instances}/>
              }
            </div>
          </div>

          {/* ── Row 5: Canary + Cost + Service Status ── */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1.2fr 1fr",gap:14,marginBottom:22}}>
            <div style={{background:C.surface,borderRadius:C.r,padding:"18px 20px",boxShadow:C.shadow,border:`1px solid ${C.border}`}}>
              <SectionHeader title="Canary Monitoring"/>
              {!canaryData
                ? <div style={{textAlign:"center",padding:"20px",color:C.textMute,fontSize:12}}>Loading canary data…</div>
                : <>
                  <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:14}}>
                    <div style={{position:"relative",width:90,height:90}}>
                      <svg width={90} height={90} style={{transform:"rotate(-90deg)"}}>
                        <circle cx={45} cy={45} r={36} fill="none" stroke={C.border} strokeWidth={8}/>
                        <circle cx={45} cy={45} r={36} fill="none" stroke={canaryData.summary.successRate>=80?C.green:C.red} strokeWidth={8}
                          strokeDasharray={`${(canaryData.summary.successRate/100)*2*Math.PI*36} ${2*Math.PI*36}`} strokeLinecap="round"/>
                      </svg>
                      <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
                        <div style={{fontSize:16,fontWeight:800,color:canaryData.summary.successRate>=80?C.green:C.red,fontFamily:C.mono}}>{canaryData.summary.successRate}%</div>
                        <div style={{fontSize:8,color:C.textMute}}>Success</div>
                      </div>
                    </div>
                    <div style={{flex:1}}>
                      {[["Total",canaryData.summary.total,C.text],["Running",canaryData.summary.running,C.blue],["Passed",canaryData.summary.passed,C.green],["Failed",canaryData.summary.failed,C.red]].map(([l,v,c])=>(
                        <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"3px 0",borderBottom:`1px solid ${C.borderSoft}`}}>
                          <span style={{fontSize:11,color:C.textSub}}>{l}</span>
                          <span style={{fontSize:12,fontWeight:700,color:c,fontFamily:C.mono}}>{v}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{fontSize:10,color:C.textMute,marginBottom:6,textTransform:"uppercase",letterSpacing:"0.06em"}}>Canaries</div>
                  <div style={{display:"flex",flexDirection:"column",gap:4,maxHeight:240,overflowY:"auto"}}>
                    {canaryData.canaries.map(c=>(
                      <div key={c.name} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"4px 6px",borderRadius:4,background:C.bg,fontSize:11}}>
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          <div style={{width:7,height:7,borderRadius:"50%",background:c.state==="RUNNING"?C.green:C.textMute,flexShrink:0}}/>
                          <span style={{color:C.text,fontWeight:500}}>{c.name}</span>
                        </div>
                        <div style={{display:"flex",gap:6,alignItems:"center"}}>
                          <span style={{fontSize:10,color:C.textMute}}>{c.state}</span>
                          {c.lastRun
                            ? <span style={{fontSize:10,fontWeight:700,
                                color:c.lastRun.status==="PASSED"?C.green:c.lastRun.status==="FAILED"?C.red:C.textMute,
                                background:c.lastRun.status==="PASSED"?C.greenBg:c.lastRun.status==="FAILED"?C.redBg:C.bg,
                                padding:"1px 6px",borderRadius:8}}>{c.lastRun.status}</span>
                            : <span style={{fontSize:10,fontWeight:700,color:C.textMute,background:C.bg,padding:"1px 6px",borderRadius:8}}>No Data</span>
                          }
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              }
            </div>

            <div style={{background:C.surface,borderRadius:C.r,padding:"18px 20px",boxShadow:C.shadow,border:`1px solid ${C.border}`}}>
              <SectionHeader title="AWS Cost Summary"/>
              <div style={{marginBottom:8}}>
                <div style={{fontSize:10,color:C.textSub}}>This Month {costData?.month ? `(${costData.month})` : ""}</div>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <span style={{fontSize:26,fontWeight:800,color:C.text,fontFamily:C.mono}}>
                    {costTotal !== null ? `$${costTotal.toLocaleString()}` : "Loading…"}
                  </span>
                </div>
              </div>
              <Spark data={costLine} color={C.primary} w={300} h={40}/>
              <div style={{display:"flex",alignItems:"center",gap:12,marginTop:12}}>
                <Donut segments={costDonut} size={80} thickness={14}
                  label={costTotal !== null ? `$${costTotal >= 1000 ? (costTotal/1000).toFixed(1)+"K" : costTotal}` : "…"}
                  sublabel="Total"/>
                <div style={{flex:1}}>
                  {costDonut.map((r,i)=>{
                    const pct = costTotal ? Math.round((r.value/costTotal)*100)+"%" : "";
                    return (
                      <div key={r.label} style={{display:"flex",justifyContent:"space-between",padding:"2px 0",fontSize:11}}>
                        <div style={{display:"flex",alignItems:"center",gap:5}}><div style={{width:7,height:7,borderRadius:"50%",background:r.color}}/><span style={{color:C.textSub}}>{r.label}</span></div>
                        <div style={{display:"flex",gap:6}}><span style={{color:C.text,fontWeight:600,fontFamily:C.mono}}>${r.value.toLocaleString()}</span><span style={{color:C.textMute}}>{pct}</span></div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div style={{background:C.surface,borderRadius:C.r,padding:"18px 20px",boxShadow:C.shadow,border:`1px solid ${C.border}`}}>
              <SectionHeader title="Service Status"/>
              {["AWS/RDS","AWS/EC2","AWS/Lambda","AWS/ApiGateway","AWS/ECS","AWS/CloudFront"].map(ns=>{
                const {status,color}=getServiceStatus(ns);
                return (
                  <div key={ns} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:`1px solid ${C.borderSoft}`}}>
                    <div style={{display:"flex",alignItems:"center",gap:7}}>
                      <div style={{width:7,height:7,borderRadius:"50%",background:color,flexShrink:0}}/>
                      <span style={{fontSize:11,color:C.text,fontWeight:500}}>{ns.replace("AWS/","")}</span>
                    </div>
                    <span style={{fontSize:11,color,fontWeight:700}}>{status}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Row 6: Quick Actions ── */}
          <div style={{background:C.surface,borderRadius:C.r,padding:"18px 20px",boxShadow:C.shadow,border:`1px solid ${C.border}`}}>
            <SectionHeader title="Quick Actions"/>
            <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:10}}>
              {[
                {icon:"⚠️",label:"Create Incident",   bg:"#fff5f5",     color:C.red},
                {icon:"🐦",label:"Run Canary Test",   bg:C.blueBg,      color:C.blue},
                {icon:"📋",label:"View Logs",          bg:C.purpleBg,    color:C.purple},
                {icon:"💰",label:"Cost Report",        bg:C.greenBg,     color:C.green},
                {icon:"⚡",label:"AI Analysis",        bg:C.primaryLight,color:C.primary,fn:()=>{setAiTarget(null);setShowAI(true);}},
                {icon:"🔄",label:"Refresh All",        bg:C.bg,          color:C.textSub,fn:loadAll},
              ].map(a=>(
                <button key={a.label} onClick={a.fn||undefined}
                  style={{background:a.bg,border:`1px solid ${C.border}`,borderRadius:C.rSm,padding:"14px 8px",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:6,transition:"all 0.15s"}}
                  onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow=C.shadowMd;}}
                  onMouseLeave={e=>{e.currentTarget.style.transform="";e.currentTarget.style.boxShadow="";}}>
                  <span style={{fontSize:22}}>{a.icon}</span>
                  <span style={{fontSize:10,fontWeight:700,color:a.color,textAlign:"center",lineHeight:1.3}}>{a.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div style={{textAlign:"center",padding:"20px 0 0",fontSize:11,color:C.textMute}}>
            © 2024 eLit. All rights reserved. &nbsp;·&nbsp; Dashboard v4.0 &nbsp;·&nbsp; AWS CloudWatch + EC2 Metrics Live
          </div>
          </div>}{/* end overview */}
        </div>
      </div>

      {selected&&<AlarmDetail alarm={selected} onClose={()=>setSelected(null)} onAnalyze={()=>{setAiTarget(selected);setSelected(null);setShowAI(true);}}/>}
      {showAI&&aiPerfTarget
        ? <PerfAnalysisModal perfTarget={aiPerfTarget} onClose={()=>{setShowAI(false);setAiPerfTarget(null);}}/>
        : showAI&&<AIModal alarms={alarms} target={aiTarget} perfTarget={null} onClose={()=>{setShowAI(false);setAiTarget(null);}}/>
      }
    </div>
  );
}
