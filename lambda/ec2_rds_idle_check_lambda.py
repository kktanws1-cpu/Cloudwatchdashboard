"""
EC2/RDS Left-Running Check + Auto-Shutdown Lambda

Runs weekday evenings 8pm SGT (12:00 UTC Mon-Fri) via EventBridge.
- Lists all EC2 instances in `running` state across configured regions
- Lists all RDS instances in `available` state across configured regions
- For each: pulls last 1h avg CPU from CloudWatch and uptime
- If AUTO_STOP_EC2=true → automatically stops running EC2 instances
- Posts a single Slack message summarising what was found and stopped

Environment variables:
  SLACK_WEBHOOK   - Slack incoming webhook URL
  REGIONS         - Comma-separated AWS regions (default: ap-southeast-1)
  CPU_PERIOD_MIN  - Minutes of CPU history to average (default: 60)
  AUTO_STOP_EC2   - "true" to automatically stop running EC2 (default: "true")
  EXCLUDE_TAG_KEY - EC2s with this tag key/value are NOT stopped (default: "KeepRunning")
  EXCLUDE_TAG_VAL - Tag value to skip (default: "true")
"""
import json
import os
import urllib3
import boto3
from datetime import datetime, timedelta, timezone

SLACK_WEBHOOK   = os.environ.get("SLACK_WEBHOOK", "")
REGIONS         = [r.strip() for r in os.environ.get("REGIONS", "ap-southeast-1").split(",") if r.strip()]
CPU_PERIOD_MIN  = int(os.environ.get("CPU_PERIOD_MIN", "60"))
AUTO_STOP_EC2   = os.environ.get("AUTO_STOP_EC2", "true").lower() == "true"
EXCLUDE_TAG_KEY = os.environ.get("EXCLUDE_TAG_KEY", "KeepRunning")
EXCLUDE_TAG_VAL = os.environ.get("EXCLUDE_TAG_VAL", "true")

http = urllib3.PoolManager()


def lambda_handler(event, context):
    print(f"Checking left-running EC2/RDS in regions: {REGIONS} | AUTO_STOP_EC2={AUTO_STOP_EC2}")

    ec2_running = []
    rds_running = []

    for region in REGIONS:
        ec2_running.extend(list_ec2(region))
        rds_running.extend(list_rds(region))

    print(f"Found {len(ec2_running)} EC2 running, {len(rds_running)} RDS available")

    # Auto-shutdown running EC2s (unless excluded by tag)
    stopped, skipped = [], []
    if AUTO_STOP_EC2 and ec2_running:
        stopped, skipped = stop_running_ec2s(ec2_running)
        print(f"Stopped {len(stopped)}, skipped {len(skipped)}")

    send_slack(ec2_running, rds_running, stopped, skipped)

    return {
        "statusCode": 200,
        "body": json.dumps({
            "ec2Count":    len(ec2_running),
            "rdsCount":    len(rds_running),
            "stoppedCount": len(stopped),
            "skippedCount": len(skipped),
        }),
    }


def stop_running_ec2s(ec2_list):
    """Stop all running EC2 instances except those with the exclude tag."""
    stopped, skipped = [], []
    # Group by region for a single StopInstances call per region
    by_region = {}
    for e in ec2_list:
        # Skip if tagged with EXCLUDE_TAG_KEY=EXCLUDE_TAG_VAL
        if any(t.get("Key") == EXCLUDE_TAG_KEY and t.get("Value") == EXCLUDE_TAG_VAL
               for t in e.get("tags", [])):
            skipped.append(e)
            continue
        by_region.setdefault(e["region"], []).append(e)

    for region, entries in by_region.items():
        ids = [e["id"] for e in entries]
        try:
            boto3.client("ec2", region_name=region).stop_instances(InstanceIds=ids)
            stopped.extend(entries)
            print(f"  Sent stop for {region}: {ids}")
        except Exception as err:
            print(f"  Failed to stop in {region}: {err}")
    return stopped, skipped


def list_ec2(region):
    ec2 = boto3.client("ec2", region_name=region)
    cw  = boto3.client("cloudwatch", region_name=region)
    results = []
    try:
        paginator = ec2.get_paginator("describe_instances")
        for page in paginator.paginate(Filters=[{"Name": "instance-state-name", "Values": ["running"]}]):
            for res in page.get("Reservations", []):
                for inst in res.get("Instances", []):
                    iid  = inst["InstanceId"]
                    name = tag_value(inst.get("Tags", []), "Name") or "(no Name tag)"
                    results.append({
                        "region":   region,
                        "id":       iid,
                        "name":     name,
                        "type":     inst.get("InstanceType", "?"),
                        "launched": inst.get("LaunchTime"),
                        "uptimeH":  uptime_hours(inst.get("LaunchTime")),
                        "cpuAvg":   ec2_cpu_avg(cw, iid),
                        "tags":     inst.get("Tags", []),
                    })
    except Exception as e:
        print(f"  EC2 error in {region}: {e}")
    return results


