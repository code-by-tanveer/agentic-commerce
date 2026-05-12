'use client';

import { motion } from 'framer-motion';
import type { Product } from '@/types/product';
import { useShortlist } from '@/hooks/useShortlist';
import { ProductCard } from './ProductCard';
import { CollageView } from './CollageView';

interface Props {
  products: Product[];
}

// Branches on `viewMode` from `useShortlist`:
//   - 'list' → existing 2-column grid of `ProductCard`s.
//   - 'collage' → `CollageView` (CSS-columns masonry, image-dominant cards).
// Both branches use the same `Product[]` payload; only the container/card
// chrome differs (DESIGN.md §4 ViewToggle).
export function ProductCardGroup({ products }: Props) {
  const { viewMode } = useShortlist();
  if (!products.length) return null;
  if (viewMode === 'collage') {
    return <CollageView products={products} />;
  }
  return (
    <motion.div layout className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {products.map((p, i) => (
        <ProductCard key={p.id || i} product={p} index={i} />
      ))}
    </motion.div>
  );
}
