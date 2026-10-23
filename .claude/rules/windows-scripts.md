---
paths:
  - "bin/*.ps1"
---

# Windows PowerShell scripts

These run under Windows PowerShell 5.1 (`powershell.exe`, launched hidden from the Startup-folder shortcut), not PowerShell 7.

- Save as UTF-8 **with BOM**. Without it 5.1 reads the file as ANSI and the Korean strings break. The Write/Edit tools may drop the BOM — check with `head -c 3 <file> | od -An -tx1` (expect `ef bb bf`) and re-add it if missing.
- 5.1 syntax only: no `&&`/`||` pipeline chains, `??`, `?.`, or ternary.
- Call npm through `cmd.exe /c "npm ..."` so output redirection and `$LASTEXITCODE` behave; native stderr redirected inside PowerShell becomes error records.
- No console prompts or visible windows: the script runs at logon with nobody watching. Log to `.finance-dashboard.log` instead of writing to the console.
- Keep `bin/finance-dashboard` (bash) behaviour in step: same port (4300), PID file, and "already running → do nothing".
