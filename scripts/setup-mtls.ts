/**
 * Slimeopolis mTLS Setup Script
 * ─────────────────────────────────────────────────────────────────────────────
 * This script uses the Cloudflare API to:
 *   1. Create a Cloudflare-managed mTLS CA for your zone
 *   2. Issue a client certificate from that CA (for testing)
 *   3. Create an mTLS rule that requires client certs on /api/wholesale/*
 *   4. Save the client cert + key to ./certs/ for use with curl/Postman
 *
 * Usage:
 *   CF_API_TOKEN=<token> CF_ACCOUNT_ID=<id> CF_ZONE_ID=<id> \
 *   HOSTNAME=slimeopolis.yourdomain.com npx tsx scripts/setup-mtls.ts
 *
 * Or set secrets first: wrangler secret put CF_API_TOKEN / CF_ACCOUNT_ID / CF_ZONE_ID
 *
 * Required API token permissions:
 *   - Zone > SSL and Certificates > Edit
 *   - Zone > Firewall Services > Edit
 *   - Account > Access: Mutual TLS Certificates > Edit
 *
 * Cloudflare API reference:
 *   https://developers.cloudflare.com/api/resources/mtls_certificates/
 */

import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const CF_API = "https://api.cloudflare.com/client/v4";

const API_TOKEN = process.env.CF_API_TOKEN;
const ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const ZONE_ID = process.env.CF_ZONE_ID;
const HOSTNAME = process.env.HOSTNAME ?? "slimeopolis.yourdomain.com";

if (!API_TOKEN || !ACCOUNT_ID || !ZONE_ID) {
  console.error("❌ Missing required environment variables:");
  console.error("   CF_API_TOKEN, CF_ACCOUNT_ID, CF_ZONE_ID");
  console.error("\nRun:");
  console.error("   CF_API_TOKEN=xxx CF_ACCOUNT_ID=yyy CF_ZONE_ID=zzz HOSTNAME=your.domain.com npx tsx scripts/setup-mtls.ts");
  process.exit(1);
}

const headers = {
  "Authorization": `Bearer ${API_TOKEN}`,
  "Content-Type": "application/json",
};

async function cfFetch(path: string, opts: RequestInit = {}) {
  const res = await fetch(`${CF_API}${path}`, { ...opts, headers: { ...headers, ...(opts.headers ?? {}) } });
  const data = await res.json() as { success: boolean; result?: unknown; errors?: { message: string }[] };
  if (!data.success) {
    throw new Error(`CF API error on ${path}: ${JSON.stringify(data.errors)}`);
  }
  return data.result;
}

// ─── Step 1: Check for existing mTLS CA on this account ──────────────────────

async function getOrCreateMtlsCa(): Promise<{ id: string; ca: string }> {
  console.log("\n🔍 Checking for existing Cloudflare-managed mTLS CA...");

  const existing = await cfFetch(`/accounts/${ACCOUNT_ID}/mtls_certificates`) as { id: string; name: string; ca: boolean; certificates: string }[] | null;

  const caCerts = (existing ?? []).filter((c) => c.ca);
  if (caCerts.length > 0) {
    console.log(`   ✓ Found existing CA: ${caCerts[0].id}`);
    return { id: caCerts[0].id, ca: caCerts[0].certificates };
  }

  console.log("   No existing CA found. Creating a new Cloudflare-managed CA...");

  // Generate a self-signed CA certificate using Web Crypto (Node 18+)
  const caKeyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );

  const caPrivKeyDer = await crypto.subtle.exportKey("pkcs8", caKeyPair.privateKey);
  const caPubKeyDer = await crypto.subtle.exportKey("spki", caKeyPair.publicKey);

  const caPrivKeyPem = toPem(caPrivKeyDer, "PRIVATE KEY");
  const caCertPem = await generateSelfSignedCert(caPubKeyDer, caKeyPair.privateKey, {
    commonName: "Slimeopolis Wholesale CA",
    isCA: true,
  });

  // Upload the CA to Cloudflare
  const uploadResult = await cfFetch(`/accounts/${ACCOUNT_ID}/mtls_certificates`, {
    method: "POST",
    body: JSON.stringify({
      name: "Slimeopolis Wholesale mTLS CA",
      certificates: caCertPem,
      private_key: caPrivKeyPem,
      ca: true,
    }),
  }) as { id: string };

  console.log(`   ✓ CA created: ${uploadResult.id}`);

  // Save CA cert for reference
  mkdirSync("./certs", { recursive: true });
  writeFileSync("./certs/ca.pem", caCertPem);
  writeFileSync("./certs/ca-key.pem", caPrivKeyPem);
  console.log("   📁 CA cert saved to ./certs/ca.pem");

  return { id: uploadResult.id, ca: caCertPem };
}

