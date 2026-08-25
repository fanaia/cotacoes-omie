import { randomUUID } from "node:crypto";
import { buildOrders, consolidate, normalizeRequest, validateAllocation } from "./domain.js";

export class PocService {
  constructor(store, omie) { this.store = store; this.omie = omie; }
  view() { const state = this.store.snapshot(); return { ...state, needs: consolidate(state.requests, state.allocations) }; }
  async sync() {
    const state = this.store.state;
    state.sync.lastAttemptAt = new Date().toISOString();
    try {
      const raw = await this.omie.listPurchaseRequests({ updatedFrom: state.sync.lastSuccessfulAt });
      const incoming = raw.map(normalizeRequest);
      const byId = new Map(state.requests.map(r => [r.id, r]));
      for (const request of incoming) byId.set(request.id, request);
      state.requests = [...byId.values()];
      state.sync.lastSuccessfulAt = new Date().toISOString(); state.sync.error = null;
      if (!state.suppliers.length) state.suppliers = [
        { id: "supplier-1", omieCode: 14170458, name: "Fornecedor Alfa" },
        { id: "supplier-2", omieCode: 14170459, name: "Fornecedor Beta" }
      ];
      await this.store.save(); return { imported: incoming.length, total: state.requests.length };
    } catch (error) { state.sync.error = error.message; await this.store.save(); throw error; }
  }
  async allocate(input) {
    const needs = consolidate(this.store.state.requests, this.store.state.allocations);
    validateAllocation(needs, input);
    const need = needs.find(n => n.id === input.needId);
    let remaining = Number(input.quantity);
    const created = [];
    for (const origin of need.origins) {
      const available = origin.quantity - origin.allocatedQuantity;
      const quantity = Math.min(remaining, available);
      if (quantity <= 0) continue;
      const allocation = { id: randomUUID(), needId: input.needId, requestItemId: origin.requestItemId, supplierId: input.supplierId, quantity, unitPrice: Number(input.unitPrice || 0), createdAt: new Date().toISOString(), orderId: null };
      this.store.state.allocations.push(allocation); created.push(allocation); remaining -= quantity;
      if (!remaining) break;
    }
    await this.store.save(); return created;
  }
  async createOrders() {
    const plans = buildOrders(this.store.state.requests, this.store.state.allocations, this.store.state.suppliers);
    const created = [];
    for (const plan of plans) {
      let order = this.store.state.orders.find(o => o.integrationCode === plan.integrationCode);
      if (!order) {
        const first = plan.entries[0].item;
        const result = await this.omie.createPurchaseOrder({ integrationCode: plan.integrationCode, supplier: plan.supplier, projectCode: first.projectCode, categoryCode: first.categoryCode, expectedDate: new Date(Date.now() + 7 * 86400000).toLocaleDateString("pt-BR"), items: plan.entries.map(e => ({ allocationId: e.allocation.id, productCode: e.item.productCode, quantity: e.allocation.quantity, unitPrice: e.allocation.unitPrice, notes: e.item.notes })) });
        order = { id: randomUUID(), integrationCode: plan.integrationCode, supplierId: plan.supplier.id, allocationIds: plan.entries.map(e => e.allocation.id), ...result, createdAt: new Date().toISOString() };
        this.store.state.orders.push(order);
        for (const entry of plan.entries) entry.allocation.orderId = order.id;
        created.push(order);
      }
    }
    await this.store.save(); return created;
  }
  async trackOrders() {
    for (const order of this.store.state.orders) Object.assign(order, await this.omie.trackPurchaseOrder(order), { trackedAt: new Date().toISOString() });
    await this.store.save(); return this.store.state.orders;
  }
}
