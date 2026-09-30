import ZoneView from "@/components/ZoneView";

export default async function ZonePage({ params }: PageProps<"/zone/[zoneId]">) {
  const { zoneId } = await params;
  return <ZoneView zoneId={zoneId} />;
}
