"""Rebuild the original cat-paw greeting artwork (no runtime font dependency).

Each Chinese character is drawn as an individual rounded pen path. All lettering,
paw pads, ears, stars and the tail flourish below are original vector artwork.
This script uses only the Python standard library; the site serves the checked-in
SVG directly, so it does not add a build dependency.
"""
from pathlib import Path

STROKES = {
    '祝': 'M11 5L16 10 M5 18Q12 16 22 17Q17 28 5 38 M14 30V58 M17 32L23 39 M29 13H56V32H29Z M35 34Q36 51 25 58 M48 34V51Q48 58 56 55L60 50',
    '集': 'M22 5Q17 13 8 20 M18 13V38 M36 5L40 10 M20 14H57 M40 14V38 M20 22H54 M20 30H54 M18 38H59 M7 47H59 M33 41V63 M30 49Q20 58 7 62 M36 49Q47 58 60 62',
    '美': 'M19 5L24 12 M45 5L39 12 M11 17H53 M32 18V35 M16 26H49 M8 35H56 M8 45H56 M32 38Q31 55 7 61 M35 48Q44 58 60 61',
    '小': 'M32 9V54Q32 60 22 55 M17 25Q12 39 6 45 M47 25Q54 33 58 44',
    '喵': 'M5 25H20V51H5Z M28 16H61 M36 8V24 M51 8V24 M28 32H60V59H28Z M44 33V58 M29 45H59',
    '圣': 'M12 8H51Q44 25 10 32 M18 12Q34 29 59 32 M32 34V58 M14 44H50 M6 59H58',
    '诞': 'M7 7L15 14 M4 26H14V54L23 46 M25 15H33L26 28H33Q31 46 23 54 M24 42Q32 60 61 59 M57 6Q47 11 40 11 M47 12V44 M38 25V45H59 M49 28H59',
    '节': 'M6 17H58 M21 8V24 M44 8V24 M14 33H52V49Q51 55 42 51 M29 34V61',
    '快': 'M8 27L6 38 M16 9V60 M23 26L26 33 M28 24H54V41 M28 41H61 M41 9V30Q40 49 28 60 M44 43Q51 55 61 60',
    '乐': 'M52 8Q35 14 20 13 M20 15L14 32H57 M35 23V55Q35 61 25 56 M21 42Q15 51 6 57 M48 42Q54 47 60 55',
}


def glyph(char, x, y, scale=1, rotate=0, color='url(#milk)'):
    return (f'<g transform="translate({x} {y}) scale({scale}) rotate({rotate} 32 32)">'
            f'<path d="{STROKES[char]}" class="letter-edge"/>'
            f'<path d="{STROKES[char]}" stroke="{color}" class="letter-ink"/></g>')


def paw(x, y, scale=1, rotate=0):
    return f'''<g transform="translate({x} {y}) scale({scale}) rotate({rotate})" stroke="#203047" stroke-width="2.8">
      <path d="M-15 6C-14-3-8-7 0-7S14-3 15 6C17 17 8 18 0 14C-8 18-17 17-15 6Z" fill="#cb6871"/>
      <ellipse cx="-19" cy="-9" rx="6" ry="8.5" transform="rotate(-30 -19 -9)" fill="#fff0d5"/>
      <ellipse cx="-7" cy="-20" rx="6.5" ry="9" transform="rotate(-9 -7 -20)" fill="#fff0d5"/>
      <ellipse cx="8" cy="-20" rx="6.5" ry="9" transform="rotate(9 8 -20)" fill="#fff0d5"/>
      <ellipse cx="20" cy="-8" rx="6" ry="8.5" transform="rotate(30 20 -8)" fill="#fff0d5"/>
      <path d="M-8 3Q-4-1 0 1" fill="none" stroke="#ffdabb" stroke-width="2.2" stroke-linecap="round"/>
    </g>'''


