---
title: "Send Logs to Grafana Cloud | Grafana Cloud documentation"
description: "Send Logs to Grafana Cloud Logs are files that list things that have happened, events related to things like a computer’s operating system or software running on that system. These are typically recorded as a list of messages in a file, often including a time stamp to record when the event occurred."
---

# Send Logs to Grafana Cloud

Logs are files that list things that have happened, events related to things like a computer’s operating system or software running on that system. These are typically recorded as a list of messages in a file, often including a time stamp to record when the event occurred.

## Guidance and help

Not sure where to go?

Answer a few questions and Grot will show you a helpful next step.

Start guide

Back

How do you want to monitor Kubernetes?

Answer a few questions to get started.

Get Started

[Docs  
\
Grafana Play  
\
Title]()

Get started

Next Start over

## Get started with Grafana Cloud Logs

To get up and running with logs in Grafana cloud, you need to start sending your log data to the log ingestion endpoint. This can be done by [collecting logs with Grafana Alloy](/docs/grafana-cloud/send-data/logs/collect-logs-with-alloy/). If you want some hands on practice first, there’s a tutorial for [sending logs to Loki using Alloy](/docs/grafana-cloud/send-data/alloy/tutorials/send-logs-to-loki/).

As Grafana Cloud Logs works by indexing only metadata instead of the full text log line, you should carefully consider the set of labels sent. Read [the documentation page on Labels](/docs/loki/next/get-started/labels/) to learn how to use labels effectively for the best experience.

Good examples of labels include:

- Hostname
- Environment
- Service

Avoid indexing [high cardinality](/docs/loki/next/get-started/labels/cardinality/) fields like *usernames*, *order ids* or request parameters.

After beginning to send data, you can start to query it using the `Explore` tab or create your own visualizations. This is how you might integrate logs into a panel in Grafana Cloud:

## A deeper introduction to Loki

[Loki](/oss/loki/) is the horizontally scalable, highly available, multi-tenant log aggregation system powering Grafana Cloud logs. It is designed to be cost-effective and easy to operate. It does not index the contents of the logs, but rather a set of labels for each log stream. This allows for high developer velocity while still being easy and fast to query.

Compared to other log aggregation systems, Loki:

- Does not do full text indexing on logs. By storing compressed, unstructured logs and only indexing metadata, Loki is simpler to operate and cheaper to run.
- Indexes and groups log streams using the same labels you’re already using with Prometheus, enabling you to seamlessly switch between metrics and logs using the same labels that you’re already using with Prometheus.
- Is an especially good fit for storing [Kubernetes](https://kubernetes.io/) Pod logs. Metadata such as Pod labels is automatically scraped and indexed.
- Has native support in Grafana (needs Grafana v6.0+).

Loki is like Prometheus, but for logs: we prefer a multidimensional label-based approach to indexing, and want a single-binary, easy to operate system with no dependencies. Loki differs from Prometheus by focusing on logs instead of metrics, and delivering logs via push, instead of pull.

## Further reading

This annotated list of additional resources is provided for both context and to help you discover ways to use Loki with greater success and ease.

### Delete accidentally exposed information

If you accidentially logged sensitive information, you can delete them from our systems by following this guide: [Delete unwanted information in log lines](delete-log-lines/).

### Drop sensitive information

> Note
> 
> Read [Labels](/docs/loki/latest/get-started/labels/) to learn how to use labels effectively for the best experience.

### Send Cloudwatch logs

To send Cloudwatch logs to Loki, see how to use an intermediary [Lambda Promtail](/docs/loki/latest/send-data/lambda-promtail/) function created especially for this task.
