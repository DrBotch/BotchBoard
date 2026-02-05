#!/usr/bin/env python3
"""
Generate JSON data files for the Botch Dashboard
Run periodically to update dashboard data
"""

import json
import os
import glob
from datetime import datetime
from pathlib import Path

API_DIR = Path("/home/moltbot/clawd/dashboards/api")
MEMORY_DIR = Path("/home/moltbot/clawd/memory")
WORKSPACE = Path("/home/moltbot/clawd")
SKILLS_DIRS = [
    Path("/home/moltbot/clawd/skills"),
    Path("/home/moltbot/.npm-global/lib/node_modules/openclaw/skills")
]

def ensure_dir():
    API_DIR.mkdir(parents=True, exist_ok=True)

def generate_meta():
    """Generate metadata with timestamp"""
    meta = {
        "generated": datetime.utcnow().isoformat() + "Z",
        "version": "1.0"
    }
    with open(API_DIR / "meta.json", "w") as f:
        json.dump(meta, f)

def generate_memory_files():
    """Generate list of memory files with content preview"""
    files = []
    for filepath in sorted(MEMORY_DIR.glob("*.md"), reverse=True):
        try:
            stat = filepath.stat()
            content = filepath.read_text(encoding='utf-8')
            files.append({
                "name": filepath.name,
                "size": stat.st_size,
                "modified": int(stat.st_mtime),
                "preview": content[:2000] if len(content) > 2000 else content
            })
        except Exception as e:
            print(f"Error reading {filepath}: {e}")
    
    with open(API_DIR / "memory-files.json", "w") as f:
        json.dump(files, f, indent=2)

def generate_memory_main():
    """Generate MEMORY.md content"""
    memory_path = WORKSPACE / "MEMORY.md"
    if memory_path.exists():
        content = memory_path.read_text(encoding='utf-8')
        with open(API_DIR / "memory-main.json", "w") as f:
            json.dump(content, f)

def parse_skill_md(filepath):
    """Parse a SKILL.md file to extract metadata"""
    try:
        content = filepath.read_text(encoding='utf-8')
        lines = content.split('\n')
        
        title = ""
        description = ""
        
        for line in lines:
            line = line.strip()
            if line.startswith('# ') and not title:
                title = line[2:].strip()
            elif line.startswith('> ') and not description:
                description = line[2:].strip()
            elif description and line.startswith('>'):
                # Continue multi-line description
                description += " " + line[1:].strip()
        
        # If no description found, try to get first paragraph
        if not description:
            in_content = False
            for line in lines:
                if line.startswith('# '):
                    in_content = True
                    continue
                if in_content and line.strip() and not line.startswith('#') and not line.startswith('---'):
                    description = line.strip()
                    break
        
        return title, description
    except Exception as e:
        print(f"Error parsing {filepath}: {e}")
        return "", ""

def generate_skills():
    """Generate skills list from SKILL.md files"""
    skills = {}
    
    for skills_dir in SKILLS_DIRS:
        if not skills_dir.exists():
            continue
        
        for skill_path in skills_dir.iterdir():
            if not skill_path.is_dir():
                continue
            
            skill_file = skill_path / "SKILL.md"
            if not skill_file.exists():
                continue
            
            name = skill_path.name
            title, description = parse_skill_md(skill_file)
            
            # Don't overwrite if we already have a better version
            if name in skills and skills[name].get('description'):
                continue
            
            skills[name] = {
                "name": name,
                "title": title or name,
                "description": description or "",
                "path": str(skill_file)
            }
    
    skills_list = sorted(skills.values(), key=lambda x: x['name'])
    
    with open(API_DIR / "skills.json", "w") as f:
        json.dump(skills_list, f, indent=2)

def generate_system_info():
    """Generate system information"""
    import subprocess
    
    info = {}
    
    try:
        # Uptime
        uptime = subprocess.check_output(['uptime', '-p'], text=True).strip()
        info['uptime'] = uptime
    except:
        info['uptime'] = 'unknown'
    
    try:
        # Disk usage
        df = subprocess.check_output(['df', '-h', '/home/moltbot'], text=True)
        lines = df.strip().split('\n')
        if len(lines) > 1:
            parts = lines[1].split()
            info['disk'] = {
                'total': parts[1],
                'used': parts[2],
                'available': parts[3],
                'percent': parts[4]
            }
    except:
        pass
    
    try:
        # Memory
        free = subprocess.check_output(['free', '-h'], text=True)
        lines = free.strip().split('\n')
        if len(lines) > 1:
            parts = lines[1].split()
            info['memory'] = {
                'total': parts[1],
                'used': parts[2],
                'available': parts[6] if len(parts) > 6 else parts[3]
            }
    except:
        pass
    
    with open(API_DIR / "system.json", "w") as f:
        json.dump(info, f, indent=2)

def main():
    print(f"Generating dashboard data at {datetime.now()}")
    ensure_dir()
    generate_meta()
    generate_memory_files()
    generate_memory_main()
    generate_skills()
    generate_system_info()
    print("Done!")

if __name__ == "__main__":
    main()
