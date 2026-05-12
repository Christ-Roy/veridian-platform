---
title: "prometheus.remote_write | Grafana Alloy documentation"
description: "Learn about prometheus.remote_write"
---

# `prometheus.remote_write`

`prometheus.remote_write` collects metrics sent from other components into a Write-Ahead Log (WAL) and forwards them over the network to a series of user-supplied endpoints. Metrics are sent over the network using the [Prometheus Remote Write protocol](https://docs.google.com/document/d/1LPhVRSFkGNSuU1fBd81ulhsCPR4hkSZyyBj1SZ8fWOM/edit).

You can specify multiple `prometheus.remote_write` components by giving them different labels.

## Usage

Alloy 

```alloy
prometheus.remote_write "<LABEL>" {
  endpoint {
    url = "<REMOTE_WRITE_URL>"

    ...
  }

  ...
}
```

## Arguments

You can use the following argument with `prometheus.remote_write`:


| Name              | Type          | Description                                     | Default | Required |
|-------------------|---------------|-------------------------------------------------|---------|----------|
| `external_labels` | `map(string)` | Labels to add to metrics sent over the network. |         | no       |

## Blocks

You can use the following blocks with `prometheus.remote_write`:

No valid configuration blocks found.

### `endpoint`

The `endpoint` block describes a single location to send metrics to. You can define multiple `endpoint` blocks to send metrics to multiple locations.

The following arguments are supported:


| Name                     | Type                | Description                                                                                                                          | Default                     | Required |
|--------------------------|---------------------|--------------------------------------------------------------------------------------------------------------------------------------|-----------------------------|----------|
| `url`                    | `string`            | Full URL to send metrics to.                                                                                                         |                             | yes      |
| `bearer_token_file`      | `string`            | File containing a bearer token to authenticate with.                                                                                 |                             | no       |
| `bearer_token`           | `secret`            | Bearer token to authenticate with.                                                                                                   |                             | no       |
| `enable_http2`           | `bool`              | Whether HTTP2 is supported for requests.                                                                                             | `false`                     | no       |
| `follow_redirects`       | `bool`              | Whether redirects returned by the server should be followed.                                                                         | `true`                      | no       |
| `http_headers`           | `map(list(secret))` | Custom HTTP headers to be sent along with each request. The map key is the header name.                                              |                             | no       |
| `headers`                | `map(string)`       | Extra headers to deliver with the request.                                                                                           |                             | no       |
| `name`                   | `string`            | Optional name to identify the endpoint in metrics.                                                                                   |                             | no       |
| `no_proxy`               | `string`            | Comma-separated list of IP addresses, CIDR notations, and domain names to exclude from proxying.                                     |                             | no       |
| `protobuf_message`       | `string`            | Protobuf message format to use for remote write. Must be `prometheus.WriteRequest` or experimental `io.prometheus.write.v2.Request`. | `"prometheus.WriteRequest"` | no       |
| `proxy_connect_header`   | `map(list(secret))` | Specifies headers to send to proxies during CONNECT requests.                                                                        |                             | no       |
| `proxy_from_environment` | `bool`              | Use the proxy URL indicated by environment variables.                                                                                | `false`                     | no       |
| `proxy_url`              | `string`            | HTTP proxy to send requests through.                                                                                                 |                             | no       |
| `remote_timeout`         | `duration`          | Timeout for requests made to the URL.                                                                                                | `"30s"`                     | no       |
| `send_exemplars`         | `bool`              | Whether exemplars should be sent.                                                                                                    | `true`                      | no       |
| `send_native_histograms` | `bool`              | Whether native histograms should be sent.                                                                                            | `false`                     | no       |

At most, one of the following can be provided:

- \[`authorization`]\[authorization] block
- \[`azuread`]\[azuread] block
- \[`basic_auth`]\[basic\_auth] block
- [`bearer_token_file`](#endpoint) argument
- [`bearer_token`](#endpoint) argument
- \[`oauth2`]\[oauth2] block
- \[`sigv4`]\[sigv4] block

When multiple `endpoint` blocks are provided, metrics are concurrently sent to all configured locations. Each endpoint has a *queue* which is used to read metrics from the WAL and queue them for sending. The `queue_config` block can be used to customize the behavior of the queue.

Endpoints can be named for easier identification in debug metrics using the `name` argument. If the `name` argument isn’t provided, a name is generated based on a hash of the endpoint settings.

When `send_native_histograms` is `true`, native Prometheus histogram samples sent to `prometheus.remote_write` are forwarded to the configured endpoint. If the endpoint doesn’t support receiving native histogram samples, pushing metrics fails.

`no_proxy` can contain IPs, CIDR notations, and domain names. IP and domain names can contain port numbers. `proxy_url` must be configured if `no_proxy` is configured.

`proxy_from_environment` uses the environment variables HTTP\_PROXY, HTTPS\_PROXY, and NO\_PROXY (or the lowercase versions thereof). Requests use the proxy from the environment variable matching their scheme, unless excluded by NO\_PROXY. `proxy_url` and `no_proxy` must not be configured if `proxy_from_environment` is configured.

`proxy_connect_header` should only be configured if `proxy_url` or `proxy_from_environment` are configured.

### `authorization`


| Name               | Type     | Description                                | Default | Required |
|--------------------|----------|--------------------------------------------|---------|----------|
| `credentials_file` | `string` | File containing the secret value.          |         | no       |
| `credentials`      | `secret` | Secret value.                              |         | no       |
| `type`             | `string` | Authorization type, for example, “Bearer”. |         | no       |

`credential` and `credentials_file` are mutually exclusive, and only one can be provided inside an `authorization` block.

> Warning
> 
> Using `credentials_file` causes the file to be read on every outgoing request. Use the `local.file` component with the `credentials` attribute instead to avoid unnecessary reads.

### `azuread`


| Name    | Type     | Description      | Default         | Required |
|---------|----------|------------------|-----------------|----------|
| `cloud` | `string` | The Azure Cloud. | `"AzurePublic"` | no       |

The supported values for `cloud` are:

- `"AzurePublic"`
- `"AzureChina"`
- `"AzureGovernment"`

### `managed_identity`

Required


| Name        | Type     | Description                                             | Default | Required |
|-------------|----------|---------------------------------------------------------|---------|----------|
| `client_id` | `string` | Client ID of the managed identity used to authenticate. |         | yes      |

`client_id` should be a valid [UUID](https://en.wikipedia.org/wiki/Universally_unique_identifier) in one of the supported formats:

- `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`
- `urn:uuid:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`
- Microsoft encoding: `{xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx}`
- Raw hex encoding: `xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

### `oauth`

Required


| Name            | Type     | Description                                                                                    | Default | Required |
|-----------------|----------|------------------------------------------------------------------------------------------------|---------|----------|
| `client_id`     | `string` | The client ID of the Azure Active Directory application that’s being used to authenticate.     |         | yes      |
| `client_secret` | `secret` | The client secret of the Azure Active Directory application that’s being used to authenticate. |         | yes      |
| `tenant_id`     | `string` | The tenant ID of the Azure Active Directory application that’s being used to authenticate.     |         | yes      |

### `sdk`

Required

This block configures [Azure SDK authentication](https://learn.microsoft.com/en-us/azure/developer/go/azure-sdk-authentication).


| Name        | Type     | Description                                                                                | Default | Required |
|-------------|----------|--------------------------------------------------------------------------------------------|---------|----------|
| `tenant_id` | `string` | The tenant ID of the Azure Active Directory application that’s being used to authenticate. |         | yes      |

### `basic_auth`


| Name            | Type     | Description                              | Default | Required |
|-----------------|----------|------------------------------------------|---------|----------|
| `password_file` | `string` | File containing the basic auth password. |         | no       |
| `password`      | `secret` | Basic auth password.                     |         | no       |
| `username`      | `string` | Basic auth username.                     |         | no       |

`password` and `password_file` are mutually exclusive, and only one can be provided inside a `basic_auth` block.

> Warning
> 
> Using `password_file` causes the file to be read on every outgoing request. Use the `local.file` component with the `password` attribute instead to avoid unnecessary reads.

### `metadata_config`


| Name                   | Type       | Description                                                         | Default | Required |
|------------------------|------------|---------------------------------------------------------------------|---------|----------|
| `max_samples_per_send` | `number`   | Maximum number of metadata samples to send to the endpoint at once. | `2000`  | no       |
| `send_interval`        | `duration` | How frequently metric metadata is sent to the endpoint.             | `"1m"`  | no       |
| `send`                 | `bool`     | Controls whether metric metadata is sent to the endpoint.           | `true`  | no       |

### `oauth2`


| Name                     | Type                | Description                                                                                      | Default | Required |
|--------------------------|---------------------|--------------------------------------------------------------------------------------------------|---------|----------|
| `client_id`              | `string`            | OAuth2 client ID.                                                                                |         | no       |
| `client_secret_file`     | `string`            | File containing the OAuth2 client secret.                                                        |         | no       |
| `client_secret`          | `secret`            | OAuth2 client secret.                                                                            |         | no       |
| `endpoint_params`        | `map(string)`       | Optional parameters to append to the token URL.                                                  |         | no       |
| `no_proxy`               | `string`            | Comma-separated list of IP addresses, CIDR notations, and domain names to exclude from proxying. |         | no       |
| `proxy_connect_header`   | `map(list(secret))` | Specifies headers to send to proxies during CONNECT requests.                                    |         | no       |
| `proxy_from_environment` | `bool`              | Use the proxy URL indicated by environment variables.                                            | `false` | no       |
| `proxy_url`              | `string`            | HTTP proxy to send requests through.                                                             |         | no       |
| `scopes`                 | `list(string)`      | List of scopes to authenticate with.                                                             |         | no       |
| `token_url`              | `string`            | URL to fetch the token from.                                                                     |         | no       |

`client_secret` and `client_secret_file` are mutually exclusive, and only one can be provided inside an `oauth2` block.

> Warning
> 
> Using `client_secret_file` causes the file to be read on every outgoing request. Use the `local.file` component with the `client_secret` attribute instead to avoid unnecessary reads.

The `oauth2` block may also contain a separate `tls_config` sub-block.

`no_proxy` can contain IPs, CIDR notations, and domain names. IP and domain names can contain port numbers. `proxy_url` must be configured if `no_proxy` is configured.

`proxy_from_environment` uses the environment variables HTTP\_PROXY, HTTPS\_PROXY, and NO\_PROXY (or the lowercase versions thereof). Requests use the proxy from the environment variable matching their scheme, unless excluded by NO\_PROXY. `proxy_url` and `no_proxy` must not be configured if `proxy_from_environment` is configured.

`proxy_connect_header` should only be configured if `proxy_url` or `proxy_from_environment` are configured.

### `tls_config`


| Name                   | Type     | Description                                              | Default | Required |
|------------------------|----------|----------------------------------------------------------|---------|----------|
| `ca_pem`               | `string` | CA PEM-encoded text to validate the server with.         |         | no       |
| `ca_file`              | `string` | CA certificate to validate the server with.              |         | no       |
| `cert_pem`             | `string` | Certificate PEM-encoded text for client authentication.  |         | no       |
| `cert_file`            | `string` | Certificate file for client authentication.              |         | no       |
| `insecure_skip_verify` | `bool`   | Disables validation of the server certificate.           |         | no       |
| `key_file`             | `string` | Key file for client authentication.                      |         | no       |
| `key_pem`              | `secret` | Key PEM-encoded text for client authentication.          |         | no       |
| `min_version`          | `string` | Minimum acceptable TLS version.                          |         | no       |
| `server_name`          | `string` | ServerName extension to indicate the name of the server. |         | no       |

The following pairs of arguments are mutually exclusive and can’t both be set simultaneously:

- `ca_pem` and `ca_file`
- `cert_pem` and `cert_file`
- `key_pem` and `key_file`

When configuring client authentication, both the client certificate (using `cert_pem` or `cert_file`) and the client key (using `key_pem` or `key_file`) must be provided.

When `min_version` isn’t provided, the minimum acceptable TLS version is inherited from Go’s default minimum version, TLS 1.2. If `min_version` is provided, it must be set to one of the following strings:

- `"TLS10"` (TLS 1.0)
- `"TLS11"` (TLS 1.1)
- `"TLS12"` (TLS 1.2)
- `"TLS13"` (TLS 1.3)

### `queue_config`


| Name                   | Type       | Description                                                          | Default  | Required |
|------------------------|------------|----------------------------------------------------------------------|----------|----------|
| `batch_send_deadline`  | `duration` | Maximum time samples wait in the buffer before sending.              | `"5s"`   | no       |
| `capacity`             | `number`   | Number of samples to buffer per shard.                               | `10000`  | no       |
| `max_backoff`          | `duration` | Maximum retry delay.                                                 | `"5s"`   | no       |
| `max_samples_per_send` | `number`   | Maximum number of samples per send.                                  | `2000`   | no       |
| `max_shards`           | `number`   | Maximum number of concurrent shards sending samples to the endpoint. | `50`     | no       |
| `min_backoff`          | `duration` | Initial retry delay. The backoff time gets doubled for each retry.   | `"30ms"` | no       |
| `min_shards`           | `number`   | Minimum amount of concurrent shards sending samples to the endpoint. | `1`      | no       |
| `retry_on_http_429`    | `bool`     | Retry when an HTTP 429 status code is received.                      | `true`   | no       |
| `sample_age_limit`     | `duration` | Maximum age of samples to send.                                      | `"0s"`   | no       |

Each queue then manages a number of concurrent *shards* which is responsible for sending a fraction of data to their respective endpoints. The number of shards is automatically raised if samples aren’t being sent to the endpoint quickly enough. The range of permitted shards can be configured with the `min_shards` and `max_shards` arguments. Refer to [Tune `max_shards`](#tune-max_shards) for more information about how to configure `max_shards`.

Each shard has a buffer of samples it keeps in memory, controlled with the `capacity` argument. New metrics aren’t read from the WAL unless there is at least one shard that’s not at maximum capacity.

The buffer of a shard is flushed and sent to the endpoint either after the shard reaches the number of samples specified by `max_samples_per_send` or the duration specified by `batch_send_deadline` has elapsed since the last flush for that shard.

Shards retry requests which fail due to a recoverable error. An error is recoverable if the server responds with an `HTTP 5xx` status code. The delay between retries can be customized with the `min_backoff` and `max_backoff` arguments.

The `retry_on_http_429` argument specifies whether `HTTP 429` status code responses should be treated as recoverable errors. Other `HTTP 4xx` status code responses are never considered recoverable errors. When `retry_on_http_429` is enabled, `Retry-After` response headers from the servers are honored.

The `sample_age_limit` argument specifies the maximum age of samples to send. Any samples older than the limit are dropped and won’t be sent to the remote storage. The default value is `0s`, which means that all samples are sent (feature is disabled).

### `sigv4`


| Name         | Type     | Description                                         | Default | Required |
|--------------|----------|-----------------------------------------------------|---------|----------|
| `access_key` | `string` | AWS API access key.                                 |         | no       |
| `profile`    | `string` | Named AWS profile used to authenticate.             |         | no       |
| `region`     | `string` | AWS region.                                         |         | no       |
| `role_arn`   | `string` | AWS Role ARN, an alternative to using AWS API keys. |         | no       |
| `secret_key` | `secret` | AWS API secret key.                                 |         | no       |

If `region` is left blank, the region from the default credentials chain is used.

If `access_key` is left blank, the environment variable `AWS_ACCESS_KEY_ID` is used.

If `secret_key` is left blank, the environment variable `AWS_SECRET_ACCESS_KEY` is used.

### `write_relabel_config`

The `write_relabel_config` block contains the definition of any relabeling rules that can be applied to an input metric. If more than one `write_relabel_config` block is defined, the transformations are applied in top-down order.

The following arguments can be used to configure a `write_relabel_config`. All arguments are optional. Omitted fields take their default values.


| Name            | Type           | Description                                                                                                                                                                                                                                   | Default | Required |
|-----------------|----------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|---------|----------|
| `action`        | `string`       | The relabeling action to perform.                                                                                                                                                                                                             | replace | no       |
| `modulus`       | `uint`         | A positive integer used to calculate the modulus of the hashed source label values.                                                                                                                                                           |         | no       |
| `regex`         | `string`       | A valid RE2 expression with support for parenthesized capture groups. Used to match the extracted value from the combination of the `source_label` and `separator` fields or filter labels during the `labelkeep/labeldrop/labelmap` actions. | `(.*)`  | no       |
| `replacement`   | `string`       | The value against which a regular expression replace is performed, if the regular expression matches the extracted value. Supports previously captured groups.                                                                                | `"$1"`  | no       |
| `separator`     | `string`       | The separator used to concatenate the values present in `source_labels`.                                                                                                                                                                      | ;       | no       |
| `source_labels` | `list(string)` | The list of labels whose values are to be selected. Their content is concatenated using the `separator` and matched against `regex`.                                                                                                          |         | no       |
| `target_label`  | `string`       | Label to which the resulting value will be written to.                                                                                                                                                                                        |         | no       |

You can use the following actions:

- `drop`: Drops metrics where `regex` matches the string extracted using the `source_labels` and `separator`.
- `dropequal`: Drop targets for which the concatenated `source_labels` do match `target_label`.
- `hashmod`: Hashes the concatenated labels, calculates its modulo `modulus` and writes the result to the `target_label`.
- `keep`: Keeps metrics where `regex` matches the string extracted using the `source_labels` and `separator`.
- `keepequal`: Drop targets for which the concatenated `source_labels` don’t match `target_label`.
- `labeldrop`: Matches `regex` against all label names. Any labels that match are removed from the metric’s label set.
- `labelkeep`: Matches `regex` against all label names. Any labels that don’t match are removed from the metric’s label set.
- `labelmap`: Matches `regex` against all label names. Any labels that match are renamed according to the contents of the `replacement` field.
- `lowercase`: Sets `target_label` to the lowercase form of the concatenated `source_labels`.
- `replace`: Matches `regex` to the concatenated labels. If there’s a match, it replaces the content of the `target_label` using the contents of the `replacement` field.
- `uppercase`: Sets `target_label` to the uppercase form of the concatenated `source_labels`.

> Note
> 
> The regular expression capture groups can be referred to using either the `$CAPTURE_GROUP_NUMBER` or `${CAPTURE_GROUP_NUMBER}` notation.

### `wal`

The `wal` block customizes the Write-Ahead Log (WAL) used to temporarily store metrics before they’re sent to the configured set of endpoints.


| Name                 | Type       | Description                                                    | Default | Required |
|----------------------|------------|----------------------------------------------------------------|---------|----------|
| `truncate_frequency` | `duration` | How frequently to clean up the WAL.                            | `"2h"`  | no       |
| `min_keepalive_time` | `duration` | Minimum time to keep data in the WAL before it can be removed. | `"5m"`  | no       |
| `max_keepalive_time` | `duration` | Maximum time to keep data in the WAL before removing it.       | `"8h"`  | no       |

The WAL serves two primary purposes:

- Buffer unsent metrics in case of intermittent network issues.
- Populate in-memory cache after a process restart.

The WAL is located inside a component-specific directory relative to the storage path Alloy is configured to use. Refer to the [`run` documentation](../../../cli/run/) for information about how to change the storage path.

The `truncate_frequency` argument configures how often to clean up the WAL. Every time the `truncate_frequency` period elapses, the lower two-thirds of data is removed from the WAL and is no longer available for sending.

When a WAL clean-up starts, the lowest successfully sent timestamp is used to determine how much data is safe to remove from the WAL. The `min_keepalive_time` and `max_keepalive_time` control the permitted age range of data in the WAL. Samples aren’t removed until they’re at least as old as `min_keepalive_time`, and samples are forcibly removed if they’re older than `max_keepalive_time`.

## Exported fields

The following fields are exported and can be referenced by other components:


| Name       | Type              | Description                                                |
|------------|-------------------|------------------------------------------------------------|
| `receiver` | `MetricsReceiver` | A value which other components can use to send metrics to. |

## Component health

`prometheus.remote_write` is only reported as unhealthy if given an invalid configuration. In those cases, exported fields are kept at their last healthy values.

## Debug information

`prometheus.remote_write` doesn’t expose any component-specific debug information.

## Debug metrics

- `prometheus_remote_storage_bytes_total` (counter): Total number of bytes of data sent by queues after compression.
- `prometheus_remote_storage_enqueue_retries_total` (counter): Total number of times enqueue has failed because a shard’s queue was full.
- `prometheus_remote_storage_exemplars_dropped_total` (counter): Total number of exemplars which were dropped after being read from the WAL before being sent to `remote_write` because of an unknown reference ID.
- `prometheus_remote_storage_exemplars_failed_total` (counter): Total number of exemplars that failed to send to remote storage due to non-recoverable errors.
- `prometheus_remote_storage_exemplars_in_total` (counter): Exemplars read into remote storage.
- `prometheus_remote_storage_exemplars_pending` (gauge): The number of exemplars pending in shards to be sent to remote storage.
- `prometheus_remote_storage_exemplars_retried_total` (counter): Total number of exemplars that failed to send to remote storage but were retried due to recoverable errors.
- `prometheus_remote_storage_exemplars_total` (counter): Total number of exemplars sent to remote storage.
- `prometheus_remote_storage_max_samples_per_send` (gauge): The maximum number of samples each shard is allowed to send in a single request.
- `prometheus_remote_storage_metadata_bytes_total` (counter): Total number of bytes of metadata sent by queues after compression.
- `prometheus_remote_storage_metadata_failed_total` (counter): Total number of metadata entries that failed to send to remote storage due to non-recoverable errors.
- `prometheus_remote_storage_metadata_retried_total` (counter): Total number of metadata entries that failed to send to remote storage but were retried due to recoverable errors.
- `prometheus_remote_storage_metadata_total` (counter): Total number of metadata entries sent to remote storage.
- `prometheus_remote_storage_queue_highest_sent_timestamp_seconds` (gauge): Unix timestamp of the latest WAL sample successfully sent by a queue.
- `prometheus_remote_storage_samples_dropped_total` (counter): Total number of samples which were dropped after being read from the WAL before being sent to `remote_write` because of an unknown reference ID.
- `prometheus_remote_storage_samples_failed_total` (counter): Total number of samples that failed to send to remote storage due to non-recoverable errors.
- `prometheus_remote_storage_samples_in_total` (counter): Samples read into remote storage.
- `prometheus_remote_storage_samples_pending` (gauge): The number of samples pending in shards to be sent to remote storage.
- `prometheus_remote_storage_samples_retries_total` (counter): Total number of samples that failed to send to remote storage but were retried due to recoverable errors.
- `prometheus_remote_storage_samples_total` (counter): Total number of samples sent to remote storage.
- `prometheus_remote_storage_sent_batch_duration_seconds` (histogram): Duration of send calls to remote storage.
- `prometheus_remote_storage_shard_capacity` (gauge): The capacity of shards within a given queue.
- `prometheus_remote_storage_shards_desired` (gauge): The number of shards a queue wants to run to be able to keep up with the amount of incoming metrics.
- `prometheus_remote_storage_shards_max` (gauge): The maximum number of a shards a queue is allowed to run.
- `prometheus_remote_storage_shards_min` (gauge): The minimum number of shards a queue is allowed to run.
- `prometheus_remote_storage_shards` (gauge): The number of shards used for concurrent delivery of metrics to an endpoint.
- `prometheus_remote_write_wal_exemplars_appended_total` (counter): Total number of exemplars appended to the WAL.
- `prometheus_remote_write_wal_out_of_order_samples_total` (counter): Total number of out of order samples ingestion failed attempts.
- `prometheus_remote_write_wal_metadata_updates_total` (counter): Total number of metadata updates sent through the WAL.
- `prometheus_remote_write_wal_samples_appended_total` (counter): Total number of samples appended to the WAL.
- `prometheus_remote_write_wal_storage_active_series` (gauge): Current number of active series being tracked by the WAL.
- `prometheus_remote_write_wal_storage_created_series_total` (counter): Total number of created series appended to the WAL.
- `prometheus_remote_write_wal_storage_deleted_series` (gauge): Current number of series marked for deletion from memory.
- `prometheus_remote_write_wal_storage_removed_series_total` (counter): Total number of series removed from the WAL.

## Examples

The following examples show you how to create `prometheus.remote_write` components that send metrics to different destinations.

### Send metrics to a local Mimir instance

You can create a `prometheus.remote_write` component that sends your metrics to a local Mimir instance:

Alloy 

```alloy
prometheus.remote_write "staging" {
  // Send metrics to a locally running Mimir.
  endpoint {
    url = "http://mimir:9009/api/v1/push"

    basic_auth {
      username = "example-user"
      password = "example-password"
    }
  }
}

// Configure a prometheus.scrape component to send metrics to
// prometheus.remote_write component.
prometheus.scrape "demo" {
  targets = [
    // Collect metrics from the default HTTP listen address.
    {"__address__" = "127.0.0.1:12345"},
  ]
  forward_to = [prometheus.remote_write.staging.receiver]
}
```

### Send metrics to a Mimir instance with a tenant specified

You can create a `prometheus.remote_write` component that sends your metrics to a specific tenant within the Mimir instance. This is useful when your Mimir instance is using more than one tenant:

Alloy 

```alloy
prometheus.remote_write "staging" {
  // Send metrics to a Mimir instance
  endpoint {
    url = "http://mimir:9009/api/v1/push"

    headers = {
      "X-Scope-OrgID" = "staging",
    }
  }
}
```

### Experimental: Send metrics using Remote Write v2 protocol

> **EXPERIMENTAL**: This is an [experimental](/docs/release-life-cycle/) feature. Experimental features are subject to frequent breaking changes, and may be removed with no equivalent replacement. To enable and use an experimental feature, you must set the `stability.level` [flag](/docs/alloy/latest/reference/cli/run/) to `experimental`.

You can configure `prometheus.remote_write` to use the Remote Write v2 protocol if your endpoint supports it:

Alloy 

```alloy
prometheus.remote_write "v2_example" {
  endpoint {
    url = "http://mimir:9009/api/v1/push"
    protobuf_message = "io.prometheus.write.v2.Request"
  }
}
```

### Send metrics to a managed service

You can create a `prometheus.remote_write` component that sends your metrics to a managed service, for example, Grafana Cloud. The Prometheus username and the Grafana Cloud API Key are injected in this example through environment variables.

Alloy 

```alloy
prometheus.remote_write "default" {
  endpoint {
    url = "https://prometheus-xxx.grafana.net/api/prom/push"
      basic_auth {
        username = sys.env("PROMETHEUS_USERNAME")
        password = sys.env("GRAFANA_CLOUD_API_KEY")
      }
  }
}
```

## Troubleshooting

### Out of order errors

You may sometimes see an “out of order” error in the Alloy log files. This means that Alloy sent a metric sample that has an older timestamp than a sample that the database already ingested. If your database is Mimir, the exact name of the [Mimir error](/docs/mimir/latest/manage/mimir-runbooks/#err-mimir-sample-out-of-order) is `err-mimir-sample-out-of-order`.

The most common cause for this error is that there is more than one Alloy instance scraping the same target. To troubleshoot, take the following steps in order:

1. If you use [clustering](../../../../configure/clustering), check if the number of Alloy instances changed at the time the error was logged. This is the only situation in which it’s normal to experience an out of order error. The error would only happen for a short period, until the cluster stabilizes and all Alloy instances have a new list of targets. Since the time duration for the cluster to stabilize is expected to be much shorter than the scrape interval, this isn’t a real problem. If the out of order error you see isn’t related to scaling of clustered collectors, it must be investigated.
2. Check if there are active Alloy instances which shouldn’t be running. There may be an older Alloy instance that wasn’t shut down before a new one was started.
3. Inspect the configuration to see if there could be multiple Alloy instances which scrape the same target.
4. Inspect the WAL to see which Alloy instance sent those metric samples. The WAL is located in a directory set by the [run command](../../../cli/run/) `--storage.path` argument. You can use [Promtool](https://prometheus.io/docs/prometheus/latest/command-line/promtool/#promtool-tsdb) to inspect it and find out which metric series were sent by this Alloy instance since the last WAL truncation event. For example:
   
   text 
   
   ```text
   ./promtool tsdb dump --match='{__name__="otelcol_connector_spanmetrics_duration_seconds_bucket", http_method="GET", job="ExampleJobName"}' /path/to/wal/
   ```

## Technical details

`prometheus.remote_write` uses [snappy](https://en.wikipedia.org/wiki/Snappy_%28compression%29) for compression.

Any labels that start with `__` are removed before sending to the endpoint.

### Data retention

The `prometheus.remote_write` component uses a Write Ahead Log (WAL) to prevent data loss during network outages. The component buffers the received metrics in a WAL for each configured endpoint. The queue shards can use the WAL after the network outage is resolved and flush the buffered metrics to the endpoints.

The WAL records metrics in 128 MB files called segments. To avoid having a WAL that grows on-disk indefinitely, the component *truncates* its segments on a set interval.

On each truncation, the WAL deletes references to series that are no longer present and also *checkpoints* roughly the oldest two thirds of the segments (rounded down to the nearest integer) written to it since the last truncation period. A checkpoint means that the WAL only keeps track of the unique identifier for each existing metrics series, and can no longer use the samples for remote writing. If that data hasn’t yet been pushed to the remote endpoint, it’s lost.

This behavior dictates the data retention for the `prometheus.remote_write` component. It also means that it’s impossible to directly correlate data retention directly to the data age itself, as the truncation logic works on *segments*, not the samples themselves. This makes data retention less predictable when the component receives a non-consistent rate of data.

The [WAL block](#wal) contains some configurable parameters that can be used to control the tradeoff between memory usage, disk usage, and data retention.

The `truncate_frequency` or `wal_truncate_frequency` parameter configures the interval at which truncations happen. A lower value leads to reduced memory usage, but also provides less resiliency to long outages.

When a WAL clean-up starts, the most recently successfully sent timestamp is used to determine how much data is safe to remove from the WAL. The `min_keepalive_time` or `min_wal_time` controls the minimum age of samples considered for removal. No samples more recent than `min_keepalive_time` are removed. The `max_keepalive_time` or `max_wal_time` controls the maximum age of samples that can be kept in the WAL. Samples older than `max_keepalive_time` are forcibly removed.

### Extended `remote_write` outages

When the remote write endpoint is unreachable over a period of time, the most recent successfully sent timestamp isn’t updated. The `min_keepalive_time` and `max_keepalive_time` arguments control the age range of data kept in the WAL.

If the remote write outage is longer than the `max_keepalive_time` parameter, then the WAL is truncated, and the oldest data is lost.

### Intermittent `remote_write` outages

If the remote write endpoint is intermittently reachable, the most recent successfully sent timestamp is updated whenever the connection is successful. A successful connection updates the series’ comparison with `min_keepalive_time` and triggers a truncation on the next `truncate_frequency` interval which checkpoints two thirds of the segments (rounded down to the nearest integer) written since the previous truncation.

### Falling behind

If the queue shards can’t flush data quickly enough to keep up-to-date with the most recent data buffered in the WAL, the component is “falling behind”. It’s not unusual for the component to temporarily fall behind 2 or 3 scrape intervals. If the component falls behind more than one third of the data written since the last truncate interval, it’s possible for the truncate loop to checkpoint data before being pushed to the `remote_write` endpoint.

### Tune `max_shards`

The [`queue_config`](#queue_config) block allows you to configure `max_shards`. The `max_shards` is the maximum number of concurrent shards sending samples to the Prometheus-compatible remote write endpoint. For each shard, a single remote write request can send up to `max_samples_per_send` samples.

Alloy tries not to use too many shards, but if the queue falls behind, the remote write component increases the number of shards up to `max_shards` to increase throughput. A high number of shards may potentially overwhelm the remote endpoint or increase Alloy memory utilization. For this reason, it’s important to tune `max_shards` to a reasonable value that’s good enough to keep up with the backlog of data to send to the remote endpoint without overwhelming it.

The maximum throughput that Alloy can achieve when remote writing is equal to `max_shards * max_samples_per_send * <1 / average write request latency>`. For example, running Alloy with the default configuration of 50 `max_shards` and 2000 `max_samples_per_send`, and assuming the average latency of a remote write request is 500ms, the maximum throughput achievable is about `50 * 2000 * (1s / 500ms) = 200K samples / s`.

The default `max_shards` configuration is good for most use cases, especially if each Alloy instance scrapes up to 1 million active series. However, if you run Alloy at a large scale and each instance scrapes more than 1 million series, we recommend increasing the value of `max_shards`.

Alloy exposes a few metrics that you can use to monitor the remote write shards:

- `prometheus_remote_storage_shards_desired` (gauge): The number of shards a queue wants to run to keep up with the number of incoming metrics.
- `prometheus_remote_storage_shards_max` (gauge): The maximum number of shards a queue is allowed to run.
- `prometheus_remote_storage_shards_min` (gauge): The minimum number of shards a queue is allowed to run.
- `prometheus_remote_storage_shards` (gauge): The number of shards used for concurrent delivery of metrics to an endpoint.

If you’re already running Alloy, a rule of thumb is to set `max_shards` to 4x shard utilization. Using the metrics explained above, you can run the following PromQL instant query to compute the suggested `max_shards` value for each remote write endpoint `url`:

text 

```text
clamp_min(
    (
        # Calculate the 90th percentile desired shards over the last seven-day period.
        # If you're running Alloy for less than seven days, then
        # reduce the [7d] period to cover only the time range since when you deployed it.
        ceil(quantile_over_time(0.9, prometheus_remote_storage_shards_desired[7d]))

        # Add room for spikes.
        * 4
    ),
    # We recommend setting max_shards to a value of no less than 50, as in the default configuration.
    50
)
```

If you aren’t running Alloy yet, we recommend running it with the default `max_shards` and then using the PromQL instant query mentioned above to compute the recommended `max_shards`.

### WAL corruption

WAL corruption can occur when Alloy unexpectedly stops while the latest WAL segments are still being written to disk. For example, the host computer has a general disk failure and crashes before you can stop Alloy and other running services. When you restart Alloy, it verifies the WAL, removing any corrupt segments it finds. Sometimes, this repair is unsuccessful, and you must manually delete the corrupted WAL to continue. If the WAL becomes corrupted, Alloy writes error messages such as `err="failed to find segment for index"` to the log file.

> Note
> 
> Deleting a WAL segment or a WAL file permanently deletes the stored WAL data.

To delete the corrupted WAL:

1. [Stop](../../../../set-up/run/) Alloy.
2. Find and delete the contents of the `wal` directory.
   
   By default the `wal` directory is a subdirectory of the `data-alloy` directory located in the Alloy working directory. The WAL data directory may be different than the default depending on the path specified by the [command line flag](../../../cli/run/) `--storage-path`.
   
   > Note
   > 
   > There is one `wal` directory per `prometheus.remote_write` component.
3. [Start](../../../../set-up/run/) Alloy and verify that the WAL is working correctly.

## Compatible components

`prometheus.remote_write` has exports that can be consumed by the following components:

- Components that consume [Prometheus `MetricsReceiver`](../../../compatibility/#prometheus-metricsreceiver-consumers)

> Note
> 
> Connecting some components may not be sensible or components may require further configuration to make the connection work correctly. Refer to the linked documentation for more details.
