#!/usr/bin/env python3
"""
Check which skills are active/installed
"""

import json
import subprocess
import shutil
from pathlib import Path

API_DIR = Path("/home/moltbot/clawd/dashboards/api")

# Map skill names to their required commands/checks
SKILL_CHECKS = {
    '1password': ['op'],
    'docker': ['docker'],
    'github': ['gh'],
    'gog': ['gog'],
    'weather': [],  # No deps, always available
    'tmux': ['tmux'],
    'qmd': ['qmd'],
}

def check_command(cmd):
    """Check if a command exists"""
    return shutil.which(cmd) is not None

def main():
    # Load existing skills data
    skills_file = API_DIR / "skills.json"
    if not skills_file.exists():
        print("Skills file not found, run generate-data.py first")
        return
    
    with open(skills_file) as f:
        skills = json.load(f)
    
    # Check each skill
    for skill in skills:
        name = skill.get('name', '')
        
        # Check if we have a specific check for this skill
        if name in SKILL_CHECKS:
            cmds = SKILL_CHECKS[name]
            if not cmds:  # No deps required
                skill['status'] = 'active'
            elif all(check_command(cmd) for cmd in cmds):
                skill['status'] = 'active'
            else:
                skill['status'] = 'inactive'
                skill['missing'] = [cmd for cmd in cmds if not check_command(cmd)]
        else:
            # Default: check if a command with the skill name exists
            if check_command(name):
                skill['status'] = 'active'
            else:
                skill['status'] = 'unknown'
    
    # Save updated skills
    with open(skills_file, 'w') as f:
        json.dump(skills, f, indent=2, ensure_ascii=False)
    
    active = sum(1 for s in skills if s.get('status') == 'active')
    print(f"Skills checked: {active} active, {len(skills) - active} inactive/unknown")

if __name__ == "__main__":
    main()
