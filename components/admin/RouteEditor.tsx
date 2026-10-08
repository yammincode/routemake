"use client";

import { gradeLabel } from "@/lib/design";
import { useEffect, useState } from "react";
import { Button, LinkButton } from "@/components/ui/Button";
import { CommentItem, CommentList } from "@/components/ui/Comments";
import { ColorPicker, GradePicker, Label, TagPicker, TextField, Toggle } from "@/components/ui/Form";
import Sheet, { SheetSection, SheetSub, SheetTitle } from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/Toast";
import { archiveRoute, createRoute, deleteComment, getComments, newId, updateRoute, type Comment, type Route, type Zone } from "@/lib/data";
import { ago } from "@/lib/date";
import type { HoldColor } from "@/lib/design";

export type EditTarget = { route: Route } | { x: number; y: number } | null;

// 新增／編輯路線（底部彈出）：顏色、難度、風格、評語、留言開關；編輯時可看並刪留言、下架
export default function RouteEditor({ zone, target, onClose, onChanged }: { zone: Zone; target: EditTarget; onClose: () => void; onChanged: () => void }) {
  return (
    <Sheet open={!!target} onClose={onClose}>
      {target && <Body key={"route" in target ? target.route.id : `${target.x},${target.y}`} zone={zone} target={target} onClose={onClose} onChanged={onChanged} />}
    </Sheet>
  );
}

function Body({ zone, target, onClose, onChanged }: { zone: Zone; target: NonNullable<EditTarget>; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const r = "route" in target ? target.route : null;
  const [color, setColor] = useState<HoldColor>(r?.hold_color ?? "紅");
  const [grade, setGrade] = useState(r?.grade ?? (zone.grade_system === "yds" ? 104 : 3));
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

  const input = { grade, hold_color: color, style_tags: tags, setter_note: note.trim() || null, comments_enabled: cm };

  const save = async () => {
    setBusy(true);
    try {
      if (r) {
        await updateRoute(r.id, input);
        toast("已儲存");
      } else if ("x" in target) {
        const created = await createRoute(zone.id, input, target.x, target.y, routeId);
        toast(`已新增 ${created.code}（${gradeLabel(grade)} ${color}色）`);
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
      <Label>岩點顏色</Label>
      <ColorPicker value={color} onChange={setColor} />
      <Label>難度</Label>
      <GradePicker system={zone.grade_system} value={grade} onChange={setGrade} />
      <Label>路線風格（可複選）</Label>
      <TagPicker value={tags} onChange={setTags} />
      <Label htmlFor="rnote">評語（選填，40 字內）</Label>
      <TextField id="rnote" maxLength={40} value={note} onChange={(e) => setNote(e.target.value)} placeholder="例如：最後一手要果斷" />
      <Toggle checked={cm} onChange={setCm} label="開放這條路線留言" hint="關閉後也不能分享影片" />
      <Button variant="primary" disabled={busy} onClick={save}>
        {busy ? "儲存中…" : r ? "儲存變更" : "新增路線"}
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
