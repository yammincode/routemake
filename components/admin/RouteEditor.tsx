"use client";

import { gradeLabel } from "@/lib/design";
import { useEffect, useState } from "react";
import { Button, LinkButton } from "@/components/ui/Button";
import { CommentItem, CommentList } from "@/components/ui/Comments";
import { NumberMarks } from "@/components/ui/Endurance";
import { ColorPicker, GradePicker, Label, TagPicker, TextField, Toggle } from "@/components/ui/Form";
import Sheet, { SheetSection, SheetSub, SheetTitle } from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/Toast";
import { WallPhoto } from "@/components/ui/Wall";
import {
  archiveRoute,
  createRoute,
  deleteComment,
  getComments,
  newId,
  routeHasAscents,
  updateRoute,
  type Comment,
  type Route,
  type RouteInput,
  type Zone,
} from "@/lib/data";
import { ago } from "@/lib/date";
import type { HoldColor } from "@/lib/design";

export type EditTarget = { route: Route } | { x: number; y: number } | null;

// 新增／編輯路線（底部彈出）：顏色、難度、風格、評語、留言開關；編輯時可看並刪留言、下架
// 長耐力區：不選顏色，改成在照片上照順序點岩點（最多 50 點）；已經有人記錄過的路線，點不能再改
export default function RouteEditor({
  zone,
  photo,
  target,
  onClose,
  onChanged,
}: {
  zone: Zone;
  photo?: string | null;
  target: EditTarget;
  onClose: () => void;
  onChanged: () => void;
}) {
  return (
    <Sheet open={!!target} onClose={onClose}>
      {target && (
        <Body key={"route" in target ? target.route.id : `${target.x},${target.y}`} zone={zone} photo={photo ?? null} target={target} onClose={onClose} onChanged={onChanged} />
      )}
    </Sheet>
  );
}

const MAX_POINTS = 50;

