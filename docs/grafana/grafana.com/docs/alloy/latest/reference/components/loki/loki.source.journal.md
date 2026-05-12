---
title: "loki.source.journal | Grafana Alloy documentation"
description: "Learn about loki.source.journal"
---

# `loki.source.journal`

`loki.source.journal` reads from the systemd journal and forwards them to other `loki.*` components.

You can specify multiple `loki.source.journal` components by giving them different labels.

> Note
> 
> Make sure that the `alloy` user is a member of the following groups:
> 
> - `adm`
> - `systemd-journal`

## Usage

Alloy ![Copy code to clipboard](/media/images/icons/icon-copy-small-2.svg) Copy

```alloy
loki.source.journal "<LABEL>" {
  forward_to    = <RECEIVER_LIST>
}
```

## Arguments

The component starts a journal reader and fans out log entries to the list of receivers passed in `forward_to`.

You can use the following arguments with `loki.source.journal`:

Expand table

| Name             | Type                 | Description                                                                 | Default | Required |
|------------------|----------------------|-----------------------------------------------------------------------------|---------|----------|
| `forward_to`     | `list(LogsReceiver)` | List of receivers to send log entries to.                                   |         | yes      |
| `format_as_json` | `bool`               | Whether to forward the original journal entry as JSON.                      | `false` | no       |
| `labels`         | `map(string)`        | The labels to apply to every log coming out of the journal.                 | `{}`    | no       |
| `matches`        | `string`             | Journal field matches to filter entries using systemd journal match syntax. | `""`    | no       |
| `max_age`        | `duration`           | The oldest relative time from process start that Alloy reads.               | `"7h"`  | no       |
| `path`           | `string`             | Path to a directory to read entries from.                                   | `""`    | no       |
| `relabel_rules`  | `RelabelRules`       | Relabeling rules to apply on log entries.                                   | `{}`    | no       |

> Note
> 
> Grafana Alloy adds a `job` label with the full name of the component `loki.source.journal.LABEL`.

When the `format_as_json` argument is true, log messages pass through as JSON with all of the original fields from the journal entry. Otherwise, Alloy takes the log message from the content of the `MESSAGE` field from the journal entry.

When the `path` argument is empty, Alloy uses `/var/log/journal` and `/run/log/journal` for discovering journal entries.

The `relabel_rules` argument can make use of the `rules` export value from a [`loki.relabel`](../loki.relabel/) component to apply one or more relabeling rules to log entries before they’re forwarded to the list of receivers in `forward_to`.

All messages read from the journal include internal labels following the pattern of `__journal_FIELDNAME` and Alloy drops them before sending to the list of receivers specified in `forward_to`. To keep these labels, use the `relabel_rules` argument and relabel them to not have the `__` prefix.

> Note
> 
> Many field names from journald start with an `_`, such as `_systemd_unit`. The final internal label name would be `__journal__systemd_unit`, with *two* underscores between `__journal` and `systemd_unit`.
> 
> Additionally, the `PRIORITY` field receives special handling and creates two labels:
> 
> - `__journal_priority` - The numeric priority value between 0 and 7
> - `__journal_priority_keyword` - The priority keyword, for example `emerg`, `alert`, `crit`, `error`, `warning`, `notice`, `info`, or `debug`

### Journal matches

The `matches` argument filters journal entries using systemd journal field match syntax. Each match must be in the format `FIELD=VALUE`, where `FIELD` is a journal field name and `VALUE` is the exact value to match.

Multiple matches can exist in a single string separated by spaces. When you provide multiple matches, they work as a logical AND operation - all matches must satisfy for Alloy to include an entry.

#### Common journal fields

The most commonly used journal fields for filtering include:

- `_SYSTEMD_UNIT` - The systemd unit name, for example, `nginx.service`
- `PRIORITY` - The syslog priority level between 0 and 7, where 0 is highest priority
- `_PID` - Process ID
- `_UID` - User ID
- `_COMM` - Command name
- `SYSLOG_IDENTIFIER` - Syslog identifier
- `_TRANSPORT` - Transport mechanism, for example, `kernel`, `syslog`, `journal`

