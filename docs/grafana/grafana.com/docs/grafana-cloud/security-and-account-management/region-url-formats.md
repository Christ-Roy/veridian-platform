---
title: "Determine Grafana Cloud URLs based on region | Grafana Cloud documentation"
description: "Learn how Grafana Cloud URLs are constructed for each region, and how to identify the correct URL for your stack."
---

# Determine Grafana Cloud URLs based on region

Grafana Cloud URLs follow one of two formats, depending on *when* your region was created. The format for a given stack doesn’t change after the stack is created.

Whenever possible, copy the exact URL from your [Grafana Cloud portal](/docs/grafana-cloud/security-and-account-management/cloud-portal/) or the Grafana Cloud application you want to connect to. Refer to [Find a URL in the Grafana Cloud portal](#find-a-url-in-the-grafana-cloud-portal).

## URL format differences

Grafana Cloud uses a flat format for regions created before January 15, 2026, and a nested format for regions created on or after that date.


| Region creation date            | URL format                                                | Example (OTLP gateway)                                    |
|---------------------------------|-----------------------------------------------------------|-----------------------------------------------------------|
| Before 2026-01-15 (flat)        | `<service-host>.grafana.net`                              | `otlp-gateway-prod-us-east-0.grafana.net`                 |
| On or after 2026-01-15 (nested) | `<service-host>.<csp>-<csp-region>-<counter>.grafana.net` | `otlp-gateway-prod-us-east-4.aws-us-east-4-1.grafana.net` |

In the nested format:

- `<service-host>` identifies the service and the cluster, for example, `otlp-gateway-prod-us-east-4` or `prometheus-prod-56-prod-us-east-2`.
- `<csp>` is the cloud provider: `aws`, `gcp`, or `azure`.
- `<csp-region>` is the cloud provider’s region identifier, for example, `us-east-1`, `us-central1`, or `westeurope`.
- `<counter>` distinguishes multiple Grafana Cloud regions hosted in the same cloud provider region.

Only regions listed under [Legacy regions](#legacy-regions) use the flat format. All other regions, including any region created after January 15, 2026, use the nested format.

## Find your region in the Grafana Cloud portal

To determine which region your stack is in, check your Grafana Cloud portal. The portal includes information for every service in your stack, including region, endpoints, and other instance specific settings.

To find the region your stack is in using the portal as the authoritative source:

1. Sign in to your [Grafana Cloud account](/auth/sign-in/?plcmt=top-nav&cta=myaccount).
2. From the **Overview** page, select the organization you want to connect to.
3. Choose your stack and click **Details**.
4. On the Grafana or service card, click **Details**.

If a procedure or code sample in Grafana documentation shows a URL template that you need to adapt, model the URL based on the format (flat or nested) you found in your portal. You can double-check which format to use by comparing the region you see in your portal to the list of [legacy regions](#legacy-regions).

## Legacy regions

The following regions use the flat `<service-host>.grafana.net` format. Any region not listed here uses the nested format.


| Cloud provider | Location                   | Region slug           |
|----------------|----------------------------|-----------------------|
| AWS            | Australia                  | `prod-au-southeast-1` |
| AWS            | Brazil                     | `prod-sa-east-1`      |
| AWS            | Canada                     | `prod-ca-east-0`      |
| AWS            | Germany                    | `prod-eu-west-2`      |
| AWS            | Germany                    | `prod-eu-west-4`      |
| AWS            | India                      | `prod-ap-south-1`     |
| AWS            | Indonesia                  | `prod-ap-southeast-2` |
| AWS            | Ireland                    | `prod-eu-west-6`      |
| AWS            | Japan                      | `prod-ap-northeast-0` |
| AWS            | Singapore                  | `prod-ap-southeast-1` |
| AWS            | Sweden                     | `prod-eu-north-0`     |
| AWS            | Switzerland                | `prod-eu-central-0`   |
| AWS            | UAE                        | `prod-me-central-1`   |
| AWS            | UK                         | `prod-gb-south-1`     |
| AWS            | US East (OH)               | `prod-us-east-0`      |
| AWS            | US East (OH)               | `prod-us-east-2`      |
| AWS            | US East (VA)               | `prod-us-east-3`      |
| AWS            | US West                    | `prod-us-west-0`      |
| Azure          | Germany BYOC               | `prod-eu-west-5`      |
| Azure          | Netherlands                | `prod-eu-west-3`      |
| Azure          | US Central                 | `prod-us-central-7`   |
| GCP            | Australia                  | `prod-au-southeast-0` |
| GCP            | Belgium                    | `prod-eu-west-0`      |
| GCP            | Brazil                     | `prod-sa-east-0`      |
| GCP            | India                      | `prod-ap-south-0`     |
| GCP            | Saudi Arabia               | `prod-me-central-0`   |
| GCP            | Singapore                  | `prod-ap-southeast-0` |
| GCP            | UK                         | `prod-gb-south-0`     |
| GCP            | US Central (dedicated-0)   | `prod-us-central-5`   |
| GCP            | US Central (general-use-0) | `prod-us-central-0`   |
| GCP            | US Central (HG-free-0)     | `prod-us-central-3`   |
| GCP            | US Central (HG-free-1)     | `prod-us-central-4`   |
| GCP            | US East                    | `prod-us-east-1`      |

## Examples

Service URLs appear in several places across Grafana Cloud documentation. The examples below show how the same URL looks for a legacy region and for a new region.

### API and ingestion endpoints

Remote-write, query, and OpenTelemetry endpoints follow the URL formats described above. Grafana Cloud application APIs also follow these patterns.


| Service                 | Legacy region example                              | New region example                                              |
|-------------------------|----------------------------------------------------|-----------------------------------------------------------------|
| Prometheus remote write | `prometheus-prod-03-prod-us-central-0.grafana.net` | `prometheus-prod-56-prod-us-east-2.aws-us-east-4-1.grafana.net` |
| Loki push               | `logs-prod3.grafana.net`                           | `logs-prod-012-prod-us-east-4.aws-us-east-4-1.grafana.net`      |
| OTLP gateway            | `otlp-gateway-prod-us-east-0.grafana.net`          | `otlp-gateway-prod-us-east-4.aws-us-east-4-1.grafana.net`       |

For more information on determining stack instance endpoints, refer to [Find instance endpoints](/docs/grafana-cloud/security-and-account-management/cloud-stacks/#find-instance-endpoints) in the Grafana Cloud Stack documentation.

### Private connectivity

Hostnames used with [AWS PrivateLink](/docs/grafana-cloud/send-data/aws-privatelink/), [Azure Private Link](/docs/grafana-cloud/send-data/azure-privatelink/), and [GCP Private Service Connect](/docs/grafana-cloud/send-data/gcp-psc/) follow the same formats as public URLs. For example, the Loki push URL exposed through AWS PrivateLink is:

- Legacy region: `logs-prod3.grafana.net`
- New region: `logs-prod-012-prod-us-east-4.aws-us-east-1-1.grafana.net`

When you configure a VPC endpoint, interface endpoint, or consumer endpoint, use the full hostname that appears in the Grafana Cloud portal for your stack.

### Terraform and infrastructure as code

Terraform resources and other infrastructure-as-code tools accept the same URLs as manual configuration. When a module documents a URL template, substitute the full hostname for your region:

hcl 

```hcl
resource "grafana_cloud_stack" "example" {
  # ...
  prometheus_remote_write_endpoint = "https://prometheus-prod-56-prod-us-east-2.aws-us-east-4-1.grafana.net/api/prom/push"
  loki_url                         = "https://logs-prod-012.aws-us-east-1-1.grafana.net"
}
```

For legacy regions, the same configuration uses the flat format:

hcl 

```hcl
resource "grafana_cloud_stack" "example" {
  # ...
  prometheus_remote_write_endpoint = "https://prometheus-prod-56-prod-us-east-2.grafana.net/api/prom/push"
  loki_url                         = "https://logs-prod-003.grafana.net"
}
```

## Related

To find out where the Grafana Cloud service is available, refer to [regional availability](/docs/grafana-cloud/security-and-account-management/regional-availability/).
