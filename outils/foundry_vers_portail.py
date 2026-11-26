import json, re, html, base64, io, sys
from urllib.parse import unquote
from PIL import Image
d = json.load(open(sys.argv[1]))
IMGDIR = sys.argv[2]; GROUPE = sys.argv[3]; OUT = sys.argv[4]
SK = {'accounting':'Comptabilité','alertness':'Vigilance','anthropology':'Anthropologie','archeology':'Archéologie','artillery':'Artillerie','athletics':'Athlétisme','bureaucracy':'Bureaucratie','computer_science':'Informatique','criminology':'Criminologie','demolitions':'Explosifs','disguise':'Déguisement','dodge':'Esquive','drive':'Conduite','firearms':'Armes à feu','first_aid':'Premiers soins','forensics':'Criminalistique','heavy_machiner':'Engins lourds','heavy_weapons':'Armes lourdes','history':'Histoire','humint':'Renseignement humain','law':'Droit','medicine':'Médecine','melee_weapons':'Combat au contact','navigate':'Orientation','occult':'Occultisme','persuade':'Persuasion','pharmacy':'Pharmacologie','psychotherapy':'Psychothérapie','ride':'Équitation','search':'Fouille','sigint':'SIGINT','stealth':'Discrétion','surgery':'Chirurgie','survival':'Survie','swim':'Natation','unarmed_combat':'Combat à mains nues','unnatural':'Surnaturel'}
GRP = {'ForeignLanguage':'Langue','Art':'Art','Craft':'Artisanat','MilitaryScience':'Science militaire','Pilot':'Pilotage','Science':'Science'}
STAT = {'str':'FOR','con':'CON','dex':'DEX','int':'INT','pow':'POU','cha':'CHA'}
def txt(h):
    h = re.sub(r'<img[^>]*>', '', h or ''); h = re.sub(r'</p>|<br\s*/?>', '\n', h); h = re.sub(r'<[^>]+>', '', h)
    return re.sub(r'\n{3,}', '\n\n', html.unescape(h)).strip()
def portrait(img):
    if not img: return None
    p = IMGDIR + '/' + unquote(img).split('/')[-1]
    try: im = Image.open(p).convert('RGBA')
    except Exception as e: print('pas d’image', p, e); return None
    bg = Image.new('RGBA', im.size, (217, 214, 204, 255)); bg.alpha_composite(im); im = bg.convert('RGB')
    W, H = im.size; w = int(min(W * .72, H / 1.25)); h = int(w * 1.25); x = (W - w) // 2
    im = im.crop((x, 0, x + w, h)).resize((360, 450), Image.LANCZOS)
    b = io.BytesIO(); im.save(b, 'JPEG', quality=84); return 'data:image/jpeg;base64,' + base64.b64encode(b.getvalue()).decode()
