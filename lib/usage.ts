// 使用狀況：登入的人每天記一次「今天有打開 App」（附上當時看的館），用來算活躍人數
// 同一天、同一間館只送一次；沒登入、沒網路或失敗都不影響使用
import { supabase } from "@/lib/supabase";
import { todayYmd } from "@/lib/date";
import { findSpray } from "@/lib/gyms";

const KEY = "routemake-open";

export async function markOpen(placeId: string | null) {
  try {
    const spray = placeId ? findSpray(placeId) : undefined;
    const gym = spray ? spray.gymId : placeId;
    const mark = `${todayYmd()}:${placeId ?? ""}`;
    const last = localStorage.getItem(KEY) ?? "";
    // 今天已經記過：沒有新的館就不用再送
    if (last === mark || (placeId == null && last.startsWith(todayYmd()))) return;
    const { data } = await supabase().auth.getSession();
    if (!data.session) return;
    const { error } = await supabase().rpc("record_open", { p_gym: gym, p_spray: !!spray });
    if (!error) localStorage.setItem(KEY, mark);
  } catch {
    // 不影響使用
  }
}
