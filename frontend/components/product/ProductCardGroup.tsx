'use client';

import { motion } from 'framer-motion';
import type { Product } from '@/types/product';
import { ProductCard } from './ProductCard';

interface Props {
  products: Product[];
}

export function ProductCardGroup({ products }: Props) {
  if (!products.length) return null;
  return (
    <motion.div
      layout
      className="grid grid-cols-1 gap-3 sm:grid-cols-2"
    >
      {products.map((p, i) => (
        <ProductCard key={p.id || i} product={p} index={i} />
      ))}
    </motion.div>
  );
}