pieces = ['''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 478 172" width="478" height="172" role="img" aria-labelledby="title desc">
  <title id="title">祝集美小喵【zkl】圣诞节快乐</title>
  <desc id="desc">原创圆润手写猫爪字，象牙白与暖红色笔画，猫耳、红色肉垫与金色猫尾装饰。</desc>
  <defs>
    <linearGradient id="milk" x2="0" y2="1"><stop stop-color="#fff4db"/><stop offset="1" stop-color="#e7c58a"/></linearGradient>
    <linearGradient id="rose" x2="0" y2="1"><stop stop-color="#ffe4c3"/><stop offset="1" stop-color="#dc7775"/></linearGradient>
    <style>.letter-edge,.letter-ink{fill:none;stroke-linecap:round;stroke-linejoin:round}.letter-edge{stroke:#172b41;stroke-width:9.5}.letter-ink{stroke-width:5.2}</style>
  </defs>
  <!-- Cat ears are part of the lettering, rather than a separate UI icon. -->
  <g stroke="#172b41" stroke-width="3.5" stroke-linejoin="round">
    <path d="M281 33L278 13Q279 8 284 12L302 28" fill="#fff0d5"/>
    <path d="M321 29L339 11Q343 8 343 14L340 35" fill="#fff0d5"/>
    <path d="M285 25L284 17L293 25M330 25L338 17L337 28" fill="none" stroke="#c96c72" stroke-width="3" stroke-linecap="round"/>
  </g>''']

pieces += [glyph('祝', 13, 49, .45, -9)]
for char, x, y, rot in [('集',58,27,-3), ('美',128,24,2), ('小',197,28,-3), ('喵',271,30,2)]:
    pieces.append(glyph(char,x,y,1,rot,'url(#rose)' if char=='喵' else 'url(#milk)'))

# The exact lowercase name remains visible in a tiny hand-drawn gift label.
pieces.append('''<g transform="translate(355 48) rotate(-5)">
  <path d="M3 4Q41-2 85 5L89 40Q45 48 3 40Z" fill="#7d293a" fill-opacity=".86" stroke="#dfbc7c" stroke-width="1.8"/>
  <g fill="none" stroke="#fff0cf" stroke-width="3.1" stroke-linecap="round" stroke-linejoin="round">
    <path d="M15 10H10V33H15Q11 22 15 10M72 10H77V33H72Q76 22 72 10" fill="#fff0cf" stroke-width="1.3"/>
    <path d="M23 18H34L23 30H36 M44 10V31 M54 18L45 24L56 31 M63 10V29Q63 33 68 30"/>
  </g>
  <path d="M43 0Q38-13 33-10Q29-6 43 0Q49-13 54-10Q57-6 43 0" fill="none" stroke="#e6c587" stroke-width="2.7" stroke-linecap="round"/>
</g>''')
for char, x, y, rot in [('圣',67,99,-3),('诞',124,101,2),('节',181,98,-2),('快',238,102,2),('乐',297,99,-3)]:
    pieces.append(glyph(char,x,y,.76,rot,'url(#milk)'))
pieces.append(paw(400,126,.85,14))
pieces.append(paw(51,126,.38,-20))
pieces.append('''<g fill="none" stroke-linecap="round">
  <path d="M78 161Q192 168 324 158Q350 156 359 144Q367 132 359 128Q350 125 350 136" stroke="#172b41" stroke-width="6"/>
  <path d="M78 161Q192 168 324 158Q350 156 359 144Q367 132 359 128Q350 125 350 136" stroke="#e6c587" stroke-width="2.4"/>
  <path d="M347 25L354 22M349 32L359 32" stroke="#e6c587" stroke-width="2.1"/>
</g>
<g fill="#f2d394" stroke="#172b41" stroke-width="1.5" stroke-linejoin="round">
  <path d="M44 23Q44 32 36 35Q44 38 44 47Q46 38 54 35Q46 32 44 23Z"/>
  <path d="M446 96Q446 102 440 104Q446 106 446 113Q448 106 454 104Q448 102 446 96Z"/>
  <circle cx="422" cy="20" r="2.5"/><circle cx="372" cy="106" r="1.8"/>
</g>
</svg>''')

out = Path(__file__).resolve().parents[1] / 'public/lettering/christmas-paw-greeting.svg'
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text('\n'.join(pieces)+'\n',encoding='utf-8')
print(out)
