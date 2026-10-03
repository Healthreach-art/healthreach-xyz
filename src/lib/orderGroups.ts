import { firestoreClient } from "@/lib/firestore-client";

/**
 * Shared helpers for the "one cart = one order = one package = one code" view model.
 *
 * Legacy un-grouped order rows (created before order_groups existed) are treated as
 * a group of one keyed by their own id, so dashboards keep showing them.
 */

export interface OrderRowLike {
  id: string;
  order_group_id?: string | null;
  medication_name: string;
  quantity: number;
  status: string;
  total_amount: number | string;
  created_at: string;
  priority?: boolean | null;
  scheduled_for?: string | null;
}

export interface OrderGroupRow {
  id: string;
  delivery_code: string | null;
  pickup_code: string | null;
  status: string;
  total_amount: number | string;
  delivery_fee: number | string | null;
  subtotal: number | string | null;
  delivery_address: string | null;
  created_at: string;
  scheduled_for: string | null;
  priority: boolean | null;
}

export interface GroupedOrder<O extends OrderRowLike = OrderRowLike> {
  /** Key — order_group_id when present, otherwise the order row id. */
  key: string;
  /** True when this group has a real order_groups row backing it. */
  isGroup: boolean;
  group: OrderGroupRow | null;
  items: O[];
  status: string;
  total: number;
  delivery_code: string | null;
  pickup_code: string | null;
  created_at: string;
  priority: boolean;
  scheduled_for: string | null;
  primaryOrderId: string;
}

/**
 * Folds a flat list of order rows into per-group view models and hydrates with
 * the matching order_groups rows in one query.
 */
export async function groupAndHydrate<O extends OrderRowLike>(rows: O[]): Promise<GroupedOrder<O>[]> {
  const byKey = new Map<string, O[]>();
  for (const r of rows) {
    const key = r.order_group_id || r.id;
    const arr = byKey.get(key) ?? [];
    arr.push(r);
    byKey.set(key, arr);
  }

  const groupIds = Array.from(new Set(rows.map((r) => r.order_group_id).filter((v): v is string => !!v)));
  let groupsById = new Map<string, OrderGroupRow>();
  if (groupIds.length > 0) {
    const { data } = await firestoreClient
      .from("order_groups" as never)
      .select("id, delivery_code, pickup_code, status, total_amount, delivery_fee, subtotal, delivery_address, created_at, scheduled_for, priority")
      .in("id", groupIds);
    groupsById = new Map(((data ?? []) as OrderGroupRow[]).map((g) => [g.id, g]));
  }

  const out: GroupedOrder<O>[] = [];
  for (const [key, items] of byKey) {
    const sorted = [...items].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
    const first = sorted[0];
    const group = (first.order_group_id && groupsById.get(first.order_group_id)) || null;
    const status = group?.status || first.status;
    const total = group ? Number(group.total_amount) : sorted.reduce((s, r) => s + Number(r.total_amount || 0), 0);
    out.push({
      key,
      isGroup: !!group,
      group,
      items: sorted,
      status,
      total,
      delivery_code: group?.delivery_code ?? null,
      pickup_code: group?.pickup_code ?? null,
      created_at: group?.created_at || first.created_at,
      priority: !!(group?.priority ?? first.priority),
      scheduled_for: group?.scheduled_for ?? first.scheduled_for ?? null,
      primaryOrderId: first.id,
    });
  }
  out.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
  return out;
}

/** Order-row IDs that belong to a group key. */
export function orderIdsForGroup<O extends OrderRowLike>(g: GroupedOrder<O>): string[] {
  return g.items.map((i) => i.id);
}