For a complete list of available journal fields, refer to the [systemd.journal-fields documentation](https://www.freedesktop.org/software/systemd/man/latest/systemd.journal-fields.html).

#### Match syntax examples

- `"_SYSTEMD_UNIT=nginx.service"` - Filter entries from nginx service only
- `"PRIORITY=3"` - Filter entries with error priority level
- `"_SYSTEMD_UNIT=nginx.service PRIORITY=3"` - Filter nginx errors only (logical AND)

#### Troubleshoot matches syntax

If the `matches` argument contains invalid syntax, Alloy reports the error `Error parsing journal reader 'matches' configuration value`. This typically occurs when:

- A match is missing the `=` character, for example, `"_SYSTEMD_UNIT nginx.service"`
- A match contains multiple `=` characters, for example, `"FIELD=value=extra"`
- Field names or values contain spaces without proper handling

To resolve matches parsing errors, ensure each match follows the exact format `FIELD=VALUE` with no extra characters.

> Note
> 
> The `+` character for logical OR operations that `journalctl` supports isn’t supported in the Alloy `matches` argument. Only logical AND filtering is available by specifying multiple space-separated matches.

## Blocks

You can use the following blocks with `loki.source.journal`:

No valid configuration blocks found.

### `legacy_position`

Expand table

| Name   | Type     | Description                                          | Required |
|--------|----------|------------------------------------------------------|----------|
| `file` | `string` | File to convert.                                     | yes      |
| `name` | `string` | Job name used for journal (agent static or promtail) | yes      |

The translation of legacy position file will happens if there is no position file already and is a valid yaml file to convert.

## Component health

`loki.source.journal` is only reported as unhealthy if given an invalid configuration.

## Debug Metrics

- `loki_source_journal_target_parsing_errors_total` (counter): Total number of parsing errors while reading journal messages.
- `loki_source_journal_target_lines_total` (counter): Total number of successful journal lines read.

## Example

The following examples show how to use `loki.source.journal` in a basic configuration and in a configuration that filters specific services.

### Basic configuration

Alloy ![Copy code to clipboard](/media/images/icons/icon-copy-small-2.svg) Copy

```alloy
loki.relabel "journal" {
  forward_to = []

  rule {
    source_labels = ["__journal__systemd_unit"]
    target_label  = "unit"
  }
}

loki.source.journal "read"  {
  forward_to    = [loki.write.endpoint.receiver]
  relabel_rules = loki.relabel.journal.rules
  labels        = {component = "loki.source.journal"}
}

loki.write "endpoint" {
  endpoint {
    url ="loki:3100/api/v1/push"
  }
}
```

### Filter specific services with matches

Alloy ![Copy code to clipboard](/media/images/icons/icon-copy-small-2.svg) Copy

```alloy
// Read only entries from a specific systemd unit
loki.source.journal "nginx_logs" {
  forward_to = [loki.write.endpoint.receiver]
  matches    = "_SYSTEMD_UNIT=nginx.service"
  labels     = {service = "nginx"}
}

// Read entries from multiple conditions (logical AND)
loki.source.journal "critical_errors" {
  forward_to = [loki.write.endpoint.receiver]  
  matches    = "_SYSTEMD_UNIT=nginx.service PRIORITY=3"
  labels     = {service = "nginx", level = "error"}
}

// Read high-priority entries across all services
loki.source.journal "alerts" {
  forward_to = [loki.write.endpoint.receiver]
  matches    = "PRIORITY=0"
  labels     = {priority = "emergency"}
}

loki.write "endpoint" {
  endpoint {
    url = "loki:3100/api/v1/push"
  }
}
```

## Compatible components

`loki.source.journal` can accept arguments from the following components:

- Components that export [Loki `LogsReceiver`](../../../compatibility/#loki-logsreceiver-exporters)

> Note
> 
> Connecting some components may not be sensible or components may require further configuration to make the connection work correctly. Refer to the linked documentation for more details.
