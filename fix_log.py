with open('D:/work/horizonsMachine/VisionMachine/src/components/Workspace.svelte', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix the broken log function - replace the corrupted line
old_pattern = "function log(msg) {\\n\\t\\tconsole.log('[Workspace] ' + msg);`r`n`t}``r`n`tlog('Component ready');"
new_pattern = """function log(msg) {
		console.log('[Workspace] ' + msg);
	}
	log('Component ready');"""

if old_pattern in content:
    content = content.replace(old_pattern, new_pattern)
    print("Fixed corrupted log function")
else:
    # Try alternative pattern
    lines = content.split('\n')
    for i, line in enumerate(lines):
        if 'function log' in line and '\\n' in line:
            print(f"Found corrupted log at line {i}: {repr(line)}")
            # Replace with proper function
            lines[i] = "function log(msg) {"
            lines.insert(i+1, "\t\tconsole.log('[Workspace] ' + msg);")
            lines.insert(i+2, "\t}")
            lines.insert(i+3, "\tlog('Component ready');")
            break
    content = '\n'.join(lines)

with open('D:/work/horizonsMachine/VisionMachine/src/components/Workspace.svelte', 'w', encoding='utf-8') as f:
    f.write(content)

print("File updated")
