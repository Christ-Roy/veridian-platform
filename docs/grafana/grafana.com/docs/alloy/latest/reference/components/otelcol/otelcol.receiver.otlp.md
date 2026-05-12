---
title: "otelcol.receiver.otlp | Grafana Alloy documentation"
description: "Learn about otelcol.receiver.otlp"
---

# `otelcol.receiver.otlp`

`otelcol.receiver.otlp` accepts OTLP-formatted data over the network and forwards it to other `otelcol.*` components.

> Note
> 
> `otelcol.receiver.otlp` is a wrapper over the upstream OpenTelemetry Collector [`otlp`](https://github.com/open-telemetry/opentelemetry-collector/tree/v0.147.0/receiver/otlpreceiver) receiver. Bug reports or feature requests will be redirected to the upstream repository, if necessary.

Multiple `otelcol.receiver.otlp` components can be specified by giving them different labels.

## Usage

Alloy 

```alloy
otelcol.receiver.otlp "<LABEL>" {
  grpc { ... }
  http { ... }

  output {
    metrics = [...]
    logs    = [...]
    traces  = [...]
  }
}
```

## Arguments

The `otelcol.receiver.otlp` component doesn’t support any arguments. You can configure this component with blocks.

## Blocks

You can use the following blocks with `otelcol.receiver.otlp`:

No valid configuration blocks found.

### `output`

Required

The `output` block configures a set of components to forward resulting telemetry data to.

The following arguments are supported:


| Name      | Type                     | Description                           | Default | Required |
|-----------|--------------------------|---------------------------------------|---------|----------|
| `logs`    | `list(otelcol.Consumer)` | List of consumers to send logs to.    | `[]`    | no       |
| `metrics` | `list(otelcol.Consumer)` | List of consumers to send metrics to. | `[]`    | no       |
| `traces`  | `list(otelcol.Consumer)` | List of consumers to send traces to.  | `[]`    | no       |

You must specify the `output` block, but all its arguments are optional. By default, telemetry data is dropped. Configure the `metrics`, `logs`, and `traces` arguments accordingly to send telemetry data to other components.

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

### `grpc`

The `grpc` block configures the gRPC server used by the component. If the `grpc` block isn’t provided, a gRPC server isn’t started.

The following arguments are supported:


| Name                     | Type                       | Description                                                                  | Default          | Required |
|--------------------------|----------------------------|------------------------------------------------------------------------------|------------------|----------|
| `auth`                   | `capsule(otelcol.Handler)` | Handler from an `otelcol.auth` component to use for authenticating requests. |                  | no       |
| `endpoint`               | `string`                   | `host:port` to listen for traffic on.                                        | `"0.0.0.0:4317"` | no       |
| `include_metadata`       | `bool`                     | Propagate incoming connection metadata to downstream consumers.              | `false`          | no       |
| `max_concurrent_streams` | `number`                   | Limit the number of concurrent streaming RPC calls.                          |                  | no       |
| `max_recv_msg_size`      | `string`                   | Maximum size of messages the server will accept.                             | `"4MiB"`         | no       |
| `read_buffer_size`       | `string`                   | Size of the read buffer the gRPC server will use for reading from clients.   | `"512KiB"`       | no       |
| `transport`              | `string`                   | Transport to use for the gRPC server.                                        | `"tcp"`          | no       |
| `write_buffer_size`      | `string`                   | Size of the write buffer the gRPC server will use for writing to clients.    |                  | no       |

### `keepalive`

The `keepalive` block configures keepalive settings for connections to a gRPC server.

`keepalive` doesn’t support any arguments and is configured fully through inner blocks.

### `enforcement_policy`

The `enforcement_policy` block configures the keepalive enforcement policy for gRPC servers. The server will close connections from clients that violate the configured policy.

The following arguments are supported:


| Name                    | Type       | Description                                                             | Default | Required |
|-------------------------|------------|-------------------------------------------------------------------------|---------|----------|
| `min_time`              | `duration` | Minimum time clients should wait before sending a keepalive ping.       | `"5m"`  | no       |
| `permit_without_stream` | `boolean`  | Allow clients to send keepalive pings when there are no active streams. | `false` | no       |

### `server_parameters`

The `server_parameters` block controls keepalive and maximum age settings for gRPC servers.

The following arguments are supported:


| Name                       | Type       | Description                                                                         | Default      | Required |
|----------------------------|------------|-------------------------------------------------------------------------------------|--------------|----------|
| `max_connection_age_grace` | `duration` | Time to wait before forcibly closing connections.                                   | `"infinity"` | no       |
| `max_connection_age`       | `duration` | Maximum age for non-idle connections.                                               | `"infinity"` | no       |
| `max_connection_idle`      | `duration` | Maximum age for idle connections.                                                   | `"infinity"` | no       |
| `time`                     | `duration` | How often to ping inactive clients to check for liveness.                           | `"2h"`       | no       |
| `timeout`                  | `duration` | Time to wait before closing inactive clients that don’t respond to liveness checks. | `"20s"`      | no       |

### `tls`

The `tls` block configures TLS settings used for a server. If the `tls` block isn’t provided, TLS won’t be used for connections to the server.

The following arguments are supported:


| Name                           | Type           | Description                                                                                  | Default     | Required |
|--------------------------------|----------------|----------------------------------------------------------------------------------------------|-------------|----------|
| `ca_file`                      | `string`       | Path to the CA file.                                                                         |             | no       |
| `ca_pem`                       | `string`       | CA PEM-encoded text to validate the server with.                                             |             | no       |
| `cert_file`                    | `string`       | Path to the TLS certificate.                                                                 |             | no       |
| `cert_pem`                     | `string`       | Certificate PEM-encoded text for client authentication.                                      |             | no       |
| `cipher_suites`                | `list(string)` | A list of TLS cipher suites that the TLS transport can use.                                  | `[]`        | no       |
| `client_ca_file`               | `string`       | Path to the TLS cert to use by the server to verify a client certificate.                    |             | no       |
| `curve_preferences`            | `list(string)` | Set of elliptic curves to use in a handshake.                                                | `[]`        | no       |
| `include_system_ca_certs_pool` | `boolean`      | Whether to load the system certificate authorities pool alongside the certificate authority. | `false`     | no       |
| `key_file`                     | `string`       | Path to the TLS certificate key.                                                             |             | no       |
| `key_pem`                      | `secret`       | Key PEM-encoded text for client authentication.                                              |             | no       |
| `max_version`                  | `string`       | Maximum acceptable TLS version for connections.                                              | `"TLS 1.3"` | no       |
| `min_version`                  | `string`       | Minimum acceptable TLS version for connections.                                              | `"TLS 1.2"` | no       |
| `reload_interval`              | `duration`     | The duration after which the certificate is reloaded.                                        | `"0s"`      | no       |

If `reload_interval` is set to `"0s"`, the certificate never reloaded.

The following pairs of arguments are mutually exclusive and can’t both be set simultaneously:

- `ca_pem` and `ca_file`
- `cert_pem` and `cert_file`
- `key_pem` and `key_file`

If `cipher_suites` is left blank, a safe default list is used. Refer to the [Go Cipher Suites documentation](https://go.dev/src/crypto/tls/cipher_suites.go) for a list of supported cipher suites.

`client_ca_file` sets the `ClientCA` and `ClientAuth` to `RequireAndVerifyClientCert` in the `TLSConfig`. Refer to the [Go TLS documentation](https://godoc.org/crypto/tls#Config) for more information.

The `curve_preferences` argument determines the set of elliptic curves to prefer during a handshake in preference order. If not provided, a default list is used. The set of elliptic curves available are `X25519`, `P521`, `P256`, and `P384`.

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

### `http`

The `http` block configures the HTTP server used by the component. If the `http` block isn’t specified, an HTTP server isn’t started.

The following arguments are supported:


| Name                     | Type                       | Description                                                                  | Default                                                    | Required |
|--------------------------|----------------------------|------------------------------------------------------------------------------|------------------------------------------------------------|----------|
| `auth`                   | `capsule(otelcol.Handler)` | Handler from an `otelcol.auth` component to use for authenticating requests. |                                                            | no       |
| `compression_algorithms` | `list(string)`             | A list of compression algorithms the server can accept.                      | `["", "gzip", "zstd", "zlib", "snappy", "deflate", "lz4"]` | no       |
| `endpoint`               | `string`                   | `host:port` to listen for traffic on.                                        | `"0.0.0.0:4318"`                                           | no       |
| `include_metadata`       | `bool`                     | Propagate incoming connection metadata to downstream consumers.              | `false`                                                    | no       |
| `keep_alives_enabled`    | `boolean`                  | Whether or not HTTP keep-alives are enabled                                  | `true`                                                     | no       |
| `logs_url_path`          | `string`                   | The URL path to receive logs on.                                             | `"/v1/logs"`                                               | no       |
| `max_request_body_size`  | `string`                   | Maximum request body size the server will allow.                             | `"20MiB"`                                                  | no       |
| `metrics_url_path`       | `string`                   | The URL path to receive metrics on.                                          | `"/v1/metrics"`                                            | no       |
| `traces_url_path`        | `string`                   | The URL path to receive traces on.                                           | `"/v1/traces"`                                             | no       |

To send telemetry signals to `otelcol.receiver.otlp` with HTTP/JSON, POST to:

- `[endpoint][traces_url_path]` for traces.
- `[endpoint][metrics_url_path]` for metrics.
- `[endpoint][logs_url_path]` for logs.

### `cors`

The `cors` block configures CORS settings for an HTTP server.

The following arguments are supported:


| Name              | Type           | Description                                              | Default                | Required |
|-------------------|----------------|----------------------------------------------------------|------------------------|----------|
| `allowed_origins` | `list(string)` | Allowed values for the `Origin` header.                  |                        | no       |
| `allowed_headers` | `list(string)` | Accepted headers from CORS requests.                     | `["X-Requested-With"]` | no       |
| `max_age`         | `number`       | Configures the `Access-Control-Max-Age` response header. |                        | no       |

The `allowed_headers` argument specifies which headers are acceptable from a CORS request. The following headers are always implicitly allowed:

- `Accept`
- `Accept-Language`
- `Content-Type`
- `Content-Language`

If `allowed_headers` includes `"*"`, all headers are permitted.

## Exported fields

`otelcol.receiver.otlp` doesn’t export any fields.

## Component health

`otelcol.receiver.otlp` is only reported as unhealthy if given an invalid configuration.

## Debug information

`otelcol.receiver.otlp` doesn’t expose any component-specific debug information.

## Debug metrics

- `otelcol_receiver_accepted_spans_total` (counter): Number of spans successfully pushed into the pipeline.
- `otelcol_receiver_refused_spans_total` (counter): Number of spans that couldn’t be pushed into the pipeline.
- `rpc_server_duration_milliseconds` (histogram): Duration of RPC requests from a gRPC server.
- `rpc_server_request_size_bytes` (histogram): Measures size of RPC request messages (uncompressed).
- `rpc_server_requests_per_rpc` (histogram): Measures the number of messages received per RPC. Should be 1 for all non-streaming RPCs.
- `rpc_server_response_size_bytes` (histogram): Measures size of RPC response messages (uncompressed).
- `rpc_server_responses_per_rpc` (histogram): Measures the number of messages received per RPC. Should be 1 for all non-streaming RPCs.

## Example

This example forwards received telemetry data through a batch processor before finally sending it to an OTLP-capable endpoint:

Alloy 

```alloy
otelcol.receiver.otlp "default" {
  http {}
  grpc {}

  output {
    metrics = [otelcol.processor.batch.default.input]
    logs    = [otelcol.processor.batch.default.input]
    traces  = [otelcol.processor.batch.default.input]
  }
}

otelcol.processor.batch "default" {
  output {
    metrics = [otelcol.exporter.otlphttp.default.input]
    logs    = [otelcol.exporter.otlphttp.default.input]
    traces  = [otelcol.exporter.otlphttp.default.input]
  }
}

otelcol.exporter.otlphttp "default" {
  client {
    endpoint = sys.env("<OTLP_ENDPOINT>")
  }
}
```

## Technical details

`otelcol.receiver.otlp` supports [Gzip](https://en.wikipedia.org/wiki/Gzip) for compression.

## Enable authentication

You can create a `otelcol.reciever.otlp` component that requires authentication for requests. This is useful for limiting who can push data to the server.

> Note
> 
> Not all OpenTelemetry Collector authentication plugins support receiver authentication. Refer to the [documentation](/docs/alloy/latest/reference/components/otelcol/) for each `otelcol.auth.*` component to determine its compatibility.

Alloy 

```alloy
otelcol.receiver.otlp "default" {
  http {
    auth = otelcol.auth.basic.creds.handler
  }
  grpc {
     auth = otelcol.auth.basic.creds.handler
  }

  output {
   ...
  }
}

otelcol.auth.basic "creds" {
    username = sys.env("<USERNAME>")
    password = sys.env("<PASSWORD>")
}
```

## Compatible components

`otelcol.receiver.otlp` can accept arguments from the following components:

- Components that export [OpenTelemetry `otelcol.Consumer`](../../../compatibility/#opentelemetry-otelcolconsumer-exporters)

> Note
> 
> Connecting some components may not be sensible or components may require further configuration to make the connection work correctly. Refer to the linked documentation for more details.