out = []
for k, a in d.items():
    if not k.startswith('!actors!') or a.get('type') != 'agent': continue
    s = a['system']; bio = s.get('biography', {})
    items = [v for kk, v in d.items() if kk.startswith('!actors.items!' + a['_id'] + '.')]
    comps = [{'n': SK.get(key, v.get('label', key)), 'v': v.get('proficiency', 0)} for key, v in s['skills'].items() if v.get('proficiency', 0) > 0]
    comps += [{'n': f"{GRP.get(t.get('group'), t.get('group', ''))} ({t['label']})", 'v': t.get('proficiency', 0)} for t in s.get('typedSkills', {}).values()]
    import unicodedata
    comps.sort(key=lambda c: unicodedata.normalize('NFD', c['n']).encode('ascii','ignore').decode().lower())
    motiv, troubles = [], []
    for it in items:
        if it['type'] != 'motivation': continue
        m = it['system']
        if m.get('disorder'): troubles.append(m['disorder'] + (' (soigné)' if m.get('disorderCured') else ''))
        if not m.get('crossedOut') and not it['name'].startswith('Nouveau'):
            dsc = txt(m.get('description')); motiv.append(it['name'] + (' — ' + dsc if dsc else ''))
    mt = '\n'.join(motiv) + (('\n\nTroubles :\n' + '\n'.join(troubles)) if troubles else '')
    liens = []
    for it in items:
        if it['type'] != 'bond': continue
        dsc = txt(it['system'].get('description')).replace('\n', ' ')
        liens.append({'n': it['name'] + (' — ' + dsc[:70] if dsc else ''), 's': it['system'].get('score', 0)})
    armes = []
    for it in items:
        if it['type'] != 'weapon': continue
        w = it['system']; sk = w.get('skill', '')
        c = STAT[sk] + ' ×5' if sk in STAT else SK.get(sk, sk)
        dmg = w.get('damage', '') or ''
        if w.get('isLethal') or (w.get('lethality') or 0) > 0: dmg = f"Létalité {w.get('lethality')} %"
        dsc = txt(w.get('description'))
        armes.append({'n': it['name'] + (' (' + dsc + ')' if dsc and len(dsc) < 40 else ''), 'c': c, 'd': dmg, 'p': w.get('range', '')})
    equip = []
    for it in items:
        if it['type'] == 'gear':
            dsc = txt(it['system'].get('description')).replace('\n', ' ')
            if dsc.startswith(it['name']): dsc = dsc[len(it['name']):].lstrip(' ·—-')
            equip.append(it['name'] + (' — ' + dsc if dsc else ''))
        elif it['type'] == 'armor':
            equip.append(f"{it['name']} (protection {it['system'].get('protection', '?')})")
    prof = ', '.join(x for x in [bio.get('profession', ''), bio.get('employer', '')] if x)
    entete = ' · '.join(x for x in [bio.get('nationality', ''), ('Âge : ' + bio['age']) if bio.get('age') else '', bio.get('education', '')] if x)
    adapt = s['sanity'].get('adaptations', {})
    data = {'name': a['name'], 'prof': prof,
            'stats': {STAT[x]: s['statistics'][x]['value'] for x in STAT},
            'pv': {'cur': s['health']['value'], 'max': -(-(s['statistics']['str']['value'] + s['statistics']['con']['value']) // 2) + (s['health'].get('maxBonus') or 0)},
            'vol': {'cur': s['wp']['value'], 'max': s['statistics']['pow']['value'] + (s['wp'].get('maxBonus') or 0)},
            'motiv': mt, 'liens': liens, 'comps': comps, 'armes': armes, 'equip': '\n'.join(equip), 'bless': '',
            'bio': (entete + '\n\n' if entete else '') + txt(s.get('physical', {}).get('description')),
            'violence': [adapt.get('violence', {}).get(f'incident{i}', False) for i in (1, 2, 3)],
            'impuiss': [adapt.get('helplessness', {}).get(f'incident{i}', False) for i in (1, 2, 3)]}
    out.append({'foundry_id': a['_id'], 'groupe': GROUPE, 'data': data, 'portrait': portrait(a.get('img')),
                'san': s['sanity']['value'], 'san_max': s['sanity']['max'], 'seuil': s['sanity']['currentBreakingPoint']})
def badge(name):
    p = IMGDIR + '/Forensic_ID_' + name.split()[-1] + '.png'
    try: im = Image.open(p).convert('RGBA')
    except Exception: return None
    r = min(1, 1000 / im.height, 800 / im.width); im = im.resize((round(im.width * r), round(im.height * r)), Image.LANCZOS)
    b = io.BytesIO(); im.save(b, 'WEBP', quality=84, method=6); return 'data:image/webp;base64,' + base64.b64encode(b.getvalue()).decode()
for x in out:
    bd = badge(x['data']['name'])
    if bd: x['badge'] = bd
out.sort(key=lambda x: x['data']['name'])
json.dump(out, open(OUT, 'w'), ensure_ascii=False)
for x in out:
    dd = x['data']; print(dd['name'], '|', dd['prof'], '|', dd['stats'], 'PV', dd['pv'], 'VOL', dd['vol'], 'SAN', x['san'], '/', x['seuil'], '| comps', len(dd['comps']), 'liens', len(dd['liens']), 'armes', len(dd['armes']), 'portrait', bool(x['portrait']))
