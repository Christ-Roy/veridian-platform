---
title: "Monitor Docker containers with Grafana Alloy | Grafana Alloy documentation"
description: "Learn how to use Grafana Alloy to monitor Docker containers"
---

# Monitor Docker containers with Grafana Alloy

Docker containers provide statistics and logs. The `docker stats` and `docker logs` commands display metrics and logs in a terminal as a fixed snapshot. With Alloy, you can collect your metrics and logs, forward them to a Grafana stack, and create dashboards to monitor your Docker containers.

The [`alloy-scenarios`](https://github.com/grafana/alloy-scenarios/) repository contains complete examples of Alloy deployments. Clone the repository and use the examples to understand how Alloy collects, processes, and exports telemetry signals.

In this example scenario, Alloy collects Docker container metrics and logs and forwards them to a Loki destination.

## Before you begin

Ensure you have the following:

- [Docker](https://www.docker.com/)
- [Git](https://git-scm.com/)

> Note
> 
> You need administrator privileges to run `docker` commands.

## Clone and deploy the example

Follow these steps to clone the repository and deploy the monitoring example:

1. Clone the Alloy scenarios repository:
   
   shell 
   
   ```shell
   git clone https://github.com/grafana/alloy-scenarios.git
   ```
2. Start Docker to deploy the Grafana stack:
   
   shell 
   
   ```shell
   cd alloy-scenarios/docker-monitoring
   docker compose up -d
   ```
   
   Verify the status of the Docker containers:
   
   shell 
   
   ```shell
   docker ps
   ```
3. (Optional) Stop Docker to shut down the Grafana stack when you finish exploring this example:
   
   shell 
   
   ```shell
   docker compose down
   ```

## Monitor and visualize your data

Use Grafana to monitor deployment health and visualize data.

### Monitor Alloy

To monitor the health of your Alloy deployment, open your browser and go to [http://localhost:12345](http://localhost:12345).

For more information about the Alloy UI, refer to [Debug Grafana Alloy](/docs/alloy/latest/troubleshoot/debug/).

### Visualize your data

To explore metrics, open your browser and go to [http://localhost:3000/explore/metrics](http://localhost:3000/explore/metrics).

To use the Grafana Logs Drilldown, open your browser and go to [http://localhost:3000/a/grafana-lokiexplore-app](http://localhost:3000/a/grafana-lokiexplore-app).

To create a [dashboard](/docs/grafana/latest/getting-started/build-first-dashboard/#create-a-dashboard) for visualizing metrics and logs, open your browser and go to [http://localhost:3000/dashboards](http://localhost:3000/dashboards).

## Understand the Alloy configuration

This example uses a `config.alloy` file to configure Alloy components for metrics and logging. You can find this file in the cloned repository at `alloy-scenarios/docker-monitoring/`.

### Configure metrics

The metrics configuration in this example requires three components:

- `prometheus.exporter.cadvisor`
- `prometheus.scrape`
- `prometheus.remote_write`

#### `prometheus.exporter.cadvisor`

The [`prometheus.exporter.cadvisor`](/docs/alloy/latest/reference/components/prometheus/prometheus.exporter.cadvisor/) component exposes Docker container metrics. In this example, the component requires the following arguments:

- `docker_host`: Defines the Docker endpoint.
- `storage_duration`: Sets the time data is stored in memory.

This component provides the `prometheus.exporter.cadvisor.example.targets` target for `prometheus.scrape`.

Alloy 

```alloy
prometheus.exporter.cadvisor "example" {
  docker_host = "unix:///var/run/docker.sock"

  storage_duration = "5m"
}
```

#### `prometheus.scrape`

The [`prometheus.scrape`](/docs/alloy/latest/reference/components/prometheus/prometheus.scrape/) component scrapes cAdvisor metrics and forwards them to a receiver. In this example, the component requires the following arguments:

- `targets`: The target to scrape metrics from.
- `forward_to`: The destination to forward metrics to.
- `scrape_interval`: The frequency of scraping the target.

Alloy 

```alloy
prometheus.scrape "scraper" {
  targets    = prometheus.exporter.cadvisor.example.targets
  forward_to = [ prometheus.remote_write.demo.receiver ]

  scrape_interval = "10s"
}
```

#### `prometheus.remote_write`

The [`prometheus.remote_write`](/docs/alloy/latest/reference/components/prometheus/prometheus.remote_write/) component sends metrics to a Prometheus server. In this example, the component requires the following argument:

- `url`: Defines the full URL endpoint to send metrics to.

This component provides the `prometheus.remote_write.demo.receiver` destination for `prometheus.scrape`.

Alloy 

```alloy
prometheus.remote_write "demo" {
  endpoint {
    url = "http://prometheus:9090/api/v1/write"
  }
}
```

### Configure logging

The logging configuration in this example requires four components:

- `discovery.docker`
- `discovery.relabel`
- `loki.source.docker`
- `loki.write`

#### `discovery.docker`

The [`discovery.docker`](/docs/alloy/latest/reference/components/discovery/discovery.docker/) component discovers Docker containers and extracts metadata. In this example, the component requires the following argument:

- `host`: Defines the address of the Docker daemon.

Alloy 

```alloy
discovery.docker "linux" {
  host = "unix:///var/run/docker.sock"
}
```

#### `discovery.relabel`

The [`discovery.relabel`](/docs/alloy/latest/reference/components/discovery/discovery.relabel/) component defines a relabeling rule to create a service name from the container name. In this example, the component requires the following arguments:

- `targets`: The targets to relabel. In this example, the `discovery.relabel` component is used only for its exported `relabel_rules` in the `loki.source.docker` component. No targets are modified, so the `targets` argument is an empty array.
- `source_labels`: The list of labels to select for relabeling.
- `regex`: A regular expression that matches any string after `/`. Docker container names often appear with a leading slash (/) in Prometheus automatic discovery labels. This expression keeps the container name.
- `target_label`: The label written to the target.

Alloy 

```alloy
discovery.relabel "logs_integrations_docker" {
  targets = []

  rule {
    source_labels = ["__meta_docker_container_name"]
    regex = "/(.*)"
    target_label = "service_name"
  }
}
```

#### `loki.source.docker`

The [`loki.source.docker`](/docs/alloy/latest/reference/components/loki/loki.source.docker/) component collects logs from Docker containers. In this example, the component requires the following arguments:

- `host`: The address of the Docker daemon.
- `targets`: The list of containers to read logs from.
- `labels`: The default set of labels to apply to entries.
- `relabel_rules`: The relabeling rules to apply to log entries.
- `forward_to`: The list of receivers to send log entries to.

Alloy 

```alloy
loki.source.docker "default" {
  host       = "unix:///var/run/docker.sock"
  targets    = discovery.docker.linux.targets
  labels     = {"platform" = "docker"}
  relabel_rules = discovery.relabel.logs_integrations_docker.rules
  forward_to = [loki.write.local.receiver]
}
```

#### `loki.write`

The [`loki.write`](/docs/alloy/latest/reference/components/loki/loki.write/) component writes logs to a Loki destination. In this example, the component requires the following argument:

- `url`: Defines the full URL endpoint in Loki to send logs to.

Alloy 

```alloy
loki.write "local" {
  endpoint {
    url = "http://loki:3100/loki/api/v1/push"
  }
}
```
