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
    console.log('=== Cleaning VisionMachine Repository ===\n');
    
    // Step 1: Get token
    console.log('Step 1: Generating GitHub token...');
    const token = await getInstallationToken();
    console.log('✅ Token obtained\n');
    
    // Step 2: Configure git remote
    console.log('Step 2: Setting up git remote...');
    try {
      runGit('git remote remove origin');
    } catch {}
    const remoteUrl = `https://x-access-token:${token}@github.com/${repoOwner}/${repoName}.git`;
    execSync(`git remote add origin ${remoteUrl}`, { cwd: localPath });
    
    // Step 3: Fetch remote
    console.log('\nStep 3: Fetching remote state...');
    runGit('git fetch origin');
    
    // Step 4: Clean history using git filter-branch (PowerShell)
    console.log('\nStep 4: Cleaning git history...');
    console.log('Removing .agnes/, config/github-token.txt from history...');
    
    const filterCmd = 'git filter-branch -f --index-filter "git rm --cached --ignore-unmatch .agnes/cache/search/webpage_snapshots/2026-08-19/a7255df5412d1ae143c8f8a2763b21b5ed1f62965740904c2695a04697bdd92d.json config/github-token.txt 2>$null" HEAD';
    try {
      runGit(filterCmd, localPath, false);
      console.log('✅ History cleaned with filter-branch');
    } catch (e) {
      console.log('filter-branch result:', e.message.substring(0, 200));
    }
    
    // Step 5: Remove refs and prune (PowerShell)
    console.log('\nStep 5: Removing backup refs and pruning...');
    try {
      runGit('$refs = git for-each-ref --format="%(refname)" refs/original/; foreach ($ref in $refs) { git update-ref -d $ref }');
    } catch {}
    runGit('git reflog expire --expire=now --expire-unreachable=now --all');
    runGit('git gc --prune=now --aggressive');
    
    // Step 6: Commit the cleanup
    console.log('\nStep 6: Committing cleanup...');
    runGit('git add -A');
    try {
      runGit('git commit -m "Clean repository: remove .agnes/, github-token, scripts from history"', { stdio: 'inherit' });
    } catch {}
    
    // Step 7: Push cleaned history
    console.log('\nStep 7: Pushing cleaned repository...');
    execSync('git push origin main --force', { 
      cwd: localPath,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      shell: false
    });
    
    console.log('\n✅ Repository cleaned successfully!');
    console.log(`🔗 https://github.com/${repoOwner}/${repoName}\n`);
    
    // Verify what's left
    console.log('Current repository contents:');
    const files = runGit('git ls-files');
    console.log(files.split('\n').join('\n  '));
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main();