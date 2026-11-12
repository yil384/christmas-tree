/** Small paper-cut flowers that belong to the three wishes in the letter. */
export default function PaperFlower({ variant = 0, className = '' }: { variant?: number; className?: string }) {
  return <svg className={className} viewBox="0 0 120 180" fill="none" aria-hidden="true">
    <path className="siyi-flower-stem" d={variant === 1 ? 'M58 172C66 129 47 89 64 45' : variant === 2 ? 'M61 172C42 136 76 99 61 45' : 'M59 173C68 132 43 91 59 43'} />
    <path className="siyi-flower-leaf siyi-flower-leaf-left" d="M60 128C34 126 23 110 25 95C43 96 57 108 60 128Z" />
    <path className="siyi-flower-leaf siyi-flower-leaf-right" d="M60 101C84 97 94 79 91 65C73 69 62 83 60 101Z" />
    <path className="siyi-flower-leaf siyi-flower-leaf-low" d="M60 157C80 155 91 143 93 131C75 131 63 142 60 157Z" />
    <g className={`siyi-flower-petals siyi-flower-petals-${variant}`}>
      {variant === 1 ? <>
        <path d="M61 56C36 47 35 30 39 18L56 30L65 10L72 29L89 20C91 39 81 52 61 56Z" />
        <path className="siyi-petal-fold" d="M61 56L65 10M61 56L39 18M61 56L89 20" />
      </> : <>
        {[0, 60, 120, 180, 240, 300].map(angle => <ellipse key={angle} cx="60" cy="24" rx={variant === 2 ? 8 : 11} ry={variant === 2 ? 20 : 17} transform={`rotate(${angle} 60 42)`} />)}
        <circle className="siyi-flower-heart" cx="60" cy="42" r="8" />
      </>}
    </g>
  </svg>;
}
