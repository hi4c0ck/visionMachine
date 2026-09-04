import re
import sys

# Read files
with open('D:/work/horizonsMachine/VisionMachine/src/components/ComposerPanel.svelte', 'r') as f:
    panel = f.read()

with open('D:/work/horizonsMachine/VisionMachine/src/lib/composerStore/index.ts', 'r') as f:
    store = f.read()

with open('D:/work/horizonsMachine/VisionMachine/BACKEND_INTEGRATION_TASKS.md', 'r') as f:
    tasks = f.read()

# Check what's exported from store
store_exports = {
    'movePipe': 'export const movePipe' in store,
    'duplicatePipe': 'export const duplicatePipe' in store,
    'updateQ': 'export const updateQ' in store,
    'updateC': 'export const updateC' in store,
    'setPipeLength': 'export const setPipeLength' in store,
    'moveKeyframe': 'export const moveKeyframe' in store,
    'resizeSegment': 'export const resizeSegment' in store,
    'updateTagValue': 'export const updateTagValue' in store,
    'updateTagPrompt': 'export const updateTagPrompt' in store,
}

# Check what's imported in panel
panel_imports = []
import_match = re.search(r'import \{([^}]+)\} from \$lib/composerStore', panel, re.DOTALL)
if import_match:
    imports_str = import_match.group(1)
    panel_imports = [x.strip() for x in imports_str.split(',')]

print("=" * 70)
print("STORE EXPORTS vs PANEL IMPORTS")
print("=" * 70)

missing_in_panel = []
for export_name, exists in store_exports.items():
    imported = export_name in panel_imports
    status = "✓" if (exists and imported) else "✗"
    if exists and not imported:
        missing_in_panel.append(export_name)
    print(f"{status} {export_name:20} | store:{'yes' if exists else 'no':3} | panel:{'yes' if imported else 'no':3}")

print("\n" + "=" * 70)
print("MISSING FUNCTIONALITY IN COMPOSER PANEL")
print("=" * 70)

# Features from BACKEND_INTEGRATION_TASKS.md
features = [
    ("Pipe reorder (movePipe)", "movePipe", False),
    ("Pipe duplicate (duplicatePipe)", "duplicatePipe", False),
    ("Q value editing (updateQ)", "updateQ", False),
    ("C value editing (updateC)", "updateC", False),
    ("Pipe length editing (setPipeLength)", "setPipeLength", False),
    ("Keyframe drag-reposition", "moveKeyframe", False),
    ("Segment drag-to-move (resizeSegment)", "resizeSegment", False),
    ("Tag value editing (updateTagValue)", "updateTagValue", False),
    ("Tag prompt editing (updateTagPrompt)", "updateTagPrompt", False),
    ("Toast notifications on errors", "showToast", False),
    ("Generate button wired", "ongenerate", False),
    ("Compiler preview in ToolsPanel", "compilePrompt", False),
    ("Unsynced badge display", "unsynced", False),
    ("Keyboard navigation (Arrows)", "ArrowLeft", False),
    ("Multi-pipe layout (scrollable)", "overflow-y", True),
    ("Tag selector modal", "showTagSelectorModal", True),
    ("Vertical playhead overlay", "vertical-playhead", True),
]

for name, keyword, already_known in features:
    found = keyword in panel or keyword in store
    status = "✓" if found else "✗"
    print(f"{status} {name}")

print("\n" + "=" * 70)
print("SUMMARY")
print("=" * 70)
print(f"Missing from panel: {len(missing_in_panel)} functions")
for m in missing_in_panel:
    print(f"  - {m}")
