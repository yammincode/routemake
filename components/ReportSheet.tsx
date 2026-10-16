"use client";

import { useState } from "react";
import { Button, LinkButton } from "@/components/ui/Button";
import { Tip } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { ColorPicker, GradePicker, Label, OptionGrid, TextArea } from "@/components/ui/Form";
import { ReportSpot } from "@/components/ui/Report";
import Sheet, { SheetSub, SheetTitle } from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/Toast";
import { Pin, WallPhoto } from "@/components/ui/Wall";
import { submitRouteReport, type ReportKind, type Route, type Zone } from "@/lib/data";
import { gradeLabel, type HoldColor } from "@/lib/design";
import { REPORT_KIND } from "@/lib/reports";

export const NOTE_MAX = 100;

// 客人回報（step47，10/16 使用者選 B）：
// - missing：區域頁最下面「找不到你爬的路線？」→ 點照片上的起步點、選顏色、難度猜的（可以不知道）、補充說明選填
// - 路線有問題：路線卡片「回報這條有問題」→ 顏色不對（選實際的顏色）／位置標錯（點正確位置）／已經拆了
// 不回報難度（使用者決定）；送出後定線員、店長在後台處理
export type ReportTarget = { kind: "missing"; zone: Zone; photo: string; routes: Route[] } | { kind: "route"; zoneName: string; route: Route; photo: string | null } | null;

export default function ReportSheet({ target, onClose }: { target: ReportTarget; onClose: () => void }) {
  return (
    <Sheet open={!!target} onClose={onClose}>
      {target && <Body key={target.kind === "route" ? target.route.id : target.zone.id} target={target} onClose={onClose} />}
    </Sheet>
  );
}

const ROUTE_KINDS = (["color", "pin", "gone"] as const).map((v) => ({ v, label: REPORT_KIND[v] }));

function Body({ target, onClose }: { target: NonNullable<ReportTarget>; onClose: () => void }) {
  const toast = useToast();
  const missing = target.kind === "missing";
  const route = target.kind === "route" ? target.route : null;
  const zone = target.kind === "missing" ? target.zone : null;
  const zoneName = target.kind === "missing" ? target.zone.name : target.zoneName;
  const [kind, setKind] = useState<ReportKind | null>(missing ? "missing" : null);
  const [spot, setSpot] = useState<{ x: number; y: number } | null>(null);
  const [color, setColor] = useState<HoldColor | null>(null);
  const [grade, setGrade] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const needSpot = kind === "missing" || kind === "pin";
  const needColor = kind === "missing" || kind === "color";
  const ready = !!kind && (!needSpot || !!spot) && (!needColor || !!color) && note.trim().length <= NOTE_MAX;
  const photo = target.photo;

  const send = async () => {
    if (!kind || !ready || busy) return;
    setBusy(true);
    try {
      await submitRouteReport({
        kind,
        zone_id: zone?.id ?? route!.zone_id,
        route_id: route?.id ?? null,
        hold_color: needColor ? color : null,
        grade_guess: kind === "missing" ? grade : null,
        x: needSpot ? spot!.x : null,
        y: needSpot ? spot!.y : null,
        note: note.trim() || null,
      });
      toast("已送出，謝謝你！定線員會處理");
      onClose();
    } catch (e) {
      toast((e as Error).message);
    }
    setBusy(false);
  };

  return (
    <>
      <SheetTitle>{missing ? "回報沒標到的路線" : "回報這條有問題"}</SheetTitle>
      <SheetSub>
        {missing
          ? `${zoneName}：在照片上點這條路線的起步點、選岩點顏色，定線員確認後會補上。`
          : `${zoneName} ${route!.code}（${route!.hold_color}色 ${gradeLabel(route!.grade)}）`}
      </SheetSub>

      {!missing && (
        <>
          <Label>哪裡有問題？</Label>
          <OptionGrid cols={3} options={ROUTE_KINDS} value={kind} onChange={(k) => (setKind(k), setSpot(null))} />
        </>
      )}

      {needSpot && photo && (
        <>
          <Label>{missing ? "點照片上的起步點" : "點照片上正確的起步點"}</Label>
          <WallPhoto src={photo} alt={`${zoneName}照片`} setter onPick={(x, y) => setSpot({ x, y })}>
            {/* 已經標的路線變淡、點不到（點下去就是選位置） */}
            <div className="pointer-events-none absolute inset-0">
              {(missing ? target.routes : route ? [route] : []).map((r) => (
                <Pin key={r.id} x={r.pin_x} y={r.pin_y} color={r.hold_color} grade={r.grade} dim={missing} label={r.code} />
              ))}
            </div>
            {spot && <ReportSpot x={spot.x} y={spot.y} color={needColor ? color : null} />}
          </WallPhoto>
          <Tip>{spot ? "位置不對再點一次就好。" : missing ? "淡淡的圓點是已經標好的路線。" : "照片上的圓點是現在標的位置。"}</Tip>
        </>
      )}

      {needColor && (
        <>
          <Label>{missing ? "岩點顏色" : "牆上實際的顏色"}</Label>
          <ColorPicker value={color} onChange={setColor} />
        </>
      )}

      {kind === "missing" && zone && (
        <>
          <Label>難度（猜的就好）</Label>
          <GradePicker system={zone.grade_system} value={grade} onChange={setGrade} />
          <div className="mt-2">
            <Chip pressed={grade == null} onClick={() => setGrade(null)}>
              不知道
            </Chip>
          </div>
        </>
      )}

      {kind === "gone" && <Tip>定線員確認後會把這條下架。</Tip>}

      {kind && (
        <>
          <Label htmlFor="rpnote">補充說明（選填，{NOTE_MAX} 字內）</Label>
          <TextArea
            id="rpnote"
            maxLength={NOTE_MAX}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={missing ? "例如：從右下角的大斜面點起步" : "例如：其實是紫色的，燈光下看起來像藍色"}
          />
        </>
      )}

      <Button variant="primary" className="mt-4" disabled={!ready || busy} onClick={() => void send()}>
        {busy ? "送出中…" : !kind ? "請先選哪裡有問題" : needSpot && !spot ? "請先在照片上點位置" : needColor && !color ? "請選顏色" : "送出回報"}
      </Button>
      <p className="mt-2 mb-0 text-center text-tiny text-muted">回報會連同你的暱稱給這間館的定線員看，每人每天最多 10 則。</p>
      <LinkButton onClick={onClose}>取消</LinkButton>
    </>
  );
}
