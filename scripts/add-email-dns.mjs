/**
 * Adds SPF + DMARC records for Remedy sending. Does not print tokens.
 * Run from repo root: node scripts/add-email-dns.mjs
 */
import fs from 'node:fs';

const env = Object.fromEntries(
  fs
    .readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);

const token = env.CLOUDFLARE_DNS_API_TOKEN;
if (!token) {
  console.error('Missing CLOUDFLARE_DNS_API_TOKEN');
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
};

const zoneRes = await fetch(
  'https://api.cloudflare.com/client/v4/zones?name=remedyrecoveries.com',
  { headers },
);
const zoneJson = await zoneRes.json();
if (!zoneJson.success) {
  console.error('zone lookup failed');
  process.exit(1);
}
const zoneId = zoneJson.result[0].id;

const wanted = [
  {
    type: 'TXT',
    name: 'remedyrecoveries.com',
    content: 'v=spf1 include:_spf.mx.cloudflare.net ~all',
    match: (r) => r.type === 'TXT' && r.name === 'remedyrecoveries.com' && String(r.content).includes('v=spf1 include:_spf.mx.cloudflare.net'),
  },
  {
    type: 'TXT',
    name: 'send.remedyrecoveries.com',
    content: 'v=spf1 include:amazonses.com ~all',
    match: (r) => r.type === 'TXT' && r.name === 'send.remedyrecoveries.com' && String(r.content).includes('v=spf1'),
  },
  {
    type: 'TXT',
    name: '_dmarc.remedyrecoveries.com',
    content: 'v=DMARC1; p=none; rua=mailto:social@remedyrecoveries.com; fo=1',
    match: (r) => r.type === 'TXT' && r.name === '_dmarc.remedyrecoveries.com',
  },
  {
    type: 'TXT',
    name: '_dmarc.send.remedyrecoveries.com',
    content: 'v=DMARC1; p=none; rua=mailto:social@remedyrecoveries.com; fo=1',
    match: (r) => r.type === 'TXT' && r.name === '_dmarc.send.remedyrecoveries.com',
  },
];

const listRes = await fetch(
  `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records?per_page=200`,
  { headers },
);
const listJson = await listRes.json();
const existing = listJson.result || [];

for (const rec of wanted) {
  if (existing.some(rec.match)) {
    console.log(`exists ${rec.type} ${rec.name}`);
    continue;
  }
  const created = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      type: rec.type,
      name: rec.name,
      content: rec.content,
      ttl: 3600,
      proxied: false,
    }),
  });
  const cj = await created.json();
  if (!cj.success) {
    console.error(`failed ${rec.type} ${rec.name}`, JSON.stringify(cj.errors));
    process.exit(1);
  }
  console.log(`added ${rec.type} ${rec.name}`);
}
