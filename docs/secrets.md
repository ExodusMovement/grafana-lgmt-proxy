# Secrets Management

This document describes how secrets are managed for grafana-lgmt-proxy using `secrets-manager-go-v2` with hybrid encryption.

## Overview

The proxy uses hybrid encryption (RSA + AES) to store secrets directly in Helm values files. Each environment has its own CMK (Customer Master Key) for encryption, and the application decrypts secrets at runtime using AWS KMS via IRSA.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Encryption Flow                          │
├─────────────────────────────────────────────────────────────────┤
│  Developer Machine                                              │
│  ┌──────────────┐    ┌─────────────────┐    ┌───────────────┐  │
│  │ secrets.env  │───▶│ secrets-manager │───▶│ encrypted_*   │  │
│  │ (plaintext)  │    │ (encrypt)       │    │ (ciphertext)  │  │
│  └──────────────┘    └─────────────────┘    └───────────────┘  │
│                              │                      │           │
│                      uses public key         stored in          │
│                      from CMK                values-{env}.yaml  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                        Decryption Flow                          │
├─────────────────────────────────────────────────────────────────┤
│  Kubernetes Pod                                                 │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────┐ │
│  │ encrypted_*     │───▶│ secrets-manager │───▶│ ENV VARS    │ │
│  │ (from env)      │    │ (decrypt via    │    │ (plaintext) │ │
│  └─────────────────┘    │  KMS + IRSA)    │    └─────────────┘ │
│                         └─────────────────┘                     │
└─────────────────────────────────────────────────────────────────┘
```

## CMK Keys

| Environment | AWS Account | KMS Key ID | Alias |
|-------------|-------------|------------|-------|
| dev | 483945769383 | 10694c10-ff7c-483b-9eab-b8b6535b620d | alias/cmk-grafana-lgmt-proxy-secrets-manager |
| stage | 966685100113 | e9e1d8c9-f608-41c7-aca6-1be7af5a48ed | alias/cmk-grafana-lgmt-proxy-secrets-manager |
| prod | 853009479172 | 74ca5217-42af-4010-8027-2e3cb2e7a7b7 | alias/cmk-grafana-lgmt-proxy-secrets-manager |
| shared | 534042329084 | 4a03f567-420f-496e-b879-30e6f6c5a81a | alias/cmk-grafana-lgmt-proxy-secrets-manager |

## Updating Secrets

### Prerequisites

1. Install `secrets-manager-go` binary:
   ```bash
   gh release download --repo ExodusMovement/secrets-manager-go \
     --pattern 'secrets-manager-go-darwin-arm64' \
     --output /usr/local/bin/secrets-manager-go --clobber
   chmod +x /usr/local/bin/secrets-manager-go
   ```

2. Have access to the relevant AWS accounts (dev, stage, prod, shared)

### Step-by-Step Process

#### 1. Download Public Keys

For each environment you need to update, download the public key:

```bash
mkdir -p /tmp/grafana-lgmt-proxy-keys && cd /tmp/grafana-lgmt-proxy-keys

# Dev
adev
aws kms get-public-key \
  --key-id alias/cmk-grafana-lgmt-proxy-secrets-manager \
  --query PublicKey --output text \
  | base64 --decode \
  | openssl pkey -pubin -inform DER -out dev.pem

# Stage
astage
aws kms get-public-key \
  --key-id alias/cmk-grafana-lgmt-proxy-secrets-manager \
  --query PublicKey --output text \
  | base64 --decode \
  | openssl pkey -pubin -inform DER -out stage.pem

# Prod
aprod
aws kms get-public-key \
  --key-id alias/cmk-grafana-lgmt-proxy-secrets-manager \
  --query PublicKey --output text \
  | base64 --decode \
  | openssl pkey -pubin -inform DER -out prod.pem

# Shared
ashared
aws kms get-public-key \
  --key-id alias/cmk-grafana-lgmt-proxy-secrets-manager \
  --query PublicKey --output text \
  | base64 --decode \
  | openssl pkey -pubin -inform DER -out shared.pem
```

#### 2. Create Secrets File

Create a file with all secrets in KEY=VALUE format:

```bash
cat > secrets.env << 'EOF'
GRAFANA_CLOUD_PROMETHEUS_ORG_ID=2668285
GRAFANA_CLOUD_LOKI_ORG_ID=1329819
GRAFANA_CLOUD_TEMPO_ORG_ID=1324130
GRAFANA_CLOUD_OTLP_ORG_ID=1372025
GRAFANA_CLOUD_ACCESS_TOKEN=<YOUR_NEW_TOKEN_HERE>
EOF
```

Current Grafana Cloud org IDs (from Grafana Cloud console):
- Prometheus: 2668285
- Loki: 1329819
- Tempo: 1324130
- OTLP: 1372025

#### 3. Encrypt Secrets

Encrypt secrets for each environment:

```bash
# Dev
secrets-manager-go encrypt --public-key dev.pem --file secrets.env --kv > dev-encrypted.txt

