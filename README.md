# Cotações Omie

Side-Car para validar a jornada entre as requisições do Kanban de Compras do Omie, consolidação de itens, seleção de fornecedores, criação de pedidos e acompanhamento financeiro.

Código: `cotacoes-omie`

Esta Central foi criada pelo Oon Workspace. A branch `main` publica automaticamente em Dev pelo fluxo governado da Plataforma Oon.

## Executar

Requer Node.js 20 ou superior.

```bash
cp .env.example .env
npm start
```

Acesse `http://localhost:3000`. O padrão é `OMIE_MODE=mock`, com duas requisições, três produtos e dois fornecedores simulados.

## Testes

```bash
npm test
```

## Fluxo da demonstração

1. Clique em **Sincronizar Omie**.
2. Confira a consolidação do produto 501 em duas requisições.
3. Aloque quantidades e preços para um ou mais fornecedores.
4. Clique em **Gerar pedidos**.
5. Clique em **Atualizar situação**.

## Integração real

Configure:

```env
OMIE_MODE=real
OMIE_APP_KEY=...
OMIE_APP_SECRET=...
```

O cliente real implementa `PesquisarReq`, paginação e `IncluirPedCompra`. Os códigos de integração são determinísticos e as confirmações são persistidas antes de uma nova tentativa.

## Endpoints

- `GET /api/health/ready`
- `GET /api/health/version`
- `GET /api/state`
- `POST /api/sync`
- `POST /api/allocations`
- `POST /api/orders`
- `POST /api/orders/track`

## Persistência e segurança

A POC usa um arquivo JSON gravado atomicamente em `data/store.json`. Credenciais são lidas apenas do ambiente; `.env` e os dados operacionais estão ignorados pelo Git.

## Limitação conhecida do rastreamento financeiro

A documentação pública permite consultar pedidos e movimentos financeiros, mas a chave confiável para conciliar requisição → pedido → nota de entrada → título → baixa precisa ser comprovada numa base Omie real. Por isso, o modo real nunca marca um pedido como pago por inferência: retorna `NOT_FOUND` até existir evidência conciliável. Esta validação faz parte da sub-issue #7.

## Organização

- Épico POC: #1
- Cliente e sincronização: #4
- Consolidação: #5
- Fornecedores e pedidos: #6
- Rastreamento financeiro: #7
- Interface e testes: #8
