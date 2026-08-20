const crypto = require('crypto');
const https = require('https');
const fs = require('fs');
const { execSync } = require('child_process');

const privateKeyPath = 'D:/work/horizonsMachine/ssh/vision-app/visual-work-openai.2026-08-19.private-key.pem';
const appId = '4650250';
const installationId = '154960372';
const localPath = 'D:/work/horizonsMachine/VisionMachine';

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

async function main() {
  console.log('=== Pushing to GitHub ===\n');
  
  const token = await getInstallationToken();
  console.log('Token obtained\n');
  
  const repoOwner = 'hi4c0ck';
  const repoName = 'visionMachine';
  const remoteUrl = `https://x-access-token:${token}@github.com/${repoOwner}/${repoName}.git`;
  
  try { execSync('git remote remove origin', { cwd: localPath }); } catch {}
  execSync(`git remote add origin ${remoteUrl}`, { cwd: localPath });
  execSync('git fetch origin', { cwd: localPath });
  
  console.log('Pushing develop branch...');
  execSync('git push origin develop --force', { cwd: localPath });
  
  console.log('\n✅ Repository updated!');
  console.log(`🔗 https://github.com/${repoOwner}/${repoName}`);
}

main().catch(console.error);
