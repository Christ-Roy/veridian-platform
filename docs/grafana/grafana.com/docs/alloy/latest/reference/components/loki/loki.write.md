---
title: "loki.write | Grafana Alloy documentation"
description: "Learn about loki.write"
---

# `loki.write`

`loki.write` receives log entries from other loki components and sends them over the network using the Loki `logproto` format.

You can specify multiple `loki.write` components by giving them different labels.

## Usage

Alloy 

```alloy
loki.write "<LABEL>" {
  endpoint {
    url = "<REMOTE_WRITE_URL>"
  }
}
```

## Arguments

You can use the following arguments with `loki.write`:


| Name              | Type          | Description                                  | Default        | Required |
|-------------------|---------------|----------------------------------------------|----------------|----------|
| `external_labels` | `map(string)` | Labels to add to logs sent over the network. | `{}`           | no       |
| `max_streams`     | `int`         | Maximum number of active streams.            | `0` (no limit) | no       |

## Blocks

You can use the following blocks with `loki.write`:

No valid configuration blocks found.

### `endpoint`

The `endpoint` block describes a single location to send logs to. You can use multiple `endpoint` blocks to send logs to multiple locations.

The following arguments are supported:


| Name                     | Type                | Description                                                                                      | Default   | Required |
|--------------------------|---------------------|--------------------------------------------------------------------------------------------------|-----------|----------|
| `url`                    | `string`            | Full URL to send logs to.                                                                        |           | yes      |
| `batch_size`             | `string`            | Maximum batch size of logs to accumulate before sending.                                         | `"1MiB"`  | no       |
| `batch_wait`             | `duration`          | Maximum amount of time to wait before sending a batch.                                           | `"1s"`    | no       |
| `bearer_token_file`      | `string`            | File containing a bearer token to authenticate with.                                             |           | no       |
| `bearer_token`           | `secret`            | Bearer token to authenticate with.                                                               |           | no       |
| `enable_http2`           | `bool`              | Whether HTTP2 is supported for requests.                                                         | `true`    | no       |
| `follow_redirects`       | `bool`              | Whether redirects returned by the server should be followed.                                     | `true`    | no       |
| `http_headers`           | `map(list(secret))` | Custom HTTP headers to be sent along with each request. The map key is the header name.          |           | no       |
| `headers`                | `map(string)`       | Extra headers to deliver with the request.                                                       |           | no       |
| `max_backoff_period`     | `duration`          | Maximum backoff time between retries.                                                            | `"5m"`    | no       |
| `max_backoff_retries`    | `int`               | Maximum number of retries.                                                                       | `10`      | no       |
| `min_backoff_period`     | `duration`          | Initial backoff time between retries.                                                            | `"500ms"` | no       |
| `name`                   | `string`            | Optional name to identify this endpoint with.                                                    |           | no       |
| `no_proxy`               | `string`            | Comma-separated list of IP addresses, CIDR notations, and domain names to exclude from proxying. |           | no       |
| `proxy_connect_header`   | `map(list(secret))` | Specifies headers to send to proxies during CONNECT requests.                                    |           | no       |
| `proxy_from_environment` | `bool`              | Use the proxy URL indicated by environment variables.                                            | `false`   | no       |
| `proxy_url`              | `string`            | HTTP proxy to send requests through.                                                             |           | no       |
| `remote_timeout`         | `duration`          | Timeout for requests made to the URL.                                                            | `"10s"`   | no       |
| `retry_on_http_429`      | `bool`              | Retry when an HTTP 429 status code is received.                                                  | `true`    | no       |
| `tenant_id`              | `string`            | The tenant ID used by default to push logs.                                                      |           | no       |

At most, one of the following can be provided:

- \[`authorization`]\[authorization] block
- \[`basic_auth`]\[basic\_auth] block
- \[`bearer_token_file`]\[endpoint] argument
- \[`bearer_token`]\[endpoint] argument
- \[`oauth2`]\[oauth2] block

