param (
    [string]$Action,
    [string]$BranchName
)

if (-not $Action) {
    Write-Host "Usage:" -ForegroundColor Yellow
    Write-Host "  .\worktree.ps1 start <branch_name>  - Add worktree and initialize venv"
    Write-Host "  .\worktree.ps1 list                 - List active worktrees"
    Write-Host "  .\worktree.ps1 remove <branch_name> - Remove worktree and delete branch"
    exit 1
}

switch ($Action.ToLower()) {
    "start" {
        if (-not $BranchName) {
            Write-Host "Error: Branch name required." -ForegroundColor Red
            exit 1
        }
        
        # Clean branch name for directory
        $DirName = $BranchName -replace '[\\/]', '-'
        $TargetDir = Join-Path (Get-Item .).Parent.FullName "winmouse-$DirName"
        
        Write-Host "Adding git worktree for branch '$BranchName' at: $TargetDir..." -ForegroundColor Cyan
        git worktree add $TargetDir -b $BranchName
        if ($LASTEXITCODE -ne 0) {
            Write-Host "Error: Failed to create worktree." -ForegroundColor Red
            exit $LASTEXITCODE
        }
        
        Write-Host "Initializing virtual environment (.venv) at $TargetDir..." -ForegroundColor Cyan
        Push-Location $TargetDir
        try {
            python -m venv .venv
            if ($LASTEXITCODE -ne 0) {
                Write-Host "Warning: Failed to create venv automatically. Set it up manually." -ForegroundColor Yellow
            } else {
                Write-Host "Installing dependencies in worktree environment..." -ForegroundColor Cyan
                & ".\.venv\Scripts\pip" install -r requirements.txt
            }
        } finally {
            Pop-Location
        }
        
        Write-Host "Worktree setup completed successfully!" -ForegroundColor Green
    }
    
    "list" {
        git worktree list
    }
    
    "remove" {
        if (-not $BranchName) {
            Write-Host "Error: Branch name required." -ForegroundColor Red
            exit 1
        }
        
        $DirName = $BranchName -replace '[\\/]', '-'
        $TargetDir = Join-Path (Get-Item .).Parent.FullName "winmouse-$DirName"
        
        Write-Host "Removing worktree at: $TargetDir..." -ForegroundColor Cyan
        git worktree remove $TargetDir
        
        Write-Host "Deleting branch '$BranchName'..." -ForegroundColor Cyan
        git branch -d $BranchName
        
        Write-Host "Worktree and branch removed successfully!" -ForegroundColor Green
    }
    
    default {
        Write-Host "Unknown action: $Action" -ForegroundColor Red
        exit 1
    }
}
