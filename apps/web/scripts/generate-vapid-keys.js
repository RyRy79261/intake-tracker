#!/usr/bin/env node
// Run: node scripts/generate-vapid-keys.js
// Generates a VAPID key pair for Web Push notifications and writes it to a
// git-ignored `vapid-keys.env` file (mode 600). Copy the two lines into
// apps/web/.env.local, then delete the file.
//
// The keypair is written to a restricted-permission file rather than printed,
// so the private key never lands in terminal scrollback / CI logs
// (CodeQL js/clear-text-logging).

const fs = require("fs");
const path = require("path");
const webpush = require("web-push");

const vapidKeys = webpush.generateVAPIDKeys();

const outPath = path.join(process.cwd(), "vapid-keys.env");
fs.writeFileSync(
  outPath,
  `NEXT_PUBLIC_VAPID_PUBLIC_KEY=${vapidKeys.publicKey}\n` +
    `VAPID_PRIVATE_KEY=${vapidKeys.privateKey}\n`,
  { mode: 0o600 },
);

console.log(`VAPID keypair written to ${outPath} (mode 600).`);
console.log("Next steps:");
console.log("  1. Copy both lines into apps/web/.env.local");
console.log("  2. Delete the file:  rm vapid-keys.env");
