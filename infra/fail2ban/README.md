# Fail2Ban Configuration

This directory contains the Fail2Ban containerized configuration for intrusion prevention.

## Overview

Fail2Ban monitors log files and bans IPs that show malicious signs:
- Too many password failures
- Seeking for exploits
- Malformed requests

## Structure

```
fail2ban/
├── config/
│   ├── jail.local          # Main jail configuration (generated)
│   └── generate-config.sh  # Script to generate config from env vars
├── filter/
│   ├── traefik-auth.conf   # Filter for Traefik auth failures
│   └── supabase-auth.conf  # Filter for Supabase auth failures
├── action/
│   └── docker-action.conf  # Custom iptables action for Docker
└── README.md               # This file
```

## Environment Variables

The Fail2Ban behavior can be controlled via environment variables in `.env`:

```bash
# Fail2Ban Configuration
TZ=Europe/Paris                              # Timezone
FAIL2BAN_DEFAULT_BANTIME=3600                # Ban time in seconds (1 hour)
FAIL2BAN_DEFAULT_FINDTIME=600                # Time window for failures (10 minutes)
FAIL2BAN_DEFAULT_MAXRETRY=5                  # Max attempts before ban
FAIL2BAN_IPTABLES_CHAIN=INPUT                # IPTABLES chain to use
```

## Active Jails

1. **SSH** - Protects SSH access
   - Max retry: 3
   - Ban time: 2 hours
   - Log: `/var/log/auth.log`

2. **Traefik Auth** - Protects Traefik basic auth
   - Max retry: 5
   - Ban time: 2 hours
   - Log: `/var/log/traefik/access.log`

3. **Traefik Bad Bots** - Blocks known bad bots
   - Max retry: 1
   - Ban time: 24 hours
   - Log: `/var/log/traefik/access.log`

4. **Nginx Auth** - Protects Nginx basic auth
   - Max retry: 5
   - Ban time: 1 hour
   - Log: `/var/log/nginx/error.log`

5. **Supabase Auth** - Protects Supabase authentication
   - Max retry: 5
   - Ban time: 1 hour
   - Log: `/config/log/supabase-auth.log`

6. **Postfix** - Protects SMTP service
   - Max retry: 3
   - Ban time: 1 hour
   - Log: `/var/log/mail.log`

7. **Recidive** - For repeat offenders
   - Max retry: 5
   - Ban time: 7 days
   - Log: `/config/log/fail2ban.log`

## Usage

### Start Fail2Ban

```bash
docker compose up -d fail2ban
```

### Check Status

```bash
# Check if container is running
docker compose ps fail2ban

# Check fail2ban status inside container
docker exec fail2ban fail2ban-client status

# Check specific jail status
docker exec fail2ban fail2ban-client status sshd
```

### View Logs

```bash
# Container logs
docker compose logs -f fail2ban

# Fail2ban specific logs
docker exec fail2ban tail -f /config/log/fail2ban.log

# Banned IPs
docker exec fail2ban fail2ban-client banned
```

### Manual Operations

```bash
# Ban an IP manually
docker exec fail2ban fail2ban-client set sshd banip 1.2.3.4

# Unban an IP
docker exec fail2ban fail2ban-client set sshd unbanip 1.2.3.4

# Reload configuration
docker exec fail2ban fail2ban-client reload

# Check jail configuration
docker exec fail2ban fail2ban-client get sshd bantime
```

## Configuration Tips

### Adjusting Ban Times

For production, consider longer ban times:
```bash
FAIL2BAN_DEFAULT_BANTIME=86400  # 24 hours
```

### Email Notifications

Ensure SMTP settings are configured in `.env`:
```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_ADMIN_EMAIL=admin@yourdomain.com
```

### Custom Filters

Add new filters in the `filter/` directory:
```ini
[Definition]
failregex = ^.*<HOST>.*401.*$
ignoreregex =
```

## Monitoring

Create a monitoring script to track bans:
```bash
#!/bin/bash
# monitor-bans.sh
docker exec fail2ban fail2ban-client status | grep "Jail list" | cut -d':' -f2 | tr -d ' ' | while read jail; do
  echo "=== $jail ==="
  docker exec fail2ban fail2ban-client status $jail | grep "Currently banned"
done
```

## Troubleshooting

### Issue: Fail2Ban can't access iptables
Make sure the container has the required capabilities:
- `privileged: true`
- `cap_add: [NET_ADMIN, NET_RAW]`

### Issue: Logs not found
Ensure log paths are correct in `jail.local`:
- Use `/var/loghost/` for host logs (mounted read-only)
- Use `/var/log/traefik/` for Traefik logs (mounted volume)

### Issue: Configuration not updated
Restart the container after changing environment variables:
```bash
docker compose restart fail2ban
```

## Security Best Practices

1. **Whitelist your IP**: Add trusted IPs to ignoreip in jail.local
2. **Monitor bans**: Regularly check who's getting banned
3. **Adjust thresholds**: Set maxretry based on your usage patterns
4. **Use long bans**: For persistent attackers, use days instead of hours
5. **Enable email alerts**: Get notified when bans occur

## Integration with Other Services

### Traefik
Ensure Traefik access logging is enabled:
```yaml
# In docker-compose.yml for traefik service
command:
  - --accesslog=true
  - --accesslog.filepath=/var/log/traefik/access.log
```

### Nginx
If using Nginx, ensure error logging:
```nginx
error_log /var/log/nginx/error.log warn;
```