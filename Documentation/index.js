const express = require("express");
const cors    = require("cors");
const {
  CloudWatchClient,
  DescribeAlarmsCommand
} = require("@aws-sdk/client-cloudwatch");

const app    = express();
const client = new CloudWatchClient({ region: "ap-southeast-1" });

app.use(cors());

// ── GET /alarms — returns all CloudWatch alarms ──────────────────────────────
app.get("/alarms", async (req, res) => {
  try {
    const command  = new DescribeAlarmsCommand({ MaxRecords: 100 });
    const response = await client.send(command);

    const alarms = response.MetricAlarms.map(a => ({
      name:      a.AlarmName,
      namespace: a.Namespace,
      metric:    a.MetricName,
      resource:  a.Dimensions?.[0]?.Value || "N/A",
      threshold: a.Threshold,
      unit:      a.Unit || "Count",
      state:     a.StateValue,          // ALARM, OK, INSUFFICIENT_DATA
      severity:  a.StateValue === "ALARM" ? "CRITICAL" : "INFO",
      time:      new Date(a.StateUpdatedTimestamp).toLocaleTimeString("en-SG"),
      type:      a.Namespace?.replace("AWS/", "") || "AWS",
      region:    "ap-southeast-1",
      period:    a.Period,
      evaluationPeriods: a.EvaluationPeriods,
      comparisonOperator: a.ComparisonOperator,
    }));

    res.json(alarms);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(3001, () =>
  console.log("✅ CloudWatch API running on http://localhost:3001")
);
