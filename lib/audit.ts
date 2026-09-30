// 操作紀錄轉成一句看得懂的話
import { ROLE_NAME, type Role } from "@/lib/auth";
import type { AuditEntry } from "@/lib/data";

export const AUDIT_FILTERS = [
  { key: "all", label: "全部", actions: [] as string[] },
  { key: "route", label: "路線", actions: ["route.archive", "route.unarchive", "zone.archive_all"] },
  { key: "comment", label: "留言", actions: ["comment.delete"] },
  { key: "staff", label: "員工", actions: ["staff.assign", "staff.remove"] },
  { key: "scoring", label: "計分", actions: ["scoring.update"] },
] as const;

const str = (v: unknown) => (typeof v === "string" ? v : "");

export function describeAudit(a: AuditEntry): string {
  const d = a.detail ?? {};
  const person = str(d.nickname) || str(d.username) || "（帳號）";
  switch (a.action) {
    case "route.archive":
      return `下架 ${str(d.zone) ? str(d.zone) + " " : ""}${str(d.code)}${typeof d.grade === "number" ? `（V${d.grade}${str(d.color) ? " " + str(d.color) + "色" : ""}）` : ""}`;
    case "route.unarchive":
      return `恢復 ${str(d.zone) ? str(d.zone) + " " : ""}${str(d.code)}`;
    case "zone.archive_all":
      return `${str(d.zone) || "區域"}整區換線，下架 ${typeof d.count === "number" ? d.count : 0} 條`;
    case "comment.delete": {
      const body = str(d.body);
      return `刪除 ${str(d.author_nickname) || "顧客"} 在 ${str(d.code) || "路線"} 的留言「${body.length > 24 ? body.slice(0, 24) + "…" : body}」`;
    }
    case "staff.assign":
      return `指派 ${person} 為${ROLE_NAME[(str(d.role) || "setter") as Role]}`;
    case "staff.remove":
      return `移除${ROLE_NAME[(str(d.role) || "setter") as Role]} ${person}`;
    case "scoring.update":
      return `修改計分規則（Flash ×${d.flash_multiplier ?? "–"}、風格加成上限 ${d.max_style_bonus ?? "–"}%）`;
    default:
      return a.action;
  }
}

// 台北時間 10/05 14:32
export const auditTime = (ts: string) =>
  new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })
    .format(new Date(ts));
