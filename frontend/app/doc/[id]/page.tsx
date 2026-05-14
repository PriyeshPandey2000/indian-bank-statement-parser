import ProductShell from '@/components/product/ProductShell';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function DocPage({ params }: Props) {
  const { id } = await params;
  return <ProductShell documentId={id} />;
}
