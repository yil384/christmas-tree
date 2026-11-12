/** Quiet, non-interactive page corners, like the border of a painted Christmas storybook. */
export default function StorybookFrame() {
  return <div className="storybook-frame" aria-hidden="true">
    {['top-left', 'top-right', 'bottom-right'].map(corner => <svg
      key={corner}
      className={`storybook-corner storybook-corner--${corner}`}
      viewBox="0 0 144 144"
      fill="none"
      focusable="false"
    >
      <path className="storybook-gilding" d="M6 132V24C6 14 14 6 24 6H132M14 107V29C14 20 20 14 29 14H107" />
      <path className="storybook-vine" d="M25 93C31 70 21 51 35 35C51 21 70 31 93 25M35 35C47 47 52 57 51 70M35 35C47 47 57 52 70 51" />
      <path className="storybook-holly" d="M32 41C20 39 22 28 20 21C28 23 39 20 41 32L35 35ZM31 57C18 57 21 47 17 41C25 43 34 38 37 49L34 53ZM57 31C57 18 47 21 41 17C43 25 38 34 49 37L53 34Z" />
      <path className="storybook-leaf" d="M26 73C16 69 19 60 22 56C25 62 31 67 26 73ZM73 26C69 16 60 19 56 22C62 25 67 31 73 26Z" />
      <path className="storybook-gilding" d="M28 28L36 36M24 48L32 53M48 24L53 32" />
      <circle className="storybook-berry" cx="36" cy="37" r="4.3" />
      <circle className="storybook-berry" cx="43" cy="36" r="3.8" />
      <circle className="storybook-berry" cx="39" cy="44" r="3.5" />
      <path className="storybook-star" d="M105 18Q106 24 112 25Q106 26 105 32Q104 26 98 25Q104 24 105 18ZM23 98Q24 102 28 103Q24 104 23 108Q22 104 18 103Q22 102 23 98Z" />
    </svg>)}
  </div>;
}
