---
title: "Prometheus metrics configuration examples | Grafana Cloud documentation"
description: "Browse open source projects with Prometheus exporters organized by technology category, with comprehensive integration guides for Grafana Cloud."
---

# Prometheus metrics configuration examples

Many open source projects provide Prometheus exporters so that you can scrape metrics from your application at any given point in time. Typically, the Prometheus metrics collector configuration file specifies how frequently to collect your metrics, known as the `scrape_config`, plus the remote endpoint and authentication parameters for reliably storing the metrics, available under `remote_write`. The Prometheus configuration file is customarily named `prometheus.yml`.

To get scalable Prometheus metrics storage, push scraped samples to compatible remote storage endpoints. Popular methods for pushing metrics to Grafana Cloud include: [agentless Metrics Endpoint scrape Jobs](/blog/2023/09/21/introducing-agentless-monitoring-for-prometheus-in-grafana-cloud/), [Grafana Alloy scrape Jobs](/docs/grafana-cloud/send-data/alloy/tutorials/send-metrics-to-prometheus/), or [Prometheus remote write](/blog/2021/05/26/the-future-of-prometheus-remote-write/).

## Integration methods

For detailed instructions on setting up metrics collection, refer to the [integration guide](integration-guide/).

## Get started

1. [Choose your project category](/docs/grafana-cloud/send-data/metrics/metrics-prometheus/prometheus-config-examples/open-source-projects/) from the list.
2. Find your project within the category.
3. Review the integration methods in the [integration guide](integration-guide/).
4. Set up your Grafana Cloud account if you don’t have one.

Need a Grafana Cloud account? [Create an account for free](/auth/sign-up/create-user).
