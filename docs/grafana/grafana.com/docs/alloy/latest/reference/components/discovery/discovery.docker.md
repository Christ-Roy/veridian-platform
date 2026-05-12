---
title: "discovery.docker | Grafana Alloy documentation"
description: "Learn about discovery.docker"
---

# `discovery.docker`

`discovery.docker` discovers [Docker Engine](https://docs.docker.com/engine/) containers and exposes them as targets.

## Usage

Alloy 

```alloy
discovery.docker "<LABEL>" {
  host = "<DOCKER_ENGINE_HOST>"
}
```

## Arguments

You can use the following arguments with `discovery.docker`:


| Name                     | Type                | Description                                                                                                         | Default       | Required |
|--------------------------|---------------------|---------------------------------------------------------------------------------------------------------------------|---------------|----------|
| `host`                   | `string`            | Address of the Docker Daemon to connect to.                                                                         |               | yes      |
| `bearer_token_file`      | `string`            | File containing a bearer token to authenticate with.                                                                |               | no       |
| `bearer_token`           | `secret`            | Bearer token to authenticate with.                                                                                  |               | no       |
| `enable_http2`           | `bool`              | Whether HTTP2 is supported for requests.                                                                            | `true`        | no       |
| `follow_redirects`       | `bool`              | Whether redirects returned by the server should be followed.                                                        | `true`        | no       |
| `http_headers`           | `map(list(secret))` | Custom HTTP headers to be sent along with each request. The map key is the header name.                             |               | no       |
| `host_networking_host`   | `string`            | Host to use if the container is in host networking mode.                                                            | `"localhost"` | no       |
| `match_first_network`    | `bool`              | Match the first network if the container has multiple networks defined, thus avoiding collecting duplicate targets. | `true`        | no       |
| `no_proxy`               | `string`            | Comma-separated list of IP addresses, CIDR notations, and domain names to exclude from proxying.                    |               | no       |
| `port`                   | `number`            | Port to use for collecting metrics when containers don’t have any port mappings.                                    | `80`          | no       |
| `proxy_connect_header`   | `map(list(secret))` | Specifies headers to send to proxies during CONNECT requests.                                                       |               | no       |
| `proxy_from_environment` | `bool`              | Use the proxy URL indicated by environment variables.                                                               | `false`       | no       |
| `proxy_url`              | `string`            | HTTP proxy to send requests through.                                                                                |               | no       |
| `refresh_interval`       | `duration`          | Frequency to refresh list of containers.                                                                            | `"1m"`        | no       |

At most, one of the following can be provided:

- \[`authorization`]\[authorization] block
- \[`basic_auth`]\[basic\_auth] block
- [`bearer_token_file`](#arguments) argument
- [`bearer_token`](#arguments) argument
- \[`oauth2`]\[oauth2] block

`no_proxy` can contain IPs, CIDR notations, and domain names. IP and domain names can contain port numbers. `proxy_url` must be configured if `no_proxy` is configured.

`proxy_from_environment` uses the environment variables HTTP\_PROXY, HTTPS\_PROXY, and NO\_PROXY (or the lowercase versions thereof). Requests use the proxy from the environment variable matching their scheme, unless excluded by NO\_PROXY. `proxy_url` and `no_proxy` must not be configured if `proxy_from_environment` is configured.

`proxy_connect_header` should only be configured if `proxy_url` or `proxy_from_environment` are configured.

## Blocks

You can use the following blocks with `discovery.docker`:

No valid configuration blocks found.

### `authorization`

The `authorization` block configures generic authorization to the endpoint.


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

The `basic_auth` block configures basic authentication to the endpoint.


| Name            | Type     | Description                              | Default | Required |
|-----------------|----------|------------------------------------------|---------|----------|
| `password_file` | `string` | File containing the basic auth password. |         | no       |
| `password`      | `secret` | Basic auth password.                     |         | no       |
| `username`      | `string` | Basic auth username.                     |         | no       |

`password` and `password_file` are mutually exclusive, and only one can be provided inside a `basic_auth` block.

> Warning
> 
> Using `password_file` causes the file to be read on every outgoing request. Use the `local.file` component with the `password` attribute instead to avoid unnecessary reads.

### `filter`

The `filter` block configures a filter to pass to the Docker Engine to limit the number of containers returned. You can specify the `filter` block multiple times to provide more than one filter.


| Name     | Type           | Description                   | Default | Required |
|----------|----------------|-------------------------------|---------|----------|
| `name`   | `string`       | Filter name to use.           |         | yes      |
| `values` | `list(string)` | Values to pass to the filter. |         | yes      |

Refer to [List containers](https://docs.docker.com/reference/api/engine/latest/#tag/Container/operation/ContainerList) from the Docker Engine API documentation for the list of supported filters and their meaning.

### `oauth2`

The `oauth2` block configures OAuth 2.0 authentication to the endpoint.


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

The `tls_config` block configures TLS settings for connecting to the endpoint.


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

The following fields are exported and can be referenced by other components:


| Name      | Type                | Description                                        |
|-----------|---------------------|----------------------------------------------------|
| `targets` | `list(map(string))` | The set of targets discovered from the docker API. |

Each target includes the following labels:

- `__meta_docker_container_id`: ID of the container.
- `__meta_docker_container_label_<labelname>`: Each label from the container.
- `__meta_docker_container_name`: Name of the container.
- `__meta_docker_container_network_mode`: Network mode of the container.
- `__meta_docker_network_id`: ID of the Docker network the container is in.
- `__meta_docker_network_ingress`: Set to `true` if the Docker network is an ingress network.
- `__meta_docker_network_internal`: Set to `true` if the Docker network is an internal network.
- `__meta_docker_network_ip`: The IP of the container in the network.
- `__meta_docker_network_label_<labelname>`: Each label from the network the container is in.
- `__meta_docker_network_name`: Name of the Docker network the container is in.
- `__meta_docker_network_scope`: The scope of the network the container is in.
- `__meta_docker_port_private`: The private port on the container.
- `__meta_docker_port_public_ip`: The public IP of the container, if a port mapping exists.
- `__meta_docker_port_public`: The publicly exposed port from the container, if a port mapping exists.

Each discovered container maps to one target per unique combination of networks and port mappings used by the container.

> Note
> 
> Alloy sanitizes Docker label names in `__meta_docker_container_label_<labelname>` and `__meta_docker_network_label_<labelname>` to comply with Prometheus label naming requirements. The component converts dots and other non-alphanumeric characters to underscores. Underscores remain unchanged. For example, a Docker label `com.example.app.name` becomes `__meta_docker_container_label_com_example_app_name`.

## Component health

`discovery.docker` is only reported as unhealthy when given an invalid configuration. In those cases, exported fields retain their last healthy values.

## Debug information

`discovery.docker` doesn’t expose any component-specific debug information.

## Debug metrics

`discovery.docker` doesn’t expose any component-specific debug metrics.

## Examples

### Linux or macOS hosts

This example discovers Docker containers when the host machine is macOS or Linux:

Alloy 

```alloy
discovery.docker "containers" {
  host = "unix:///var/run/docker.sock"
}

prometheus.scrape "demo" {
  targets    = discovery.docker.containers.targets
  forward_to = [prometheus.remote_write.demo.receiver]
}

prometheus.remote_write "demo" {
  endpoint {
    url = "<PROMETHEUS_REMOTE_WRITE_URL>"

    basic_auth {
      username = "<USERNAME>"
      password = "<PASSWORD>"
    }
  }
}
```

Replace the following:

- *`<PROMETHEUS_REMOTE_WRITE_URL>`* : The URL of the Prometheus remote\_write-compatible server to send metrics to.
- *`<USERNAME>`* : The username to use for authentication to the `remote_write` API.
- *`<PASSWORD>`* : The password to use for authentication to the `remote_write` API.

### Windows hosts

This example discovers Docker containers when the host machine is Windows:

> Note
> 
> This example requires the “Expose daemon on tcp://localhost:2375 without TLS” setting to be enabled in the Docker Engine settings.

Alloy 

```alloy
discovery.docker "containers" {
  host = "tcp://localhost:2375"
}

prometheus.scrape "demo" {
  targets    = discovery.docker.containers.example.targets
  forward_to = [prometheus.remote_write.demo.receiver]
}

prometheus.remote_write "demo" {
  endpoint {
    url = "<PROMETHEUS_REMOTE_WRITE_URL>"

    basic_auth {
      username = "<USERNAME>"
      password = "<PASSWORD>"
    }
  }
}
```

Replace the following:

- *`<PROMETHEUS_REMOTE_WRITE_URL>`* : The URL of the Prometheus remote\_write-compatible server to send metrics to.
- *`<USERNAME>`* : The username to use for authentication to the `remote_write` API.
- *`<PASSWORD>`* : The password to use for authentication to the `remote_write` API.

## Compatible components

`discovery.docker` has exports that can be consumed by the following components:

- Components that consume [Targets](../../../compatibility/#targets-consumers)

> Note
> 
> Connecting some components may not be sensible or components may require further configuration to make the connection work correctly. Refer to the linked documentation for more details.
