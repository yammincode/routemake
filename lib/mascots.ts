// 原岩夥伴：六館 logo 的動物（圖在 lib/mascot-art.ts，由 scripts/gen-mascot-art.mjs 產生）
// 名字、簡介、句子是暫定的，老闆給正式版本時改這裡就好
import { ABILITY_AXES } from "@/lib/design";
import { GYMS, GYM_COLORS } from "@/lib/gyms";

export type MascotId = "mingde" | "wanhua" | "zhonghe" | "nangang" | "xindian" | "zhongli";
// 存在資料庫 profiles.mascot：colors 每個部位一個顏色（null＝原本的顏色）、bg 卡片背景（null＝夥伴那館的顏色）
export type MascotPick = { id: MascotId; colors?: (string | null)[]; bg?: string | null };

type Part = { label: string; keys: number[]; lite?: number[] }; // keys：圖裡的顏色編號（--m1…）；lite：跟著換、淡一點的顏色
export type MascotInfo = { id: MascotId; gymId: string; name: string; ability: number; intro: string; parts: Part[] };

export const MASCOTS: MascotInfo[] = [
  {
    id: "mingde",
    gymId: "mingde",
    name: "高山猛牛",
    ability: 3,
    intro: "毛很厚，爬再久也不喘。最愛長路線和一圈一圈的耐力訓練。",
    parts: [
      { label: "毛色", keys: [1], lite: [6] },
      { label: "臉和角", keys: [2, 3] },
    ],
  },
  {
    id: "wanhua",
    gymId: "g2",
    name: "星際猿猿",
    ability: 2,
    intro: "戴著太空頭盔也要飛撲。看到遠遠的點，第一個想法就是跳過去。",
    parts: [
      { label: "身體", keys: [3] },
      { label: "頭盔玻璃", keys: [2] },
      { label: "頭盔領圈", keys: [1] },
    ],
  },
  {
    id: "zhonghe",
    gymId: "g3",
    name: "歡樂恐龍",
    ability: 0,
    intro: "大仰角、大屋簷靠一身蠻力，拉得上去就是好路線。",
    parts: [
      { label: "身體", keys: [3] },
      { label: "背上的刺", keys: [2] },
    ],
  },
  {
    id: "nangang",
    gymId: "g4",
    name: "態度羊駝",
    ability: 5,
    intro: "腳抬到頭旁邊也一臉從容，戴著墨鏡把高跨步做得很帥。",
    parts: [
      { label: "墨鏡", keys: [2] },
      { label: "耳朵", keys: [7] },
      { label: "嘴巴", keys: [4] },
    ],
  },
  {
    id: "xindian",
    gymId: "g5",
    name: "扎扎刺蝟",
    ability: 1,
    intro: "再小的點都捏得住。手指跟背上的刺一樣硬。",
    parts: [
      { label: "刺", keys: [4] },
      { label: "臉", keys: [1] },
    ],
  },
  {
    id: "zhongli",
    gymId: "g6",
    name: "太空小熊",
    ability: 4,
    intro: "看起來壯，其實重心和腳法最細膩。",
    parts: [
      { label: "身體", keys: [1] },
      { label: "頭套", keys: [4] },
    ],
  },
];

export const DEFAULT_MASCOT: MascotPick = { id: "mingde" };
export const mascotInfo = (id: string | null | undefined) => MASCOTS.find((m) => m.id === id) ?? MASCOTS[0];
// 夥伴那館還沒開放（中壢）：選單寫「即將登場」，資料庫也不給選
export const mascotOpen = (id: MascotId) => GYMS.find((g) => g.id === mascotInfo(id).gymId)?.live ?? false;
export const mascotGymColor = (id: MascotId) => GYM_COLORS[mascotInfo(id).gymId];
export const mascotAbility = (id: MascotId) => ABILITY_AXES[mascotInfo(id).ability];
// 讀資料庫的值：不認得的夥伴、還沒開放的館都當成預設（高山猛牛）
export function normalizePick(v: unknown): MascotPick {
  const p = v as MascotPick | null;
  if (!p || typeof p !== "object" || !MASCOTS.some((m) => m.id === p.id) || !mascotOpen(p.id)) return DEFAULT_MASCOT;
  return { id: p.id, colors: Array.isArray(p.colors) ? p.colors : [], bg: typeof p.bg === "string" ? p.bg : null };
}

// 換色色盤（資料庫 mascot_ok 也是這兩組，改了要一起改 migration）
export const MASCOT_SWATCHES = [
  "#6d3540", "#6959b2", "#01bcb5", "#066d6a", "#006382", "#304562",
  "#d7263d", "#f28a1e", "#f4d03f", "#2e9e5b", "#2f6fd6", "#f07bb5", "#7b4b2a", "#8e9196", "#1a1a1a",
];
export const MASCOT_SWATCHES_LITE = ["#f8c5a3", "#b5dcf2", "#a7d398", "#f5b1aa", "#f2e5dc", "#fbd8b5", "#ffe9a8", "#d9c6f0", "#ffffff"];
// 卡片背景：六館標準色
export const MASCOT_BGS = Object.values(GYM_COLORS).map((c) => c.toLowerCase());

const light = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 > 170;
};
// 這個部位用哪一組色盤：原本是淺色（臉、玻璃）用淺色那組
export const partSwatches = (orig: string) => (light(orig) ? MASCOT_SWATCHES_LITE : MASCOT_SWATCHES);
// 跟色：跟白色混一點（猛牛毛的亮部）
export function tint(hex: string, k = 0.35) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.round(v + (255 - v) * k).toString(16).padStart(2, "0");
  return `#${f(n >> 16)}${f((n >> 8) & 255)}${f(n & 255)}`;
}

