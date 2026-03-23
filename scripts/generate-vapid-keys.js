#!/usr/bin/env node
// Run: node scripts/generate-vapid-keys.js
// Generates VAPID key pair for Web Push notifications.
// Add the output to your .env.local file.

const webpush = require("web-push");

const vapidKeys = webpush.generateVAPIDKeys();

console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${vapidKeys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${vapidKeys.privateKey}`);
