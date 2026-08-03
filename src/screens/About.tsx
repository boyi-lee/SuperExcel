// 這個工具的來由。
//
// ⚠️ 這一頁不是行銷文案，是使用說明的一部分。
//    使用者要先知道「為什麼這裡算出來的數字跟你自己的試算表不一樣」，
//    後面看到自己的毛利變醜才不會以為程式壞了。

import { Button, Card } from "../components/ui";

/** 原始試算表的三個缺陷。共通點：錯的方向都是讓毛利看起來比較好。 */
const DEFECTS = [
  {
    title: "耗損率沒有計入成本",
    detail: "投入 100 只有 90 變成成品，成本要放大成 1 ÷ 0.9，不是乘 1.1，更不是不算。",
    result: "成本系統性低估",
  },
  {
    title: "營業稅被寫死成一個常數",
    detail: "那個數字是「5% 稅 ÷ 1.05」的結果。寫死之後，沒有人記得它的前提是售價含稅。",
    result: "改成未稅報價時無從改起",
  },
  {
    title: "有物料還沒問到價，剩下的照樣加總",
    detail: "少算幾項的成本一定偏低，而偏低的成本會讓毛利看起來很好。",
    result: "看起來很好的錯誤數字最難被發現",
  },
];

const RULES = [
  {
    title: "算不出來就說算不出來",
    detail:
      "缺一項單價，整張 BOM 的成本就是「未知」，不做部分加總。成本未知時，「這樣打折還有賺嗎」會回答「不知道」，不會回答「有」。畫面上的「－」代表未知，不代表 0。",
  },
  {
    title: "毛利、微利、淨利要分開看",
    detail:
      "毛利是美好的，微利是緊張的，淨利是嚇人的。只活在高毛利的粉紅泡泡裡，就會做出賠錢的活動。所以三層都列出來，而且要你看最後一層。",
  },
  {
    title: "打折之後費用也會變少，但那不是多賺",
    detail:
      "變動製造成本不會變，但變動銷售費用與固定費用分攤是按售價算的，售價降了它們就跟著降。很多人做完活動發現莫名其妙多賺了，其實不是銷量變好，是少付了費用。這裡會把兩者拆開寫給你看。",
  },
  {
    title: "分類名稱你自己取",
    detail:
      "程式只認三種計價行為：依用量、依次數、一次性攤提。分類要叫「配方油脂」還是「進貨成本」隨你，換個產業一樣能用。",
  },
];

export function AboutScreen({ onStart }: { onStart: () => void }) {
  return (
    <div className="space-y-4">
      <Card>
        <div className="max-w-3xl">
          <p className="text-sm font-semibold text-brand-700">這是什麼</p>
          <h2 className="mt-2 text-2xl font-bold text-stone-900 sm:text-3xl">
            算出一件商品真正的成本，
            <br className="hidden sm:block" />
            以及打折之後還剩多少
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-stone-700">
            這個工具是從一份用了很多年的成本試算表長出來的。那份表原本是做給電商與手作品牌的朋友，
            讓他們在開活動之前先知道自己會不會賠錢。用的人越來越多之後，它的問題也越來越清楚：
            表格很難維護、公式一改就壞、而且有幾個算錯的地方，錯的方向剛好都是讓毛利看起來比較好。
          </p>
          <p className="mt-3 text-sm leading-relaxed text-stone-700">
            所以有了這個版本。同一套邏輯，但每一條算式都寫成程式、每一條都有測試釘住，
            而且算不出來的時候會直接告訴你算不出來。
          </p>
          <div className="mt-6">
            <Button onClick={onStart}>開始試算</Button>
          </div>
        </div>
      </Card>

      <Card title="原本那份試算表哪裡不對">
        <div className="grid gap-3 sm:grid-cols-3">
          {DEFECTS.map((defect) => (
            <div key={defect.title} className="rounded-lg border border-stone-200 bg-stone-50 p-4">
              <h4 className="text-sm font-semibold text-stone-900">{defect.title}</h4>
              <p className="mt-2 text-xs leading-relaxed text-stone-700">{defect.detail}</p>
              <p className="mt-3 text-xs font-semibold text-red-700">{defect.result}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-sm text-stone-700">
          三個問題的共通點是：<span className="font-semibold">錯的方向都是讓數字變好看</span>。
          所以沒有人會發現，直到真的賠錢。
        </p>
      </Card>

      <Card title="因此這個版本說到做到的幾件事">
        <div className="space-y-3">
          {RULES.map((rule, index) => (
            <div key={rule.title} className="flex gap-3 rounded-lg border border-stone-200 p-4">
              <span className="shrink-0 text-lg font-bold text-brand-600">{index + 1}</span>
              <div>
                <h4 className="text-sm font-semibold text-stone-900">{rule.title}</h4>
                <p className="mt-1 text-xs leading-relaxed text-stone-700">{rule.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="用之前先知道兩件事">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <h4 className="text-sm font-semibold text-amber-900">前面填得越完整，後面才算得準</h4>
            <p className="mt-2 text-xs leading-relaxed text-amber-900">
              費率、物料、產品這幾頁是地基。地基沒打好，後面的邊際貢獻與促銷試算就只是把錯誤放大而已。
              一開始會覺得要填的東西很多，這是正常的。
            </p>
          </div>
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <h4 className="text-sm font-semibold text-red-800">資料只在你的瀏覽器裡，記得下載存檔</h4>
            <p className="mt-2 text-xs leading-relaxed text-red-800">
              沒有伺服器、不用註冊，我們看不到你的資料，也沒有任何地方有備份。
              「下載存檔」不是附加功能，它就是存檔本身。清除瀏覽器資料或換電腦，沒下載過的就沒了。
            </p>
          </div>
        </div>
      </Card>

      <Card title="看到數字變醜的時候">
        <p className="text-sm leading-relaxed text-stone-700">
          第一次把成本填完整，多半會看到比預期難看的數字。那不是這個工具算壞了，
          是本來就長這樣，只是以前沒有算進去。
        </p>
        <p className="mt-3 text-sm leading-relaxed text-stone-700">
          看到爆掉或死透也不用緊張：那代表你已經找到會少賺或賠錢的地方了。
          下一步是弄清楚是哪一個環節把成本撐大，然後去修它。就算要死，也要死得明明白白。
        </p>
        <div className="mt-5">
          <Button onClick={onStart}>好，開始試算</Button>
        </div>
      </Card>
    </div>
  );
}
