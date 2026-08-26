#!/usr/bin/env python3
"""Fix T5: img2img validation and T6: compiler panel"""
import re

filepath = 'src/components/ComposerPanel.svelte'

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# Fix T5: img2img validation - only require referenceUrl, not prompt
old_validation = "(addMode === 'img2img' && (!modalImg2Img.trim() || !modalPrompt.trim()))"
new_validation = "(addMode === 'img2img' && !modalImg2Img.trim())"
content = content.replace(old_validation, new_validation)
print("[OK] Fixed T5: img2img validation")

# Write back
with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print("[OK] Updated ComposerPanel.svelte with T5 fix")
