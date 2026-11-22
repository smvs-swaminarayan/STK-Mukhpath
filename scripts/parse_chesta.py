with open('chesta_pads.txt', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if '…Œ' in line or 'r™Þ{' in line or 'Page ' in line:
        print(f"L{i}: {line.strip()}")
        for j in range(1, 3):
            if i + j < len(lines):
                print(f"     {lines[i+j].strip()}")
