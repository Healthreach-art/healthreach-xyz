export function hasDeliveryCoordinates(value: { lat?: unknown; lng?: unknown } | null | undefined): value is { lat: number; lng: number } {
  return !!value && typeof value.lat === "number" && Number.isFinite(value.lat) && Math.abs(value.lat) <= 90
    && typeof value.lng === "number" && Number.isFinite(value.lng) && Math.abs(value.lng) <= 180;
}

export function deliveryBelongsToOrder(delivery: { order_id?: string | null; order_group_id?: string | null }, order: { id: string; order_group_id?: string | null }): boolean {
  return delivery.order_id === order.id || !!order.order_group_id && delivery.order_group_id === order.order_group_id;
}