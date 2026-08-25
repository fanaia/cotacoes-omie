const MOCK_REQUESTS = [
  { codReqCompra: 1001, codIntReqCompra: "REQ-1001", codCateg: "2.04.06", codProj: 10, dtSugestao: "30/08/2026", ItensReqCompra: [
    { codItem: 11, codProd: 501, qtde: 10, precoUnit: 12.5, obsItem: "Papel A4" },
    { codItem: 12, codProd: 700, qtde: 2, precoUnit: 3500, obsItem: "Notebook" }
  ]},
  { codReqCompra: 1002, codIntReqCompra: "REQ-1002", codCateg: "2.04.06", codProj: 20, dtSugestao: "02/09/2026", ItensReqCompra: [
    { codItem: 21, codProd: 501, qtde: 25, precoUnit: 12, obsItem: "Papel A4" },
    { codItem: 22, codProd: 801, qtde: 5, precoUnit: 90, obsItem: "Toner" }
  ]}
];

export class MockOmieClient {
  constructor() { this.orders = new Map(); }
  async listPurchaseRequests() { return structuredClone(MOCK_REQUESTS); }
  async createPurchaseOrder(payload) {
    if (this.orders.has(payload.integrationCode)) return this.orders.get(payload.integrationCode);
    const result = { omieOrderCode: 9000 + this.orders.size, number: `PC-${101 + this.orders.size}`, stage: "PENDING", paymentStatus: "NOT_FOUND" };
    this.orders.set(payload.integrationCode, result);
    return result;
  }
  async trackPurchaseOrder(order) {
    return { stage: order.stage || "PENDING", paymentStatus: order.paymentStatus || "NOT_FOUND", evidence: "mock" };
  }
}

export class RealOmieClient {
  constructor({ appKey, appSecret, baseUrl }) {
    if (!appKey || !appSecret) throw new Error("OMIE_APP_KEY e OMIE_APP_SECRET são obrigatórios no modo real");
    this.credentials = { app_key: appKey, app_secret: appSecret };
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }
  async call(path, call, param) {
    const response = await fetch(`${this.baseUrl}/${path}/`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ call, ...this.credentials, param: [param] })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.faultstring) throw new Error(data.faultstring || `Omie HTTP ${response.status}`);
    return data;
  }
  async listPurchaseRequests({ updatedFrom } = {}) {
    const all = [];
    for (let page = 1; ; page++) {
      const data = await this.call("produtos/requisicaocompra", "PesquisarReq", {
        pagina: page, registros_por_pagina: 50,
        ...(updatedFrom ? { filtrar_por_data_de: new Date(updatedFrom).toLocaleDateString("pt-BR"), filtrar_apenas_alteracao: "S" } : {})
      });
      all.push(...(data.requisicaoCadastro || []));
      if (page >= Number(data.total_de_paginas || 1)) break;
    }
    return all;
  }
  async createPurchaseOrder(payload) {
    const products = payload.items.map(item => ({ cCodIntItem: item.allocationId.slice(0, 20), nCodProd: Number(item.productCode), nQtde: item.quantity, nValUnit: item.unitPrice || 0, cObs: item.notes || "" }));
    const data = await this.call("produtos/pedidocompra", "IncluirPedCompra", {
      cabecalho_incluir: { cCodIntPed: payload.integrationCode.slice(0, 20), dDtPrevisao: payload.expectedDate, nCodFor: Number(payload.supplier.omieCode), cCodCateg: payload.categoryCode || "", nCodProj: Number(payload.projectCode || 0), cObsInt: "Gerado pelo Oon Cotações" },
      produtos_incluir: products
    });
    return { omieOrderCode: data.nCodPed, number: data.cNumero || null, stage: "PENDING", paymentStatus: "NOT_FOUND" };
  }
  async trackPurchaseOrder(order) {
    const data = await this.call("produtos/pedidocompra", "ConsultarPedCompra", { nCodPed: order.omieOrderCode });
    return { stage: data.cabecalho?.cEtapa || data.cabecalho_consulta?.cEtapa || "UNKNOWN", paymentStatus: "NOT_FOUND", evidence: "omie-order", limitation: "A conciliação com título e baixa depende de validar identificadores disponíveis na base real." };
  }
}

export function createOmieClient(env = process.env) {
  return env.OMIE_MODE === "real"
    ? new RealOmieClient({ appKey: env.OMIE_APP_KEY, appSecret: env.OMIE_APP_SECRET, baseUrl: env.OMIE_BASE_URL || "https://app.omie.com.br/api/v1" })
    : new MockOmieClient();
}
