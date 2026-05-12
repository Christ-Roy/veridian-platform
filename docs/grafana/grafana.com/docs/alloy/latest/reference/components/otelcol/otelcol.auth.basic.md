---
title: "otelcol.auth.basic | Grafana Alloy documentation"
description: "Learn about otelcol.auth.basic"
---

# `otelcol.auth.basic`

`otelcol.auth.basic` exposes a `handler` that other `otelcol` components can use to authenticate requests using basic authentication.

This component supports both server and client authentication.

> Note
> 
> `otelcol.auth.basic` is a wrapper over the upstream OpenTelemetry Collector [`basicauth`](https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/v0.147.0/extension/basicauthextension) extension. Bug reports or feature requests will be redirected to the upstream repository, if necessary.

You can specify multiple `otelcol.auth.basic` components by giving them different labels.

## Usage

Alloy 

```alloy
otelcol.auth.basic "<LABEL>" {
  username = "<USERNAME>"
  password = "<PASSWORD>"
}
```

## Arguments

> Caution
> 
> Don’t use the top-level `username` and `password` arguments for new configurations as they are deprecated. Use the `client_auth` block for client authentication and the `htpasswd` block for server authentication instead.

You can use the following arguments with `otelcol.auth.basic`:


| Name       | Type     | Description                                                     | Default | Required |
|------------|----------|-----------------------------------------------------------------|---------|----------|
| `password` | `secret` | (Deprecated) Password to use for basic authentication requests. |         | no       |
| `username` | `string` | (Deprecated) Username to use for basic authentication requests. |         | no       |

## Blocks

You can use the following block with `otelcol.auth.basic`:

No valid configuration blocks found.

### `client_auth`

The `client_auth` block configures credentials that client extensions (such as exporters) use to authenticate to servers.


| Name            | Type     | Description                                                                       | Default | Required |
|-----------------|----------|-----------------------------------------------------------------------------------|---------|----------|
| `password`      | `secret` | Password to use for basic authentication requests.                                | `""`    | no       |
| `password_file` | `string` | Path to a file containing the password. If set, takes precedence over `password`. | `""`    | no       |
| `username`      | `string` | Username to use for basic authentication requests.                                | `""`    | no       |
| `username_file` | `string` | Path to a file containing the username. If set, takes precedence over `username`. | `""`    | no       |

> Note
> 
> When you specify both the `client_auth` block and the deprecated top-level `username` and `password` attributes, the `client_auth` block takes precedence and Alloy ignores the top-level attributes for client authentication.

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

### `htpasswd`

The `htpasswd` block configures how server extensions (such as receivers) authenticate incoming requests using the `htpasswd` format.


| Name     | Type     | Description                                                           | Default | Required |
|----------|----------|-----------------------------------------------------------------------|---------|----------|
| `file`   | `string` | Path to the `htpasswd` file to use for basic authentication requests. | `""`    | no       |
| `inline` | `string` | The `htpasswd` file content in inline format.                         | `""`    | no       |

You can specify either `file`, `inline`, or both. When you use `inline`, the format should be `username:password` with each user on a new line.

> Note
> 
> When you specify both the `htpasswd` block and the deprecated top-level `username` and `password` attributes, Alloy automatically appends the deprecated credentials to the `inline` content. This allows authentication using credentials from both the `htpasswd` configuration and the deprecated attributes. If the same username appears in both the `file` and `inline` content, including appended deprecated credentials, the entry in the `inline` content takes precedence.

## Exported fields

The following fields are exported and can be referenced by other components:


| Name      | Type                       | Description                                                     |
|-----------|----------------------------|-----------------------------------------------------------------|
| `handler` | `capsule(otelcol.Handler)` | A value that other components can use to authenticate requests. |

## Component health

`otelcol.auth.basic` is only reported as unhealthy if given an invalid configuration.

## Debug information

`otelcol.auth.basic` doesn’t expose any component-specific debug information.

## Examples

This section includes examples to help you configure basic authentication for exporters and receivers.

### Forward signals to exporters

This example configures [`otelcol.exporter.otlp`](../otelcol.exporter.otlp/) to use basic authentication:

Alloy 

```alloy
otelcol.exporter.otlp "example" {
  client {
    endpoint = "my-otlp-grpc-server:4317"
    auth     = otelcol.auth.basic.creds.handler
  }
}

otelcol.auth.basic "creds" {
  username = "demo"
  password = sys.env("API_KEY")
}
```

### Authenticating requests for receivers

These examples show how to perform basic authentication using the `client_auth` block for exporters or the `htpasswd` block for receivers.

#### Use client authentication

This example configures [`otelcol.exporter.otlphttp`](../otelcol.exporter.otlphttp/) to use basic authentication with a single username and password combination:

Alloy 

```alloy
otelcol.receiver.otlp "example" {
  grpc {
    endpoint = "127.0.0.1:4317"
  }

  output {
    metrics = [otelcol.exporter.otlphttp.default.input]
    logs    = [otelcol.exporter.otlphttp.default.input]
    traces  = [otelcol.exporter.otlphttp.default.input]
  }
}

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

> Note
> 
> To migrate from the deprecated `username` and `password` attributes, move them into the `client_auth` block for client authentication.

#### Use htpasswd file

This example configures [`otelcol.receiver.otlp`](../otelcol.receiver.otlp/) to use basic authentication using an `htpasswd` file containing the users to use for basic authentication:

Alloy 

```alloy
otelcol.receiver.otlp "example" {
  grpc {
    endpoint = "127.0.0.1:4317"

    auth = otelcol.auth.basic.creds.handler
  }

  output {
    metrics = [otelcol.exporter.debug.default.input]
    logs    = [otelcol.exporter.debug.default.input]
    traces  = [otelcol.exporter.debug.default.input]
  }
}

otelcol.exporter.debug "default" {}

otelcol.auth.basic "creds" {
  htpasswd {
    file = "/etc/alloy/.htpasswd"
  }
}
```

#### Use htpasswd inline content

This example shows how to specify `htpasswd` content directly in the configuration:

Alloy 

```alloy
otelcol.receiver.otlp "example" {
  grpc {
    endpoint = "127.0.0.1:4317"

    auth = otelcol.auth.basic.creds.handler
  }

  output {
    metrics = [otelcol.exporter.debug.default.input]
    logs    = [otelcol.exporter.debug.default.input]
    traces  = [otelcol.exporter.debug.default.input]
  }
}

otelcol.exporter.debug "default" {}

otelcol.auth.basic "creds" {
  htpasswd {
    inline = "user1:password1\nuser2:password2"
  }
}
```

> Note
> 
> To make the migration from the deprecated `username` and `password` attributes easier, you can specify both the deprecated attributes and the `htpasswd` block in the same configuration. Alloy appends the deprecated attributes to the `htpasswd` content.
> 
> Alloy 
> 
> ```alloy
> otelcol.receiver.otlp "example" {
  grpc {
    endpoint = "127.0.0.1:4317"

    auth = otelcol.auth.basic.creds.handler
  }

  output {
    metrics = [otelcol.exporter.debug.default.input]
    logs    = [otelcol.exporter.debug.default.input]
    traces  = [otelcol.exporter.debug.default.input]
  }
}

otelcol.exporter.debug "default" {}

otelcol.auth.basic "creds" {
  username = "demo"
  password = sys.env("API_KEY")

  htpasswd {
    file = "/etc/alloy/.htpasswd"
  }
}
> ```
