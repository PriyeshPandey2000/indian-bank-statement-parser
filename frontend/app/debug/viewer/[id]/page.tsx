import ViewerLayout from '@/components/viewer/ViewerLayout';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function DebugViewerPage({ params }: Props) {
  const { id } = await params;
  return <ViewerLayout documentId={id} />;
}