// 每隻夥伴自己的句子（每天一句、沒有紀錄可以講的時候用）
export const MASCOT_LINES: Record<MascotId, string[]> = {
  mingde: [
    "慢慢來，爬完一條是一條。",
    "今天也一起把手臂爬到酸吧！",
    "耐力不是天生的，是一趟一趟爬出來的。",
    "累了就休息，休息完再上去。",
    "長路線最怕的不是難，是放棄。",
    "呼吸放慢，手放鬆，你可以的。",
    "不用每次都完攀，有上牆就是進步。",
    "今天先暖身兩條簡單的，再挑戰你的 project。",
    "我的毛很厚，你的意志更厚！",
    "爬不完的明天再來，牆會等你。",
  ],
  wanhua: [
    "看到遠的點，就跳過去吧！",
    "今天適合來一個漂亮的飛撲。",
    "動態不是亂跳，是看準了再出發！",
    "失敗幾次沒關係，第 7 次就會抓到了。",
    "在太空都要 dyno，地球上更沒問題。",
    "腳先踩好，再用力推出去！",
    "害怕的時候，就把目光放在下一顆點。",
    "今天的你，比昨天多跳 1 公分。",
    "飛出去之前，記得看一下落地的地方喔。",
    "起飛準備，3、2、1！",
  ],
  zhonghe: [
    "大屋簷，今天就靠你了！",
    "核心收緊，力量就出來了。",
    "拉得上去的，都是好路線！",
    "今天練力量，明天會更強。",
    "手拉不住的時候，試試用腳勾住。",
    "再多拉一下，你比你想的還強。",
    "休息時記得甩甩手，血液回來再上。",
    "吼！今天也要爬得很有力！",
    "肌肉會記得你今天的努力。",
    "暖身做足，才不會受傷喔。",
  ],
  nangang: [
    "戴上墨鏡，帥氣地上牆吧。",
    "腳抬高一點，世界就不一樣了。",
    "柔軟是一種力量，慢慢伸展。",
    "不用急，找到舒服的姿勢再出手。",
    "高跨步？小事一件。",
    "今天先拉筋十分鐘，身體會謝謝你。",
    "從容一點，你已經很帥了。",
    "換個角度看，路線也會變簡單。",
    "重心貼近牆，動作就會變輕。",
    "今天也要爬得漂漂亮亮。",
  ],
  xindian: [
    "再小的點都捏得住！",
    "手指和我的刺一樣硬！",
    "指力是一天一天練出來的。",
    "小點路線，今天就交給你了。",
    "手指痛的話先休息，別勉強。",
    "抓緊、相信、往上！",
    "今天記得先暖手指再爬喔。",
    "捏得住就是你的。",
    "每一顆小點，都是你的朋友。",
    "刺刺給你加油！",
  ],
  zhongli: ["中壢館快開幕了，等我！"],
};

// 幹話模式的句子（老闆提供，所有夥伴共用、隨機挑；目前 40 句，之後會補到 100 句；最後兩句是 10/15 當週全國賽的宣傳，比賽過後要刪）
export const TROLL_LINES = [
  "站起來就好，完攀很近",
  "閃電：我阿罵都可以，你也可以",
  "加油，點很大",
  "黑：有時間看我講幹話，怎麼不去爬",
  "啊～你怎麼掉下來了",
  "用力就抓住了",
  "不要坐墊子",
  "宋拔：（眼神凝視）",
  "攀岩治百病，爬爆",
  "抓不住就用力",
  "定線員的60秒，就是你的一分鐘",
  "用力還抓不住，就是你不夠用力",
  "站起來就抓到了",
  "下一顆超大！",
  "你可以！",
  "我以為你可以！",
  "上！",
  "下一顆口袋！",
  "下一條走起！",
  "生命模式！",
  "Flash的秘訣在於一次就把它爬完",
  "三日不攀岩就覺得面目可憎",
  "叫你們定線員出來",
  "V2 in my gym",
  "（擊拳）",
  "V3!",
  "這條你的菜～",
  "核心！你的核心呢！",
  "沒有啦，我都沒有訓練",
  "抱歉..我是塑膠仔",
  "如果怕高，就不要往下看",
  "用力不能解決問題，就是不夠用力",
  "當我塑膠喔！",
  "今天誰都不太能阻擋我攀岩",
  "Beta 禁止！",
  "這個倒拉..小心椎間盤差點",
  "爛線！（小心服用）",
  "龍洞有條結婚路線，記得結婚前去爬",
  "這週全國賽在台中Dapro 快來看",
  "週末～Dapro 大埔攀岩館舉辦全國攀岩比賽！",
];

// 幹話模式：刀疤、棒棒糖畫在夥伴圖上的位置（裁好的圖 0–100）：scar＝刀疤中心、angle＝角度、mouth＝棒棒糖的嘴巴
export const TROLL_DECO: Record<MascotId, { scar: [number, number]; angle: number; mouth: [number, number] }> = {
  mingde: { scar: [36, 52], angle: -35, mouth: [60, 80] },
  wanhua: { scar: [38, 50], angle: -30, mouth: [56, 70] },
  zhonghe: { scar: [62, 36], angle: -30, mouth: [86, 58] },
  nangang: { scar: [66, 42], angle: 35, mouth: [52, 76] },
  xindian: { scar: [38, 56], angle: -35, mouth: [56, 84] },
  zhongli: { scar: [40, 54], angle: -35, mouth: [56, 70] },
};
