const express = require("express");
const cors    = require("cors");
const {
  CloudWatchClient,
  DescribeAlarmsCommand,
  GetMetricStatisticsCommand,
  ListMetricsCommand,
} = require("@aws-sdk/client-cloudwatch");
const {
  CostExplorerClient,
  GetCostAndUsageCommand,
} = require("@aws-sdk/client-cost-explorer");
const {
  SyntheticsClient,
  DescribeCanariesCommand,
  DescribeCanariesLastRunCommand,
  GetCanaryRunsCommand,
} = require("@aws-sdk/client-synthetics");
const {
  RDSClient,
  DescribeDBInstancesCommand,
  DescribeDBClustersCommand,
} = require("@aws-sdk/client-rds");

const app    = express();
const client = new CloudWatchClient({ region: "ap-southeast-1" });
// Cost Explorer must always use us-east-1
const ceClient  = new CostExplorerClient({ region: "us-east-1" });
const synClient = new SyntheticsClient({ region: "ap-southeast-1" });
const rdsClient = new RDSClient({ region: "ap-southeast-1" });

app.use(cors());

// ── Helper: fetch a single metric's datapoints ───────────────────────────────
async function getMetric({ namespace, metricName, dimensions, stat, unit }) {
  const now   = new Date();
  const start = new Date(now.getTime() - 24 * 60 * 60 * 1000); // last 24h
  try {
    const cmd = new GetMetricStatisticsCommand({
      Namespace:  namespace,
      MetricName: metricName,
      Dimensions: dimensions,
      StartTime:  start,
      EndTime:    now,
      Period:     3600,   // 1-hour buckets
      Statistics: [stat],
      Unit:       unit,
    });
    const res = await client.send(cmd);
    const pts = res.Datapoints.sort((a, b) => a.Timestamp - b.Timestamp);
    return pts.map(p => p[stat] ?? 0);
  } catch {
    return [];
  }
}

