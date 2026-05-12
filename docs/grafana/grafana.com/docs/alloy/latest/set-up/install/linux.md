---
title: "Install Grafana Alloy on Linux | Grafana Alloy documentation"
description: "Learn how to install Grafana Alloy on Linux"
---

# Install Grafana Alloy on Linux

Start your learning experience with Grafana Learning Paths

Grafana Learning Paths provide a clear, structured path that leads you from beginner concepts to advanced use cases. Learn about this Grafana feature on [Monitor a Linux server in Grafana Cloud](/docs/learning-journeys/linux-server-integration/).

[Start learning](https://grafana.com/docs/learning-journeys/linux-server-integration/)

You can install Alloy as a systemd service on Linux.

## Before you begin

Some Debian-based cloud Virtual Machines don’t have GPG installed by default. To install GPG in your Linux Virtual Machine, run the following command in a terminal window.

shell 

```shell
sudo apt install gpg
```

## Install

To install Alloy on Linux, run the following commands in a terminal window.

1. Import the GPG key and add the Grafana package repository.
   
   Debian-Ubuntu RHEL-Fedora SUSE-openSUSE
   
   
   
   Debian-Ubuntu 
   
   ```debian-ubuntu
   sudo mkdir -p /etc/apt/keyrings
   sudo wget -O /etc/apt/keyrings/grafana.asc https://apt.grafana.com/gpg-full.key
   sudo chmod 644 /etc/apt/keyrings/grafana.asc
   echo "deb [signed-by=/etc/apt/keyrings/grafana.asc] https://apt.grafana.com stable main" | sudo tee /etc/apt/sources.list.d/grafana.list
   ```
   
   RHEL-Fedora 
   
   ```rhel-fedora
   wget -q -O gpg.key https://rpm.grafana.com/gpg.key
   sudo rpm --import gpg.key
   echo -e '[grafana]\nname=grafana\nbaseurl=https://rpm.grafana.com\nrepo_gpgcheck=1\nenabled=1\ngpgcheck=1\ngpgkey=https://rpm.grafana.com/gpg.key\nsslverify=1\nsslcacert=/etc/pki/tls/certs/ca-bundle.crt' | sudo tee /etc/yum.repos.d/grafana.repo
   ```
   
   SUSE-openSUSE 
   
   ```suse-opensuse
   wget -q -O gpg.key https://rpm.grafana.com/gpg.key
   sudo rpm --import gpg.key
   sudo zypper addrepo https://rpm.grafana.com grafana
   ```
2. Update the repositories.
   
   Debian-Ubuntu RHEL-Fedora SUSE-openSUSE
   
   
   
   Debian-Ubuntu 
   
   ```debian-ubuntu
   sudo apt-get update
   ```
   
   RHEL-Fedora 
   
   ```rhel-fedora
   yum update
   ```
   
   SUSE-openSUSE 
   
   ```suse-opensuse
   sudo zypper update
   ```
3. Install Alloy.
   
   Debian-Ubuntu RHEL-Fedora SUSE-openSUSE
   
   
   
   Debian-Ubuntu 
   
   ```debian-ubuntu
   sudo apt-get install alloy
   ```
   
   RHEL-Fedora 
   
   ```rhel-fedora
   sudo dnf install alloy
   ```
   
   SUSE-openSUSE 
   
   ```suse-opensuse
   sudo zypper -r grafana install alloy
   ```

## Uninstall

To uninstall Alloy on Linux, run the following commands in a terminal window.

1. Stop the systemd service for Alloy.
   
   All-distros 
   
   ```all-distros
   sudo systemctl stop alloy
   ```
2. Uninstall Alloy.
   
   Debian-Ubuntu RHEL-Fedora SUSE-openSUSE
   
   
   
   Debian-Ubuntu 
   
   ```debian-ubuntu
   sudo apt-get remove alloy
   ```
   
   RHEL-Fedora 
   
   ```rhel-fedora
   sudo dnf remove alloy
   ```
   
   SUSE-openSUSE 
   
   ```suse-opensuse
   sudo zypper remove alloy
   ```
3. Optional: Remove the Grafana repository.
   
   Debian-Ubuntu RHEL-Fedora SUSE-openSUSE
   
   
   
   Debian-Ubuntu 
   
   ```debian-ubuntu
   sudo rm -i /etc/apt/sources.list.d/grafana.list
   ```
   
   RHEL-Fedora 
   
   ```rhel-fedora
   sudo rm -i /etc/yum.repos.d/grafana.repo
   ```
   
   SUSE-openSUSE 
   
   ```suse-opensuse
   sudo zypper removerepo grafana
   ```

## Next steps

- [Run Alloy](../../run/linux/)
- [Configure Alloy](../../../configure/linux/)
