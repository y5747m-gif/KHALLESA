/**
 * Generates the Android release signing key for KHALLESA.
 *
 *   npm run keystore
 *
 * Produces:
 *   android/keystore/release.p12     ← the key store (PKCS#12)
 *   android/keystore.properties      ← what Gradle reads (both git-ignored)
 *
 * and prints the base64 blob + passwords to paste into GitHub secrets:
 *   Settings → Secrets and variables → Actions
 *     ANDROID_KEYSTORE_BASE64 / ANDROID_KEYSTORE_PASSWORD /
 *     ANDROID_KEY_ALIAS / ANDROID_KEY_PASSWORD
 *
 * No JDK needed — the key pair and the self-signed certificate are created
 * with node-forge. Keep the .p12 safe: losing it means losing the ability to
 * publish updates under the same signature.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import forge from 'node-forge';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'android', 'keystore');
const storePath = join(dir, 'release.p12');
const propsPath = join(root, 'android', 'keystore.properties');

const ALIAS = process.env.KHALLESA_KEY_ALIAS || 'khallesa';
const STORE_PASSWORD = process.env.KHALLESA_STORE_PASSWORD || 'khallesa';
const KEY_PASSWORD = process.env.KHALLESA_KEY_PASSWORD || 'khallesa-release';
const YEARS = Number(process.env.KHALLESA_KEY_YEARS || 30);

if (existsSync(storePath) && process.env.FORCE !== '1') {
  console.log(`! ${storePath} already exists — refusing to overwrite.`);
  console.log('  Re-run with FORCE=1 npm run keystore if you really want a new key');
  console.log('  (a new key means existing installs cannot be updated in place).');
  process.exit(1);
}

console.log('› generating a 2048-bit RSA key…');
const keys = forge.pki.rsa.generateKeyPair(2048);

const cert = forge.pki.createCertificate();
cert.publicKey = keys.publicKey;
cert.serialNumber = '01' + forge.util.bytesToHex(forge.random.getBytesSync(8));
cert.validity.notBefore = new Date();
cert.validity.notAfter = new Date();
cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + YEARS);

const attrs = [
  { name: 'commonName', value: 'KHALLESA' },
  { name: 'organizationName', value: 'KHALLESA' },
  { name: 'organizationalUnitName', value: 'Mobile' },
  { name: 'countryName', value: 'EG' },
];
cert.setSubject(attrs);
cert.setIssuer(attrs);
cert.setExtensions([
  { name: 'basicConstraints', cA: false },
  { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
  { name: 'extKeyUsage', codeSigning: true },
]);
cert.sign(keys.privateKey, forge.md.sha256.create());

mkdirSync(dir, { recursive: true });
const p12 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], STORE_PASSWORD, {
  algorithm: '3des', // widest keytool / apksigner compatibility
});
writeFileSync(storePath, Buffer.from(forge.asn1.toDer(p12).getBytes(), 'binary'));

writeFileSync(
  propsPath,
  [
    '# KHALLESA release signing — read by android/app/build.gradle.',
    '#',
    "# This is the app's *distribution* key and it is committed on purpose: every",
    '# CI build signs with the same key, so an installed APK can always be updated',
    '# in place instead of needing an uninstall.',
    '#',
    '# Publishing to Google Play? Put your Play upload key in the repository',
    '# secrets instead (ANDROID_KEYSTORE_BASE64 / _PASSWORD / ANDROID_KEY_ALIAS /',
    '# ANDROID_KEY_PASSWORD) — the workflow prefers secrets over this file.',
    '# Regenerate with: npm run keystore',
    'storeFile=keystore/release.p12',
    `storePassword=${STORE_PASSWORD}`,
    `keyAlias=${ALIAS}`,
    `keyPassword=${KEY_PASSWORD}`,
    '',
  ].join('\n'),
);

const b64 = readFileSync(storePath).toString('base64');
// SHA-256 of the DER-encoded public key (the usual "key fingerprint" shown by
// keytool), formatted by hand — forge's own helper chokes on binary → UTF-8.
const derHex = forge.util.bytesToHex(
  forge.asn1.toDer(forge.pki.publicKeyToAsn1(keys.publicKey)).getBytes(),
  'binary',
);
const fingerprint = forge.md.sha256.create().update(derHex, 'utf8').digest().toHex().match(/../g).join(':');

console.log(`✓ key store   android/keystore/release.p12  (${(readFileSync(storePath).length / 1024).toFixed(1)} KB)`);
console.log(`✓ gradle props android/keystore.properties`);
console.log(`  alias=${ALIAS}  valid until ${cert.validity.notAfter.toISOString().slice(0, 10)}`);
console.log(`  SHA-256 ${fingerprint}`);
console.log('\n› GitHub secrets (Settings → Secrets and variables → Actions):');
console.log(`  ANDROID_KEYSTORE_PASSWORD = ${STORE_PASSWORD}`);
console.log(`  ANDROID_KEY_ALIAS         = ${ALIAS}`);
console.log(`  ANDROID_KEY_PASSWORD      = ${KEY_PASSWORD}`);
console.log(`  ANDROID_KEYSTORE_BASE64   = (one line, ${b64.length} chars)`);
console.log(b64);
