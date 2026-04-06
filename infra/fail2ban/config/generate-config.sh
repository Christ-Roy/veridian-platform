#!/bin/bash

# Generate fail2ban configuration from environment variables
# This script runs inside the container

# Set default values if not provided
BANTIME=${FAIL2BAN_DEFAULT_BANTIME:-3600}
FINDTIME=${FAIL2BAN_DEFAULT_FINDTIME:-600}
MAXRETRY=${FAIL2BAN_DEFAULT_MAXRETRY:-5}
DESTEMAIL=${SMTP_TO:-admin@localhost}
SENDER=${SMTP_SENDER:-fail2ban@localhost}

# Create jail.local with environment variables
cat > /config/fail2ban/jail.local <<EOF
[DEFAULT]
# Default banned time in seconds (from env: ${BANTIME})
bantime = ${BANTIME}

# Find time in seconds (from env: ${FINDTIME})
findtime = ${FINDTIME}

# Maximum retry attempts (from env: ${MAXRETRY})
maxretry = ${MAXRETRY}

# Use "yes" to ignore certain IPs
ignoreip = 127.0.0.1/8 ::1

# Email configuration (from env)
destemail = ${DESTEMAIL}
sender = ${SENDER}
mta = sendmail

# Action to execute
action = %(action_mwl)s

# Chain for iptables rules (from env: ${FAIL2BAN_IPTABLES_CHAIN})
chain = ${FAIL2BAN_IPTABLES_CHAIN:-INPUT}

# Jails configuration
[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/loghost/auth.log
maxretry = 3
bantime = 7200

[traefik-auth]
enabled = true
filter = traefik-auth
logpath = /var/log/traefik/access.log
maxretry = 5
findtime = 300
bantime = 7200
action = iptables-allports[name=traefik, chain=INPUT]

[traefik-badbots]
enabled = true
filter = traefik-badbots
logpath = /var/log/traefik/access.log
bantime = 86400
findtime = 86400
maxretry = 1

[nginx-http-auth]
enabled = true
filter = nginx-http-auth
logpath = /var/loghost/nginx/error.log
maxretry = 5
bantime = 3600

[supabase-auth]
enabled = true
filter = supabase-auth
logpath = /config/log/supabase-auth.log
maxretry = 5
bantime = 3600

[postfix]
enabled = true
filter = postfix
logpath = /var/loghost/mail.log
maxretry = 3
bantime = 3600

[recidive]
enabled = true
filter = recidive
logpath = /config/log/fail2ban.log
action = %(action_mwl)s
bantime = 604800
findtime = 86400
maxretry = 5

# Docker containers jail
[docker-auth]
enabled = true
filter = docker-auth
logpath = /var/loghost/docker.log
maxretry = 5
bantime = 3600
EOF

echo "fail2ban configuration generated with:"
echo "  - Bantime: ${BANTIME} seconds"
echo "  - Findtime: ${FINDTIME} seconds"
echo "  - Maxretry: ${MAXRETRY}"
echo "  - Email alerts to: ${DESTEMAIL}"