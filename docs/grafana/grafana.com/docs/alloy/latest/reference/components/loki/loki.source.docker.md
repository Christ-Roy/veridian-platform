---
title: "loki.source.docker | Grafana Alloy documentation"
description: "Learn about loki.source.docker"
---

# `loki.source.docker`

`loki.source.docker` reads log entries from Docker containers and forwards them to other `loki.*` components. Each component can read from a single Docker daemon.

You can specify multiple `loki.source.docker` components by giving them different labels.

## Usage

Alloy 

```alloy
loki.source.docker "LABEL" {
  host       = HOST
  targets    = TARGET_LIST
  forward_to = RECEIVER_LIST
}
```

## Arguments

The component starts a new reader for each of the given `targets` and fans out log entries to the list of receivers passed in `forward_to`.

You can use the following arguments with `loki.source.docker`:


| Name               | Type                 | Description                                                                    | Default | Required |
|--------------------|----------------------|--------------------------------------------------------------------------------|---------|----------|
| `forward_to`       | `list(LogsReceiver)` | List of receivers to send log entries to.                                      |         | yes      |
| `host`             | `string`             | Address of the Docker daemon.                                                  |         | yes      |
| `labels`           | `map(string)`        | The default set of labels to apply on entries.                                 | `{}`    | yes      |
| `targets`          | `list(map(string))`  | List of containers to read logs from.                                          |         | yes      |
| `refresh_interval` | `duration`           | The refresh interval to use when connecting to the Docker daemon over HTTP(S). | `"60s"` | no       |
| `relabel_rules`    | `RelabelRules`       | Relabeling rules to apply on log entries.                                      | `{}`    | no       |

## Blocks

You can use the following blocks with `loki.source.docker`:

No valid configuration blocks found.

These blocks are only applicable when connecting to a Docker daemon over HTTP or HTTPS and has no effect when connecting via a `unix:///` socket

### `http_client_config`

The `http_client_config` block configures settings used to connect to HTTP(S) Docker daemons.


| Name                     | Type                | Description                                                                                      | Default | Required |
|--------------------------|---------------------|--------------------------------------------------------------------------------------------------|---------|----------|
| `bearer_token_file`      | `string`            | File containing a bearer token to authenticate with.                                             |         | no       |
| `bearer_token`           | `secret`            | Bearer token to authenticate with.                                                               |         | no       |
| `enable_http2`           | `bool`              | Whether HTTP2 is supported for requests.                                                         | `true`  | no       |
| `follow_redirects`       | `bool`              | Whether redirects returned by the server should be followed.                                     | `true`  | no       |
| `http_headers`           | `map(list(secret))` | Custom HTTP headers to be sent along with each request. The map key is the header name.          |         | no       |
| `proxy_url`              | `string`            | HTTP proxy to send requests through.                                                             |         | no       |
| `no_proxy`               | `string`            | Comma-separated list of IP addresses, CIDR notations, and domain names to exclude from proxying. |         | no       |
| `proxy_from_environment` | `bool`              | Use the proxy URL indicated by environment variables.                                            | `false` | no       |
| `proxy_connect_header`   | `map(list(secret))` | Specifies headers to send to proxies during CONNECT requests.                                    |         | no       |

`bearer_token`, `bearer_token_file`, `basic_auth`, `authorization`, and `oauth2` are mutually exclusive, and only one can be provided inside of a `http_client_config` block.

`no_proxy` can contain IPs, CIDR notations, and domain names. IP and domain names can contain port numbers. `proxy_url` must be configured if `no_proxy` is configured.

`proxy_from_environment` uses the environment variables HTTP\_PROXY, HTTPS\_PROXY, and NO\_PROXY (or the lowercase versions thereof). Requests use the proxy from the environment variable matching their scheme, unless excluded by NO\_PROXY. `proxy_url` and `no_proxy` must not be configured if `proxy_from_environment` is configured.

`proxy_connect_header` should only be configured if `proxy_url` or `proxy_from_environment` are configured.

### `authorization`

The `authorization` block configures custom authorization to use for the Docker daemon.


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

The `basic_auth` block configures basic authentication for HTTP(S) Docker daemons.


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

The `oauth2` block configures OAuth 2.0 authorization to use for the Docker daemon.


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

The `tls_config` block configures TLS settings for connecting to HTTPS Docker daemons.


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

## Exported fields

`loki.source.docker` doesn’t export any fields.

## Component health

`loki.source.docker` is only reported as unhealthy if given an invalid configuration.

## Debug information

`loki.source.docker` exposes some debug information per target:

- Whether the target is ready to tail entries.
- The labels associated with the target.
- The most recent time a log line was read.

## Debug metrics

- `loki_source_docker_target_entries_total` (gauge): Total number of successful entries sent to the Docker target.
- `loki_source_docker_target_parsing_errors_total` (gauge): Total number of parsing errors while receiving Docker messages.

## Component behavior

The component uses its data path, a directory named after the domain’s fully qualified name, to store its *positions file*. The positions file is used to store read offsets, so that if a component or Alloy restarts, `loki.source.docker` can pick up tailing from the same spot.

If the target’s argument contains multiple entries with the same container ID, for example, as a result of `discovery.docker` picking up multiple exposed ports or networks, `loki.source.docker` deduplicates them, and only keeps the first of each container ID instances, based on the `__meta_docker_container_id` label. As such, the Docker daemon is queried for each container ID only once, and only one target is available in the component’s debug info.

## Example

This example collects log entries from the files specified in the `targets` argument and forwards them to a `loki.write` component to be written to Loki.

Alloy 

```alloy
discovery.docker "linux" {
  host = "unix:///var/run/docker.sock"
}

loki.source.docker "default" {
  host       = "unix:///var/run/docker.sock"
  targets    = discovery.docker.linux.targets
  labels     = {"app" = "docker"}
  forward_to = [loki.write.local.receiver]
}

loki.write "local" {
  endpoint {
    url = "http://loki:3100/loki/api/v1/push"
  }
}
```

## Compatible components

`loki.source.docker` can accept arguments from the following components:

- Components that export [Targets](../../../compatibility/#targets-exporters)
- Components that export [Loki `LogsReceiver`](../../../compatibility/#loki-logsreceiver-exporters)

> Note
> 
> Connecting some components may not be sensible or components may require further configuration to make the connection work correctly. Refer to the linked documentation for more details.
