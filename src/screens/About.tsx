// 這個工具的特色與來由。
//
// ⚠️ 這一頁不是行銷文案，是使用說明的一部分。
//    使用者要先知道「為什麼這裡算出來的數字跟你自己的試算表不一樣」，
//    後面看到自己的毛利變醜才不會以為程式壞了。
// 🚫 不要寫「業界最強」這種話。這個工具的賣點就是不講漂亮話，
//    文案先破功的話，後面叫人相信那些難看的數字就沒有說服力了。

import { Button, Card } from "../components/ui";

/** 特色。每一條都要對得上程式裡真的有做的事，寫得出來卻做不到就是騙人。 */
const FEATURES = [
  {
    tag: "不騙你",
    title: "算不出來就說算不出來",
    detail:
      "缺一項物料單價，整張配方的成本就是「未知」，不做部分加總。成本未知時，「這樣打折還有賺嗎」會回答「不知道」，不會回答「有」。畫面上的「－」代表未知，不是 0。",
  },
  {
    tag: "看真的",
    title: "毛利、微利、淨利三層都列出來",
    detail:
      "毛利是美好的，微利是緊張的，淨利是嚇人的。多數試算表只算到毛利就停了，於是每個商品看起來都很賺。這裡三層並排，而且要你看最後一層。",
  },
  {
    tag: "最容易錯",
    title: "打折之後「多賺」的錢，會拆給你看",
    detail:
      "降價之後變動銷售費用與固定分攤都跟著變少，淨利不會照折抵金額等比例掉。很多人因此以為活動很成功。這裡會直接寫出「你折掉 100，實際只少賺 54，差額 46 是少付的費用」。",
  },
  {
    tag: "細節",
    title: "耗損率是除進去，不是乘上去",
    detail:
      "耗損 10% 代表投入只有 90% 變成成品，成本要放大成 1 ÷ 0.9，不是乘 1.1。這兩個數字差 1%，量大的時候就是幾萬塊。",
  },
  {
    tag: "細節",
    title: "運費按營收攤，但有上限",
    detail:
      "不會出現 2000 元的商品攤到 120 元運費這種事：你根本沒花那麼多錢寄它。上限就是你的每筆平均運費。低價商品也不會被迫扛整筆平均運費而看起來全部在虧。",
  },
  {
    tag: "細節",
    title: "營業稅存稅率本身，不寫死成常數",
    detail:
      "存的是 5% 加上一個「售價是否含稅」的開關，含稅時的實質佔比 4.76% 由程式推導。寫死成 4.8% 之後，日後改成未稅報價時就沒有人知道要改哪個數字。",
  },
  {
    tag: "跨產業",
    title: "分類名稱你自己取",
    detail:
      "程式只認三種計價行為：依用量、依次數、一次性攤提。分類要叫「配方油脂」還是「進貨成本」隨你。手作、電商、代工共用同一套程式，原始碼裡沒有任何一行針對特定產業的判斷。",
  },
  {
    tag: "你的資料",
    title: "沒有後端，不用註冊，我們收不到你的資料",
    detail:
      "全部在你的瀏覽器裡跑。成本結構是商業機密，本來就不該傳給誰。相對地，匯出的 JSON 就是你的存檔，換電腦要自己帶著走。",
  },
];

/** 對照表。抽象的原則講再多次，都不如一格具體的數字。 */
const COMPARISON = [
  {
    case: "有一項物料還沒問到價",
    others: "把有價的加一加，給你一個成本",
    here: "整張配方成本顯示「－」，並列出缺哪幾項",
    why: "加一半的成本一定偏低，而偏低的成本會讓毛利看起來很好",
  },
  {
    case: "耗損率 10%",
    others: "成本 × 1.1，或根本不算",
    here: "成本 ÷ 0.9",
    why: "投入 100 只有 90 變成成品，不是多花 10",
  },
  {
    case: "2000 元的商品，平均運費 68 元",
    others: "整筆 68，或按比例攤到 136",
    here: "以 68 為上限",
    why: "你沒有花 136 元寄它",
  },
  {
    case: "滿千折百之後淨利變化",
    others: "只給你一個折後數字",
    here: "少賺 54、少付 46，兩個分開列",
    why: "多出來的是少付的費用，不是多賣的量",
  },
  {
    case: "期望淨利率設得太高",
    others: "算出一個很大的建議售價",
    here: "顯示「無解」",
    why: "那代表賣多貴都達不到，不是賣貴一點就好",
  },
];

