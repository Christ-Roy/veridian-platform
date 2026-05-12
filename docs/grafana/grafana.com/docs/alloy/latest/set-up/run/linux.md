---
title: "Run Grafana Alloy on Linux | Grafana Alloy documentation"
description: "Learn how to run Grafana Alloy on Linux"
---

# Run Grafana Alloy on Linux

Alloy is [installed](../../install/linux/) as a [systemd](https://systemd.io/) service on Linux.

## Start Alloy

To start Alloy, run the following command in a terminal window:

shell 

```shell
sudo systemctl start alloy
```

Optional: To verify that the service is running, run the following command in a terminal window:

shell 

```shell
sudo systemctl status alloy
```

## Configure Alloy to start at boot

To automatically run Alloy when the system starts, run the following command in a terminal window:

shell 

```shell
sudo systemctl enable alloy.service
```

## Restart Alloy

To restart Alloy, run the following command in a terminal window:

shell 

```shell
sudo systemctl restart alloy
```

## Stop Alloy

To stop Alloy, run the following command in a terminal window:

shell 

```shell
sudo systemctl stop alloy
```

## View Alloy logs

To view Alloy log files, run the following command in a terminal window:

shell 

```shell
sudo journalctl -u alloy
```

## Next steps

- [Configure Alloy](../../../configure/linux/)