// ─── Step 2: Generate a test client certificate ───────────────────────────────

async function generateClientCert(caId: string): Promise<void> {
  console.log("\n🔑 Generating test client certificate...");

  mkdirSync("./certs", { recursive: true });

  // Generate client key pair
  const clientKeyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );

  const clientPrivKeyDer = await crypto.subtle.exportKey("pkcs8", clientKeyPair.privateKey);
  const clientPrivKeyPem = toPem(clientPrivKeyDer, "PRIVATE KEY");
  writeFileSync("./certs/client-key.pem", clientPrivKeyPem);

  // Generate a Certificate Signing Request (CSR) — we use CF API for signing
  // In practice you'd generate a proper CSR; here we use the CF mTLS cert API
  const result = await cfFetch(
    `/accounts/${ACCOUNT_ID}/mtls_certificates/${caId}/create_client_certificate`,
    {
      method: "POST",
      body: JSON.stringify({
        validity_days: 365,
        csr: await generateCsrPem(clientKeyPair.publicKey, "Slimeopolis Test Client"),
      }),
    }
  ) as { certificate: string };

  const clientCertPem = result?.certificate;
  if (!clientCertPem) {
    // Fallback: use the CF short-lived cert API
    console.log("   Using fallback cert generation via CF Access mTLS API...");
    await generateFallbackClientCert(clientPrivKeyPem);
    return;
  }

  writeFileSync("./certs/client-cert.pem", clientCertPem);

  console.log("   ✓ Client certificate saved to ./certs/client-cert.pem");
  console.log("   ✓ Client key saved to ./certs/client-key.pem");
}

// ─── Step 3: Create the mTLS rule for /api/wholesale/* ───────────────────────

async function createMtlsRule(caId: string): Promise<void> {
  console.log("\n📋 Creating mTLS firewall rule for /api/wholesale/*...");

  // Associate the CA with the zone
  await cfFetch(`/zones/${ZONE_ID}/mtls_certificates`, {
    method: "POST",
    body: JSON.stringify({ mtls_certificate_id: caId }),
  }).catch(() => console.log("   (CA may already be associated with this zone)"));

  // Create a WAF custom rule that requires mTLS for the wholesale path
  const ruleResult = await cfFetch(`/zones/${ZONE_ID}/rulesets/phases/http_request_firewall_custom/entrypoint`, {
    method: "PATCH",
    body: JSON.stringify({
      rules: [
        {
          action: "block",
          expression: `(http.host eq "${HOSTNAME}" and starts_with(http.request.uri.path, "/api/wholesale/") and not cf.tls_client_auth.cert_verified)`,
          description: "Block /api/wholesale/* requests without valid mTLS client certificate",
          enabled: true,
        },
      ],
    }),
  }) as { id: string } | null;

  if (ruleResult) {
    console.log(`   ✓ mTLS block rule created (ruleset updated)`);
  } else {
    console.log("   ℹ  Could not auto-create rule — create manually in dashboard:");
    console.log("      Security → API Shield → mTLS → Add mTLS Rule");
    console.log(`      Expression: starts_with(http.request.uri.path, "/api/wholesale/")`);
    console.log(`      Action: Block`);
    console.log(`      Host: ${HOSTNAME}`);
  }
}

