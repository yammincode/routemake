"use client";

import { useEffect, useRef, useState } from "react";
import { Button, LinkButton } from "@/components/ui/Button";
import { GradePicker, Label, TextArea, TextField } from "@/components/ui/Form";
import Sheet, { SheetSub, SheetTitle } from "@/components/ui/Sheet";
import { HoldMarks, HoldTools } from "@/components/ui/Spray";
import { useToast } from "@/components/ui/Toast";
import { WallPhoto } from "@/components/ui/Wall";
import { hasRoutePhotos, photoUrl, saveSprayRoute, type Hold, type Route, type SprayKind, type Zone } from "@/lib/data";

// Spray Wall 出路線／修改路線：在照片上點一下加圈圈（起攀 S、路線點、完攀 T），點圈圈刪除
// 岩館路線（員工）：先放這條路線自己的照片（step44），圈圈可以不畫；岩友路線照舊在公版照片上畫
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
  // 岩館路線照片（step44，使用者選的 2a）：新選的檔案、預覽網址；資料庫還沒套用 step44 時照舊在公版照片上畫
  const [photosOn, setPhotosOn] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (kind !== "gym") return;
    let live = true;
    void hasRoutePhotos().then((on) => live && setPhotosOn(on));
    return () => {
      live = false;
    };
  }, [kind]);
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);
  const ownPhoto = preview ?? photoUrl(route?.photo_path ?? null);
  // 新的岩館路線一定要先放照片；舊的（公版照片上畫的）可以照舊改
  const needPhoto = kind === "gym" && photosOn && !route && !file;
  const src = ownPhoto ?? photo;
  const hasS = holds.some((h) => h.t === "s");
  const hasT = holds.some((h) => h.t === "t");
  // 有自己照片的岩館路線圈圈可以不畫；有畫就要有起攀和完攀
  const holdsOptional = !!ownPhoto;

  const add = (x: number, y: number) => {
    if (holds.length >= 60) return toast("圈圈最多 60 個");
    setHolds((hs) => [...hs, { x: +x.toFixed(2), y: +y.toFixed(2), t: type, r: size }]);
    // 放好起攀後自動換成路線點
    if (type === "s") setType("h");
  };

  const pickFile = (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) return toast("請選照片");
    setFile(f);
    setPreview(URL.createObjectURL(f));
    // 換照片：之前畫的圈圈位置對不上新照片，清掉重畫
    setHolds([]);
    setType("s");
  };

  const save = async () => {
    if (needPhoto) return toast("請先放這條路線的照片");
    if (!name.trim()) return toast("請幫路線取個名字");
    if ((!holdsOptional || holds.length) && (!hasS || !hasT)) return toast(holdsOptional ? "有畫圈圈的話要有起攀（S）和完攀（T）" : "路線要有起攀（S）和完攀（T）");
    setBusy(true);
    try {
      await saveSprayRoute(zone, kind, { name, grade, description: desc, holds, photo: file }, route);
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
      {kind === "gym" && photosOn ? (
        <SheetSub>
          {needPhoto ? "先拍或選一張這條路線的照片。" : "照片上已經標好路線可以不畫圈；要畫就選圈圈種類，再點照片上的岩點（點圈圈可以刪掉）。可以雙指放大。"}
        </SheetSub>
      ) : (
        <SheetSub>選圈圈種類，再點照片上的岩點；點已經標的圈圈可以刪掉。可以雙指放大。</SheetSub>
      )}
      {kind === "gym" && photosOn && (
        <>
          <Button variant={needPhoto ? "primary" : "default"} className="mb-3" disabled={busy} onClick={() => fileRef.current?.click()}>
            {ownPhoto ? "📷 換一張照片" : "📷 拍照或選照片"}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            aria-label="路線照片"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              pickFile(f);
            }}
          />
        </>
      )}
      {!needPhoto && (
        <>
          <HoldTools type={type} size={size} onType={setType} onSize={setSize} />
          <WallPhoto src={src} alt={ownPhoto ? "這條路線的照片" : "Spray Wall 公版照片"} setter onPick={add}>
            <HoldMarks holds={holds} onTap={(i) => setHolds((hs) => hs.filter((_, j) => j !== i))} />
          </WallPhoto>
          <div className="-mt-2 mb-1 flex items-center justify-between text-meta text-muted">
            <span>
              {holds.length} 個圈圈
              {holds.length > 0 || !holdsOptional ? (
                <>
                  {!hasS && "・還沒有起攀 S"}
                  {!hasT && "・還沒有完攀 T"}
                </>
              ) : (
                "・不畫也可以"
              )}
            </span>
            <button disabled={!holds.length} onClick={() => setHolds((hs) => hs.slice(0, -1))} className="px-1 py-1 font-bold text-accent disabled:opacity-40">
              復原上一步
            </button>
          </div>
        </>
      )}
      <Label htmlFor="sname">路線名稱（最多 20 字）</Label>
      <TextField id="sname" maxLength={20} value={name} onChange={(e) => setName(e.target.value)} placeholder="例如 下雨天的指力" />
      <Label>難度</Label>
      <GradePicker value={grade} onChange={setGrade} />
      <Label htmlFor="sdesc">介紹（選填，最多 200 字）</Label>
      <TextArea id="sdesc" maxLength={200} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="例如 起步雙手 S，腳點只能用標記的" />
      <p className="mt-1 mb-0 text-tiny text-muted">名稱和介紹不能放聯絡方式。{kind === "community" && "岩友路線每人每天最多出 5 條，不算積分。"}</p>
      <Button variant="primary" className="mt-3.5" disabled={busy} onClick={save}>
        {busy && file ? "照片上傳中…" : route ? "儲存修改" : "發布路線"}
      </Button>
      <LinkButton onClick={onClose}>取消</LinkButton>
    </>
  );
}
