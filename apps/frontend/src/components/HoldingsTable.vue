<script setup lang="ts">
import { computed } from 'vue';
import type { Holding, PnlSummary } from '@pnl/types';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import TokenIcon from '@/components/icons/TokenIcon.vue';
import { cn } from '@/lib/utils';
import { fmtNum, fmtSignedUsd, fmtUsd } from '@/lib/format';

const props = defineProps<{ holdings: Holding[]; pnl: PnlSummary | null }>();

const rows = computed(() =>
  props.holdings.map((h) => {
    const p = props.pnl?.perAsset.find((a) => a.asset === h.asset);
    return { ...h, avgBuy: p?.avgBuy ?? 0, avgSell: p?.avgSell ?? 0 };
  }),
);

function tone(n: number): string {
  return n > 0 ? 'text-profit' : n < 0 ? 'text-loss' : '';
}
</script>

<template>
  <div class="rounded-md border">
    <Table>
      <TableHeader>
        <TableRow class="whitespace-nowrap">
          <TableHead>Asset</TableHead>
          <TableHead class="text-right">Quantity</TableHead>
          <TableHead class="text-right">Avg cost</TableHead>
          <TableHead class="text-right">Avg buy</TableHead>
          <TableHead class="text-right">Avg sell</TableHead>
          <TableHead class="text-right">Price</TableHead>
          <TableHead class="text-right">Value</TableHead>
          <TableHead class="text-right">Unrealized</TableHead>
          <TableHead class="text-right">Alloc.</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-for="r in rows" :key="r.asset">
          <TableCell>
            <Badge
              variant="outline"
              :class="cn('gap-1', r.asset === 'SOL' ? 'border-solana/40 text-solana' : 'border-sui/40 text-sui')"
            >
              <TokenIcon :asset="r.asset" />
              {{ r.asset }}
            </Badge>
          </TableCell>
          <TableCell class="text-right tabular-nums">{{ fmtNum(r.ledgerQty) }}</TableCell>
          <TableCell class="text-right tabular-nums">{{ fmtUsd(r.avgCost, 2) }}</TableCell>
          <TableCell class="text-right tabular-nums">{{ fmtUsd(r.avgBuy, 2) }}</TableCell>
          <TableCell class="text-right tabular-nums">{{ r.avgSell > 0 ? fmtUsd(r.avgSell, 2) : '—' }}</TableCell>
          <TableCell class="text-right tabular-nums">{{ fmtUsd(r.currentPrice, 2) }}</TableCell>
          <TableCell class="text-right tabular-nums">{{ fmtUsd(r.valueUsd) }}</TableCell>
          <TableCell :class="cn('text-right tabular-nums', tone(r.unrealized))">
            {{ fmtSignedUsd(r.unrealized) }}
          </TableCell>
          <TableCell class="text-right tabular-nums text-muted-foreground">
            {{ (r.allocation * 100).toFixed(1) }}%
          </TableCell>
        </TableRow>
        <TableRow v-if="rows.length === 0">
          <TableCell colspan="9" class="py-12 text-center text-sm text-muted-foreground">
            No holdings yet. Add orders to see your positions.
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  </div>
</template>