`no_proxy` can contain IPs, CIDR notations, and domain names. IP and domain names can contain port numbers. `proxy_url` must be configured if `no_proxy` is configured.

`proxy_from_environment` uses the environment variables HTTP\_PROXY, HTTPS\_PROXY, and NO\_PROXY (or the lowercase versions thereof). Requests use the proxy from the environment variable matching their scheme, unless excluded by NO\_PROXY. `proxy_url` and `no_proxy` must not be configured if `proxy_from_environment` is configured.

`proxy_connect_header` should only be configured if `proxy_url` or `proxy_from_environment` are configured.

If no `tenant_id` is provided, the component assumes that the Loki instance at `endpoint` is running in single-tenant mode and no X-Scope-OrgID header is sent.

When multiple `endpoint` blocks are provided, the `loki.write` component creates a client for each. Received log entries are fanned-out to these endpoints in succession. That means that if one endpoint is bottlenecked, it may impact the rest.

Each endpoint has a *queue* of batches to be sent. The `queue_config` block can be used to customize the behavior of this queue.

Endpoints can be named for easier identification in debug metrics by using the `name` argument. If the `name` argument isn’t provided, a name is generated based on a hash of the endpoint settings.

The `retry_on_http_429` argument specifies whether `HTTP 429` status code responses should be treated as recoverable errors. Other `HTTP 4xx` status code responses are never considered recoverable errors. When `retry_on_http_429` is enabled, the retry mechanism is governed by the backoff configuration specified through `min_backoff_period`, `max_backoff_period` and `max_backoff_retries` attributes.

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

### `queue_config`

> **EXPERIMENTAL**: This is an [experimental](/docs/release-life-cycle/) feature. Experimental features are subject to frequent breaking changes, and may be removed with no equivalent replacement. To enable and use an experimental feature, you must set the `stability.level` [flag](/docs/alloy/latest/reference/cli/run/) to `experimental`.

The optional `queue_config` block configures how the endpoint queues batches of logs sent to Loki.

The following arguments are supported:


| Name                | Type       | Description                                                                                                                                                                   | Default | Required |
|---------------------|------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|---------|----------|
| `block_on_overflow` | `bool`     | If `true`, block until there is space in the queue; if `false`, drop entries when queue is full.                                                                              | `true`  | no       |
| `capacity`          | `string`   | Controls the size of the underlying send queue buffer. This setting should be considered a worst-case scenario of memory consumption, in which all enqueued batches are full. | `10MiB` | no       |
| `drain_timeout`     | `duration` | Configures the maximum time the client can take to drain the send queue upon shutdown. During that time, it enqueues pending batches and drains the send queue sending each.  | `"1m"`  | no       |
| `min_shards`        | `number`   | Minimum number of concurrent shards sending samples to the endpoint.                                                                                                          | `1`     | no       |

Each endpoint is divided into a number of concurrent *shards* which are responsible for sending a fraction of batches. The number of shards is controlled with `min_shards` argument. Each shard has a queue of batches it keeps in memory, controlled with the `capacity` argument.

Queue size is calculated using `batch_size` and `capacity` for each shard. So if `batch_size` is 1MiB and `capacity` is 10MiB each shard would be able to queue up 10 batches. The maximum amount of memory required for all configured shards can be calculated using `capacity` * `min_shards`.

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

### `wal`

> **EXPERIMENTAL**: This is an [experimental](/docs/release-life-cycle/) feature. Experimental features are subject to frequent breaking changes, and may be removed with no equivalent replacement. To enable and use an experimental feature, you must set the `stability.level` [flag](/docs/alloy/latest/reference/cli/run/) to `experimental`.

The optional `wal` block configures the Write-Ahead Log (WAL) used in the Loki remote-write client. To enable the WAL, you must include the `wal` block in your configuration. When the WAL is enabled, the log entries sent to the `loki.write` component are first written to a WAL under the `dir` directory and then read into the remote-write client. This process provides durability guarantees when an entry reaches this component. The client knows when to read from the WAL using the following two mechanisms:

