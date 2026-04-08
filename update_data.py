import re

data_path = 'd:\\VidyaPath\\lib\\data.ts'

with open(data_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Let's remove the previously added empty exemplar URLs
content = re.sub(r"\s*ncertExemplarUrl:\s*'(.*?)',", "", content)

# 2. Add exemplar URLs to each chapter object
def get_exemplar_url(class_level, subject, chapter_number):
    unit = f"{int(chapter_number):02d}"
    if class_level == '10':
        if subject in ['Physics', 'Chemistry', 'Biology']:
            return f"https://ncert.nic.in/pdf/publication/exemplarproblem/classX/science/jeep1{unit}.pdf"
        elif subject == 'Math':
            return f"https://ncert.nic.in/pdf/publication/exemplarproblem/classX/mathematics/jeep2{unit}.pdf"
    elif class_level == '11':
        if subject == 'Physics':
            return f"https://ncert.nic.in/pdf/publication/exemplarproblem/classXI/physics/keep3{unit}.pdf"
        elif subject == 'Chemistry':
            return f"https://ncert.nic.in/pdf/publication/exemplarproblem/classXI/chemistry/keep5{unit}.pdf"
        elif subject == 'Biology':
            return f"https://ncert.nic.in/pdf/publication/exemplarproblem/classXI/biology/keep4{unit}.pdf"
        elif subject == 'Math':
            return f"https://ncert.nic.in/pdf/publication/exemplarproblem/classXI/mathematics/keep2{unit}.pdf"
    elif class_level == '12':
        if subject == 'Physics':
            return f"https://ncert.nic.in/pdf/publication/exemplarproblem/classXII/physics/leep1{unit}.pdf"
        elif subject == 'Chemistry':
            return f"https://ncert.nic.in/pdf/publication/exemplarproblem/classXII/chemistry/leep5{unit}.pdf"
        elif subject == 'Biology':
            return f"https://ncert.nic.in/pdf/publication/exemplarproblem/classXII/biology/leep4{unit}.pdf"
        elif subject == 'Math':
            return f"https://ncert.nic.in/pdf/publication/exemplarproblem/classXII/mathematics/leep2{unit}.pdf"
    return ""

new_content = ""
pos = 0
pattern = re.compile(
    r"(id:\s*'[^']+',\s*classLevel:\s*(\d+),\s*subject:\s*'([^']+)',\s*chapterNumber:\s*(\d+).*?ncertPdfUrl:\s*'[^\n]+',\n)",
    re.DOTALL
)

for match in pattern.finditer(content):
    class_level = match.group(2)
    subject = match.group(3)
    chapter_num = match.group(4)
    
    exemplar_url = get_exemplar_url(class_level, subject, chapter_num)
    
    replacement = f"{match.group(1)}    ncertExemplarUrl: '{exemplar_url}',\n"
    
    new_content += content[pos:match.start()]
    new_content += replacement
    pos = match.end()

new_content += content[pos:]

with open(data_path, 'w', encoding='utf-8') as f:
    f.write(new_content)

print("Updated data.ts again!")
