---
title: "Grafana Cloud Traces | Grafana Cloud documentation"
description: "Introduction to Cloud Traces"
---

# Grafana Cloud Traces

Grafana Cloud Traces is an easy-to-use, and high-scale distributed tracing backend. Using Cloud Traces, you can search for traces, generate metrics from spans, and link your tracing data with logs and metrics.

* * *

## Overview

Distributed tracing visualizes the lifecycle of a request as it passes through a set of applications.

Grafana Cloud Traces is a fully managed distributed tracing system powered by [Grafana Tempo](/docs/tempo/next/). Use its highly scalable, cost-effective trace storage and query engine to understand the flow of requests and data in your software systems and track down issues quickly.

Cloud Traces uses object storage and a columnar trace storage format based on Apache Parquet, making it extremely cost effective.

You can use open source tracing protocols, including OpenTelemetry, Zipkin, and Jaeger.

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

## Explore

[Learn about tracing  
\
Learn about distributed traces and how to use them, how to instrument your app for tracing, and how to visualize tracing data in Grafana.](/docs/grafana-cloud/send-data/traces/introduction/)

[Set up Cloud Traces  
\
Learn how to send tracing data to Grafana Cloud and Grafana.](/docs/grafana-cloud/send-data/traces/set-up/)

[Best practices  
\
Learn about how to use best practices to help control costs related to tracing data.](/docs/grafana-cloud/send-data/traces/tracing-best-practices/)

[Use Grafana Assistant with traces  
\
Use Grafana Assistant to investigate your tracing data.](/docs/grafana-cloud/send-data/traces/investigate-traces-with-assistant/)

[Query tracing data with TraceQL  
\
TraceQL is a query language designed for selecting traces. With TraceQL, you can precisely and easily select spans and jump directly to the spans fulfilling the specified conditions.](/docs/grafana-cloud/send-data/traces/traces-query-editor/)

[Metrics and tracing  
\
Use metrics-generator to derive metrics from ingested traces. The metrics-generator processes spans and writes metrics to a Prometheus data source using the Prometheus remote write protocol.](/docs/grafana-cloud/send-data/traces/configure/metrics-generator/)
