"use client";

import { useState } from "react";
import { Empty, SectionTitle, Tip } from "@/components/ui/Card";
import { MeterList, MeterRow, SplitBar } from "@/components/ui/Insights";
import { MascotAvatar } from "@/components/ui/Mascot";
import { SetBox, StatGrid, StatTile, TrendBars } from "@/components/ui/Stats";
import { type UsageInsights } from "@/lib/data";
import { pct } from "@/lib/insights";
import { MASCOTS, mascotOpen } from "@/lib/mascots";

const md = (d: string) => `${+d.slice(5, 7)}/${+d.slice(8, 10)}`;
const NOT_YET = "統計起始日之後還不滿這幾週，過幾天就算得出來。";

// 「人」分頁多的分析：回頭率、新客人第一週、常客分群、程度分布、幾點最多人用
export function PeopleInsights({ u }: { u: UsageInsights }) {
  const [hour, setHour] = useState<number | null>(null);
  const { now, prev, cohort } = u.retention;
  const lv = u.levels;
  const lvTotal = lv.easy + lv.mid + lv.hard;
  return (
    <>
      <section id="retention">
        <SectionTitle>回頭率</SectionTitle>
        {now ? (
          <>
            <StatGrid>
              <StatTile value={`${pct(now.back, now.base)}%`} label="上週的人這週回來" />
              <StatTile value={prev ? `${pct(prev.back, prev.base)}%` : "–"} label="前一週" />
              <StatTile value={now.base} label="上週用過" />
              <StatTile value={now.back} label="這週又來" />
            </StatGrid>
            <Tip>上週（8～14 天前）有用過的人，這週（最近 7 天）有幾成又用了。數字往下掉，代表大家沒有養成習慣。</Tip>
          </>
        ) : (
          <Empty>{NOT_YET}</Empty>
        )}
        {cohort && cohort.base > 0 && (
          <SetBox>
            <p className="mt-3 mb-2 text-meta text-muted">
              4 週前用過的 <b className="font-num text-ink">{cohort.base}</b> 人，之後每週還有幾成在用
            </p>
            <MeterList>
              {cohort.kept.map((n, i) => (
                <MeterRow key={i} label={["3 週前", "2 週前", "這週"][i]} value={pct(n, cohort.base)} right={`${pct(n, cohort.base)}%・${n} 人`} />
              ))}
            </MeterList>
          </SetBox>
        )}
      </section>

      <section id="newbie">
        <SectionTitle>新客人第一週</SectionTitle>
        {u.newbie.n ? (
          <>
            <MeterList>
              <MeterRow label="隔天再打開" value={pct(u.newbie.next_day, u.newbie.n)} right={`${pct(u.newbie.next_day, u.newbie.n)}%`} />
              <MeterRow label="記第一條路線" value={pct(u.newbie.first_route, u.newbie.n)} right={`${pct(u.newbie.first_route, u.newbie.n)}%`} />
              <MeterRow label="來 2 天以上" value={pct(u.newbie.two_days, u.newbie.n)} right={`${pct(u.newbie.two_days, u.newbie.n)}%`} />
            </MeterList>
            <Tip>
              7～37 天前註冊的 {u.newbie.n} 人，註冊後第一週的情形。記了第一條路線的人比較會留下來，櫃檯可以教新客人當場記一條。
            </Tip>
          </>
        ) : (
          <Empty>最近還沒有過完第一週的新客人。</Empty>
        )}
      </section>

      <section id="groups">
        <SectionTitle>常客分群（最近 30 天）</SectionTitle>
        <SplitBar
          label="常客分群"
          parts={[
            { label: "常客 8 天以上", n: u.groups.regular },
            { label: "偶爾 2–7 天", n: u.groups.sometimes },
            { label: "只來 1 天", n: u.groups.once },
          ]}
        />
        <Tip>依最近 30 天用了幾天分三群（一天裡打開、記錄、留言都只算一天）。</Tip>
      </section>

      <section id="levels">
        <SectionTitle>程度分布（抱石，最近 30 天）</SectionTitle>
        {lvTotal ? (
          <>
            <MeterList>
              {(
                [
                  ["入門", "VB–V2", lv.easy],
                  ["進階", "V3–V5", lv.mid],
                  ["挑戰", "V6+", lv.hard],
                ] as const
              ).map(([name, range, n]) => (
                <MeterRow
                  key={name}
                  label={`${name} ${range}`}
                  value={pct(n, lvTotal)}
                  right={`${n} 人`}
                />
              ))}
            </MeterList>
            <Tip>
              用每個人最近 30 天完攀過的最高難度分。
              {u.progress.climbers > 0 && (
                <>
                  之前就有紀錄的 {u.progress.climbers} 人裡，<b className="text-ink">{u.progress.improved} 人</b>這 30 天破了自己的最高難度。
                </>
              )}
            </Tip>
          </>
        ) : (
          <Empty>最近 30 天還沒有抱石完攀紀錄。</Empty>
        )}
      </section>

      <section id="hours">
        <SectionTitle>幾點最多人用（最近 30 天）</SectionTitle>
        <SetBox>
          <TrendBars
            label="每個小時有幾人次在用"
            items={u.hours.map((n, h) => ({ key: String(h), tick: `${h}`, title: `${h} 點：${n} 人次`, value: n }))}
            selected={hour}
            onSelect={setHour}
          />
        </SetBox>
        <Tip>下面的數字是幾點。打開 App 和記錄攀爬的時間（同一人同一天同一個小時算一次）。打開 App 的時間從這次更新後才開始記。</Tip>
      </section>
    </>
  );
}

