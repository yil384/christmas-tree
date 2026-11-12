#!/usr/bin/python3
"""Build the small SC story font with the system fontTools/Brotli installation."""

from hashlib import sha256
from pathlib import Path
import json
import re

from fontTools import subset
from fontTools.ttLib import TTFont


ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path('/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc')
SOURCE_INDEX = 2  # Verified family: Noto Serif CJK SC, Regular.
PAGE = ROOT / 'src/confession/ConfessionPage.tsx'
DESTINATION = ROOT / 'public/princess/siyi-serif.woff2'
SEED = '谭陈思仪奕辰公主城堡夜游今晚我想耍个帅皇冠归你紧张归我先别放烟花还有一句正经的话喜欢说完了给往大里点亮星光再来一次'
PUNCTUATION = ' ，。！？：；、（）“”‘’—…·'


def main():
    page_text = PAGE.read_text(encoding='utf-8')
    chinese = set(re.findall(r'[\u3400-\u4dbf\u4e00-\u9fff]', page_text + SEED))
    punctuation = set(page_text) & set(PUNCTUATION)
    characters = ''.join(sorted(chinese | punctuation))
    font = TTFont(SOURCE, fontNumber=SOURCE_INDEX, recalcTimestamp=False)
    original_name = font['name'].getDebugName(1)
    original_version = font['name'].getDebugName(5)
    original_copyright = font['name'].getDebugName(0)
    source_cmap = font.getBestCmap()
    missing = sorted(char for char in characters if ord(char) not in source_cmap)
    if missing:
        raise ValueError(f'Source font is missing requested characters: {missing}')

    options = subset.Options()
    options.flavor = 'woff2'
    options.layout_features = []
    options.hinting = False
    options.desubroutinize = True
    options.drop_tables += ['GPOS', 'GSUB', 'VORG', 'vhea', 'vmtx']
    options.name_IDs = [0, 1, 2, 4, 5, 6, 13, 14]
    options.name_languages = [0x409]
    options.name_legacy = False
    options.recalc_timestamp = False
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(text=characters)
    subsetter.subset(font)

    # Give this limited derivative its own name, retaining attribution/license.
    names = {
        1: 'Siyi Story Serif',
        2: 'Regular',
        4: 'Siyi Story Serif Regular',
        6: 'SiyiStorySerif-Regular',
    }
    for name_id, value in names.items():
        font['name'].setName(value, name_id, 3, 1, 0x409)
    if 'CFF ' in font:
        cff = font['CFF '].cff
        cff.fontNames = ['SiyiStorySerif-Regular']
        cff.topDictIndex[0].FamilyName = names[1]
        cff.topDictIndex[0].FullName = names[4]
    font.flavor = 'woff2'
    DESTINATION.parent.mkdir(parents=True, exist_ok=True)
    font.save(DESTINATION)

    # Reopen the final WOFF2, checking actual shipped glyph coverage.
    shipped = TTFont(DESTINATION)
    cmap = shipped.getBestCmap()
    missing = [char for char in characters if ord(char) not in cmap]
    if missing:
        raise ValueError(f'Generated font is missing characters: {missing}')
    size = DESTINATION.stat().st_size
    source_text = f'''Siyi Story Serif — limited Simplified Chinese story font

Source font: {SOURCE}
TTC face index: {SOURCE_INDEX} (zero-based)
Original family: {original_name}
Original version: {original_version}
Embedded source copyright: {original_copyright}
Source TTC SHA-256: {sha256(SOURCE.read_bytes()).hexdigest()}
Upstream: https://github.com/notofonts/noto-cjk/tree/main/Serif
License: SIL Open Font License 1.1; see siyi-serif.LICENSE.txt.

Modification: SC face extraction; glyph subset; removal of unused layout
features, vertical metrics and hinting; renamed Siyi Story Serif; WOFF2 encoding.
No glyph outlines were redesigned. Copyright and OFL metadata are retained.
CSS @font-face alias suggestion: SiyiStorySerif, weight 400, style normal.

Rebuild: /usr/bin/python3 scripts/build-siyi-font.py
Uses existing system fontTools and Brotli; no project dependency is added.
The script reads all Chinese characters from src/confession/ConfessionPage.tsx,
adds the approved story-title seed and the punctuation used by that page.
It is a text-specific subset, not a general-purpose CJK web font.

Page SHA-256: {sha256(page_text.encode()).hexdigest()}
Chinese characters: {len(chinese)}
Total mapped characters: {len(cmap)}
WOFF2 size: {size} bytes
WOFF2 SHA-256: {sha256(DESTINATION.read_bytes()).hexdigest()}
Included characters: {characters}
'''
    DESTINATION.with_name('siyi-serif.SOURCE.txt').write_text(source_text, encoding='utf-8')
    print(json.dumps({
        'output': str(DESTINATION),
        'bytes': size,
        'chinese_characters': len(chinese),
        'mapped_characters': len(cmap),
        'coverage_verified': not missing,
        'under_35kb': size < 35000,
    }, ensure_ascii=False))


if __name__ == '__main__':
    main()