function Body({
  zone,
  photo,
  target,
  onClose,
  onChanged,
}: {
  zone: Zone;
  photo: string | null;
  target: NonNullable<EditTarget>;
  onClose: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const r = "route" in target ? target.route : null;
  const endurance = zone.grade_system === "endurance";
  const [color, setColor] = useState<HoldColor>(r?.hold_color ?? "紅");
  const [grade, setGrade] = useState(r?.grade ?? (zone.grade_system === "v" ? 3 : 104));
  // 長耐力的點：新增時第 1 點就是剛剛點的位置
  const startHolds = r?.holds?.map(({ x, y }) => ({ x, y })) ?? ("x" in target ? [{ x: +target.x.toFixed(2), y: +target.y.toFixed(2) }] : []);
  const [holds, setHolds] = useState(startHolds);
  // 改點的每一步（加一點、刪一點、全部清除）都記下來，「復原」退回上一步
  const [past, setPast] = useState<{ x: number; y: number }[][]>([]);
  const editHolds = (next: { x: number; y: number }[]) => {
    setPast((p) => [...p, holds]);
    setHolds(next);
  };
  const undo = () => {
    if (!past.length) return;
    setHolds(past[past.length - 1]);
    setPast((p) => p.slice(0, -1));
  };
  const [locked, setLocked] = useState(false);
  const [tags, setTags] = useState<string[]>(r?.style_tags ?? []);
  const [note, setNote] = useState(r?.setter_note ?? "");
  const [cm, setCm] = useState(r?.comments_enabled ?? true);
  const [busy, setBusy] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [comments, setComments] = useState<Comment[] | null>(null);
  // 這次新增的路線 id：訊號差重按時沿用，資料庫才認得是同一條
  const [routeId] = useState(newId);

  useEffect(() => {
    if (r) getComments(r.id).then(setComments).catch(() => setComments([]));
  }, [r]);
  // 長耐力：已經有人記錄過，點的位置和順序不能改（資料庫也會擋）
  useEffect(() => {
    if (r && endurance) routeHasAscents(r.id).then(setLocked).catch(() => setLocked(false));
  }, [r, endurance]);

  const holdsChanged = JSON.stringify(holds) !== JSON.stringify(startHolds);
  const input: RouteInput = {
    grade,
    hold_color: endurance ? "白" : color,
    style_tags: tags,
    setter_note: note.trim() || null,
    comments_enabled: cm,
    ...(endurance && (!r || (holdsChanged && !locked)) ? { holds } : {}),
  };
  const addPoint = (x: number, y: number) => {
    if (locked) return toast("已經有人記錄過這條路線，點不能再改");
    if (holds.length >= MAX_POINTS) return toast(`最多 ${MAX_POINTS} 點`);
    editHolds([...holds, { x: +x.toFixed(2), y: +y.toFixed(2) }]);
  };

  const save = async () => {
    if (endurance && holds.length < 2) return toast("至少要標 2 個點（第 1 點是起攀、最後一點是完攀）");
    setBusy(true);
    try {
      if (r) {
        await updateRoute(r.id, input);
        toast("已儲存");
      } else if ("x" in target) {
        const created = await createRoute(zone.id, input, target.x, target.y, routeId);
        toast(endurance ? `已新增 ${created.code}（${gradeLabel(grade)}・${holds.length} 點）` : `已新增 ${created.code}（${gradeLabel(grade)} ${color}色）`);
      }
      onChanged();
      onClose();
    } catch (e) {
      toast((e as Error).message);
    }
    setBusy(false);
  };

  const archive = async () => {
    if (!r) return;
    if (!confirmArchive) return setConfirmArchive(true);
    setBusy(true);
    try {
      await archiveRoute(r.id);
      toast(`已下架 ${r.code}`);
      onChanged();
      onClose();
    } catch (e) {
      toast((e as Error).message);
    }
    setBusy(false);
  };

  const removeComment = async (id: string) => {
    try {
      await deleteComment(id);
      setComments((cs) => cs?.filter((c) => c.id !== id) ?? null);
      toast("已刪除留言");
    } catch (e) {
      toast((e as Error).message);
    }
  };

  return (
    <>
      <SheetTitle>{r ? `編輯 ${r.code}` : "新增路線"}</SheetTitle>
      <SheetSub>
        {zone.name}
        {r ? `，${ago(r.created_at)}設定` : "，編號會自動產生"}
      </SheetSub>
      {endurance ? (
        <>
          <Label>照順序點岩點（最多 {MAX_POINTS} 點）</Label>
          {photo ? (
            <WallPhoto src={photo} alt={`${zone.name}照片`} setter={!locked} onPick={addPoint}>
              <NumberMarks holds={holds} onTap={locked ? undefined : (i) => editHolds(holds.filter((_, j) => j !== i))} />
            </WallPhoto>
          ) : (
            <p className="mt-0 text-meta text-muted">這區還沒有照片，請先上傳照片再標點。</p>
          )}
          <div className="-mt-2 mb-1 flex items-center justify-between gap-2 text-meta text-muted">
            <span>
              已標 <b className="font-num text-ink">{holds.length}</b> 點
              {locked ? "・已經有人記錄過，點不能改" : "・點照片加下一點，點圈圈刪掉"}
            </span>
            {!locked && (
              <span className="flex flex-none gap-1">
                <button disabled={!past.length} onClick={undo} className="px-1 py-1 font-bold text-accent disabled:opacity-40">
                  ↶ 復原
                </button>
                <button disabled={!holds.length} onClick={() => editHolds([])} className="px-1 py-1 text-warn disabled:opacity-40">
                  全部清除
                </button>
              </span>
            )}
          </div>
        </>
      ) : (
        <>
          <Label>岩點顏色</Label>
          <ColorPicker value={color} onChange={setColor} />
        </>
      )}
      <Label>難度</Label>
      <GradePicker system={zone.grade_system} value={grade} onChange={setGrade} />
      <Label>路線風格（可複選）</Label>
      <TagPicker value={tags} onChange={setTags} />
      <Label htmlFor="rnote">評語（選填，40 字內）</Label>
      <TextField id="rnote" maxLength={40} value={note} onChange={(e) => setNote(e.target.value)} placeholder="例如：最後一手要果斷" />
      <Toggle checked={cm} onChange={setCm} label="開放這條路線留言" hint="關閉後也不能分享影片" />
      <Button variant="primary" disabled={busy} onClick={save}>
        {busy ? "儲存中…" : r ? "儲存變更" : endurance ? `新增路線（${holds.length} 點）` : "新增路線"}
      </Button>
      {r && (
        <>
          <SheetSection title="顧客留言" aside={comments ? `${comments.length} 則` : undefined}>
            {comments?.length ? (
              <CommentList>
                {comments.map((c) => (
                  <CommentItem key={c.id} name={c.nickname} ago={ago(c.created_at)} body={c.body} likes={c.likers.length} onDelete={() => removeComment(c.id)} />
                ))}
              </CommentList>
            ) : (
              <p className="mt-1 mb-2 text-note text-muted">{comments ? "沒有留言。" : "讀取中…"}</p>
            )}
          </SheetSection>
          <Button variant="danger" className="mt-4" disabled={busy} onClick={archive}>
            {confirmArchive ? `確定下架 ${r.code}？影片會一起刪除，再按一次` : "下架這條路線"}
          </Button>
        </>
      )}
      <LinkButton onClick={onClose}>取消</LinkButton>
    </>
  );
}
