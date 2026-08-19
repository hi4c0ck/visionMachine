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

async function main() {
  try {
    console.log('=== VisionMachine GitHub Push ===\n');
    
    // Get token
    console.log('Generating token...');
    const token = await getInstallationToken();
    console.log('✅ Token obtained\n');
    
    // Remove old remote and add new one with token
    console.log('Setting up git remote...');
    try {
      execSync('git remote remove origin', { cwd: localPath, shell: 'cmd', stdio: 'ignore' });
    } catch {}
    
    const remoteUrl = `https://x-access-token:${token}@github.com/${repoOwner}/${repoName}.git`;
    execSync(`git remote add origin ${remoteUrl}`, { cwd: localPath });
    
    // Fetch to see current state
    console.log('\nFetching remote state...');
    const fetchResult = execSync('git fetch origin', { 
      cwd: localPath,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    });
    console.log(fetchResult.trim());
    
    // Check what's on remote
    console.log('\nRemote branches:');
    const branchList = execSync('git branch -r', { 
      cwd: localPath,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    console.log(branchList);
    
    // Show remote log
    console.log('\nRemote history:');
    try {
      const remoteLog = execSync('git log origin/main --oneline -5', { 
        cwd: localPath,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore']
      }).trim();
      console.log(remoteLog || '  (empty)');
    } catch {
      console.log('  (no main branch on remote)');
    }
    
    // Stage all local files
    console.log('\nStaging all local files...');
    const statusBefore = execSync('git status --porcelain', { 
      cwd: localPath,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    
    console.log('Changes detected:');
    if (statusBefore) {
      console.log(statusBefore.split('\n').map(l => `  ${l}`).join('\n'));
      
      // Add all untracked and modified files
      execSync('git add .', { cwd: localPath });
      
      // Create commit
      console.log('\nCreating commit...');
      execSync('git commit -m "Initial project setup: Python ML environment, CI/CD, core modules"', { 
        cwd: localPath,
        stdio: ['inherit', 'inherit', 'inherit']
      });
      
      // Show what will be pushed
      console.log('\nCommits to push:');
      const toPush = execSync('git log origin/main..HEAD --oneline', { 
        cwd: localPath,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore']
      }).trim();
      console.log(toPush || '  (all commits are up to date)');
      
      // Force push to overwrite remote
      console.log('\nPushing to GitHub (force)...');
      execSync('git push -u origin main --force', { 
        cwd: localPath,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: 'echo' }
      });
      
      console.log('\n✅ Successfully pushed!');
      console.log(`🔗 Repository: https://github.com/${repoOwner}/${repoName}`);
      
    } else {
      console.log('  No changes to push');
    }
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.stderr) {
      console.error('stderr:', error.stderr.toString());
    }
    process.exit(1);
  }
}

main();
