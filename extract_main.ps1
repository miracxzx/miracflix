$logPath = "C:\Users\mirac\.gemini\antigravity\brain\ade7e003-e547-4e48-9fab-e45293c21013\.system_generated\logs\overview.txt"
$line = (Get-Content $logPath -TotalCount 304)[-1]
$json = $line | ConvertFrom-Json
$code = $json.tool_calls[0].args.CodeContent
# The code string itself is escaped in the JSON. ConvertFrom-Json handles one layer.
# But sometimes the tool call args are stringified JSON.
$code = $code -replace '^"','' -replace '"$',''
$code = [regex]::Unescape($code)
Set-Content -Path "c:\Users\mirac\Downloads\movie\main_revert.js" -Value $code -Encoding utf8
