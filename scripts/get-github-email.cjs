const crypto = require('crypto');
const https = require('https');
const fs = require('fs');

const privateKeyPath = 'D:/work/horizonsMachine/ssh/vision-app/visual-work-openai.2026-08-19.private-key.pem';
const appId = '4650250';
const installationId = '154960372';

function generateJWT() {
  const privateKey = fs.readFileSync(privateKeyPath, 'utf8');
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 30;
  const base64url = (str) => Buffer.from(str).toString('base64url');
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({ iat: now, exp, iss: appId }));
  const signingInput = `${header}.${payload}`;
  const signature = crypto.createSign('RSA-SHA256');
  signature.update(signingInput);
  return `${header}.${payload}.${signature.sign(privateKey, 'base64url')}`;
}

async function getInstallationToken() {
  const jwt = generateJWT();
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      port: 443,
      path: `/app/installations/${installationId}/access_tokens`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jwt}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'VisionMachine-GitHubApp'
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 201) resolve(JSON.parse(data).token);
        else reject(new Error(`Failed: ${res.statusCode}`));
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

async function getUserEmails(token) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      port: 443,
      path: '/user/emails',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'VisionMachine-GitHubApp'
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) resolve(JSON.parse(data));
        else reject(new Error(`Failed: ${res.statusCode}`));
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

async function main() {
  console.log('=== GitHub Contribution Setup ===\n');
  
  const token = await getInstallationToken();
  console.log('Token obtained\n');
  
  // Get user emails
  try {
    const emails = await getUserEmails(token);
    console.log('Verified Emails on GitHub:');
    emails.forEach(e => {
      console.log(`  - ${e.email} (${e.verified ? '✓ verified' : '✗ unverified'})`);
    });
    console.log('');
    
    // Get primary email
    const primaryEmail = emails.find(e => e.primary)?.email;
    if (primaryEmail) {
      console.log(`Primary email: ${primaryEmail}`);
      console.log('\nTo add this email to git config, run:');
      console.log(`  git config user.email "${primaryEmail}"`);
      console.log(`  git config user.name "Your Name"`);
    }
  } catch (e) {
    console.log('Error getting emails:', e.message);
    console.log('\nPlease set git config manually with your GitHub email:');
    console.log('  git config user.email "your@email.com"');
  }
}

main().catch(console.error);
