const crypto = require('crypto');
const https = require('https');
const { execSync } = require('child_process');
const fs = require('fs');

const privateKeyPath = 'D:/work/horizonsMachine/ssh/vision-app/visual-work-openai.2026-08-19.private-key.pem';
const appId = '4650250';
const installationId = '154960372';
const repoOwner = 'hi4c0ck';
const repoName = 'visionMachine';
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
  const sig = signature.sign(privateKey, 'base64url');
  
  return `${header}.${payload}.${sig}`;
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
        if (res.statusCode === 201) {
          resolve(JSON.parse(data).token);
        } else {
          reject(new Error(`Failed: ${res.statusCode} ${data}`));
        }
      });
    });
    
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

function runGit(cmd) {
  try {
    return execSync(cmd, { cwd: localPath, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (e) {
    console.error(e.message);
    return null;
  }
}

async function main() {
  console.log('=== VisionMachine - Push All Branches & Documentation ===\n');
  
  const token = await getInstallationToken();
  console.log('✅ Token obtained\n');
  
  // Set up remote
  const remoteUrl = `https://x-access-token:${token}@github.com/${repoOwner}/${repoName}.git`;
  try { runGit('git remote remove origin'); } catch {}
  runGit(`git remote add origin ${remoteUrl}`);
  runGit('git fetch origin');
  
  // Stage all changes
  console.log('Staging files...');
  runGit('git add -A');
  const status = runGit('git status --short');
  if (status) {
    console.log('Changes:', status.split('\n').join('\n   '));
  }
  
  // Commit
  console.log('\nCommitting...');
  runGit('git commit -m "Add security audit docs and update branching strategy"');
  
  // Get current branch
  const currentBranch = runGit('git rev-parse --abbrev-ref HEAD') || 'develop';
  console.log(`Current branch: ${currentBranch}`);
  
  // Push all branches
  const branches = ['develop', 'production', 'master'];
  for (const branch of branches) {
    console.log(`\nPushing ${branch}...`);
    const result = runGit(`git push origin ${branch} --force-with-lease 2>&1`);
    if (result && result.includes('Everything up-to-date')) {
      console.log(`  ${branch} is up to date`);
    } else if (result) {
      console.log(`  Pushed successfully`);
    }
  }
  
  // Set default branch to develop
  console.log('\nSetting default branch to develop...');
  const updateDefault = new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      port: 443,
      path: `/repos/${repoOwner}/${repoName}`,
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'VisionMachine-GitHubApp'
      }
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log('  ✅ Default branch set to develop');
          resolve();
        } else {
          console.log(`  ⚠️ Could not set default branch (${res.statusCode})`);
          resolve();
        }
      });
    });
    
    req.on('error', reject);
    req.write(JSON.stringify({ default_branch: 'develop' }));
    req.end();
  });
  
  await updateDefault;
  
  console.log('\n✅ All done!\n');
  console.log(`🔗 Repository: https://github.com/${repoOwner}/${repoName}`);
  console.log('📚 Documentation in docs/ folder');
  console.log('⚠️  Root-level .md files are now ignored\n');
}

main().catch(console.error);
