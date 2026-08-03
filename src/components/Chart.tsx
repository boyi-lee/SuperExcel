// 手寫的 SVG 圖表。
//
// ⚠️ 刻意不引入圖表函式庫。理由跟不引入 SheetJS 一樣：
//    這裡要的只有「月營收長條」加「一條比率折線」，用不到那些函式庫存在的理由
//    （互動、縮放、上百種圖型），卻要為此多背 40 到 100KB。
//
// 🚫 沒有資料的月份不畫、不補 0。補 0 會在圖上長出一個「那個月營收暴跌」的假故事。

type Point = {
  label: string;
  /** 長條的值。null 代表那個月沒填，不畫。 */
  bar: number | null;
  /** 折線的值 0 至 1。null 代表沒填，線就斷在那裡。 */
  line: number | null;
};

const WIDTH = 720;
const HEIGHT = 240;
const PAD = { top: 16, right: 44, bottom: 28, left: 56 };

const PLOT_W = WIDTH - PAD.left - PAD.right;
const PLOT_H = HEIGHT - PAD.top - PAD.bottom;

function niceCeiling(value: number): number {
  if (!(value > 0)) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / magnitude) * magnitude;
}

export function BarLineChart({
  points,
  barLabel,
  lineLabel,
  formatBar,
  formatLine,
}: {
  points: Point[];
  barLabel: string;
  lineLabel: string;
  formatBar: (value: number) => string;
  formatLine: (value: number) => string;
}) {
  const bars = points.map((point) => point.bar).filter((value): value is number => value !== null);
  const lines = points.map((point) => point.line).filter((value): value is number => value !== null);

  if (points.length === 0 || (bars.length === 0 && lines.length === 0)) {
    return <p className="text-sm text-ink-3">還沒有足夠的資料可以畫圖。</p>;
  }

  const barMax = niceCeiling(Math.max(...bars, 0));
  // 折線可能是負的（淨利率虧損），所以上下界都要看實際資料。
  const lineMax = Math.max(...lines, 0);
  const lineMin = Math.min(...lines, 0);
  const lineSpan = lineMax - lineMin || 1;

  const slot = PLOT_W / points.length;
  const barWidth = Math.min(slot * 0.55, 48);

  const xOf = (index: number) => PAD.left + slot * index + slot / 2;
  const yOfBar = (value: number) => PAD.top + PLOT_H - (value / barMax) * PLOT_H;
  const yOfLine = (value: number) => PAD.top + PLOT_H - ((value - lineMin) / lineSpan) * PLOT_H;

  // 折線遇到沒填的月份就斷開，不跨過去連成一條假的趨勢。
  const segments: string[] = [];
  let current: string[] = [];
  points.forEach((point, index) => {
    if (point.line === null) {
      if (current.length > 1) segments.push(current.join(" "));
      current = [];
      return;
    }
    current.push(`${current.length === 0 ? "M" : "L"}${xOf(index).toFixed(1)},${yOfLine(point.line).toFixed(1)}`);
  });
  if (current.length > 1) segments.push(current.join(" "));

  const gridValues = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-auto w-full min-w-[36rem]"
        role="img"
        aria-label={`${barLabel}與${lineLabel}的逐月變化`}
      >
        {gridValues.map((fraction) => {
          const y = PAD.top + PLOT_H * (1 - fraction);
          return (
            <g key={fraction}>
              <line x1={PAD.left} y1={y} x2={WIDTH - PAD.right} y2={y} stroke="#2f2f2f" strokeWidth="1" />
              <text x={PAD.left - 8} y={y + 4} textAnchor="end" fontSize="11" fill="#8e8e8e">
                {formatBar(barMax * fraction)}
              </text>
              <text x={WIDTH - PAD.right + 8} y={y + 4} fontSize="11" fill="#8fa832">
                {formatLine(lineMin + lineSpan * fraction)}
              </text>
            </g>
          );
        })}

        {points.map((point, index) =>
          point.bar === null ? null : (
            <rect
              key={`bar-${point.label}`}
              x={xOf(index) - barWidth / 2}
              y={yOfBar(point.bar)}
              width={barWidth}
              height={Math.max(PAD.top + PLOT_H - yOfBar(point.bar), 1)}
              fill="#dcfd50"
              opacity="0.55"
              rx="2"
            />
          ),
        )}

        {segments.map((segment) => (
          <path key={segment.slice(0, 24)} d={segment} fill="none" stroke="#7be495" strokeWidth="2" />
        ))}

        {points.map((point, index) =>
          point.line === null ? null : (
            <circle key={`dot-${point.label}`} cx={xOf(index)} cy={yOfLine(point.line)} r="3" fill="#7be495" />
          ),
        )}

        {points.map((point, index) => (
          <text
            key={`label-${point.label}`}
            x={xOf(index)}
            y={HEIGHT - 8}
            textAnchor="middle"
            fontSize="11"
            fill="#8e8e8e"
          >
            {point.label}
          </text>
        ))}
      </svg>

      <div className="mt-2 flex flex-wrap gap-4 text-xs text-ink-3">
        <span className="flex items-center gap-2">
          <span aria-hidden className="inline-block h-3 w-3 rounded-sm bg-acid/60" />
          {barLabel}
        </span>
        <span className="flex items-center gap-2">
          <span aria-hidden className="inline-block h-0.5 w-4 bg-ok" />
          {lineLabel}
        </span>
        <span>沒填的月份不畫，折線會斷開，不會補 0 連成一條假的趨勢。</span>
      </div>
    </div>
  );
}