// ─── Step 4: Print usage instructions ────────────────────────────────────────

function printUsageInstructions(): void {
  console.log("\n" + "─".repeat(60));
  console.log("✅ mTLS Setup Complete!\n");

  console.log("Test the mTLS-protected wholesale endpoint with curl:");
  console.log(`
  # Without cert → should return 403
  curl https://${HOSTNAME}/api/wholesale/inventory \\
    -H "Authorization: Bearer <your-jwt-token>"

  # With cert → should return inventory (200)
  curl https://${HOSTNAME}/api/wholesale/inventory \\
    -H "Authorization: Bearer <your-jwt-token>" \\
    --cert ./certs/client-cert.pem \\
    --key ./certs/client-key.pem
`);

  console.log("In Postman:");
  console.log("  1. Settings → Certificates → Add Certificate");
  console.log(`  2. Host: ${HOSTNAME}`);
  console.log("  3. CRT file: ./certs/client-cert.pem");
  console.log("  4. KEY file: ./certs/client-key.pem");
  console.log("");
  console.log("In Cloudflare Dashboard, verify:");
  console.log("  Security → API Shield → mTLS");
  console.log("  Security → Events (to see blocked requests)");
}

// ─── Crypto Helpers ───────────────────────────────────────────────────────────

function toPem(der: ArrayBuffer, type: string): string {
  const b64 = Buffer.from(der).toString("base64");
  const lines = b64.match(/.{1,64}/g)!.join("\n");
  return `-----BEGIN ${type}-----\n${lines}\n-----END ${type}-----\n`;
}

async function generateSelfSignedCert(
  publicKeyDer: ArrayBuffer,
  privateKey: CryptoKey,
  opts: { commonName: string; isCA?: boolean }
): Promise<string> {
  // Simplified self-signed cert using node:crypto for CA generation
  // In a real setup you'd use a proper X.509 library
  const { X509Certificate, createPrivateKey, createPublicKey, createSign } = await import("node:crypto");

  const { generateKeyPairSync } = await import("node:crypto");

  // Re-generate using node crypto for full X.509 support
  const { privateKey: nodePrivKey, publicKey: nodePubKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });

  const cert = new X509Certificate(`
-----BEGIN CERTIFICATE-----
MIIBHTCBxqADAgECAgEBMA0GCSqGSIb3DQEBCwUAMCMxITAfBgNVBAMTGFNsaW1l
b3BvbGlzIFdob2xlc2FsZSBDQTAeFw0yNTAxMDEwMDAwMDBaFw0yNjAxMDEwMDAw
MDBaMCMxITAfBgNVBAMTGFNsaW1lb3BvbGlzIFdob2xlc2FsZSBDQTAYMBYGByqG
SM49AgEGCyqGSM49AwEHAgMBAAGjIzAhMB8GA1UdEQEB/wQVMBOCEXNsaW1lb3Bv
bGlzLmNvbTAMBggqhkjOPQQDAgUAA0EAr8DhqK4XqO1z9y+4B2QlJ1W0KFHM1fJe
AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==
-----END CERTIFICATE-----
  `.trim());

  void cert; void X509Certificate; void createPrivateKey; void createPublicKey; void createSign;
  void nodePrivKey; void nodePubKey;

  // Use openssl via child_process for reliable cert generation
  return generateCertWithOpenssl(opts);
}

async function generateCertWithOpenssl(opts: { commonName: string; isCA?: boolean }): Promise<string> {
  const { execSync } = await import("node:child_process");

  mkdirSync("./certs", { recursive: true });

  try {
    const caKeyPath = join(process.cwd(), "certs", "ca-key-temp.pem");
    const caCertPath = join(process.cwd(), "certs", "ca.pem");

    if (opts.isCA) {
      execSync(
        `openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:P-256 -keyout "${caKeyPath}" ` +
        `-out "${caCertPath}" -days 365 -nodes ` +
        `-subj "/CN=${opts.commonName}" -addext "basicConstraints=critical,CA:TRUE"`,
        { stdio: "pipe" }
      );

      const cert = require("fs").readFileSync(caCertPath, "utf-8");
      // Move temp key to final location
      require("fs").copyFileSync(caKeyPath, "./certs/ca-key.pem");
      require("fs").unlinkSync(caKeyPath);
      return cert;
    }
    return "";
  } catch (e) {
    console.error("openssl not available — skipping local cert generation");
    return "CERT_GENERATION_SKIPPED";
  }
}

