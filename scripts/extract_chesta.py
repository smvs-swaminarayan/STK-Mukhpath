import pypdf

reader = pypdf.PdfReader(r'D:\Seva_2\Seva_2\Jaydeep Maharaj\kirtan-sarita-1.pdf')
with open('chesta_pads.txt', 'w', encoding='utf-8') as out:
    for p in range(103, 118):
        lines = reader.pages[p].extract_text().split('\n')
        out.write(f'=== Page {p-27} ===\n')
        for line in lines:
            out.write(line + '\n')
print('Extracted successfully!')
