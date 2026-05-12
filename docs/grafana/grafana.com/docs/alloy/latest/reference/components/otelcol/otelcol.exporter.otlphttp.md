---
title: "otelcol.exporter.otlphttp | Grafana Alloy documentation"
description: "Learn about otelcol.exporter.otlphttp"
---

# `otelcol.exporter.otlphttp`

`otelcol.exporter.otlphttp` accepts telemetry data from other `otelcol` components and writes them over the network using the OTLP HTTP protocol.

> Note
> 
> `otelcol.exporter.otlphttp` is a wrapper over the upstream OpenTelemetry Collector [`otlphttp`](https://github.com/open-telemetry/opentelemetry-collector/tree/v0.147.0/exporter/otlphttpexporter) exporter. Bug reports or feature requests will be redirected to the upstream repository, if necessary.

You can specify multiple `otelcol.exporter.otlphttp` components by giving them different labels.

## Usage

Alloy 

```alloy
otelcol.exporter.otlphttp "<LABEL>" {
  client {
    endpoint = "<HOST>:<PORT>"
  }
}
```

## Arguments

You can use the following arguments with `otelcol.exporter.otlphttp`:


| Name               | Type     | Description                                                               | Default                           | Required |
|--------------------|----------|---------------------------------------------------------------------------|-----------------------------------|----------|
| `encoding`         | `string` | The encoding to use for messages. Should be either `"proto"` or `"json"`. | `"proto"`                         | no       |
| `logs_endpoint`    | `string` | The endpoint to send logs to.                                             | `client.endpoint + "/v1/logs"`    | no       |
| `metrics_endpoint` | `string` | The endpoint to send metrics to.                                          | `client.endpoint + "/v1/metrics"` | no       |
| `traces_endpoint`  | `string` | The endpoint to send traces to.                                           | `client.endpoint + "/v1/traces"`  | no       |

The default value depends on the `endpoint` field set in the required `client` block. If set, these arguments override the `client.endpoint` field for the corresponding signal.

## Blocks

You can use the following blocks with `otelcol.exporter.otlphttp`:

No valid configuration blocks found.

### `client`

Required

The `client` block configures the HTTP client used by the component.

The following arguments are supported:


| Name                      | Type                       | Description                                                                                                        | Default    | Required |
|---------------------------|----------------------------|--------------------------------------------------------------------------------------------------------------------|------------|----------|
| `endpoint`                | `string`                   | The target URL to send telemetry data to.                                                                          |            | yes      |
| `auth`                    | `capsule(otelcol.Handler)` | Handler from an `otelcol.auth` component to use for authenticating requests.                                       |            | no       |
| `compression`             | `string`                   | Compression mechanism to use for requests.                                                                         | `"gzip"`   | no       |
| `disable_keep_alives`     | `bool`                     | Disable HTTP keep-alive.                                                                                           | `false`    | no       |
| `force_attempt_http2`     | `bool`                     | Force the HTTP client to try to use the HTTP/2 protocol.                                                           | `true`     | no       |
| `headers`                 | `map(string)`              | Additional headers to send with the request.                                                                       | `{}`       | no       |
| `http2_ping_timeout`      | `duration`                 | Timeout after which the connection will be closed if a response to Ping isn’t received.                            | `"15s"`    | no       |
| `http2_read_idle_timeout` | `duration`                 | Timeout after which a health check using ping frame will be carried out if no frame is received on the connection. | `"0s"`     | no       |
| `idle_conn_timeout`       | `duration`                 | Time to wait before an idle connection closes itself.                                                              | `"90s"`    | no       |
| `max_conns_per_host`      | `int`                      | Limits the total (dialing,active, and idle) number of connections per host.                                        | `0`        | no       |
| `max_idle_conns_per_host` | `int`                      | Limits the number of idle HTTP connections the host can keep open.                                                 | `0`        | no       |
| `max_idle_conns`          | `int`                      | Limits the number of idle HTTP connections the client can keep open.                                               | `100`      | no       |
| `proxy_url`               | `string`                   | HTTP proxy to send requests through.                                                                               |            | no       |
| `read_buffer_size`        | `string`                   | Size of the read buffer the HTTP client uses for reading server responses.                                         | `0`        | no       |
| `timeout`                 | `duration`                 | Time to wait before marking a request as failed.                                                                   | `"30s"`    | no       |
| `write_buffer_size`       | `string`                   | Size of the write buffer the HTTP client uses for writing requests.                                                | `"512KiB"` | no       |

When setting `headers`, note that:

- Certain headers such as `Content-Length` and `Connection` are automatically written when needed and values in `headers` may be ignored.
- The `Host` header is automatically derived from the `endpoint` value. However, this automatic assignment can be overridden by explicitly setting a `Host` header in `headers`.

Setting `disable_keep_alives` to `true` will result in significant overhead establishing a new HTTP or HTTPS connection for every request. Before enabling this option, consider whether changes to idle connection settings can achieve your goal.

If `http2_ping_timeout` is unset or set to `0s`, it will default to `15s`.

If `http2_read_idle_timeout` is unset or set to `0s`, then no health check will be performed.

Golang’s default HTTP transport attempts HTTP/2 by default, however some settings (`max_conns_per_host`, `max_idle_conns_per_host`, `max_idle_conns`) are only relevant for HTTP/1. The `force_attempt_http2` attribute allows a user to only attempt HTTP/1.

By default, requests are compressed with Gzip. The `compression` argument controls which compression mechanism to use. Supported strings are:

- `"gzip"`
- `"zlib"`
- `"deflate"`
- `"snappy"`
- `"zstd"`

If you set `compression` to `"none"` or an empty string `""`, the requests aren’t compressed.

### `compression_params`

The `compression_params` block allows for configuration of advanced compression options.

The following arguments are supported:


| Name    | Type  | Description                  | Default | Required |
|---------|-------|------------------------------|---------|----------|
| `level` | `int` | Configure compression level. |         | yes      |

For valid combinations of `client.compression` and `client.compression_params.level`, refer to the [upstream documentation](https://github.com/open-telemetry/opentelemetry-collector/blob/v0.147.0/config/confighttp/README.md).

### `cookies`

The `cookies` block allows the HTTP client to store cookies from server responses and reuse them in subsequent requests.

This could be useful in situations such as load balancers relying on cookies for sticky sessions and enforcing a maximum session age.

The following arguments are supported:


| Name      | Type   | Description                               | Default | Required |
|-----------|--------|-------------------------------------------|---------|----------|
| `enabled` | `bool` | The target URL to send telemetry data to. | `false` | no       |

### `tls`

The `tls` block configures TLS settings used for the connection to the HTTP server.

The following arguments are supported:


| Name                           | Type           | Description                                                                                  | Default     | Required |
|--------------------------------|----------------|----------------------------------------------------------------------------------------------|-------------|----------|
| `ca_file`                      | `string`       | Path to the CA file.                                                                         |             | no       |
| `ca_pem`                       | `string`       | CA PEM-encoded text to validate the server with.                                             |             | no       |
| `cert_file`                    | `string`       | Path to the TLS certificate.                                                                 |             | no       |
| `cert_pem`                     | `string`       | Certificate PEM-encoded text for client authentication.                                      |             | no       |
| `cipher_suites`                | `list(string)` | A list of TLS cipher suites that the TLS transport can use.                                  | `[]`        | no       |
| `curve_preferences`            | `list(string)` | Set of elliptic curves to use in a handshake.                                                | `[]`        | no       |
| `include_system_ca_certs_pool` | `boolean`      | Whether to load the system certificate authorities pool alongside the certificate authority. | `false`     | no       |
| `insecure_skip_verify`         | `boolean`      | Ignores insecure server TLS certificates.                                                    |             | no       |
| `insecure`                     | `boolean`      | Disables TLS when connecting to the configured server.                                       |             | no       |
| `key_file`                     | `string`       | Path to the TLS certificate key.                                                             |             | no       |
| `key_pem`                      | `secret`       | Key PEM-encoded text for client authentication.                                              |             | no       |
| `max_version`                  | `string`       | Maximum acceptable TLS version for connections.                                              | `"TLS 1.3"` | no       |
| `min_version`                  | `string`       | Minimum acceptable TLS version for connections.                                              | `"TLS 1.2"` | no       |
| `reload_interval`              | `duration`     | The duration after which the certificate is reloaded.                                        | `"0s"`      | no       |
| `server_name`                  | `string`       | Verifies the hostname of server certificates when set.                                       |             | no       |

If the server doesn’t support TLS, you must set the `insecure` argument to `true`.

To disable `tls` for connections to the server, set the `insecure` argument to `true`.

If you set `reload_interval` to `"0s"`, the certificate never reloaded.

The following pairs of arguments are mutually exclusive and can’t both be set simultaneously:

- `ca_pem` and `ca_file`
- `cert_pem` and `cert_file`
- `key_pem` and `key_file`

If `cipher_suites` is left blank, a safe default list is used. Refer to the [Go TLS documentation](https://go.dev/src/crypto/tls/cipher_suites.go) for a list of supported cipher suites.

The `curve_preferences` argument determines the set of [elliptic curves](https://go.dev/src/crypto/tls/common.go#L138) to prefer during a handshake in preference order. If not provided, a default list is used. The set of elliptic curves available are `X25519`, `P521`, `P256`, and `P384`.

### `tpm`

The `tpm` block configures retrieving the TLS `key_file` from a trusted device.

The following arguments are supported:


| Name         | Type     | Description                                                        | Default | Required |
|--------------|----------|--------------------------------------------------------------------|---------|----------|
| `auth`       | `string` | The authorization value used to authenticate the TPM device.       | `""`    | no       |
| `enabled`    | `bool`   | Load the `tls.key_file` from TPM.                                  | `false` | no       |
| `owner_auth` | `string` | The owner authorization value used to authenticate the TPM device. | `""`    | no       |
| `path`       | `string` | Path to the TPM device or Unix domain socket.                      | `""`    | no       |

The [trusted platform module](https://trustedcomputinggroup.org/resource/trusted-platform-module-tpm-summary/) (TPM) configuration can be used for loading TLS key from TPM. Currently only TSS2 format is supported.

The `path` attribute is not supported on Windows.

In the following example, the private key `my-tss2-key.key` in TSS2 format is loaded from the TPM device `/dev/tmprm0`:

Alloy 

```alloy
otelcol.example.component "<LABEL>" {
    ...
    tls {
        ...
        key_file = "my-tss2-key.key"
        tpm {
            enabled = true
            path = "/dev/tpmrm0"
        }
    }
}
```

### `debug_metrics`

The `debug_metrics` block configures the metrics that this component generates to monitor its state.

The following arguments are supported:


| Name                               | Type      | Description                                          | Default | Required |
|------------------------------------|-----------|------------------------------------------------------|---------|----------|
| `disable_high_cardinality_metrics` | `boolean` | Whether to disable certain high cardinality metrics. | `true`  | no       |

`disable_high_cardinality_metrics` is the Alloy equivalent to the `telemetry.disableHighCardinalityMetrics` feature gate in the OpenTelemetry Collector. It removes attributes that could cause high cardinality metrics. For example, attributes with IP addresses and port numbers in metrics about HTTP and gRPC connections are removed.

> Note
> 
> If configured, `disable_high_cardinality_metrics` only applies to `otelcol.exporter.*` and `otelcol.receiver.*` components.

### `retry_on_failure`

The `retry_on_failure` block configures how failed requests to the HTTP server are retried.

The following arguments are supported:


| Name                   | Type       | Description                                            | Default | Required |
|------------------------|------------|--------------------------------------------------------|---------|----------|
| `enabled`              | `boolean`  | Enables retrying failed requests.                      | `true`  | no       |
| `initial_interval`     | `duration` | Initial time to wait before retrying a failed request. | `"5s"`  | no       |
| `max_elapsed_time`     | `duration` | Maximum time to wait before discarding a failed batch. | `"5m"`  | no       |
| `max_interval`         | `duration` | Maximum time to wait between retries.                  | `"30s"` | no       |
| `multiplier`           | `number`   | Factor to grow wait time before retrying.              | `1.5`   | no       |
| `randomization_factor` | `number`   | Factor to randomize wait time before retrying.         | `0.5`   | no       |

When `enabled` is `true`, failed batches are retried after a given interval. The `initial_interval` argument specifies how long to wait before the first retry attempt. If requests continue to fail, the time to wait before retrying increases by the factor specified by the `multiplier` argument, which must be greater than `1.0`. The `max_interval` argument specifies the upper bound of how long to wait between retries.

The `randomization_factor` argument is useful for adding jitter between retrying Alloy instances. If `randomization_factor` is greater than `0`, the wait time before retries is multiplied by a random factor in the range `[ I - randomization_factor * I, I + randomization_factor * I]`, where `I` is the current interval.

If a batch hasn’t been sent successfully, it’s discarded after the time specified by `max_elapsed_time` elapses. If `max_elapsed_time` is set to `"0s"`, failed requests are retried forever until they succeed.

### `sending_queue`

The `sending_queue` block configures queueing and batching for the exporter.

The following arguments are supported:


| Name                | Type                       | Description                                                                                | Default      | Required |
|---------------------|----------------------------|--------------------------------------------------------------------------------------------|--------------|----------|
| `block_on_overflow` | `boolean`                  | The behavior when the component’s `TotalSize` limit is reached.                            | `false`      | no       |
| `enabled`           | `boolean`                  | Enables a buffer before sending data to the client.                                        | `true`       | no       |
| `num_consumers`     | `number`                   | Number of readers to send batches written to the queue in parallel.                        | `10`         | no       |
| `queue_size`        | `number`                   | Maximum number of unwritten batches allowed in the queue at the same time.                 | `1000`       | no       |
| `sizer`             | `string`                   | How the queue and batching is measured.                                                    | `"requests"` | no       |
| `wait_for_result`   | `boolean`                  | Determines if incoming requests are blocked until the request is processed or not.         | `false`      | no       |
| `storage`           | `capsule(otelcol.Handler)` | Handler from an `otelcol.storage` component to use to enable a persistent queue mechanism. |              | no       |

The `blocking` argument is deprecated in favor of the `block_on_overflow` argument.

When `block_on_overflow` is `true`, the component will wait for space. Otherwise, operations will immediately return a retryable error.

When `enabled` is `true`, data is first written to an in-memory buffer before sending it to the configured server. Batches sent to the component’s `input` exported field are added to the buffer as long as the number of unsent batches doesn’t exceed the configured `queue_size`.

`queue_size` determines how long an endpoint outage is tolerated. Assuming 100 requests/second, the default queue size `1000` provides about 10 seconds of outage tolerance. To calculate the correct value for `queue_size`, multiply the average number of outgoing requests per second by the time in seconds that outages are tolerated. A very high value can cause Out Of Memory (OOM) kills.

The `sizer` argument could be set to:

- `requests`: number of incoming batches of metrics, logs, traces (the most performant option).
- `items`: number of the smallest parts of each signal (spans, metric data points, log records).
- `bytes`: the size of serialized data in bytes (the least performant option).

The `num_consumers` argument controls how many readers read from the buffer and send data in parallel. Larger values of `num_consumers` allow data to be sent more quickly at the expense of increased network traffic.

If an `otelcol.storage.*` component is configured and provided in the queue’s `storage` argument, the queue uses the provided storage extension to provide a persistent queue and the queue is no longer stored in memory. Any data persisted will be processed on startup if Alloy is killed or restarted. Refer to the [exporterhelper documentation](https://github.com/open-telemetry/opentelemetry-collector/blob/v0.147.0/exporter/exporterhelper/README.md#persistent-queue) in the OpenTelemetry Collector repository for more details.

### `batch`

The `batch` block configures batching requests based on a timeout and a minimum number of items.

Batching is disabled by default. To enable it, explicitly include `batch {}` in your Alloy configuration. You do not need to include a `batch {}` block in your `otelcol.exporter` if you already use a `otelcol.processor.batch` component, although batching in the exporter is the preferred method because it is more flexible.

The following arguments are supported:


| Name            | Type       | Description                                                                                                | Default   | Required |
|-----------------|------------|------------------------------------------------------------------------------------------------------------|-----------|----------|
| `flush_timeout` | `duration` | Time after which a batch will be sent regardless of its size. Must be a non-zero value.                    | `"200ms"` | no       |
| `min_size`      | `number`   | The minimum size of a batch.                                                                               | `2000`    | no       |
| `max_size`      | `number`   | The maximum size of a batch, enables batch splitting.                                                      | `3000`    | no       |
| `sizer`         | `string`   | How the queue and batching is measured. Overrides the sizer set at the `sending_queue` level for batching. | `"items"` | no       |

If configured, `max_size` must be greater than or equal to `min_size`.

The `sizer` argument can be set to:

- `items`: The number of the smallest parts of each span, metric data point, or log record.
- `bytes`: the size of serialized data in bytes (the least performant option).

## Exported fields

The following fields are exported and can be referenced by other components:


| Name    | Type               | Description                                                      |
|---------|--------------------|------------------------------------------------------------------|
| `input` | `otelcol.Consumer` | A value that other components can use to send telemetry data to. |

`input` accepts `otelcol.Consumer` data for any telemetry signal (metrics, logs, or traces).

## Component health

`otelcol.exporter.otlphttp` is only reported as unhealthy if given an invalid configuration.

## Debug information

`otelcol.exporter.otlphttp` doesn’t expose any component-specific debug information.

## Examples

### Grafana Cloud

This example creates an exporter which can send OTLP logs, metrics, and traces to Grafana Cloud using basic authentication:

Alloy 

```alloy
otelcol.exporter.otlphttp "default" {
  client {
    endpoint = `https://otlp-gateway-prod-gb-south-0.grafana.net/otlp`
    auth     = otelcol.auth.basic.creds.handler
  }
}

otelcol.auth.basic "creds" {
  client_auth {
    username = sys.env("OTLP_USERNAME")
    password = sys.env("OTLP_API_KEY")
  }
}
```

### Local Tempo database

This example creates an exporter to send data to a locally running Grafana Tempo without TLS:

Alloy 

```alloy
otelcol.exporter.otlphttp "tempo" {
    client {
        endpoint = "http://tempo:4318"
        tls {
            insecure             = true
            insecure_skip_verify = true
        }
    }
}
```

## Compatible components

`otelcol.exporter.otlphttp` has exports that can be consumed by the following components:

- Components that consume [OpenTelemetry `otelcol.Consumer`](../../../compatibility/#opentelemetry-otelcolconsumer-consumers)

> Note
> 
> Connecting some components may not be sensible or components may require further configuration to make the connection work correctly. Refer to the linked documentation for more details.
