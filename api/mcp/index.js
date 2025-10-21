name: Local Coding Runner

on:
  workflow_dispatch:
  repository_dispatch:
    types: [nightly_ticket, run_ci]
  push:
    branches:
      - main
      - feature/**

permissions:
  contents: write
  pull-requests: write

jobs:
  build-and-test:
    runs-on: [self-hosted, Windows, X64]

    defaults:
      run:
        shell: pwsh
        working-directory: ${{ github.workspace }}

    steps:
      # 🧩 Checkout using SSH (supports large files)
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 0
          ssh-key: ${{ secrets.SSH_PRIVATE_KEY }}

      - name: Ensure PowerShell can run scripts
        run: Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process -Force

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20.x'

      - name: Use local Python 3.10
        run: |
          $env:PATH = "C:\Program Files\Python310;$env:PATH"
          python --version
          python -m pip install --upgrade pip
          pip install pytest

      - name: Environment health check
        run: |
          Write-Host "Node version:"; node -v
          Write-Host "Python version:"; python --version
          Write-Host "Git version:"; git --version

      - name: Install dependencies
        run: |
          python -m pip install --upgrade pip
          if (Test-Path requirements.txt) { pip install -r requirements.txt }
          if (Test-Path package-lock.json) {
            npm ci
          } elseif (Test-Path package.json) {
            npm install
          } elseif (Test-Path yarn.lock) {
            yarn install --frozen-lockfile
          } elseif (Test-Path pnpm-lock.yaml) {
            pnpm i --frozen-lockfile
          } else {
            Write-Host "⚠️ No JS project detected, skipping npm/yarn install."
          }

      - name: Install Playwright browsers
        run: |
          try { npx playwright install } catch { Write-Host "Playwright already installed." }

      - name: Run patch/apply script
        run: |
          if (Test-Path scripts/request_patch_and_apply.py) {
            python scripts/request_patch_and_apply.py
          } else {
            Write-Host "⚠️ Script not found, skipping"
          }

      - name: Run tests (Playwright + Pytest)
        run: |
          if (Test-Path "tests\e2e") {
            Write-Host "▶ Running Playwright tests..."
            npx playwright install --with-deps
            npx playwright test
          } else {
            Write-Host "⚠️ No Playwright tests found, skipping."
          }

          if (Test-Path "tests") {
            Write-Host "▶ Running Pytest..."
            $env:PATH = "C:\Users\maanh\AppData\Roaming\Python\Python310\Scripts;$env:PATH"
            python -m pytest -q
          } else {
            Write-Host "⚠️ No Python tests found, skipping."
          }

      - name: Configure Git author
        run: |
          cd $env:GITHUB_WORKSPACE
          git config user.name "Maan Runner"
          git config user.email "maan-runner@users.noreply.github.com"

      # 🔐 Prepare SSH key from GitHub secret (RUNNER_SSH_KEY)
      - name: Prepare SSH key
        shell: pwsh
        run: |
          $keyDir = "$env:RUNNER_TEMP\sshkey"
          New-Item -ItemType Directory -Force -Path $keyDir | Out-Null
          $keyPath = "$keyDir\id_agent_runner"

          # Use Raw to preserve newlines exactly
          $keyContent = @'
${{ secrets.RUNNER_SSH_KEY }}
'@

          [System.IO.File]::WriteAllText($keyPath, $keyContent, [System.Text.Encoding]::UTF8)
          icacls $keyPath /inheritance:r /grant:r "${env:USERNAME}:R"
          Write-Host "🔍 First lines of key file:"
          Get-Content $keyPath | Select-Object -First 3

      - name: Configure Git remote (SSH)
        run: |
          cd $env:GITHUB_WORKSPACE
          $keyPath = Join-Path $env:RUNNER_TEMP "sshkey\id_agent_runner"
          $env:GIT_SSH_COMMAND = "C:/Windows/System32/OpenSSH/ssh.exe -i `"$keyPath`" -o IdentitiesOnly=yes -o StrictHostKeyChecking=no"
          git remote set-url origin git@github.com:EZChoices/agent-factory.git
          git remote -v

      # ✅ Create and push branch via SSH (handles large files)
      - name: Create branch + commit changes (SSH)
        run: |
          cd $env:GITHUB_WORKSPACE
          $branch = "auto/patch-${{ github.run_id }}"
          git checkout -B $branch
          git add --all -- ':!node_modules'
          git commit -m "Auto patch via Local Coding Runner (run ${{ github.run_id }})" || echo "No changes to commit"
          $keyPath = Join-Path $env:RUNNER_TEMP "sshkey\id_agent_runner"
          $sshCmd = "C:/Windows/System32/OpenSSH/ssh.exe -i `"$keyPath`" -o IdentitiesOnly=yes -o StrictHostKeyChecking=no"
          git -c "core.sshCommand=$sshCmd" push -f origin $branch

      # 🔄 Temporarily switch to HTTPS just for PR creation
      - name: Switch remote to HTTPS for PR
        run: |
          cd $env:GITHUB_WORKSPACE
          git remote set-url origin https://github.com/EZChoices/agent-factory.git
          git remote -v

      # 🪄 Create Pull Request
      - name: Create Pull Request
        id: cpr
        uses: peter-evans/create-pull-request@v6
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          title: "Auto patch via Local Coding Runner"
          body: "Generated by local self-hosted runner."
          branch: "auto/patch-${{ github.run_id }}"
          base: "main"
          commit-message: "Auto patch via Local Coding Runner (run ${{ github.run_id }})"
          delete-branch: true
          committer: "github-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>"
          author: "EZChoices <199622373+EZChoices@users.noreply.github.com>"

      # ✅ Auto-merge PR after creation
      - name: Enable auto-merge (squash)
        if: steps.cpr.outputs.pull-request-number != ''
        uses: peter-evans/enable-pull-request-automerge@v3
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          pull-request-number: ${{ steps.cpr.outputs.pull-request-number }}
          merge-method: squash

      # ✅ Graceful exit if no changes
      - name: Auto-close if no changes
        if: steps.cpr.outputs.pull-request-number == ''
        run: echo "No new changes detected — ending workflow gracefully."

      # 🔁 Restore SSH remote for next run
      - name: Restore SSH remote for future runs
        if: always()
        run: |
          cd $env:GITHUB_WORKSPACE
          git remote set-url origin git@github.com:EZChoices/agent-factory.git
          git remote -v
