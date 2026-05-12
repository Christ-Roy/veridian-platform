---
title: "prometheus.exporter.cadvisor | Grafana Alloy documentation"
description: "Learn about prometheus.exporter.cadvisor"
---

# `prometheus.exporter.cadvisor`

The `prometheus.exporter.cadvisor` component collects container metrics with [cAdvisor](https://github.com/google/cadvisor).

> Note
> 
> We do not recommend using this exporter with [clustering](../../../../get-started/clustering/) enabled.
> 
> The default `instance` label set by this exporter is the hostname of the machine running Alloy. Alloy clustering uses consistent hashing to distribute targets across the instances. This requires the discovered targets to be the same and have the same labels across all cluster instances.
> 
> If you do need to use this component in a cluster, use a dedicated `prometheus.scrape` component that’s used to scrape this exporter and doesn’t have clustering enabled. Alternatively, use `discovery.relabel` to set the `instance` label to a value that is the same across all cluster instances.

> Note
> 
> The `prometheus.exporter.cadvisor` component only works on Linux systems. On other operating systems, Alloy writes a warning to the logs and the component doesn’t collect container metrics.

The component requires specific permissions and configuration depending on your deployment environment.

Linux binaryKubernetesDocker container

Linux binary Kubernetes Docker container

When you run Alloy as a Linux binary, systemd service, or with the [non-root](../../../configure/nonroot/) `alloy` user, you must grant the `alloy` user permissions to access the container runtime socket and related directories to collect metrics from containers on the host.

The component works with Docker, `containerd`, Container Runtime Interface for OpenShift (CRI-O), and systemd container runtimes.

For Docker, grant permissions using one of these approaches:

- **Add to docker group (recommended)**: Add the `alloy` user to the `docker` group:
  
  Bash 
  
  ```bash
  sudo usermod -aG docker alloy
  ```
  
  Then restart the Alloy service:
  
  Bash 
  
  ```bash
  sudo systemctl restart alloy
  ```

> Note
> 
> The `docker` group grants privileges equivalent to the `root` user. For more information about the security implications, refer to [Docker security](https://docs.docker.com/engine/security/#docker-daemon-attack-surface).

- **Using ACLs**: Grant the `alloy` user read and execute permissions to `/var/lib/docker/`:
  
  Bash 
  
  ```bash
  sudo setfacl -R -m d:u:alloy:rx /var/lib/docker/
  sudo setfacl -R -m u:alloy:rx /var/lib/docker/
  ```

> Note
> 
> You must rerun these commands when adding containers, as they don’t automatically apply to newly created directories.

- **Running as root**: Modify the systemd service to run Alloy as root:
  
  Bash 
  
  ```bash
  sudo systemctl edit alloy.service
  ```
  
  Add the following override:
  
  ini 
  
  ```ini
  [Service]
  User=root
  ```

> Caution
> 
> Running Alloy as root has security implications. Only use this approach if necessary for your environment.

For more information about running Alloy without root privileges, refer to [Configure Alloy to run as a nonroot user](../../../configure/nonroot/).

When you run Alloy in Kubernetes to collect container metrics, deploy Alloy as a DaemonSet to collect metrics from each node.

The DaemonSet requires:

- **Host network access**: To access the container runtime
- **Volume mounts**: Access to the container runtime socket and system directories
- **Security context**: Privileged access or specific capabilities

For detailed Kubernetes Deployment guidance, refer to the [Kubernetes Deployment example](#kubernetes-deployment-example) section.

When you run Alloy itself as a Docker container to monitor other containers on the host, the Alloy container requires:

- **Privileged mode**: Access to host resources
- **Volume mounts**: Access to the container runtime socket and system directories

For a complete Docker container deployment example, refer to the [Docker deployment example](#docker-deployment-example) section.

## Usage

Alloy 

```alloy
prometheus.exporter.cadvisor "<LABEL>" {
}
```

## Arguments

You can use the following arguments with `prometheus.exporter.cadvisor`:


| Name                           | Type           | Description                                                                                                         | Default                             | Required |
|--------------------------------|----------------|---------------------------------------------------------------------------------------------------------------------|-------------------------------------|----------|
| `allowlisted_container_labels` | `list(string)` | Allowlist of container labels to convert to Prometheus labels.                                                      | `[]`                                | no       |
| `containerd_host`              | `string`       | The containerd endpoint.                                                                                            | `"/run/containerd/containerd.sock"` | no       |
| `containerd_namespace`         | `string`       | The containerd namespace.                                                                                           | `"k8s.io"`                          | no       |
| `disable_root_cgroup_stats`    | `bool`         | Disable collecting root Cgroup stats.                                                                               | `false`                             | no       |
| `disabled_metrics`             | `list(string)` | List of metrics to be disabled which, if set, overrides the default disabled metrics.                               | (see below)                         | no       |
| `docker_host`                  | `string`       | Docker endpoint.                                                                                                    | `"unix:///var/run/docker.sock"`     | no       |
| `docker_only`                  | `bool`         | Only report docker containers in addition to root stats.                                                            | `false`                             | no       |
| `docker_tls_ca`                | `string`       | Path to a trusted CA for TLS connection to docker.                                                                  | `"ca.pem"`                          | no       |
| `docker_tls_cert`              | `string`       | Path to client certificate for TLS connection to docker.                                                            | `"cert.pem"`                        | no       |
| `docker_tls_key`               | `string`       | Path to private key for TLS connection to docker.                                                                   | `"key.pem"`                         | no       |
| `enabled_metrics`              | `list(string)` | List of metrics to be enabled which, if set, overrides `disabled_metrics`.                                          | `[]`                                | no       |
| `env_metadata_allowlist`       | `list(string)` | Allowlist of environment variable keys matched with a specified prefix that needs to be collected for containers.   | `[]`                                | no       |
| `perf_events_config`           | `string`       | Path to a JSON file containing the configuration of perf events to measure.                                         | `""`                                | no       |
| `raw_cgroup_prefix_allowlist`  | `list(string)` | List of cgroup path prefixes that need to be collected, even when `docker_only` is specified.                       | `[]`                                | no       |
| `resctrl_interval`             | `duration`     | Interval to update resctrl mon groups.                                                                              | `"0"`                               | no       |
| `storage_duration`             | `duration`     | Length of time to keep data stored in memory.                                                                       | `"2m"`                              | no       |
| `store_container_labels`       | `bool`         | Whether to convert container labels and environment variables into labels on Prometheus metrics for each container. | `true`                              | no       |
| `use_docker_tls`               | `bool`         | Use TLS to connect to docker.                                                                                       | `false`                             | no       |

For `allowlisted_container_labels` to take effect, `store_container_labels` must be set to `false`.

If a container is using the `overlayfs` storage driver, ensure the `containerd_host` attribute is set correctly to be able to retrieve its metrics.

`env_metadata_allowlist` is only supported for containerd and Docker runtimes.

If `perf_events_config` isn’t set, measurement of `perf` events is disabled.

A `resctrl_interval` of `0` disables updating mon groups.

The values for `enabled_metrics` and `disabled_metrics` don’t correspond to Prometheus metrics, but to kinds of metrics that should or shouldn’t be exposed. The values that you can use are:

- `"advtcp"`
- `"app"`
- `"cpu_topology"`
- `"cpu"`
- `"cpuLoad"`
- `"cpuset"`
- `"disk"`
- `"diskIO"`
- `"hugetlb"`
- `"memory_numa"`
- `"memory"`
- `"network"`
- `"oom_event"`
- `"percpu"`
- `"perf_event"`
- `"process"`
- `"referenced_memory"`
- `"resctrl"`
- `"sched"`
- `"tcp"`
- `"udp"`

By default the following metric kinds are disabled:

- `"advtcp"`
- `"cpu_topology"`
- `"cpuset"`
- `"hugetlb"`
- `"memory_numa"`
- `"process"`
- `"referenced_memory"`
- `"resctrl"`
- `"tcp"`
- `"udp"`

## Blocks

The `prometheus.exporter.cadvisor` component doesn’t support any blocks. You can configure this component with arguments.

## Exported fields

The following fields are exported and can be referenced by other components.


| Name      | Type                | Description                                               |
|-----------|---------------------|-----------------------------------------------------------|
| `targets` | `list(map(string))` | The targets that can be used to collect exporter metrics. |

For example, the `targets` can either be passed to a `discovery.relabel` component to rewrite the targets’ label sets or to a `prometheus.scrape` component that collects the exposed metrics.

The exported targets use the configured [in-memory traffic](../../../../get-started/component_controller/#in-memory-traffic) address specified by the [run command](../../../cli/run/).

## Component health

`prometheus.exporter.cadvisor` is only reported as unhealthy if given an invalid configuration. In those cases, exported fields retain their last healthy values.

## Debug information

`prometheus.exporter.cadvisor` doesn’t expose any component-specific debug information.

## Debug metrics

`prometheus.exporter.cadvisor` doesn’t expose any component-specific debug metrics.

## Examples

### Component configuration

This example uses a [`prometheus.scrape` component](../prometheus.scrape/) to collect metrics from `prometheus.exporter.cadvisor`:

Alloy 

```alloy
prometheus.exporter.cadvisor "example" {
  docker_host = "unix:///var/run/docker.sock"

  storage_duration = "5m"
}

// Configure a prometheus.scrape component to collect cadvisor metrics.
prometheus.scrape "scraper" {
  targets    = prometheus.exporter.cadvisor.example.targets
  forward_to = [ prometheus.remote_write.demo.receiver ]
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

- *`<PROMETHEUS_REMOTE_WRITE_URL>`* : The URL of the Prometheus `remote_write` compatible server to send metrics to.
- *`<USERNAME>`* : The username to use for authentication to the `remote_write` API.
- *`<PASSWORD>`* : The password to use for authentication to the `remote_write` API.

### Docker deployment example

To collect container metrics with Alloy in Docker, you must mount the necessary host directories and run the container in privileged mode.

> Note
> 
> The `prometheus.exporter.cadvisor` component only works when the Alloy container runs on a Linux Docker host. Docker Desktop for Mac and Docker Desktop for Windows run containers in a Linux VM, which prevents direct host monitoring.

The following Docker Compose example shows the required configuration:

YAML 

```yaml
services:
  alloy:
    image: grafana/alloy:latest
    privileged: true
    ports:
      - "12345:12345"
    volumes:
      - ./config.alloy:/etc/alloy/config.alloy
      - /var/run/docker.sock:/var/run/docker.sock
      - /:/rootfs:ro
      - /var/run:/var/run:rw
      - /sys:/sys:ro
      - /var/lib/docker/:/var/lib/docker:ro
      - /dev/disk/:/dev/disk:ro
    command: run --server.http.listen-addr=0.0.0.0:12345 --storage.path=/var/lib/alloy/data /etc/alloy/config.alloy
```

The required volume mounts are:

- `/var/run/docker.sock`: Docker socket for container discovery and API access
- `/`: Host root filesystem (read-only) for system metrics
- `/var/run`: Host runtime data (read-write) for accessing container state
- `/sys`: Host system information (read-only) for cgroup and device metrics
- `/var/lib/docker/`: Docker storage directory (read-only) for container metadata and layer information
- `/dev/disk/`: Disk device information (read-only) for disk I/O metrics

> Caution
> 
> Running in privileged mode grants the container access to all host devices. Only use privileged mode when necessary and ensure proper network isolation.

For a complete working example with Grafana and Prometheus, refer to the [alloy-scenarios repository](https://github.com/grafana/alloy-scenarios/tree/main/docker-monitoring).

### Kubernetes Deployment example

When you run Alloy in Kubernetes, deploy it as a DaemonSet to collect container metrics from each node.

The following example shows the required configuration for a DaemonSet:

YAML 

```yaml
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: alloy
  namespace: monitoring
spec:
  selector:
    matchLabels:
      app: alloy
  template:
    metadata:
      labels:
        app: alloy
    spec:
      serviceAccountName: alloy
      hostNetwork: true
      hostPID: true
      containers:
        - name: alloy
          image: grafana/alloy:latest
          args:
            - run
            - /etc/alloy/config.alloy
            - --server.http.listen-addr=0.0.0.0:12345
            - --storage.path=/var/lib/alloy/data
          ports:
            - containerPort: 12345
              name: http-metrics
          securityContext:
            privileged: true
          volumeMounts:
            - name: config
              mountPath: /etc/alloy
            - name: rootfs
              mountPath: /rootfs
              readOnly: true
            - name: var-run
              mountPath: /var/run
            - name: sys
              mountPath: /sys
              readOnly: true
            - name: docker
              mountPath: /var/lib/docker
              readOnly: true
            - name: dev-disk
              mountPath: /dev/disk
              readOnly: true
      volumes:
        - name: config
          configMap:
            name: alloy-config
        - name: rootfs
          hostPath:
            path: /
        - name: var-run
          hostPath:
            path: /var/run
        - name: sys
          hostPath:
            path: /sys
        - name: docker
          hostPath:
            path: /var/lib/docker
        - name: dev-disk
          hostPath:
            path: /dev/disk
```

Key configuration requirements:

- **hostNetwork: true**: Allows access to the host network stack
- **hostPID: true**: Enables process-level metrics collection
- **privileged: true**: Grants access to host resources
- **Volume mounts**: Provide access to container runtime and system directories

> Note
> 
> For container runtimes other than Docker, such as `containerd` or CRI-O, adjust the volume mounts and `docker_host` or `containerd_host` arguments accordingly.

> Caution
> 
> Running containers with privileged access in Kubernetes has security implications. Consider using Pod Security Standards and RBAC to limit exposure, and only deploy to dedicated monitoring namespaces.

For more information about deploying Alloy on Kubernetes, refer to [Deploy Grafana Alloy](../../../set-up/deploy/).

## Compatible components

`prometheus.exporter.cadvisor` has exports that can be consumed by the following components:

- Components that consume [Targets](../../../compatibility/#targets-consumers)

> Note
> 
> Connecting some components may not be sensible or components may require further configuration to make the connection work correctly. Refer to the linked documentation for more details.
