import { createHash } from "node:crypto";

export const stableId = (...parts) => createHash("sha256")
  .update(parts.map(String).join("|"))
  .digest("hex")
  .slice(0, 24);

export function normalizeRequest(raw) {
  const requestCode = String(raw.codReqCompra ?? raw.codIntReqCompra);
  if (!requestCode || requestCode === "undefined") throw new Error("Requisição sem identificador Omie");
  return {
    id: stableId("request", requestCode),
    omieCode: raw.codReqCompra ?? null,
    integrationCode: raw.codIntReqCompra || null,
    categoryCode: raw.codCateg || null,
    projectCode: raw.codProj || null,
    suggestedDate: raw.dtSugestao || null,
    notes: raw.obsReqCompra || "",
    internalNotes: raw.obsIntReqCompra || "",
    sourceUpdatedAt: raw.__updatedAt || null,
    items: (raw.ItensReqCompra || []).map((item, index) => {
      const itemCode = item.codItem ?? item.codIntItem ?? index;
      return {
        id: stableId("request-item", requestCode, itemCode),
        omieItemCode: item.codItem ?? null,
        integrationCode: item.codIntItem?.trim() || null,
        productCode: String(item.codProd ?? item.codIntProd ?? "unknown"),
        quantity: Number(item.qtde || 0),
        suggestedUnitPrice: Number(item.precoUnit || 0),
        notes: item.obsItem || ""
      };
    })
  };
}

export function consolidate(requests, allocations = []) {
  const allocated = new Map();
  for (const allocation of allocations) {
    allocated.set(allocation.requestItemId, (allocated.get(allocation.requestItemId) || 0) + Number(allocation.quantity));
  }
  const groups = new Map();
  for (const request of requests) {
    for (const item of request.items) {
      const key = item.productCode;
      if (!groups.has(key)) groups.set(key, {
        id: stableId("need", key), productCode: key, totalQuantity: 0,
        allocatedQuantity: 0, availableQuantity: 0, origins: []
      });
      const group = groups.get(key);
      const used = allocated.get(item.id) || 0;
      group.totalQuantity += item.quantity;
      group.allocatedQuantity += used;
      group.origins.push({ requestId: request.id, requestItemId: item.id, omieRequestCode: request.omieCode, quantity: item.quantity, allocatedQuantity: used });
    }
  }
  return [...groups.values()].map(group => ({ ...group, availableQuantity: group.totalQuantity - group.allocatedQuantity }));
}

export function validateAllocation(needs, allocation) {
  const need = needs.find(item => item.id === allocation.needId);
  if (!need) throw new Error("Necessidade não encontrada");
  const quantity = Number(allocation.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("Quantidade deve ser positiva");
  if (quantity > need.availableQuantity) throw new Error("Quantidade excede o saldo disponível");
  if (!allocation.supplierId) throw new Error("Fornecedor é obrigatório");
}

export function buildOrders(requests, allocations, suppliers) {
  const requestItems = new Map(requests.flatMap(r => r.items.map(i => [i.id, { ...i, requestId: r.id, projectCode: r.projectCode, categoryCode: r.categoryCode }])));
  const bySupplier = new Map();
  for (const allocation of allocations.filter(a => !a.orderId)) {
    const item = requestItems.get(allocation.requestItemId);
    if (!item) throw new Error(`Item de origem não encontrado: ${allocation.requestItemId}`);
    if (!bySupplier.has(allocation.supplierId)) bySupplier.set(allocation.supplierId, []);
    bySupplier.get(allocation.supplierId).push({ allocation, item });
  }
  return [...bySupplier].map(([supplierId, entries]) => {
    const supplier = suppliers.find(s => s.id === supplierId);
    if (!supplier) throw new Error(`Fornecedor não encontrado: ${supplierId}`);
    const integrationCode = `OON-${stableId(supplierId, ...entries.map(e => e.allocation.id).sort()).toUpperCase()}`;
    return { supplier, entries, integrationCode };
  });
}
