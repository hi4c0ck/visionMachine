const crypto = require('crypto');
const https = require('https');
const fs = require('fs');
const { execSync } = require('child_process');

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

function runGit(cmd, cwd = localPath) {
  return execSync(cmd, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

async function main() {
  try {
    console.log('=== VisionMachine GitHub Push ===\n');
    
    // Get token
    console.log('Generating GitHub App token...');
    const token = await getInstallationToken();
    console.log('✅ Token obtained\n');
    
    const remoteUrl = `https://x-access-token:${token}@github.com/${repoOwner}/${repoName}.git`;
    
    // Set up remote
    console.log('Setting up git remote...');
    try {
      runGit('git remote remove origin');
    } catch {}
    execSync(`git remote add origin ${remoteUrl}`, { cwd: localPath });
    
    // Fetch remote
    console.log('\nFetching remote state...');
    runGit('git fetch origin');
    
    // Check remote status
    console.log('\nRemote history:');
    try {
      const remoteLog = runGit('git log origin/main --oneline -5');
      console.log(remoteLog || '  (empty)');
    } catch {
      console.log('  (no remote history)');
    }
    
    // Stage all files
    console.log('\nStaging all files...');
    runGit('git add .');
    
    // Check what's changed
    const diff = runGit('git diff --cached --stat');
    console.log(diff);
    
    // Create commit
    console.log('\nCreating commit...');
    runGit('git commit -m "Initial project setup: Python ML environment, CI/CD, core modules"');
    
    // Show commits to push
    console.log('\nCommits to push:');
    const commits = runGit('git log origin/main..HEAD --oneline 2>/dev/null || echo "new branch"');
    console.log(commits || '  (nothing new)');
    
    // Push
    console.log('\nPushing to GitHub...');
    execSync('git push -u origin main --force-with-lease', { 
      cwd: localPath,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
    });
    
    console.log('\n✅ Successfully pushed!');
    console.log(`🔗 Repository: https://github.com/${repoOwner}/${repoName}\n`);
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main();
