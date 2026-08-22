const crypto = require('crypto');
const https = require('https');
const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

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
        if (res.statusCode === 201) resolve(JSON.parse(data).token);
        else reject(new Error(`Failed: ${res.statusCode}`));
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
    return null;
  }
}

function runCmd(cmd) {
  try {
    return execSync(cmd, { shell: 'cmd', encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (e) {
    return null;
  }
}

async function main() {
  console.log('=== VisionMachine Branch Setup & History Cleanup ===\n');

  const token = await getInstallationToken();
  console.log('✅ Token obtained\n');

  // Set up remote
  const remoteUrl = `https://x-access-token:${token}@github.com/${repoOwner}/${repoName}.git`;
  try { runGit('git remote remove origin'); } catch {}
  execSync(`git remote add origin ${remoteUrl}`, { cwd: localPath });
  runGit('git fetch origin');

  // Step 1: Create develop branch from current main
  console.log('Step 1: Creating develop branch...');
  runGit('git checkout -b develop');

  // Step 2: Stage and commit all changes
  console.log('Step 2: Committing current state to develop...');
  runGit('git add -A');
  const status = runGit('git status --short');
  if (status && !status.includes('nothing to commit')) {
    runGit('git commit -m "Init: Complete project structure with Tauri v2, Python ML, and docs"');
  }

  // Step 3: Create production branch from develop
  console.log('Step 3: Creating production branch...');
  runGit('git branch production');

  // Step 4: Create master branch (will be protected)
  console.log('Step 4: Creating master branch...');
  runGit('git branch master');

  // Step 5: Push all branches
  console.log('Step 5: Pushing branches to GitHub...');
  execSync('git push -u origin develop --force-with-lease', { cwd: localPath, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
  execSync('git push origin production --force-with-lease', { cwd: localPath, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
  execSync('git push origin master --force-with-lease', { cwd: localPath, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });

  // Step 6: Set default branch to develop
  console.log('Step 6: Setting default branch to develop...');
  const updateDefault = async (name) => {
    return new Promise((resolve) => {
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
          console.log(`  ${name}: ${res.statusCode}`);
          resolve();
        });
      });
      req.on('error', reject => console.error(`  ${name} error:`, reject.message));
      req.write(JSON.stringify({ default_branch: name }));
      req.end();
    });
  };
  await updateDefault('develop');

  // Step 7: Set up branch protection rules (via API)
  console.log('Step 7: Setting up branch protection...');
  const setupBranchProtection = async (branchName) => {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.github.com',
        port: 443,
        path: `/repos/${repoOwner}/${repoName}/branches/${branchName}/protection`,
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
          'User-Agent': 'VisionMachine-GitHubApp'
        }
      };
      const body = JSON.stringify({
        required_status_checks: {
          strict: true,
          contexts: ['python-check', 'node-check']
        },
        enforce_admins: true,
        required_pull_request_reviews: null,
        restrictions: null
      });
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode === 200 || res.statusCode === 204) {
            console.log(`  ✅ ${branchName} protected`);
          } else {
            console.log(`  ⚠️ ${branchName}: ${res.statusCode}`);
          }
          resolve();
        });
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  };

  // Protect production and master branches
  await setupBranchProtection('production');
  await setupBranchProtection('master');

  console.log('\n✅ Branch setup complete!\n');
  console.log('Branch Structure:');
  console.log('  🌿 develop     - Main development (default)');
  console.log('  🏭 production  - Staging/Testing (protected)');
  console.log('  🚀 master      - Production releases (protected)');
  console.log('\nWorkflow:');
  console.log('  feature/* → develop → production → master');
  console.log('\n🔗 Repository: https://github.com/' + repoOwner + '/' + repoName + '\n');
}

main().catch(console.error);
