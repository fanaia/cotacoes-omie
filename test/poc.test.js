import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { JsonStore } from "../src/store.js";
import { MockOmieClient } from "../src/omie-client.js";
import { PocService } from "../src/service.js";

async function fixture(){const dir=await mkdtemp(join(tmpdir(),'cotacoes-'));const store=new JsonStore(join(dir,'store.json'));await store.load();return new PocService(store,new MockOmieClient());}

test('sincronização é idempotente e consolida produtos repetidos',async()=>{const service=await fixture();await service.sync();await service.sync();const state=service.view();assert.equal(state.requests.length,2);assert.equal(state.needs.length,3);assert.equal(state.needs.find(n=>n.productCode==='501').totalQuantity,35);});

test('aloca saldo entre origens e gera pedido idempotente',async()=>{const service=await fixture();await service.sync();let state=service.view();const need=state.needs.find(n=>n.productCode==='501');await service.allocate({needId:need.id,supplierId:'supplier-1',quantity:35,unitPrice:11.9});state=service.view();assert.equal(state.needs.find(n=>n.id===need.id).availableQuantity,0);const first=await service.createOrders();const second=await service.createOrders();assert.equal(first.length,1);assert.equal(second.length,0);assert.equal(service.view().orders.length,1);assert.equal(service.view().orders[0].allocationIds.length,2);});

test('impede alocação acima do saldo',async()=>{const service=await fixture();await service.sync();const need=service.view().needs[0];await assert.rejects(()=>service.allocate({needId:need.id,supplierId:'supplier-1',quantity:need.availableQuantity+1}),/excede/);});
