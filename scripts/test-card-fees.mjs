import test from "node:test"
import assert from "node:assert/strict"
import { build } from "esbuild"
import { mkdir } from "node:fs/promises"
import { pathToFileURL } from "node:url"
import path from "node:path"
const dir = path.resolve("node_modules/.cache/card-fee-tests")
await mkdir(dir, { recursive: true })
const outfile = path.join(dir, "fees.mjs")
await build({ stdin: { contents: 'export {quoteCardTerms} from "./lib/boleto/card-fees"; export {calculateChargeTerms} from "./lib/finance/charge-plan"', resolveDir: process.cwd() }, outfile, bundle: true, platform: "node", format: "esm", packages: "external", logLevel: "silent" })
const { quoteCardTerms, calculateChargeTerms } = await import(pathToFileURL(outfile).href)

test("repasse usa o líquido simulado da conta e cobre a taxa sobre o valor acrescido", async () => {
  for (const count of [2, 6, 12]) {
    const percentage = count <= 6 ? 3 : 5
    const net = value => Math.round((value * (1 - percentage / 100) - 0.49 * count) * 100) / 100
    const terms = await quoteCardTerms({ simulateCard: async value => ({ creditCard: { netValue: net(value), feePercentage: percentage } }) }, 2000, count)
    const calculation = calculateChargeTerms(terms)
    assert(net(calculation.total) >= 2000)
    assert(calculation.surcharge > 0)
    assert.equal(calculation.amounts.reduce((sum, value) => sum + Math.round(value * 100), 0), Math.round(calculation.total * 100))
    assert.equal(calculateChargeTerms({ baseAmount: 2000, surchargePercent: 0, count, cardFeeMode: "none" }).total, 2000)
  }
})

test("taxas zeradas não acrescentam valor; falha ou retorno inválido não inventam uma taxa", async () => {
  const terms = await quoteCardTerms({ simulateCard: async value => ({ creditCard: { netValue: value, feePercentage: 0 } }) }, 100, 3)
  assert.equal(calculateChargeTerms(terms).total, 100)
  for (const card of [undefined, { netValue: NaN, feePercentage: 3 }, { netValue: 90, feePercentage: 100 }]) await assert.rejects(quoteCardTerms({ simulateCard: async () => ({ creditCard: card }) }, 100, 3), /simulação válida/)
  await assert.rejects(quoteCardTerms({ simulateCard: async () => { throw Error("indisponível") } }, 100, 3), /indisponível/)
})
