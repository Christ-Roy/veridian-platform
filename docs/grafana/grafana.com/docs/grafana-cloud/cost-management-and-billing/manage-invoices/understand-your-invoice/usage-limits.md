---
title: "Understand Grafana Cloud usage limits | Grafana Cloud documentation"
description: "Understand Grafana Cloud usage limits for metrics, logs, and traces."
---

# Understand Grafana Cloud usage limits

Grafana Cloud continuously provides your account limits in the following metrics:

- `grafanacloud_instance_metrics_limits`
- `grafanacloud_logs_instance_limits`
- `grafanacloud_traces_instance_limits`

To find these limits in your Grafana Cloud instance:

1. Click **Explore** (compass icon).
2. Select `grafanacloud-usage` from the drop-down menu.
3. In the Metrics browser query field, enter the metric, for example `grafanacloud_instance_metrics_limits`.
4. Click **Run query**.

The label `limit_name` provides the specific limit. See below for a complete reference.

## Metric usage limits

The following limits apply to Grafana Cloud Metrics.

> Note
> 
> Usage time limits are recorded internally using the Go `time.Duration` representation, which is in nanoseconds. To get to something useful, like “days” you divide the limit in nanoseconds by 1 billion and then divide that by 86400 (seconds in a day).

### Metric ingestion limits


| Limit name                       | Limit description                                                          | Default limit               |
|----------------------------------|----------------------------------------------------------------------------|-----------------------------|
| `ingestion_rate`                 | The maximum number of ingested samples per second for a series.            | 10,000                      |
| `ingestion_burst_size`           | The maximum allowed ingestion burst size in number of samples.             | 200,000                     |
| `max_global_series_per_user`     | The total maximum series for each user in an instance.                     | 150,000                     |
| `max_global_exemplars_per_user`  | The total maximum exemplars for each user in an instance.                  | 100,000                     |
| `max_aggregation_ingestion_rate` | The maximum ingestion rate for aggregated metrics.                         | 250,000                     |
| `max_aggregated_tenant_series`   | The maximum series for aggregated tenant metrics.                          | 3,000,000                   |
| `max_global_metadata_per_user`   | The maximum number of different sets of help text and unit in an instance. | 30,000                      |
| `max_global_metadata_per_metric` | The maximum number of different sets of help text and unit per metric.     | 10                          |
| `out_of_order_time_window`       | The maximum allowed time window for out-of-order samples in nanoseconds.   | 7,200,000,000,000 (2 hours) |

### Metric Query limits


| Limit name                        | Limit description                                                                                                                                                                                 | Default limit               |
|-----------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-----------------------------|
| `max_partial_query_length`        | The maximum time range for partial queries at the querier level (exported in seconds).                                                                                                            | 2,764,800 seconds (32 days) |
| `max_fetched_chunks_per_query`    | The maximum number of chunks with compressed samples that each query can fetched from the storage.                                                                                                | 2,000,000                   |
| `max_query_expression_size_bytes` | The maximum length of a PromQL query expression after any variables have been replaced with their values.                                                                                         | 128KiB                      |
| `max_labels_query_length`         | The maximum time range for label names and values queries. If the requested time range is outside the allowed range, the request is manipulated to only query data within the allowed time range. | 2,764,800 seconds (32 days) |

### Rules limits


| Limit name                         | Limit description                                           | Default limit |
|------------------------------------|-------------------------------------------------------------|---------------|
| `ruler_max_rule_groups_per_tenant` | The maximum number of rule groups for an instance.          | 35            |
| `ruler_max_rules_per_rule_group`   | The maximum number of rules per rule group for an instance. | 20            |

### About limit autoscaling

Grafana Cloud automatically scales some metric usage limits based on your consumption. Limits are continuously autoscaled.

The following limits are autoscaled:

- `ingestion_rate`
- `ingestion_burst_size`
- `max_global_series_per_user`
- `max_aggregation_ingestion_rate`
- `max_global_metadata_per_user`
- `max_aggregated_tenant_series`
- `ruler_max_rule_groups_per_tenant`
- `ruler_max_rules_per_rule_group`

To adjust a limit that isn’t autoscaled, contact Grafana Support.

## Logs usage limits

### Log ingestion limits


| Limit name                    | Limit description                                                | Default limit                   |
|-------------------------------|------------------------------------------------------------------|---------------------------------|
| `ingestion_rate_mb`           | Per-user ingestion rate in MB.                                   | 5                               |
| `max_global_streams_per_user` | The maximum number of active streams per user, across ingesters. | 5,000                           |
| `retention_period`            | Compactor retention for storage, in nanoseconds.                 | 2,678,400,000,000,000 (31 days) |
| `max_line_size`               | The maximum size of a log line. This limit can’t be modified.    | 256kb                           |
| `max_label_names_per_series`  | The maximum number of labels per stream.                         | 15                              |
| `max_label_name_length`       | The maximum size label name.                                     | 1024                            |
| `max_label_value_length`      | The maximum size label value.                                    | 2048                            |

### Log query limits


| Limit name           | Limit description                                                               | Default limit                          |
|----------------------|---------------------------------------------------------------------------------|----------------------------------------|
| `max_query_length`   | The maximum time range for partial queries at the querier level,in nanoseconds. | 2,595,600,000,000,000 (30 days + 1 hr) |
| `max_query_lookback` | Querier limit on how far back data can be queried.                              | 0 (disabled)                           |
| `max_query_series`   | The maximum unique series that can be returned by a metric query.               | 500                                    |

## Traces usage limits

Use these metrics to help track your traces usage limits.


