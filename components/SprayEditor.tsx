"use client";

import { useState } from "react";
import { Button, LinkButton } from "@/components/ui/Button";
import { GradePicker, Label, TextArea, TextField } from "@/components/ui/Form";
import Sheet, { SheetSub, SheetTitle } from "@/components/ui/Sheet";
import { HoldMarks, HoldTools } from "@/components/ui/Spray";
import { useToast } from "@/components/ui/Toast";
import { WallPhoto } from "@/components/ui/Wall";
import { saveSprayRoute, type Hold, type Route, type SprayKind, type Zone } from "@/lib/data";

// Spray Wall 出路線／修改路線：在公版照片上點一下加圈圈（起攀 S、路線點、完攀 T），點圈圈刪除
export default function SprayEditor({
  open,
  zone,
  photo,
  kind,
  route,
  onClose,
  onSaved,
}: {
  open: boolean;
  zone: Zone;
  photo: string;
  kind: SprayKind;
  route?: Route | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  return (
    <Sheet open={open} onClose={onClose}>
      {open && <Body key={route?.id ?? "new"} zone={zone} photo={photo} kind={kind} route={route ?? null} onClose={onClose} onSaved={onSaved} />}
    </Sheet>
  );
}

function Body({ zone, photo, kind, route, onClose, onSaved }: { zone: Zone; photo: string; kind: SprayKind; route: Route | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [holds, setHolds] = useState<Hold[]>(route?.holds ?? []);
  const [type, setType] = useState<Hold["t"]>(route?.holds?.length ? "h" : "s");
  const [size, setSize] = useState<1 | 2 | 3>(2);
  const [name, setName] = useState(route?.name ?? "");
  const [grade, setGrade] = useState(route?.grade ?? 3);
  const [desc, setDesc] = useState(route?.description ?? "");
  const [busy, setBusy] = useState(false);
  const hasS = holds.some((h) => h.t === "s");
  const hasT = holds.some((h) => h.t === "t");

  const add = (x: number, y: number) => {
    if (holds.length >= 60) return toast("圈圈最多 60 個");
    setHolds((hs) => [...hs, { x: +x.toFixed(2), y: +y.toFixed(2), t: type, r: size }]);
    // 放好起攀後自動換成路線點
    if (type === "s") setType("h");
  };

  const save = async () => {
    if (!name.trim()) return toast("請幫路線取個名字");
    if (!hasS || !hasT) return toast("路線要有起攀（S）和完攀（T）");
    setBusy(true);
    try {
      await saveSprayRoute(zone.id, kind, { name, grade, description: desc, holds }, route?.id);
      toast(route ? "已更新路線" : "已新增路線");
      onSaved();
      onClose();
    } catch (e) {
      toast((e as Error).message);
    }
    setBusy(false);
  };

  return (
    <>
      <SheetTitle>{route ? "修改路線" : kind === "gym" ? "新增岩館路線" : "出一條岩友路線"}</SheetTitle>
      <SheetSub>選圈圈種類，再點照片上的岩點；點已經標的圈圈可以刪掉。可以雙指放大。</SheetSub>
      <HoldTools type={type} size={size} onType={setType} onSize={setSize} />
      <WallPhoto src={photo} alt="Spray Wall 公版照片" setter onPick={add}>
        <HoldMarks holds={holds} onTap={(i) => setHolds((hs) => hs.filter((_, j) => j !== i))} />
      </WallPhoto>
      <div className="-mt-2 mb-1 flex items-center justify-between text-meta text-muted">
        <span>
          {holds.length} 個圈圈{!hasS && "・還沒有起攀 S"}
          {!hasT && "・還沒有完攀 T"}
        </span>
        <button disabled={!holds.length} onClick={() => setHolds((hs) => hs.slice(0, -1))} className="px-1 py-1 font-bold text-accent disabled:opacity-40">
          復原上一步
        </button>
      </div>
      <Label htmlFor="sname">路線名稱（最多 20 字）</Label>
      <TextField id="sname" maxLength={20} value={name} onChange={(e) => setName(e.target.value)} placeholder="例如 下雨天的指力" />
      <Label>難度</Label>
      <GradePicker value={grade} onChange={setGrade} />
      <Label htmlFor="sdesc">介紹（選填，最多 200 字）</Label>
      <TextArea id="sdesc" maxLength={200} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="例如 起步雙手 S，腳點只能用標記的" />
      <p className="mt-1 mb-0 text-tiny text-muted">名稱和介紹不能放聯絡方式。{kind === "community" && "岩友路線每人每天最多出 5 條，不算積分。"}</p>
      <Button variant="primary" className="mt-3.5" disabled={busy} onClick={save}>
        {route ? "儲存修改" : "發布路線"}
      </Button>
      <LinkButton onClick={onClose}>取消</LinkButton>
    </>
  );
}
