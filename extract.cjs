const fs = require('fs');
const readline = require('readline');

async function extract() {
    const rl = readline.createInterface({
        input: fs.createReadStream('C:/Users/mirac/.gemini/antigravity/brain/ade7e003-e547-4e48-9fab-e45293c21013/.system_generated/logs/overview.txt'),
        crlfDelay: Infinity
    });

    let lineNumber = 0;
    for await (const line of rl) {
        lineNumber++;
        if (lineNumber >= 300 && lineNumber <= 310) {
            console.log(`Line ${lineNumber}: ${line.substring(0, 100)}...`);
            if (line.includes('"step_index":753')) {
                const json = JSON.parse(line);
                let code = json.tool_calls[0].args.CodeContent;
                if (code.startsWith('"') && code.endsWith('"')) {
                   try { code = JSON.parse(code); } catch(e) {}
                }
                fs.writeFileSync('c:/Users/mirac/Downloads/movie/main_revert.js', code);
                console.log(`Extracted main.js from line ${lineNumber}, length: ${code.length}`);
            }
        }
    }
}

extract();