# Stage
secrets-manager-go encrypt --public-key stage.pem --file secrets.env --kv > stage-encrypted.txt

# Prod
secrets-manager-go encrypt --public-key prod.pem --file secrets.env --kv > prod-encrypted.txt

# Shared
secrets-manager-go encrypt --public-key shared.pem --file secrets.env --kv > shared-encrypted.txt
```

#### 4. Update Helm Values

Copy the encrypted values to the respective values files:

- `deployment/grafana-lgmt-proxy/values-dev.yaml` - use dev-encrypted.txt output
- `deployment/grafana-lgmt-proxy/values-stage.yaml` - use stage-encrypted.txt output
- `deployment/grafana-lgmt-proxy/values-prod.yaml` - use prod-encrypted.txt output
- `deployment/grafana-lgmt-proxy/values-shared.yaml` - use shared-encrypted.txt output

Format in values file:
```yaml
deployment:
  encryptedValues:
    GRAFANA_CLOUD_PROMETHEUS_ORG_ID: "encrypted_AAAA..."
    GRAFANA_CLOUD_LOKI_ORG_ID: "encrypted_BBBB..."
    GRAFANA_CLOUD_TEMPO_ORG_ID: "encrypted_CCCC..."
    GRAFANA_CLOUD_OTLP_ORG_ID: "encrypted_DDDD..."
    GRAFANA_CLOUD_ACCESS_TOKEN: "encrypted_EEEE..."
```

#### 5. Clean Up

Delete the plaintext secrets file immediately:

```bash
rm secrets.env dev-encrypted.txt stage-encrypted.txt prod-encrypted.txt shared-encrypted.txt
rm dev.pem stage.pem prod.pem shared.pem
```

#### 6. Commit and Deploy

```bash
git add deployment/grafana-lgmt-proxy/values-*.yaml
git commit -m "feat(secrets): update Grafana Cloud credentials"
git push
```

## Validation

To validate encrypted values before deployment:

```bash
secrets-manager-go validate --file deployment/grafana-lgmt-proxy/values-dev.yaml
```

This checks that:
- Encrypted values exist
- They match the expected fingerprint in `encryptionKeys`
- The encryption format is valid

## Key Fingerprints

The `encryptionKeys` block in `values.yaml` contains fingerprints for validation:

```yaml
encryptionKeys:
  dev: "bc375252eec6ff07d9a5056b0faaf9ed2b451a787310f7ea4db9595ec8f8c2ee"
  stage: "667c5048f08351325222a86532d0c731e902297c05d959bc929ba922eea11e73"
  prod: "c36b94e43288614f16193a310eb2681e9b78f6e3e7f262eeb118d9e94bd064fa"
  shared: "d2d6434fcd97db109fb64849cb5a49c0679fa4a9d226905478745ec57301d93a"
```

To regenerate a fingerprint from a public key:
```bash
secrets-manager-go fingerprint --public-key dev.pem
```

## Infrastructure

### CMK Terraform

CMKs are defined in infra-live:
- `dev/us-east-1/dev/security/kms-master-key/grafana-lgmt-proxy-secrets-manager/`
- `stage/us-east-1/staging/security/kms-master-key/grafana-lgmt-proxy-secrets-manager/`
- `prod/us-east-1/prod/security/kms-master-key/grafana-lgmt-proxy-secrets-manager/`
- `shared-services/us-east-1/shared/security/kms-master-key/grafana-lgmt-proxy-secrets-manager/`

### IRSA Policies

IRSA policies granting KMS decrypt permission:
- `dev/us-east-1/dev/security/irsa/grafana-lgmt-proxy/`
- `stage/us-east-1/staging/security/irsa/grafana-lgmt-proxy/`
- `prod/us-east-1/prod/security/irsa/grafana-lgmt-proxy/`
- `shared-services/us-east-1/shared/security/irsa/grafana-lgmt-proxy/`

## Troubleshooting

### Decryption Fails at Runtime

1. Check IRSA role is properly configured in service account annotation
2. Verify KMS key ARN in IRSA policy matches the actual key
3. Check pod logs for specific KMS errors
4. Ensure the encrypted value was encrypted with the correct environment key

### Validation Fails

1. Run `secrets-manager-go fingerprint --public-key <env>.pem` to get the actual fingerprint
2. Compare with the fingerprint in `values.yaml` `encryptionKeys` block
3. If mismatched, update `encryptionKeys` with the correct fingerprint

### Wrong Environment Key Used

If secrets were encrypted with wrong key (e.g., dev key used for prod):
1. Re-download the correct public key
2. Re-encrypt the secrets
3. Update the values file
4. Redeploy