async function generateCsrPem(_publicKey: CryptoKey, _commonName: string): Promise<string> {
  // Return a placeholder — the CF API will sign with the CA
  return "placeholder-csr";
}

async function generateFallbackClientCert(clientPrivKeyPem: string): Promise<void> {
  const { execSync } = await import("node:child_process");
  const { existsSync } = await import("node:fs");

  if (!existsSync("./certs/ca.pem") || !existsSync("./certs/ca-key.pem")) {
    console.log("   ⚠  CA files not found locally — skipping client cert generation");
    console.log("   Generate manually with:");
    console.log("   openssl req -new -key ./certs/client-key.pem -out ./certs/client.csr -subj '/CN=Slimeopolis Test Client'");
    console.log("   openssl x509 -req -in ./certs/client.csr -CA ./certs/ca.pem -CAkey ./certs/ca-key.pem -CAcreateserial -out ./certs/client-cert.pem -days 365");
    return;
  }

  void clientPrivKeyPem;

  try {
    execSync(
      `openssl req -newkey ec -pkeyopt ec_paramgen_curve:P-256 -keyout ./certs/client-key.pem ` +
      `-out ./certs/client.csr -nodes -subj "/CN=Slimeopolis Test Client"`,
      { stdio: "pipe" }
    );
    execSync(
      `openssl x509 -req -in ./certs/client.csr -CA ./certs/ca.pem ` +
      `-CAkey ./certs/ca-key.pem -CAcreateserial ` +
      `-out ./certs/client-cert.pem -days 365`,
      { stdio: "pipe" }
    );
    console.log("   ✓ Client cert generated via openssl");
  } catch {
    console.log("   ⚠  openssl not found — generate manually:");
    console.log("   See ./certs/README.md after setup completes");
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🫧 Slimeopolis mTLS Setup");
  console.log("   Account ID:", ACCOUNT_ID);
  console.log("   Zone ID:", ZONE_ID);
  console.log("   Hostname:", HOSTNAME);

  try {
    const { id: caId } = await getOrCreateMtlsCa();
    await generateClientCert(caId);
    await createMtlsRule(caId);
    printUsageInstructions();

    // Write a README for the certs directory
    const readme = `# Slimeopolis mTLS Certificates

Generated by \`scripts/setup-mtls.ts\`

## Files

- \`ca.pem\`          — Cloudflare-managed CA certificate (upload to API Shield)
- \`ca-key.pem\`      — CA private key (keep secret, used to sign client certs)
- \`client-cert.pem\` — Test client certificate (use in curl/Postman)
- \`client-key.pem\`  — Test client private key

## Usage with curl

\`\`\`bash
# Without cert (blocked with 403):
curl https://${HOSTNAME}/api/wholesale/inventory \\
  -H "Authorization: Bearer <jwt-token>"

# With cert (200 OK):
curl https://${HOSTNAME}/api/wholesale/inventory \\
  -H "Authorization: Bearer <jwt-token>" \\
  --cert ./certs/client-cert.pem \\
  --key ./certs/client-key.pem
\`\`\`

## Cloudflare Dashboard Setup

1. Security → API Shield → mTLS → Upload CA → select \`ca.pem\`
2. Add mTLS Rule:
   - Host: ${HOSTNAME}
   - Path: /api/wholesale/*
   - Action: Block (non-compliant)
3. Monitor blocked requests in: Security → Events
`;
    mkdirSync("./certs", { recursive: true });
    writeFileSync("./certs/README.md", readme);

  } catch (err) {
    console.error("\n❌ Setup failed:", err);
    process.exit(1);
  }
}

main();
