---
title: "Get started with Grafana Alloy | Grafana Alloy documentation"
description: "Get started with Grafana Alloy"
---

# Get started with Grafana Alloy

Grafana Alloy uses a configuration language to define how components collect, transform, and send data. Components are building blocks that perform specific tasks, such as reading files, collecting metrics, or sending data to external systems.

To write effective configurations, you need to understand three fundamental elements: blocks, attributes, and expressions. Mastering these building blocks lets you create powerful data collection and processing pipelines.

## Basic configuration elements

All Alloy configurations use three main elements: blocks, attributes, and expressions.

## Blocks

Blocks group related settings and configure different parts of Alloy. Each block has a name and contains attributes or nested blocks.

Alloy 

```alloy
prometheus.remote_write "production" {
  endpoint {
    url = "http://localhost:9009/api/prom/push"
  }
}
```

This example contains two blocks:

- `prometheus.remote_write "production"`: Creates a component with the label `"production"`
- `endpoint`: A nested block that configures connection settings

## Attributes

Attributes set individual values within blocks. They follow the format `ATTRIBUTE_NAME = ATTRIBUTE_VALUE`.

Alloy 

```alloy
log_level = "debug"
timeout = 30
enabled = true
```

## Expressions

Expressions compute values for attributes. You can use simple constants or more complex calculations.

**Constants:**

Alloy 

```alloy
name = "my-service"
port = 9090
tags = ["web", "api"]
```

**Simple calculations:**

You can use arithmetic operations to compute values from other variables. This lets you build dynamic configurations where values depend on other settings.

Alloy 

```alloy
total_timeout = base_timeout + retry_timeout
```

**Function calls:**

Function calls let you access system information and transform data. [Built-in](../reference/stdlib/) functions like `sys.env()` retrieve environment variables, while others can manipulate strings, decode JSON, and perform other operations.

Alloy 

```alloy
home_dir = sys.env("HOME")
config_path = home_dir + "/config.yaml"
```

**Component references:**

Component references let you use data from other parts of your configuration. To reference a component’s data, combine three parts with periods:

- Component name: `local.file`
- Label: `secret`
- Export name: `content`
- Result: `local.file.secret.content`

Alloy 

```alloy
password = local.file.secret.content
```

You’ll learn about more powerful expressions in the dedicated [Expressions](./expressions/) section, including how to reference data from other components and use more built-in functions. You can find the available exports for each component in the [Components](./components/) documentation.

## Configuration syntax

Alloy uses a declarative configuration language, which means you describe what you want your system to do rather than how to do it. This design makes configurations flexible and easy to understand.

You can organize blocks and attributes in any order that makes sense for your use case. Alloy automatically determines the dependencies between components and evaluates them in the correct order.

## Configuration files

Alloy configuration files conventionally use a `.alloy` file extension, though you can name single files anything you want. If you specify a directory path, Alloy processes only files with the `.alloy` extension. You must save your configuration files as UTF-8 encoded text - Alloy can’t parse files with invalid UTF-8 encoding.

## Tooling

You can use these tools to write Alloy configuration files:

- Editor support:
  
  - [VS Code](https://github.com/grafana/vscode-alloy)
  - [Vim/Neovim](https://github.com/grafana/vim-alloy)
- Code formatting: [`alloy fmt` command](../reference/cli/fmt/)

## Next steps

Now that you understand the basic syntax, learn how to use these elements to build working configurations:

- [Components](./components/) - Learn about the building blocks that collect, transform, and send data
- [Expressions](./expressions/) - Create dynamic configurations using functions and component references
- [Alloy syntax](./syntax/) - Explore advanced syntax features and patterns

For hands-on learning:

- [Tutorials](../tutorials/) - Build complete data collection pipelines step by step
- [Components](./components/) - Browse all available components and their options
