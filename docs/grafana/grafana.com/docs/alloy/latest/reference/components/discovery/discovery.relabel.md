---
title: "discovery.relabel | Grafana Alloy documentation"
description: "Learn about discovery.relabel"
---

# `discovery.relabel`

In Alloy, targets are defined as sets of key-value pairs called *labels*.

`discovery.relabel` rewrites the label set of the input targets by applying one or more relabeling rules. If no rules are defined, then the input targets are exported as-is.

The most common use of `discovery.relabel` is to filter targets or standardize the target label set that’s passed to a downstream component. The `rule` blocks are applied to the label set of each target in order of their appearance in the configuration file. The configured rules can be retrieved by calling the function in the `rules` export field.

Target labels which start with a double underscore `__` are considered internal, and may be removed by other components prior to telemetry collection. To retain any of these labels, use a `labelmap` action to remove the prefix, or remap them to a different name. Service discovery mechanisms usually group their labels under `__meta_*`. For example, the discovery.kubernetes component populates a set of `__meta_kubernetes_*` labels to provide information about the discovered Kubernetes resources. If a relabeling rule needs to store a label value temporarily, for example as the input to a subsequent step, use the `__tmp` label name prefix, as it’s guaranteed to never be used.

Multiple `discovery.relabel` components can be specified by giving them different labels.

## Usage

Alloy 

```alloy
discovery.relabel "<LABEL>" {
  targets = "<TARGET_LIST>"

  rule {
    ...
  }

  ...
}
```

## Arguments

You can use the following argument with `discovery.relabel`:


| Name      | Type                | Description        | Default | Required |
|-----------|---------------------|--------------------|---------|----------|
| `targets` | `list(map(string))` | Targets to relabel |         | yes      |

## Blocks

You can use the following block with `discovery.relabel`:

No valid configuration blocks found.

### `rule`

The `rule` block configures the relabeling rules to apply to targets.

The `rule` block contains the definition of any relabeling rules that can be applied to an input metric. If more than one `rule` block is defined, the transformations are applied in top-down order.

The following arguments can be used to configure a `rule`. All arguments are optional. Omitted fields take their default values.


| Name            | Type           | Description                                                                                                                                                                                                                                   | Default | Required |
|-----------------|----------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|---------|----------|
| `action`        | `string`       | The relabeling action to perform.                                                                                                                                                                                                             | replace | no       |
| `modulus`       | `uint`         | A positive integer used to calculate the modulus of the hashed source label values.                                                                                                                                                           |         | no       |
| `regex`         | `string`       | A valid RE2 expression with support for parenthesized capture groups. Used to match the extracted value from the combination of the `source_label` and `separator` fields or filter labels during the `labelkeep/labeldrop/labelmap` actions. | `(.*)`  | no       |
| `replacement`   | `string`       | The value against which a regular expression replace is performed, if the regular expression matches the extracted value. Supports previously captured groups.                                                                                | `"$1"`  | no       |
| `separator`     | `string`       | The separator used to concatenate the values present in `source_labels`.                                                                                                                                                                      | ;       | no       |
| `source_labels` | `list(string)` | The list of labels whose values are to be selected. Their content is concatenated using the `separator` and matched against `regex`.                                                                                                          |         | no       |
| `target_label`  | `string`       | Label to which the resulting value will be written to.                                                                                                                                                                                        |         | no       |

You can use the following actions:

- `drop` - Drops metrics where `regex` matches the string extracted using the `source_labels` and `separator`.
- `dropequal` - Drop targets for which the concatenated `source_labels` do match `target_label`.
- `hashmod` - Hashes the concatenated labels, calculates its modulo `modulus` and writes the result to the `target_label`.
- `keep` - Keeps metrics where `regex` matches the string extracted using the `source_labels` and `separator`.
- `keepequal` - Drop targets for which the concatenated `source_labels` don’t match `target_label`.
- `labeldrop` - Matches `regex` against all label names. Any labels that match are removed from the metric’s label set.
- `labelkeep` - Matches `regex` against all label names. Any labels that don’t match are removed from the metric’s label set.
- `labelmap` - Matches `regex` against all label names. Any labels that match are renamed according to the contents of the `replacement` field.
- `lowercase` - Sets `target_label` to the lowercase form of the concatenated `source_labels`.
- `replace` - Matches `regex` to the concatenated labels. If there’s a match, it replaces the content of the `target_label` using the contents of the `replacement` field.
- `uppercase` - Sets `target_label` to the uppercase form of the concatenated `source_labels`.

> Note
> 
> The regular expression capture groups can be referred to using either the `$CAPTURE_GROUP_NUMBER` or `${CAPTURE_GROUP_NUMBER}` notation.

## Exported fields

The following fields are exported and can be referenced by other components:


| Name     | Type                | Description                                   |
|----------|---------------------|-----------------------------------------------|
| `output` | `list(map(string))` | The set of targets after applying relabeling. |
| `rules`  | `RelabelRules`      | The currently configured relabeling rules.    |

## Component health

`discovery.relabel` is only reported as unhealthy when given an invalid configuration. In those cases, exported fields retain their last healthy values.

## Debug information

`discovery.relabel` doesn’t expose any component-specific debug information.

## Debug metrics

`discovery.relabel` doesn’t expose any component-specific debug metrics.

## Example

The following example shows how the `discovery.relabel` component applies relabel rules to the incoming targets. In practice, the `targets` slice will come from another `discovery.*` component, but they are enumerated here to help clarify the example.

Alloy 

```alloy
discovery.relabel "keep_backend_only" {
  targets = [
    { "__meta_foo" = "foo", "__address__" = "localhost", "instance" = "one",   "app" = "backend"  },
    { "__meta_bar" = "bar", "__address__" = "localhost", "instance" = "two",   "app" = "database" },
    { "__meta_baz" = "baz", "__address__" = "localhost", "instance" = "three", "app" = "frontend" },
  ]

  # Combine the "__address__" and "instance" labels into a new "destination" label.
  rule {
    source_labels = ["__address__", "instance"]
    separator     = "/"
    target_label  = "destination"
    action        = "replace"
  }

  # Drop any targets that do not have the value "backend" in their "app" label.
  rule {
    source_labels = ["app"]
    action        = "keep"
    regex         = "backend"
  }

  # Add a static label to all remaining targets.
  rule {
    target_label = "custom_static_label"
    replacement = "static_value"
  }
}
```

## Compatible components

`discovery.relabel` can accept arguments from the following components:

- Components that export [Targets](../../../compatibility/#targets-exporters)

`discovery.relabel` has exports that can be consumed by the following components:

- Components that consume [Targets](../../../compatibility/#targets-consumers)

> Note
> 
> Connecting some components may not be sensible or components may require further configuration to make the connection work correctly. Refer to the linked documentation for more details.