// 「互動」分頁：每天留言、影片、按讚，熱門影片和留言，大家選的夥伴
export function SocialInsights({ u }: { u: UsageInsights }) {
  const [pick, setPick] = useState<number | null>(null);
  const sum = (k: "comments" | "videos" | "likes") => u.daily.reduce((n, d) => n + d[k], 0);
  const mascots = u.mascots
    ? MASCOTS.filter((m) => mascotOpen(m.id))
        .map((m) => ({ m, n: (u.mascots![m.id] ?? 0) + (m.id === "mingde" ? (u.mascots![""] ?? 0) : 0) }))
        .sort((a, b) => b.n - a.n)
    : null;
  const mtotal = mascots?.reduce((n, x) => n + x.n, 0) ?? 0;
  return (
    <section id="social">
      <SectionTitle>互動（最近 14 天）</SectionTitle>
      <StatGrid>
        <StatTile value={sum("comments")} label="留言" />
        <StatTile value={sum("videos")} label="影片" />
        <StatTile value={sum("likes")} label="按讚" />
      </StatGrid>
      <SetBox>
        <TrendBars
          label="最近 14 天每天留言和影片"
          items={u.daily.map((d) => ({
            key: d.day,
            tick: md(d.day),
            title: `${md(d.day)}：留言 ${d.comments}・影片 ${d.videos}・按讚 ${d.likes}`,
            value: d.comments + d.videos,
          }))}
          selected={pick}
          onSelect={setPick}
        />
      </SetBox>
      <Tip>長條是每天的留言＋影片，點一下看當天的按讚數。</Tip>

      <SectionTitle>最熱門的影片和留言</SectionTitle>
      {u.top_video || u.top_comment ? (
        <ul className="m-0 grid list-none gap-2 p-0">
          {u.top_video && (
            <li className="rounded-btn bg-surface px-3 py-2.5 shadow-card">
              <span className="text-meta text-muted">
                影片・{u.top_video.zone} {u.top_video.name ?? `${u.top_video.color}色 ${u.top_video.code}`}・{u.top_video.nickname}
              </span>
              <span className="block text-note">
                {u.top_video.caption || "（沒有說明）"} <b className="ml-1 font-num text-accent">👍 {u.top_video.likes}</b>
              </span>
            </li>
          )}
          {u.top_comment && (
            <li className="rounded-btn bg-surface px-3 py-2.5 shadow-card">
              <span className="text-meta text-muted">
                留言・{u.top_comment.zone} {u.top_comment.name ?? `${u.top_comment.color}色 ${u.top_comment.code}`}・{u.top_comment.nickname}
              </span>
              <span className="block text-note">
                {u.top_comment.body} <b className="ml-1 font-num text-accent">👍 {u.top_comment.likes}</b>
              </span>
            </li>
          )}
        </ul>
      ) : (
        <Empty>最近 14 天的影片和留言還沒有人按讚。</Empty>
      )}

      <SectionTitle>大家選的原岩夥伴</SectionTitle>
      {mascots && mtotal ? (
        <>
          <MeterList>
            {mascots.map(({ m, n }) => (
              <MeterRow
                key={m.id}
                label={
                  <span className="inline-flex items-center gap-1.5">
                    <MascotAvatar pick={{ id: m.id }} size={26} />
                    {m.name}
                  </span>
                }
                value={pct(n, mtotal)}
                right={`${n} 人`}
              />
            ))}
          </MeterList>
          <Tip>還沒選的人算在預設的高山猛牛。幹話模式存在客人自己的手機裡，算不到有幾個人開。</Tip>
        </>
      ) : (
        <Empty>{mascots ? "還沒有人。" : "資料庫還沒套用原岩夥伴（step41），套用後就算得出來。"}</Empty>
      )}
    </section>
  );
}
