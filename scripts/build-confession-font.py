#!/usr/bin/python3
"""Build and verify the small SC serif font used by the castle confession."""

import argparse
from hashlib import sha256
import json
from pathlib import Path
import unicodedata

from fontTools import subset
from fontTools.ttLib import TTFont


ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path('/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc')
SOURCE_INDEX = 2  # Noto Serif CJK SC, Regular, zero-based TTC face.
PAGES = [
    ROOT / 'src/journey/RideConfession.tsx',
    ROOT / 'src/journey/CastleRide.tsx',
]
DESTINATION = ROOT / 'public/journey/confession-serif.woff2'
LICENSE_SOURCE = ROOT / 'public/princess/siyi-serif.LICENSE.txt'
SEED = (
    '谭陈思仪我喜欢你。要不要和我在一起？'
    '好呀先不了那我先开心一下。好，听你的。'
    '给思仪去逛城堡继续看风景'
)
FAMILY = 'Siyi Confession Serif'
POSTSCRIPT_NAME = 'SiyiConfessionSerif-Regular'
MAX_BYTES = 40000


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--allow-missing-page', action='store_true',
                        help='Allow a provisional seed build before a component exists.')
    args = parser.parse_args()
    page_texts = {}
    missing_pages = []
    for page in PAGES:
        relative = str(page.relative_to(ROOT))
        if not page.is_file():
            missing_pages.append(relative)
            continue
        page_texts[relative] = page.read_text(encoding='utf-8')
    if missing_pages and not args.allow_missing_page:
        raise FileNotFoundError(f'Confession source pages are missing: {missing_pages}')

    # Include every non-ASCII character from both components, including their
    # punctuation, plus printable ASCII. This deliberately covers a superset of
    # visible copy and catches any newly introduced symbol absent from the font.
    text = SEED + ''.join(page_texts.values())
    needed = {chr(codepoint) for codepoint in range(32, 127)}
    needed.update(char for char in text
                  if ord(char) >= 128 and not char.isspace()
                  and not unicodedata.category(char).startswith('C'))
    characters = ''.join(sorted(needed))

    font = TTFont(SOURCE, fontNumber=SOURCE_INDEX, recalcTimestamp=False)
    original_name = font['name'].getDebugName(1)
    original_version = font['name'].getDebugName(5)
    original_copyright = font['name'].getDebugName(0)
    if original_name != 'Noto Serif CJK SC' or font['OS/2'].usWeightClass != 400:
        raise ValueError('Expected the Simplified Chinese Regular face at TTC index 2')
    source_cmap = font.getBestCmap()
    missing = [char for char in characters if ord(char) not in source_cmap]
    if missing:
        raise ValueError(f'Source font is missing requested characters: {missing}')

    options = subset.Options()
    options.flavor = 'woff2'
    options.layout_features = []
    options.hinting = False
    options.desubroutinize = True
    options.drop_tables += ['GPOS', 'GSUB', 'VORG', 'vhea', 'vmtx']
    options.name_IDs = [0, 1, 2, 4, 5, 6, 13, 14, 16, 17]
    options.name_languages = [0x409]
    options.name_legacy = False
    options.recalc_timestamp = False
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(text=characters)
    subsetter.subset(font)

    names = {
        1: FAMILY, 2: 'Regular', 4: f'{FAMILY} Regular',
        6: POSTSCRIPT_NAME, 16: FAMILY, 17: 'Regular',
    }
    for name_id, value in names.items():
        font['name'].setName(value, name_id, 3, 1, 0x409)
    if 'CFF ' in font:
        cff = font['CFF '].cff
        cff.fontNames = [POSTSCRIPT_NAME]
        cff.topDictIndex[0].FamilyName = FAMILY
        cff.topDictIndex[0].FullName = names[4]
    font.flavor = 'woff2'
    DESTINATION.parent.mkdir(parents=True, exist_ok=True)
    font.save(DESTINATION)
    font.close()

    # Inspect the bytes actually shipped, rather than only the input subset.
    with TTFont(DESTINATION) as shipped:
        cmap = shipped.getBestCmap()
        missing = [char for char in characters if ord(char) not in cmap]
        if missing:
            raise ValueError(f'Generated font is missing characters: {missing}')
        if shipped['OS/2'].usWeightClass != 400:
            raise ValueError('Generated font must retain Regular weight 400')
        if shipped['name'].getDebugName(1) != FAMILY:
            raise ValueError('Generated font family was not renamed')
    size = DESTINATION.stat().st_size
    if size >= MAX_BYTES:
        raise ValueError(f'Confession font is {size} bytes; expected below {MAX_BYTES}')

    license_text = LICENSE_SOURCE.read_text(encoding='utf-8')
    if 'SIL OPEN FONT LICENSE Version 1.1' not in license_text:
        raise ValueError('The existing source attribution must include the full SIL OFL 1.1')
    license_text = license_text.replace('Siyi Story Serif:', f'{FAMILY}:', 1)
    DESTINATION.with_name('confession-serif.LICENSE.txt').write_text(license_text, encoding='utf-8')
    sources = '\n'.join(f'{path} SHA-256: {sha256(value.encode()).hexdigest()}'
                        for path, value in page_texts.items())
    source_text = f'''{FAMILY} — limited Simplified Chinese confession font

Source font: {SOURCE}
TTC face index: {SOURCE_INDEX} (zero-based)
Original family: {original_name}
Original version: {original_version}
Embedded source copyright: {original_copyright}
Source TTC SHA-256: {sha256(SOURCE.read_bytes()).hexdigest()}
Upstream: https://github.com/notofonts/noto-cjk/tree/main/Serif
License: SIL Open Font License 1.1; see confession-serif.LICENSE.txt.

Modification: SC face extraction; glyph subset; removal of unused layout
features, vertical metrics and hinting; renamed {FAMILY}; WOFF2 encoding.
No glyph outlines were redesigned. Copyright and OFL metadata are retained.
CSS @font-face alias: SiyiConfessionSerif, weight 400, style normal.

Rebuild: /usr/bin/python3 scripts/build-confession-font.py
Uses the existing system fontTools and Brotli; adds no project dependency.
The script reads both src/journey/RideConfession.tsx and CastleRide.tsx,
adds the approved confession/button seed, includes all source non-ASCII
characters and printable ASCII, and verifies every required glyph against
the final WOFF2 cmap. Default builds require both source components.
It is a text-specific subset, not a general-purpose CJK web font.

{sources}
Missing source pages (provisional builds only): {json.dumps(missing_pages, ensure_ascii=False)}
Total mapped characters: {len(cmap)}
WOFF2 size: {size} bytes
WOFF2 SHA-256: {sha256(DESTINATION.read_bytes()).hexdigest()}
Included characters: {characters}
'''
    DESTINATION.with_name('confession-serif.SOURCE.txt').write_text(source_text, encoding='utf-8')
    print(json.dumps({
        'output': str(DESTINATION), 'bytes': size,
        'mapped_characters': len(cmap), 'coverage_verified': not missing,
        'under_40kb': size < MAX_BYTES, 'missing_pages': missing_pages,
    }, ensure_ascii=False))


if __name__ == '__main__':
    main()