- The WAL-writer side of the `loki.write` component notifies the reader side that new data is available.
- The WAL-reader side periodically checks if there is new data, increasing the wait time exponentially between `min_read_frequency` and `max_read_frequency`.

The WAL is located inside a component-specific directory relative to the storage path Alloy is configured to use. Refer to the [`run` documentation](../../../cli/run/) for more information about how to change the storage path.

The following arguments are supported:


| Name                 | Type       | Description                                                                                                    | Default   | Required |
|----------------------|------------|----------------------------------------------------------------------------------------------------------------|-----------|----------|
| `drain_timeout`      | `duration` | Maximum time the WAL drain procedure can take, before being forcefully stopped.                                | `"30s"`   | no       |
| `enabled`            | `bool`     | Whether to enable the WAL.                                                                                     | `false`   | no       |
| `max_read_frequency` | `duration` | Maximum backoff time in the backup read mechanism.                                                             | `"1s"`    | no       |
| `max_segment_age`    | `duration` | Maximum time a WAL segment should be allowed to live. Segments older than this setting are eventually deleted. | `"1h"`    | no       |
| `min_read_frequency` | `duration` | Minimum backoff time in the backup read mechanism.                                                             | `"250ms"` | no       |

## Exported fields

The following fields are exported and can be referenced by other components:


| Name       | Type           | Description                                                   |
|------------|----------------|---------------------------------------------------------------|
| `receiver` | `LogsReceiver` | A value that other components can use to send log entries to. |

## Component health

`loki.write` is only reported as unhealthy if given an invalid configuration.

## Debug information

`loki.write` doesn’t expose any component-specific debug information.

## Debug metrics

- `loki_write_batch_retries_total` (counter): Number of times batches have had to be retried.
- `loki_write_dropped_bytes_total` (counter): Number of bytes dropped because failed to be sent to the ingester after all retries.
- `loki_write_dropped_entries_total` (counter): Number of log entries dropped because they failed to be sent to the ingester after all retries.
- `loki_write_sent_bytes_total` (counter): Number of bytes sent.
- `loki_write_sent_entries_total` (counter): Number of log entries sent to the ingester.
- `loki_write_request_size_bytes` (histogram): Number of bytes for encoded requests.
- `loki_write_request_duration_seconds` (histogram): Duration of sent requests.
- `loki_write_entry_propagation_latency_seconds` (histogram): Time in seconds from entry creation until it’s either successfully sent or dropped.

## Examples

The following examples show you how to create `loki.write` components that send log entries to different destinations.

### Send log entries to a local Loki instance

You can create a `loki.write` component that sends your log entries to a local Loki instance:

Alloy 

```alloy
loki.write "local" {
    endpoint {
        url = "http://loki:3100/loki/api/v1/push"
    }
}
```

### Send log entries to a managed service

You can create a `loki.write` component that sends your log entries to a managed service, for example, Grafana Cloud. The Loki username and Grafana Cloud API Key are injected in this example through environment variables.

Alloy 

```alloy
loki.write "default" {
    endpoint {
        url = "https://logs-xxx.grafana.net/loki/api/v1/push"
        basic_auth {
            username = sys.env("LOKI_USERNAME")
            password = sys.env("GRAFANA_CLOUD_API_KEY")
        }
    }
}
```

## Technical details

`loki.write` uses [snappy](https://en.wikipedia.org/wiki/Snappy_%28compression%29) for compression.

Any labels that start with `__` are removed before sending to the endpoint.

## Compatible components

`loki.write` has exports that can be consumed by the following components:

- Components that consume [Loki `LogsReceiver`](../../../compatibility/#loki-logsreceiver-consumers)

> Note
> 
> Connecting some components may not be sensible or components may require further configuration to make the connection work correctly. Refer to the linked documentation for more details.
