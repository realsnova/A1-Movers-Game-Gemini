import json
import os
import io

def build():
    with open('wordlist.json', 'r', encoding='utf-8') as f:
        words_data = json.load(f)
    words_all = json.dumps(words_data.get('words', []), ensure_ascii=False)
    
    with open('monsters.json', 'r', encoding='utf-8') as f:
        monsters_data = json.load(f)
    monsters_all = json.dumps(monsters_data, ensure_ascii=False)
    
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
            
    data_snippet = f"const WORDS_ALL = {words_all};\nconst MONSTERS = {monsters_all};"
    
    output = html_template.replace('<!-- INJECT_CSS -->', f"<style>\n{css_content}\n</style>")
    output = output.replace('<!-- INJECT_DATA -->', f"<script>\n{data_snippet}\n</script>")
    
    import base64
    bgm_source_web = '<source src="BGM_no1.mp3" type="audio/mp3">'
    bgm_source_local = '<source src="https://upload.wikimedia.org/wikipedia/commons/4/4b/Kevin_MacLeod_-_Fantasy_Intro.ogg" type="audio/ogg">'
    if os.path.exists('BGM_no1.mp3'):
        with open('BGM_no1.mp3', 'rb') as f:
            bgm_b64 = base64.b64encode(f.read()).decode('utf-8')
        bgm_source_local = f'<source src="data:audio/mp3;base64,{bgm_b64}" type="audio/mp3">'
    
    output_web = output.replace('<!-- INJECT_BGM -->', bgm_source_web)
    output_local = output.replace('<!-- INJECT_BGM -->', bgm_source_local)
    
    intro_images_web = []
    intro_images_local = []
    for i in range(1, 13):
        img_name = f'intro_scene{i}.jpg'
        if os.path.exists(img_name):
            intro_images_web.append(f'"{img_name}"')
            with open(img_name, 'rb') as f:
                img_b64 = base64.b64encode(f.read()).decode('utf-8')
            intro_images_local.append(f'"data:image/jpeg;base64,{img_b64}"')
        else:
            intro_images_web.append('""')
            intro_images_local.append('""')
            
    images_js_web = f"const INTRO_IMAGES = [{','.join(intro_images_web)}];\n"
    images_js_local = f"const INTRO_IMAGES = [{','.join(intro_images_local)}];\n"
    
    output_web = output_web.replace('<!-- INJECT_JS -->', f"<script>\n{images_js_web}{js_content}\n</script>")
    output_local = output_local.replace('<!-- INJECT_JS -->', f"<script>\n{images_js_local}{js_content}\n</script>")
    
    output_web = output_web.replace('<!-- INJECT_BG_IMG -->', '')
    output_local = output_local.replace('<!-- INJECT_BG_IMG -->', '')
    
    with io.open('³æ¦r«_ÀI_Gemini.html', 'w', encoding='utf-8') as f:
        f.write(output_local)
    
    with io.open('index.html', 'w', encoding='utf-8') as f:
        f.write(output_web)
        
    print("Build complete: ³æ¦r«_ÀI_Gemini.html (Local Offline) and index.html (Web) generated.")

if __name__ == "__main__":
    build()
