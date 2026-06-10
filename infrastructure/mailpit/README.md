# Mailpit on EC2

Deploys a single EC2 instance running [Mailpit](https://mailpit.axllent.org/)
in Docker — a fake SMTP server with a web UI for viewing captured emails.
Useful for testing the alert/notification emails sent from the CloudWatch
dashboard backend without delivering to real inboxes.

- **Web UI:** `http://<elastic-ip>:8025`
- **SMTP endpoint:** `<elastic-ip>:1025` (no authentication required)
- **Instance access:** AWS Systems Manager Session Manager (no SSH key needed)

## Prerequisites

- An AWS account with a VPC that has a **public subnet** (a subnet with a
  route to an Internet Gateway).
- AWS CLI configured with credentials that can create EC2, IAM, and EIP
  resources.
- Your IP address (for the `AllowedCidr` parameter), e.g. via `curl ifconfig.me`.

## Deploy

```bash
aws cloudformation deploy \
  --template-file infrastructure/mailpit/template.yaml \
  --stack-name mailpit \
  --capabilities CAPABILITY_IAM \
  --region ap-southeast-1 \
  --parameter-overrides \
    VpcId=vpc-xxxxxxxx \
    SubnetId=subnet-xxxxxxxx \
    AllowedCidr=203.0.113.4/32
```

Get the web UI URL and SMTP endpoint once the stack is created:

```bash
aws cloudformation describe-stacks \
  --stack-name mailpit \
  --region ap-southeast-1 \
  --query "Stacks[0].Outputs"
```

## Using it

Point any app's SMTP settings (e.g. the CloudWatch dashboard's alerting
backend) at the `SmtpEndpoint` output, port `1025`, with no
username/password. Open the `MailpitWebUI` output in a browser to view
captured emails.

## Managing the instance

Connect without SSH via Session Manager:

```bash
aws ssm start-session --target <InstanceId>
```

Captured emails are persisted to `/opt/mailpit/data/mailpit.db` on the
instance's EBS volume, so they survive container/instance restarts.

## Tear down

```bash
aws cloudformation delete-stack --stack-name mailpit --region ap-southeast-1
```

## Notes

- `AllowedCidr` restricts both the web UI and SMTP port — scope it to your
  office/VPN IP rather than `0.0.0.0/0`, since captured emails may contain
  sensitive content.
- `t3.micro` is Free Tier eligible. Stop the instance when not in use to
  avoid ongoing compute charges (the Elastic IP and EBS volume incur small
  charges regardless).