export function AboutScreen({ onStart }: { onStart: () => void }) {
  return (
    <div className="space-y-4">
      <Card>
        <div className="max-w-3xl">
          <p className="text-sm font-semibold text-acid">成本 · 定價 · 促銷試算</p>
          <h2 className="mt-2 text-2xl font-bold leading-tight text-ink sm:text-4xl">
            算出一件商品真正的成本，
            <br className="hidden sm:block" />
            以及打折之後還剩多少
          </h2>
          <p className="mt-4 text-base leading-relaxed text-ink-2">
            這個工具最大的特色是：<span className="font-semibold">它不會給你一個好看的假數字。</span>
            算得出來就算，算不出來就明講算不出來，並告訴你缺什麼。
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Button onClick={onStart}>開始試算</Button>
          </div>
        </div>
      </Card>

      <Card title="它跟一般成本試算表差在哪">
        <div className="grid gap-3 sm:grid-cols-2">
          {FEATURES.map((feature) => (
            <div key={feature.title} className="rounded-lg border border-line p-4">
              <span className="inline-block rounded-full bg-acid/10 px-2.5 py-1 text-xs font-semibold text-acid">
                {feature.tag}
              </span>
              <h4 className="mt-2 text-sm font-semibold text-ink">{feature.title}</h4>
              <p className="mt-1 text-xs leading-relaxed text-ink-2">{feature.detail}</p>
            </div>
          ))}
        </div>
      </Card>

      {/*
        ⚠️ 這裡刻意不用表格。四欄的比較表在手機上一定要橫向捲，
           而使用者最需要看懂的就是這一段，不該叫他一邊捲一邊比對。
           拆成五張卡，每張自己講完一件事，任何寬度都讀得完。
      */}
      <Card title="同一種狀況，兩種算法">
        <div className="space-y-3">
          {COMPARISON.map((row, index) => (
            <div key={row.case} className="rounded-lg border border-line bg-panel-2 p-4">
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-xs text-ink-3">{String(index + 1).padStart(2, "0")}</span>
                <h4 className="text-sm font-semibold text-ink">{row.case}</h4>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div className="rounded-md border border-line px-3 py-2">
                  <div className="text-xs text-ink-3">一般試算表</div>
                  <div className="mt-1 text-sm text-ink-2">{row.others}</div>
                </div>
                <div className="rounded-md border border-acid/40 bg-acid/10 px-3 py-2">
                  <div className="text-xs text-acid">這裡</div>
                  <div className="mt-1 text-sm font-semibold text-acid">{row.here}</div>
                </div>
              </div>

              <p className="mt-3 text-xs leading-relaxed text-ink-3">為什麼：{row.why}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card title="為什麼會有這個工具">
        <div className="max-w-3xl space-y-3 text-sm leading-relaxed text-ink-2">
          <p>
            它是從一份用了很多年的成本試算表長出來的。那份表原本是做給電商與手作品牌的朋友，
            讓他們在開活動之前先知道自己會不會賠錢。用的人越來越多之後，問題也越來越清楚：
            表格難維護、公式一改就壞，而且有幾個地方本來就算錯。
          </p>
          <p>
            三個算錯的地方分別是：耗損率沒有計入成本、營業稅被寫死成一個沒人記得由來的常數、
            以及有物料還沒問到價時剩下的照樣加總。
            <span className="font-semibold">
              它們的共通點是，錯的方向都是讓數字變好看，所以沒有人會發現，直到真的賠錢。
            </span>
          </p>
          <p>
            所以有了這個版本。同一套邏輯，但每一條算式都寫成程式、每一條都有測試釘住，
            而且算不出來的時候會直接告訴你算不出來。
          </p>
        </div>
      </Card>

      <Card title="用之前先知道兩件事">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-warn/40 bg-warn/10 p-4">
            <h4 className="text-sm font-semibold text-warn">前面填得越完整，後面才算得準</h4>
            <p className="mt-2 text-xs leading-relaxed text-warn">
              費率、物料、產品這幾頁是地基。地基沒打好，後面的邊際貢獻與促銷試算只是把錯誤放大而已。
              一開始會覺得要填的東西很多，這是正常的。
            </p>
          </div>
          <div className="rounded-lg border border-bad/40 bg-bad/10 p-4">
            <h4 className="text-sm font-semibold text-bad">資料只在你的瀏覽器裡，記得下載存檔</h4>
            <p className="mt-2 text-xs leading-relaxed text-bad">
              沒有伺服器、不用註冊，我們看不到你的資料，也沒有任何地方有備份。
              「下載存檔」不是附加功能，它就是存檔本身。清除瀏覽器資料或換電腦，沒下載過的就沒了。
            </p>
          </div>
        </div>
      </Card>

      {/*
        🚫 這一段的內容必須跟 LICENSE 檔一致。
           授權說明寫錯比沒寫更糟：使用者會照著做，然後違約的是他。
           這個專案是 AGPL-3.0，跟 FSL、MIT 的規則都不一樣，不要照抄別的專案的說法。
      */}
      <Card title="授權">
        <div className="max-w-3xl">
          <h3 className="text-xl font-bold text-ink sm:text-2xl">開源，而且要求改良的版本也開源</h3>
          <p className="mt-3 text-sm leading-relaxed text-ink-2">
            授權是 <span className="font-semibold text-ink">AGPL-3.0</span>。
            你可以自由使用、修改、散布，也可以拿去賺錢。唯一的核心要求是：
            <span className="font-semibold text-ink">
              如果你改了它，並且把改過的版本架成網路服務給別人用，你也必須以同樣的授權公開你的原始碼。
            </span>
          </p>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border-l-4 border-ok border-y border-r border-y-line border-r-line bg-panel-2 p-4">
            <h4 className="text-sm font-semibold text-ok">可以</h4>
            <ul className="mt-3 space-y-2 text-sm text-ink-2">
              {[
                "自己用、公司內部用",
                "修改它、發布你的修改版",
                "拿去上收費課程與企業內訓",
                "用在你提供給客戶的專業服務裡",
                "架成網路服務對外收費",
              ].map((line) => (
                <li key={line} className="flex gap-2">
                  <span aria-hidden className="text-ok">
                    ✓
                  </span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-lg border-l-4 border-bad border-y border-r border-y-line border-r-line bg-panel-2 p-4">
            <h4 className="text-sm font-semibold text-bad">不可以</h4>
            <ul className="mt-3 space-y-2 text-sm text-ink-2">
              {[
                "改了之後架成服務，卻不公開你改過的原始碼",
                "改成專有授權或閉源",
                "移除原始碼裡的著作權與授權聲明",
                "散布時不附上授權條款全文",
              ].map((line) => (
                <li key={line} className="flex gap-2">
                  <span aria-hidden className="text-bad">
                    ✕
                  </span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-line bg-panel-2 p-4 text-sm leading-relaxed text-ink-2">
          <span className="font-semibold text-ink">判斷原則：</span>
          拿去賺錢可以，把改良的版本變回黑箱不行。
          選 AGPL 就是為了這一條：這個工具解決的是資訊不對稱，
          它的後代不該再變成一個別人看不到算式的黑盒子。
          條款全文在原始碼的 LICENSE 檔裡，那份才是有效力的版本，這裡只是白話摘要。
        </div>
      </Card>

      <Card title="看到數字變醜的時候">
        <div className="max-w-3xl space-y-3 text-sm leading-relaxed text-ink-2">
          <p>
            第一次把成本填完整，多半會看到比預期難看的數字。那不是這個工具算壞了，
            是本來就長這樣，只是以前沒有算進去。
          </p>
          <p>
            看到爆掉或死透也不用緊張：那代表你已經找到會少賺或賠錢的地方了。
            下一步是弄清楚哪一個環節把成本撐大，然後去修它。就算要死，也要死得明明白白。
          </p>
        </div>
        <div className="mt-5">
          <Button onClick={onStart}>好，開始試算</Button>
        </div>
      </Card>
    </div>
  );
}
