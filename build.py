import json
import os
import io

def build():
    # Load JSON data
    with open('wordlist.json', 'r', encoding='utf-8') as f:
        words_data = json.load(f)
    words_all = json.dumps(words_data.get('words', []), ensure_ascii=False)
    
    with open('monsters.json', 'r', encoding='utf-8') as f:
        monsters_data = json.load(f)
    monsters_all = json.dumps(monsters_data, ensure_ascii=False)
    
    # Load source files
    css_content = ""
    if os.path.exists('src/style.css'):
        with open('src/style.css', 'r', encoding='utf-8') as f:
            css_content = f.read()
            
    js_content = ""
    if os.path.exists('src/main.js'):
        with open('src/main.js', 'r', encoding='utf-8') as f:
            js_content = f.read()
            
    html_template = ""
    if os.path.exists('src/index.html'):
        with open('src/index.html', 'r', encoding='utf-8') as f:
            html_template = f.read()
            
    # Inject data into JS snippet
    data_snippet = f"""
    const WORDS_ALL = {words_all};
    const MONSTERS = {monsters_all};
    """
    
    # Inject CSS, JS, and Data into HTML
    output = html_template.replace('<!-- INJECT_CSS -->', f"<style>\n{css_content}\n</style>")
    output = output.replace('<!-- INJECT_DATA -->', f"<script>\n{data_snippet}\n</script>")
    output = output.replace('<!-- INJECT_JS -->', f"<script>\n{js_content}\n</script>")
    
    with open('單字冒險_Gemini.html', 'w', encoding='utf-8') as f:
        f.write(output)
        
    print("Build complete: 單字冒險_Gemini.html generated.")

if __name__ == "__main__":
    build()
