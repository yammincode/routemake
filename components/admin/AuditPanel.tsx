"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Empty, SectionTitle } from "@/components/ui/Card";
import { Chip, ChipRow } from "@/components/ui/Chip";
import { LogList, LogRow } from "@/components/ui/Log";
import { AUDIT_FILTERS, auditTime, describeAudit } from "@/lib/audit";
import { getAuditLog, type AuditEntry } from "@/lib/data";

const PAGE = 30;

// 操作紀錄（店長、老闆）：誰在什麼時候下架路線、整區換線、刪留言、指派員工、改計分規則
export default function AuditPanel({ gymId, gymName }: { gymId: string; gymName: string }) {
  const [filter, setFilter] = useState<(typeof AUDIT_FILTERS)[number]["key"]>("all");
  const [rows, setRows] = useState<AuditEntry[] | null>(null);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const actions = AUDIT_FILTERS.find((f) => f.key === filter)!.actions;

  const load = useCallback(
    async (before?: number) => {
      try {
        const got = await getAuditLog(gymId, { before, actions: [...actions], limit: PAGE });
        setRows((cur) => (before ? [...(cur ?? []), ...got] : got));
        setMore(got.length === PAGE);
        setError(null);
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [gymId, actions]
  );

  useEffect(() => {
    void Promise.resolve().then(() => {
      setRows(null);
      return load();
    });
  }, [load]);

  return (
    <>
      <SectionTitle>{gymName}操作紀錄</SectionTitle>
      <ChipRow>
        {AUDIT_FILTERS.map((f) => (
          <Chip key={f.key} pressed={filter === f.key} onClick={() => setFilter(f.key)}>
            {f.label}
          </Chip>
        ))}
      </ChipRow>
      {error ? (
        <Empty>{error}</Empty>
      ) : rows == null ? (
        <Empty>讀取中…</Empty>
      ) : rows.length === 0 ? (
        <Empty>還沒有紀錄。</Empty>
      ) : (
        <>
          <LogList>
            {rows.map((r) => (
              <LogRow key={r.id} time={auditTime(r.created_at)} text={describeAudit(r)} who={r.nickname} />
            ))}
          </LogList>
          {more && (
            <div className="mt-2.5">
              <Button onClick={() => void load(rows[rows.length - 1].id)}>看更早的紀錄</Button>
            </div>
          )}
        </>
      )}
    </>
  );
}