def list_rds(region):
    rds = boto3.client("rds", region_name=region)
    cw  = boto3.client("cloudwatch", region_name=region)
    results = []
    try:
        paginator = rds.get_paginator("describe_db_instances")
        for page in paginator.paginate():
            for db in page.get("DBInstances", []):
                if db.get("DBInstanceStatus") != "available":
                    continue
                dbid = db["DBInstanceIdentifier"]
                results.append({
                    "region":   region,
                    "id":       dbid,
                    "engine":   db.get("Engine", "?"),
                    "class":    db.get("DBInstanceClass", "?"),
                    "launched": db.get("InstanceCreateTime"),
                    "uptimeH":  uptime_hours(db.get("InstanceCreateTime")),
                    "cpuAvg":   rds_cpu_avg(cw, dbid),
                })
    except Exception as e:
        print(f"  RDS error in {region}: {e}")
    return results


def tag_value(tags, key):
    for t in tags or []:
        if t.get("Key") == key:
            return t.get("Value")
    return None


def uptime_hours(launch_time):
    if not launch_time:
        return None
    delta = datetime.now(timezone.utc) - launch_time
    return round(delta.total_seconds() / 3600, 1)


def ec2_cpu_avg(cw, instance_id):
    return _cpu_avg(cw, "AWS/EC2", "InstanceId", instance_id)


def rds_cpu_avg(cw, db_id):
    return _cpu_avg(cw, "AWS/RDS", "DBInstanceIdentifier", db_id)


def _cpu_avg(cw, namespace, dim_name, dim_value):
    end   = datetime.now(timezone.utc)
    start = end - timedelta(minutes=CPU_PERIOD_MIN)
    try:
        resp = cw.get_metric_statistics(
            Namespace=namespace,
            MetricName="CPUUtilization",
            Dimensions=[{"Name": dim_name, "Value": dim_value}],
            StartTime=start,
            EndTime=end,
            Period=300,
            Statistics=["Average"],
        )
        pts = resp.get("Datapoints", [])
        if not pts:
            return None
        return round(sum(p["Average"] for p in pts) / len(pts), 1)
    except Exception as e:
        print(f"  CPU error for {dim_value}: {e}")
        return None


def format_uptime(hours):
    if hours is None:
        return "?"
    if hours < 24:
        return f"{hours}h"
    return f"{round(hours / 24, 1)}d"


def format_cpu(cpu):
    return f"{cpu}%" if cpu is not None else "—"


def send_slack(ec2s, rdss, stopped=None, skipped=None):
    if not SLACK_WEBHOOK:
        print("SLACK_WEBHOOK not set, skipping notification")
        return

    stopped = stopped or []
    skipped = skipped or []
    total   = len(ec2s) + len(rdss)
    now     = datetime.now(timezone.utc).strftime("%d %b %Y, %H:%M UTC")

    if total == 0:
        message = {
            "text": "✅ EC2/RDS Check — nothing left running.",
            "blocks": [
                {"type": "section", "text": {"type": "mrkdwn", "text": "✅ *EC2/RDS Check* — no running EC2 or available RDS instances in: " + ", ".join(REGIONS)}},
                {"type": "context", "elements": [{"type": "mrkdwn", "text": f"📅 {now}  |  Lambda"}]},
            ],
        }
    else:
        sections = []
        if ec2s:
            lines = []
            for e in ec2s:
                status_tag = ""
                if any(s["id"] == e["id"] for s in stopped):
                    status_tag = " 🛑 *STOPPING*"
                elif any(s["id"] == e["id"] for s in skipped):
                    status_tag = f" ⚙️ _skipped ({EXCLUDE_TAG_KEY}={EXCLUDE_TAG_VAL})_"
                elif not AUTO_STOP_EC2:
                    status_tag = " ⏸ _auto-stop disabled_"
                lines.append(
                    f"• *{e['name']}* (`{e['id']}`) — {e['type']} • up {format_uptime(e['uptimeH'])} • CPU {format_cpu(e['cpuAvg'])} • _{e['region']}_{status_tag}"
                )
            header = "*🖥️ EC2 running"
            if stopped:
                header += f" — {len(stopped)} stopped automatically"
            header += f" ({len(ec2s)}):*"
            sections.append({"type": "section", "text": {"type": "mrkdwn", "text": header + "\n" + "\n".join(lines)}})
        if rdss:
            lines = [
                f"• *{d['id']}* — {d['engine']} {d['class']} • up {format_uptime(d['uptimeH'])} • CPU {format_cpu(d['cpuAvg'])} • _{d['region']}_ ⏸ _RDS not auto-stopped_"
                for d in rdss
            ]
            sections.append({"type": "section", "text": {"type": "mrkdwn", "text": f"*🗄️ RDS available ({len(rdss)}):*\n" + "\n".join(lines)}})

        header_text = f"⏰ {total} resource(s) still running"
        if stopped:
            header_text = f"🛑 Auto-stopped {len(stopped)} EC2  |  ⏰ {total} resource(s) found"

        message = {
            "text": header_text,
            "blocks": [
                {"type": "header", "text": {"type": "plain_text", "text": header_text, "emoji": True}},
                *sections,
                {"type": "context", "elements": [{"type": "mrkdwn", "text": f"📅 {now}  |  Regions: {', '.join(REGIONS)}  |  AUTO_STOP_EC2={AUTO_STOP_EC2}  |  Lambda"}]},
            ],
        }

    try:
        resp = http.request(
            "POST", SLACK_WEBHOOK,
            body=json.dumps(message, default=str),
            headers={"Content-Type": "application/json"},
        )
        print(f"Slack response: {resp.status}")
    except Exception as e:
        print(f"Error sending Slack: {e}")
