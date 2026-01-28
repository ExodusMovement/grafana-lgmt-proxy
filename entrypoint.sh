#!/bin/sh
set -e

if [ -n "$KMS_KEY_ALIAS" ]; then
  eval $(secrets-manager-go --kms-key "$KMS_KEY_ALIAS" -- env | grep GRAFANA_CLOUD)
fi

exec node dist/index.js
