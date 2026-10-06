"use client";

import { useCallback, useEffect, useState } from "react";
import { Empty, SectionTitle } from "@/components/ui/Card";
import { Chip, ChipRow } from "@/components/ui/Chip";
import { FEEDBACK_STATUS, FeedbackItem, FeedbackList } from "@/components/ui/Feedback";
import { useToast } from "@/components/ui/Toast";
import { getFeedbackList, setFeedbackStatus, type Feedback, type FeedbackStatus } from "@/lib/data";
import { ago } from "@/lib/date";
import { findGym } from "@/lib/gyms";

const NEXT: Record<FeedbackStatus, FeedbackStatus[]> = { new: ["doing", "done"], doing: ["done", "new"], done: ["new"] };

// 使用者回饋（只有老闆）：篩選狀態、標記處理進度
export default function FeedbackPanel() {
  const toast = useToast();
  const [filter, setFilter] = useState<FeedbackStatus | null>("new");
  const [list, setList] = useState<Feedback[] | null>(null);

  const load = useCallback(() => {
    getFeedbackList(filter)
      .then(setList)
      .catch((e) => toast((e as Error).message));
  }, [filter, toast]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const change = async (f: Feedback, s: FeedbackStatus) => {
    try {
      await setFeedbackStatus(f.id, s);
      toast(`已標成「${FEEDBACK_STATUS[s]}」`);
      load();
    } catch (e) {
      toast((e as Error).message);
    }
  };

  return (
    <>
      <SectionTitle>使用者回饋</SectionTitle>
      <ChipRow>
        <Chip pressed={filter == null} onClick={() => setFilter(null)}>
          全部
        </Chip>
        {(Object.keys(FEEDBACK_STATUS) as FeedbackStatus[]).map((s) => (
          <Chip key={s} pressed={filter === s} onClick={() => setFilter(s)}>
            {FEEDBACK_STATUS[s]}
          </Chip>
        ))}
      </ChipRow>
      {list == null ? (
        <Empty>讀取中…</Empty>
      ) : list.length === 0 ? (
        <Empty>{filter ? `沒有「${FEEDBACK_STATUS[filter]}」的回饋。` : "還沒有人送回饋。"}</Empty>
      ) : (
        <FeedbackList>
          {list.map((f) => (
            <FeedbackItem
              key={f.id}
              kind={f.kind}
              status={f.status}
              when={ago(f.created_at)}
              meta={[
                `${f.nickname ?? "（未填暱稱）"}（帳號 ${f.username ?? "?"}）`,
                f.contact && `聯絡：${f.contact}`,
                f.app_version && `v${f.app_version}`,
                f.gym_id && findGym(f.gym_id)?.name,
                f.device,
              ]
                .filter(Boolean)
                .join("・")}
              actions={
                <span className="flex gap-4">
                  {NEXT[f.status].map((s) => (
                    <button key={s} className="text-meta text-accent underline" onClick={() => void change(f, s)}>
                      {s === "new" ? "改回未讀" : `標成${FEEDBACK_STATUS[s]}`}
                    </button>
                  ))}
                </span>
              }
            >
              {f.body}
            </FeedbackItem>
          ))}
        </FeedbackList>
      )}
    </>
  );
}
