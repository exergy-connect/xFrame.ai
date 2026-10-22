#!/bin/bash
# OCI launch: Advanced options > Management > Initialization script > Upload this file.
# Cloud-init runs this script as root on first boot. Target: fresh Oracle Linux
# 8/9/10 aarch64 (Ampere) instances with outbound HTTPS access.
# Docker CE uses Docker's RHEL repository, not an Oracle-supported Docker package.
# Installation reference: https://docs.docker.com/engine/install/rhel/
# Check completion: sudo cloud-init status --wait --long
# Check output: sudo tail -n 100 /var/log/cloud-init-output.log
# After provisioning: sudo docker image inspect ghcr.io/exergy-connect/xframe.ai:latest
# The multiarch workflow must publish an ARM64 image before this script runs.
set -euo pipefail
trap 'echo "xFrame.ai provisioning failed at line ${LINENO}" >&2' ERR

source /etc/os-release
if [[ "${ID}" != "ol" || "$(uname -m)" != "aarch64" ]]; then
    echo "Expected Oracle Linux on aarch64 (Ampere)." >&2
    exit 1
fi

oracle_major="${VERSION_ID%%.*}"
case "${oracle_major}" in
    8|9|10) ;;
    *) echo "Unsupported Oracle Linux version: ${VERSION_ID}" >&2; exit 1 ;;
esac

image="ghcr.io/exergy-connect/xframe.ai:latest"

# Remove packages that conflict with Docker CE on a fresh Oracle Linux image.
dnf -y remove podman-docker podman runc
dnf -y install ca-certificates

# Pin the repository path to the major release: Oracle's $releasever can include
# a minor version for which Docker does not publish a repository.
cat > /etc/yum.repos.d/docker-ce.repo <<EOF
[docker-ce-stable]
name=Docker CE Stable - \$basearch
baseurl=https://download.docker.com/linux/rhel/${oracle_major}/\$basearch/stable
enabled=1
gpgcheck=1
gpgkey=https://download.docker.com/linux/rhel/gpg
EOF

dnf -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker
docker info

# Retry transient registry/network failures during first boot.
for attempt in 1 2 3 4 5; do
    if docker pull --platform linux/arm64 "${image}"; then
        echo "Devcontainer ready: ${image} (linux/arm64)"
        exit 0
    fi
    if [[ "${attempt}" -lt 5 ]]; then
        sleep 15
    fi
done

echo "Failed to pull ${image}; check GHCR visibility and ARM64 manifest availability." >&2
exit 1
