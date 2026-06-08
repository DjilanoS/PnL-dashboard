<script setup lang="ts">
import { ref } from 'vue';
import {
  createColumnHelper,
  getCoreRowModel,
  getSortedRowModel,
  useVueTable,
  type SortingState,
} from '@tanstack/vue-table';
import { ArrowUpDown, ExternalLink, Trash2 } from '@lucide/vue';
import type { Order } from '@pnl/types';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import TokenIcon from '@/components/icons/TokenIcon.vue';
import { cn } from '@/lib/utils';
import { fmtDate, fmtNum, fmtUsd, shortSig } from '@/lib/format';

const props = defineProps<{ orders: Order[] }>();
const emit = defineEmits<{ delete: [id: string] }>();

function explorerUrl(o: Order): string | null {
  if (!o.txSignature) return null;
  return o.chain === 'sol'
    ? `https://solscan.io/tx/${o.txSignature}`
    : `https://suivision.xyz/txblock/${o.txSignature}`;
}

const columnHelper = createColumnHelper<Order>();
const columns = [
  columnHelper.accessor('timestamp', { header: 'Date' }),
  columnHelper.accessor('asset', { header: 'Asset', enableSorting: false }),
  columnHelper.accessor('side', { header: 'Side', enableSorting: false }),
  columnHelper.accessor('amount', { header: 'Amount' }),
  columnHelper.accessor('priceUsd', { header: 'Price' }),
  columnHelper.accessor((o) => o.amount * o.priceUsd, { id: 'total', header: 'Total' }),
  columnHelper.accessor('source', { header: 'Source', enableSorting: false }),
  columnHelper.display({ id: 'actions', header: '' }),
];

const sorting = ref<SortingState>([{ id: 'timestamp', desc: true }]);

const table = useVueTable({
  get data() {
    return props.orders;
  },
  columns,
  state: {
    get sorting() {
      return sorting.value;
    },
  },
  onSortingChange: (updater) => {
    sorting.value = typeof updater === 'function' ? updater(sorting.value) : updater;
  },
  getCoreRowModel: getCoreRowModel(),
  getSortedRowModel: getSortedRowModel(),
});
</script>

<template>
  <div class="rounded-md border">
    <Table>
      <TableHeader>
        <TableRow v-for="hg in table.getHeaderGroups()" :key="hg.id">
          <TableHead
            v-for="header in hg.headers"
            :key="header.id"
            :class="cn('whitespace-nowrap', header.column.getCanSort() && 'cursor-pointer select-none')"
            @click="header.column.getToggleSortingHandler()?.($event)"
          >
            <span class="inline-flex items-center gap-1">
              {{ header.column.columnDef.header }}
              <ArrowUpDown v-if="header.column.getCanSort()" class="size-3 opacity-50" />
            </span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-for="row in table.getRowModel().rows" :key="row.id">
          <TableCell class="whitespace-nowrap text-muted-foreground">
            {{ fmtDate(row.original.timestamp) }}
          </TableCell>
          <TableCell>
            <Badge
              variant="outline"
              :class="cn('gap-1', row.original.asset === 'SOL' ? 'border-solana/40 text-solana' : 'border-sui/40 text-sui')"
            >
              <TokenIcon :asset="row.original.asset" />
              {{ row.original.asset }}
            </Badge>
          </TableCell>
          <TableCell>
            <span :class="cn('font-medium capitalize', row.original.side === 'buy' ? 'text-profit' : 'text-loss')">
              {{ row.original.side }}
            </span>
          </TableCell>
          <TableCell class="tabular-nums">{{ fmtNum(row.original.amount) }}</TableCell>
          <TableCell class="tabular-nums">{{ fmtUsd(row.original.priceUsd, 2) }}</TableCell>
          <TableCell class="tabular-nums">{{ fmtUsd(row.original.amount * row.original.priceUsd) }}</TableCell>
          <TableCell>
            <a
              v-if="explorerUrl(row.original)"
              :href="explorerUrl(row.original)!"
              target="_blank"
              rel="noopener"
              class="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              {{ shortSig(row.original.txSignature!) }}
              <ExternalLink class="size-3" />
            </a>
            <span v-else class="text-xs capitalize text-muted-foreground">{{ row.original.source }}</span>
          </TableCell>
          <TableCell class="text-right">
            <Button variant="ghost" size="icon" class="size-8" @click="emit('delete', row.original.id)">
              <Trash2 class="size-4 text-muted-foreground" />
            </Button>
          </TableCell>
        </TableRow>
        <TableRow v-if="table.getRowModel().rows.length === 0">
          <TableCell :colspan="columns.length" class="py-12 text-center text-sm text-muted-foreground">
            No orders yet.
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  </div>
</template>
