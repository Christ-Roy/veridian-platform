#!/bin/bash
# Docker cleanup script to prevent base image corruption
# Run this weekly via cron to keep Docker cache clean

set -e

echo "🧹 Docker Cleanup Script"
echo "========================"
echo ""

# 1. Remove dangling images (layers from failed builds)
echo "1️⃣ Removing dangling images..."
sudo docker image prune -f

echo ""

# 2. Remove stopped containers (optional)
echo "2️⃣ Removing stopped containers..."
sudo docker container prune -f

echo ""

# 3. Check if node:20-alpine is corrupted
echo "3️⃣ Checking base image integrity..."
NODE_USER=$(sudo docker run --rm node:20-alpine whoami 2>/dev/null || echo "error")

if [ "$NODE_USER" = "root" ]; then
  echo "   ✅ Base image is healthy (user: root)"
elif [ "$NODE_USER" = "nextjs" ]; then
  echo "   ⚠️  Base image is CORRUPTED (user: nextjs)"
  echo "   🔧 Fixing: Removing and repulling node:20-alpine..."
  sudo docker rmi node:20-alpine
  sudo docker pull node:20-alpine
  echo "   ✅ Base image repaired"
else
  echo "   ❌ Error checking base image: $NODE_USER"
fi

echo ""

# 4. Display cleanup summary
echo "📊 Cleanup Summary:"
sudo docker system df

echo ""
echo "✅ Cleanup complete!"
echo ""
echo "💡 To run this automatically, add to crontab:"
echo "   0 2 * * 0 /home/ubuntu/app.veridian/infra/scripts/cleanup-docker.sh >> /var/log/docker-cleanup.log 2>&1"