| Limit name                   | Limit description                                    | Default limit                   |
|------------------------------|------------------------------------------------------|---------------------------------|
| `max_bytes_per_trace`        | The maximum size of a trace in bytes.                | 3,000,000                       |
| `ingestion_rate_limit_bytes` | Per-tenant ingestion rate limit per second in bytes. | 500,000                         |
| `ingestion_burst_size_bytes` | Per ingestion burst size in bytes.                   | 500,000                         |
| `block_retention`            | The duration to keep blocks/traces in nanoseconds.   | 2,592,000,000,000,000 (30 days) |

## **Discarded Spans** panel in the **Billing** dashboard

In the **Billing** dashboard, there is a panel that shows **Discarded Spans** and a color-coded legend with a reason why the spans were discarded. The table that follows defines each of those reasons.


| Reason for discarded span    | Description                                                           |
|------------------------------|-----------------------------------------------------------------------|
| `internal error`             | A general error that should be further explained in the logs.         |
| `live_traces_exceeded`       | Exceeded the max number of traces allowed in the ingester per tenant. |
| `rate limited`               | Exceeded the `ingestion_rate_limit_bytes` limit.                      |
| `trace_too_large`            | Exceeded the `max_bytes_per_trace` limit.                             |
| `trace_too_large_to_compact` | Exceeded the `max_bytes_per_trace` limit during compaction.           |

You can use `grafanacloud_traces_instance_percentage_complete_traces_flushed` metric. This metric has a value between `0` and `1`, indicating the percentage of traces without any orphaned spans when the trace is flushed to storage.

In addition, you can use the `grafanacloud_traces_instance_discarded_spans_total:rate5m` metric to review the number of discarded spans, including the reasons for discarding, in 5 minute periods.

When a trace is too large to be ingested, it is discarded. This can happen for a few reasons:

- Ingestion: Traces are refused with `trace_too_large` error
- Search: Oversized traces are skipped with `trace_too_large` error
- Compaction: Oversized traces are partially dropped with `trace_too_large_to_compact` error

The default limit for traces is 5MB, which, in Tempo, is configured by `max_bytes_per_trace`.

Let’s say that you want more information about traces that are discarded because they were too large. You can query for the `grafanacloud_traces_instance_discarded_spans_total:rate5m` metric using the `grafanacloud-usage` data source.

To narrow the results down to the specific “trace too large” reason, modify the query to be `grafanacloud_traces_instance_discarded_spans_total:rate5m{reason="trace_too_large"}`. While the `grafanacloud_traces_instance_discarded_spans_total:rate5m` metric shows the number of discarded spans, it doesn’t provide any information on where the large traces originate. To identify which services are causing discards using TraceQL, and to learn how to reduce the discard rate, refer to [Discarded traces](/docs/grafana-cloud/send-data/traces/troubleshoot/#discarded-traces).

## Grafana Cloud usage

Grafana Cloud continuously provides your account usage in the following metrics:

- `grafanacloud_instance_metrics_*`
- `grafanacloud_logs_instance_*`
- `grafanacloud_traces_instance_*`

For example, to monitor log stream count, you can use `grafanacloud_logs_instance_active_streams`.

### Cloud Traces usage

If you need to have a limit raised, then contact Grafana Support for assistance.


| Metric                                                                   | Description                                                                                                                  |
|--------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------|
| `grafanacloud_traces_instance_bytes_received_per_second`                 | Number of bytes received by each Grafana Cloud Traces stack for the organization.                                            |
| `grafanacloud_traces_instance_created_date`                              | Date (milliseconds since epoch) when the instance was created.                                                               |
| `grafanacloud_traces_instance_discarded_spans_total:rate5m`              | Number of discarded spans, including the reasons for discarding, in 5 minute periods.                                        |
| `grafanacloud_traces_instance_percentage_complete_traces_flushed`        | A value between 0 and 1 indicating the percentage of traces without any orphaned spans when the trace is flushed to storage. |
| `grafanacloud_traces_instance_info`                                      | Information about the instance such as org ID and customer ID.                                                               |
| `grafanacloud_traces_instance_limits`                                    | Span volume limits for the organization, on a per-stack basis.                                                               |
| `grafanacloud_traces_instance_queries_per_second`                        | Number of queries that are carried out on a per-second rate basis.                                                           |
| `grafanacloud_traces_instance_spans_received_total:rate5m`               | Per second rate of spans received by each Grafana Cloud Traces stack for the organization, over a 5 minute period.           |
| `grafanacloud_traces_instance_usage`                                     | Billable trace usage over the last month for stacks in the organization.                                                     |
| `grafanacloud_traces_instance_metrics_generator_active_series`           | Number of active series being generated via ingested spans.                                                                  |
| `grafanacloud_traces_instance_percentage_traces_with_root_spans_flushed` | A value between `0` and `1` indicating the percentage of traces with root spans when the trace is flushed to storage.        |

## Other usage limits

The following limits apply to Grafana Cloud resources to protect platform stability and ensure a consistent experience for all customers. Reaching these limits does not affect your invoice. Paid customers can request higher limits at no additional cost by contacting Grafana Support.

### Dashboard and folder limits


| Limit name                         | Limit description                           | Default limit |
|------------------------------------|---------------------------------------------|---------------|
| `dashboard.grafana.app/dashboards` | The maximum number of dashboards per stack. | 1,000         |
| `folder.grafana.app/folders`       | The maximum number of folders per stack.    | 1,000         |

When a stack reaches approximately 80% of a limit, users see a warning in the Grafana UI. At the limit:

- New dashboards or folders cannot be created.
- Existing dashboards and folders are not removed.
- Saves that would exceed the limit are blocked.

Free tier stacks are hard-limited at the default. Paid customers can request a higher limit through Grafana Support.

> Note
> 
> The existing dashboard size limit of 16 MB is not affected by these limits.