// ── Helper: average of an array ───────────────────────────────────────────────
function avg(arr) {
  if (!arr.length) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

// ── GET /alarms — real CloudWatch alarms ──────────────────────────────────────
app.get("/alarms", async (req, res) => {
  try {
    const command  = new DescribeAlarmsCommand({ MaxRecords: 100 });
    const response = await client.send(command);

    const alarms = response.MetricAlarms.map(a => ({
      name:               a.AlarmName,
      namespace:          a.Namespace,
      metric:             a.MetricName,
      resource:           a.Dimensions?.[0]?.Value || "N/A",
      threshold:          a.Threshold,
      unit:               a.Unit || "Count",
      state:              a.StateValue,
      severity:           a.StateValue === "ALARM" ? "CRITICAL" : "INFO",
      time:               new Date(a.StateUpdatedTimestamp).toLocaleTimeString("en-SG"),
      type:               a.Namespace?.replace("AWS/", "") || "AWS",
      region:             "ap-southeast-1",
      period:             a.Period,
      evaluationPeriods:  a.EvaluationPeriods,
      comparisonOperator: a.ComparisonOperator,
    }));

    res.json(alarms);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /ec2-instances — list all EC2 instance IDs from CloudWatch ────────────
app.get("/ec2-instances", async (req, res) => {
  try {
    const cmd = new ListMetricsCommand({
      Namespace:  "AWS/EC2",
      MetricName: "CPUUtilization",
    });
    const response = await client.send(cmd);
    const instances = [
      ...new Set(
        response.Metrics
          .flatMap(m => m.Dimensions)
          .filter(d => d.Name === "InstanceId")
          .map(d => d.Value)
      )
    ];
    res.json(instances);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /performance — real EC2 metrics for last 24h ─────────────────────────
app.get("/performance", async (req, res) => {
  try {
    // Step 1: discover all EC2 instances that have metrics
    const listCmd  = new ListMetricsCommand({ Namespace: "AWS/EC2", MetricName: "CPUUtilization" });
    const listResp = await client.send(listCmd);
    const instanceIds = [
      ...new Set(
        listResp.Metrics
          .flatMap(m => m.Dimensions)
          .filter(d => d.Name === "InstanceId")
          .map(d => d.Value)
      )
    ];

    if (!instanceIds.length) {
      return res.json({
        instances: [],
        summary: { avgCpu: 0, avgNetworkIn: 0, avgNetworkOut: 0, avgDiskRead: 0, avgDiskWrite: 0 },
        sparklines: { cpu: [], networkIn: [], networkOut: [] },
        message: "No EC2 instances found with CloudWatch metrics"
      });
    }

    // Step 2: fetch metrics for each instance
    const instanceData = await Promise.all(
      instanceIds.slice(0, 10).map(async instanceId => {   // cap at 10 instances
        const dims = [{ Name: "InstanceId", Value: instanceId }];

        const [cpu, netIn, netOut, diskRead, diskWrite] = await Promise.all([
          getMetric({ namespace: "AWS/EC2", metricName: "CPUUtilization",    dimensions: dims, stat: "Average",  unit: "Percent"  }),
          getMetric({ namespace: "AWS/EC2", metricName: "NetworkIn",         dimensions: dims, stat: "Sum",      unit: "Bytes"    }),
          getMetric({ namespace: "AWS/EC2", metricName: "NetworkOut",        dimensions: dims, stat: "Sum",      unit: "Bytes"    }),
          getMetric({ namespace: "AWS/EC2", metricName: "DiskReadBytes",     dimensions: dims, stat: "Sum",      unit: "Bytes"    }),
          getMetric({ namespace: "AWS/EC2", metricName: "DiskWriteBytes",    dimensions: dims, stat: "Sum",      unit: "Bytes"    }),
        ]);

        return {
          instanceId,
          cpu:       { points: cpu,       avg: +avg(cpu).toFixed(2),                  unit: "%" },
          networkIn: { points: netIn,      avg: +(avg(netIn)  / 1024 / 1024).toFixed(2), unit: "MB" },
          networkOut:{ points: netOut,     avg: +(avg(netOut) / 1024 / 1024).toFixed(2), unit: "MB" },
          diskRead:  { points: diskRead,   avg: +(avg(diskRead)  / 1024 / 1024).toFixed(2), unit: "MB" },
          diskWrite: { points: diskWrite,  avg: +(avg(diskWrite) / 1024 / 1024).toFixed(2), unit: "MB" },
        };
      })
    );

    // Step 3: aggregate across all instances for summary cards
    const allCpu      = instanceData.flatMap(i => i.cpu.points);
    const allNetIn    = instanceData.flatMap(i => i.networkIn.points);
    const allNetOut   = instanceData.flatMap(i => i.networkOut.points);
    const allDiskRead = instanceData.flatMap(i => i.diskRead.points);
    const allDiskWrite= instanceData.flatMap(i => i.diskWrite.points);

    // Step 4: build hourly sparkline (last 24 points)
    const pad = (arr, n=24) => {
      const padded = Array(n).fill(0);
      arr.slice(-n).forEach((v, i) => { padded[i + Math.max(0, n - arr.length)] = v; });
      return padded;
    };

    res.json({
      instances: instanceData,
      summary: {
        avgCpu:        +avg(allCpu).toFixed(2),
        avgNetworkIn:  +(avg(allNetIn)  / 1024 / 1024).toFixed(2),
        avgNetworkOut: +(avg(allNetOut) / 1024 / 1024).toFixed(2),
        avgDiskRead:   +(avg(allDiskRead)  / 1024 / 1024).toFixed(2),
        avgDiskWrite:  +(avg(allDiskWrite) / 1024 / 1024).toFixed(2),
      },
      sparklines: {
        cpu:       pad(allCpu.slice(-24)),
        networkIn: pad(allNetIn.map(v => v / 1024 / 1024).slice(-24)),
        networkOut:pad(allNetOut.map(v => v / 1024 / 1024).slice(-24)),
        diskRead:  pad(allDiskRead.map(v => v / 1024 / 1024).slice(-24)),
        diskWrite: pad(allDiskWrite.map(v => v / 1024 / 1024).slice(-24)),
      },
      instanceCount: instanceIds.length,
      lastUpdated:   new Date().toLocaleTimeString("en-SG"),
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /cost — real AWS Cost Explorer data with last 2 months comparison ────
app.get("/cost", async (req, res) => {
  const now = new Date();

  // Helper to get month boundaries
  const monthStart = (offset = 0) => {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  };
  const monthEnd = (offset = 0) => {
    const d = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
    const end = new Date(Math.min(d, now));
    return end.toISOString().slice(0, 10);
  };

  try {
    // Fetch current month, last month and month before — all in one API call
    const histCmd = new GetCostAndUsageCommand({
      TimePeriod:  { Start: monthStart(-2), End: monthEnd(0) },
      Granularity: "MONTHLY",
      Metrics:     ["UnblendedCost"],
      GroupBy:     [{ Type: "DIMENSION", Key: "SERVICE" }],
    });
    const histResp = await ceClient.send(histCmd);
    const months = histResp.ResultsByTime || [];

    const parseMonth = (data) => {
      if (!data) return { total: 0, services: [], month: "" };
      const services = (data.Groups || [])
        .map(g => ({
          name:   g.Keys[0].replace("Amazon ", "").replace("AWS ", ""),
          amount: +parseFloat(g.Metrics.UnblendedCost.Amount).toFixed(2),
        }))
        .filter(s => s.amount > 0)
        .sort((a, b) => b.amount - a.amount);
      return {
        total:    +services.reduce((s, v) => s + v.amount, 0).toFixed(2),
        services,
        month:    data.TimePeriod.Start.slice(0, 7),
      };
    };

    const current  = parseMonth(months[months.length - 1]);
    const lastMonth = parseMonth(months[months.length - 2]);
    const twoMonths = parseMonth(months[months.length - 3]);

    // % change helper
    const pctChange = (curr, prev) => {
      if (!prev || prev === 0) return null;
      return +(((curr - prev) / prev) * 100).toFixed(1);
    };

    // Daily trend for sparkline (last 30 days)
    const trendStart = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const trendCmd = new GetCostAndUsageCommand({
      TimePeriod:  { Start: trendStart, End: now.toISOString().slice(0, 10) },
      Granularity: "DAILY",
      Metrics:     ["UnblendedCost"],
    });
    const trendResp = await ceClient.send(trendCmd);
    const trend = (trendResp.ResultsByTime || []).map(r =>
      +parseFloat(r.Total.UnblendedCost.Amount).toFixed(2)
    );

    res.json({
      total:    current.total,
      services: current.services,
      trend,
      month:    current.month,
      history: [
        { ...twoMonths,  pctVsPrev: pctChange(twoMonths.total,  null) },
        { ...lastMonth,  pctVsPrev: pctChange(lastMonth.total,  twoMonths.total) },
        { ...current,    pctVsPrev: pctChange(current.total,    lastMonth.total) },
      ],
    });
  } catch (err) {
    console.error("Cost Explorer error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /canary — real CloudWatch Synthetics canary data ─────────────────────
app.get("/canary", async (req, res) => {
  try {
    // Fetch canary definitions and their authoritative last-run status in parallel
    const [listResp, lastRunResp] = await Promise.all([
      synClient.send(new DescribeCanariesCommand({ MaxResults: 20 })),
      synClient.send(new DescribeCanariesLastRunCommand({ MaxResults: 20 })),
    ]);
    const canaries = listResp.Canaries || [];

    // Build a map of name -> last run from the dedicated last-run API (matches AWS Console)
    const lastRunMap = {};
    for (const entry of (lastRunResp.CanariesLastRun || [])) {
      const run = entry.LastRun;
      if (run) {
        lastRunMap[entry.CanaryName] = {
          status:    run.Status?.State || "UNKNOWN",
          startedAt: run.Timeline?.Started,
          duration:  run.Timeline?.Duration || 0,
        };
      }
    }

    const canaryData = await Promise.all(
      canaries.map(async c => {
        try {
          const runResp = await synClient.send(new GetCanaryRunsCommand({ Name: c.Name, MaxResults: 10 }));
          const runs = (runResp.CanaryRuns || []).sort((a, b) =>
            new Date(b.Timeline?.Started || 0) - new Date(a.Timeline?.Started || 0)
          );
          const passed = runs.filter(r => r.Status?.State === "PASSED").length;
          const successRate = runs.length ? +(passed / runs.length * 100).toFixed(1) : null;

          // Use DescribeCanariesLastRun as the authoritative last run status
          const lastRun = lastRunMap[c.Name] || null;

          return {
            name:        c.Name,
            state:       c.Status?.State || "UNKNOWN",
            schedule:    c.Schedule?.Expression || "",
            lastRun,
            successRate,
            recentRuns:  runs.slice(0, 5).map(r => ({
              status:    r.Status?.State,
              startedAt: r.Timeline?.Started,
              duration:  r.Timeline?.Duration || 0,
            })),
          };
        } catch {
          return { name: c.Name, state: c.Status?.State || "UNKNOWN", schedule: c.Schedule?.Expression || "", lastRun: lastRunMap[c.Name] || null, successRate: null, recentRuns: [] };
        }
      })
    );

    const total   = canaryData.length;
    const passed  = canaryData.filter(c => c.lastRun?.status === "PASSED").length;
    const failed  = canaryData.filter(c => c.lastRun?.status === "FAILED").length;
    const running = canaryData.filter(c => c.state === "RUNNING").length;
    const overallRate = total ? +(passed / canaryData.filter(c => c.lastRun).length * 100).toFixed(1) : 0;

    res.json({ canaries: canaryData, summary: { total, passed, failed, running, successRate: overallRate } });
  } catch (err) {
    console.error("Canary error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Helper: discover all live RDS resources (instances + clusters) ────────────
async function discoverRDS() {
  const [instancesResult, clustersResult] = await Promise.allSettled([
    rdsClient.send(new DescribeDBInstancesCommand({})),
    rdsClient.send(new DescribeDBClustersCommand({})),
  ]);

  // Standalone instances (SQL Server, MySQL, PostgreSQL, etc.)
  const instances = instancesResult.status === "fulfilled"
    ? (instancesResult.value.DBInstances || []).map(db => ({
        id:     db.DBInstanceIdentifier,
        status: db.DBInstanceStatus,
        engine: db.Engine,
        class:  db.DBInstanceClass,
        type:   "instance",
      }))
    : [];

  // Aurora clusters — exclude instance members already listed above
  const instanceIds = new Set(instances.map(i => i.id));
  const clusters = clustersResult.status === "fulfilled"
    ? (clustersResult.value.DBClusters || [])
        .filter(c => !instanceIds.has(c.DBClusterIdentifier))
        .map(c => ({
          id:     c.DBClusterIdentifier,
          status: c.Status,
          engine: c.Engine,
          class:  "cluster",
          type:   "cluster",
        }))
    : [];

  return [...instances, ...clusters];
}

// ── GET /services — real status for EC2, RDS, and other AWS services ─────────
app.get("/services", async (req, res) => {
  const services = {};

  // RDS — all live instances and clusters
  try {
    services.RDS = await discoverRDS();
  } catch { services.RDS = []; }

  // EC2 via CloudWatch metrics
  try {
    const ec2Resp = await client.send(new ListMetricsCommand({ Namespace: "AWS/EC2", MetricName: "CPUUtilization" }));
    const instanceIds = [...new Set(
      ec2Resp.Metrics.flatMap(m => m.Dimensions).filter(d => d.Name === "InstanceId").map(d => d.Value)
    )];
    services.EC2 = instanceIds.map(id => ({ id, status: "reporting-metrics" }));
  } catch { services.EC2 = []; }

  res.json(services);
});

// ── GET /rds-performance — all RDS metrics for last 24h (auto-discovers all) ──
app.get("/rds-performance", async (req, res) => {
  try {
    const allRDS = await discoverRDS();
    if (!allRDS.length) return res.json({ clusters: [], lastUpdated: new Date().toLocaleTimeString("en-SG") });

    const instanceData = await Promise.all(allRDS.map(async inst => {
      // Use the correct dimension key depending on resource type
      const dimKey = inst.type === "cluster" ? "DBClusterIdentifier" : "DBInstanceIdentifier";
      const dims = [{ Name: dimKey, Value: inst.id }];

      const [cpu, connections, memory, readIOPS, writeIOPS, readLatency, writeLatency, freeStorage, dbLoad] = await Promise.all([
        getMetric({ namespace: "AWS/RDS", metricName: "CPUUtilization",     dimensions: dims, stat: "Average", unit: "Percent" }),
        getMetric({ namespace: "AWS/RDS", metricName: "DatabaseConnections",dimensions: dims, stat: "Average", unit: "Count"   }),
        getMetric({ namespace: "AWS/RDS", metricName: "FreeableMemory",     dimensions: dims, stat: "Average", unit: "Bytes"   }),
        getMetric({ namespace: "AWS/RDS", metricName: "ReadIOPS",           dimensions: dims, stat: "Average", unit: "Count/Second" }),
        getMetric({ namespace: "AWS/RDS", metricName: "WriteIOPS",          dimensions: dims, stat: "Average", unit: "Count/Second" }),
        getMetric({ namespace: "AWS/RDS", metricName: "ReadLatency",        dimensions: dims, stat: "Average", unit: "Seconds" }),
        getMetric({ namespace: "AWS/RDS", metricName: "WriteLatency",       dimensions: dims, stat: "Average", unit: "Seconds" }),
        getMetric({ namespace: "AWS/RDS", metricName: "FreeStorageSpace",   dimensions: dims, stat: "Average", unit: "Bytes"   }),
        getMetric({ namespace: "AWS/RDS", metricName: "DBLoad",             dimensions: dims, stat: "Average", unit: "None"    }),
      ]);

      return {
        clusterId: inst.id,
        engine:    inst.engine,
        class:     inst.class,
        status:    inst.status,
        metrics: {
          cpu:          { points: cpu,         avg: +avg(cpu).toFixed(2),                               unit: "%" },
          connections:  { points: connections,  avg: +avg(connections).toFixed(1),                       unit: "" },
          memory:       { points: memory,       avg: +(avg(memory)      / 1024 / 1024 / 1024).toFixed(2), unit: "GB" },
          freeStorage:  { points: freeStorage,  avg: +(avg(freeStorage) / 1024 / 1024 / 1024).toFixed(2), unit: "GB" },
          readIOPS:     { points: readIOPS,     avg: +avg(readIOPS).toFixed(2),                          unit: "/s" },
          writeIOPS:    { points: writeIOPS,    avg: +avg(writeIOPS).toFixed(2),                         unit: "/s" },
          readLatency:  { points: readLatency,  avg: +(avg(readLatency)  * 1000).toFixed(2),             unit: "ms" },
          writeLatency: { points: writeLatency, avg: +(avg(writeLatency) * 1000).toFixed(2),             unit: "ms" },
          dbLoad:       { points: dbLoad,       avg: +avg(dbLoad).toFixed(2),                            unit: "" },
        },
      };
    }));

    res.json({ clusters: instanceData, lastUpdated: new Date().toLocaleTimeString("en-SG") });
  } catch (err) {
    console.error("RDS performance error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(3001, () =>
  console.log("✅ CloudWatch API running on http://localhost:3001")
);
