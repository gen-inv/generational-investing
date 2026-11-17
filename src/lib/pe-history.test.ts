import { describe, it, expect } from 'vitest'
import { splitFactor, buildQuarters, ttmSeries, ttmOn, peSeries, currentPe, summarizePe, EpsFact } from './pe-history'

// Four fiscal years of quarters, EPS 1.00 per quarter in year 1 rising by 0.25 a year; quarter ends Mar/Jun/Sep/Dec.
const mk = (y: number) => {
  const q = (n: number) => [`${y}-01-01`, `${y}-04-01`, `${y}-07-01`, `${y}-10-01`][n]
  const e = (n: number) => [`${y}-03-31`, `${y}-06-30`, `${y}-09-30`, `${y}-12-31`][n]
  const eps = 1 + (y - 2020) * 0.25
  const facts: EpsFact[] = [0, 1, 2].map(n => ({ start: q(n), end: e(n), val: eps, filed: `${y}-${['05', '08', '11'][n]}-05` }))
  facts.push({ start: `${y}-01-01`, end: `${y}-12-31`, val: eps * 4, filed: `${y + 1}-02-20` })   // the 10-K reports the whole year only
  return facts
}
const facts = [2020, 2021, 2022, 2023].flatMap(mk)

describe('quarters and TTM', () => {
  it('derives Q4 as the year minus Q1..Q3', () => {
    const q = buildQuarters(facts, [])
    expect(q).toHaveLength(16)
    const q4 = q.find(x => x.end === '2021-12-31')!
    expect(q4.val).toBeCloseTo(1.25, 10); expect(q4.start).toBe('2021-10-01'); expect(q4.available).toBe('2022-02-20')
  })
  it('TTM is the sum of four consecutive quarters and is usable only after the last was filed', () => {
    const t = ttmSeries(buildQuarters(facts, []))
    expect(t).toHaveLength(13)
    const dec2021 = t.find(x => x.end === '2021-12-31')!
    expect(dec2021.eps).toBeCloseTo(5, 10); expect(dec2021.available).toBe('2022-02-20')
    expect(ttmOn('2022-01-15', t)!.end).toBe('2021-09-30')      // the December quarter was not public yet
    expect(ttmOn('2022-03-01', t)!.end).toBe('2021-12-31')
    expect(ttmOn('2030-01-01', t)).toBeNull()                    // stale: newest quarter is years old
  })
  it('a missing quarter breaks the run instead of making a wrong TTM', () => {
    const gappy = facts.filter(f => !(f.start === '2021-04-01'))
    const t = ttmSeries(buildQuarters(gappy, []))
    expect(t.every(x => x.end <= '2021-03-31' || x.end >= '2022-06-30')).toBe(true)
  })
})

describe('retail calendars with a 16-week quarter', () => {
  // Costco-style year: Q1-Q3 are 12 weeks (84 days), Q4 is 16 weeks (112 days); EPS 1.00 a quarter, the year reports 4.00
  const addD = (d: string, n: number) => new Date(Date.parse(d) + n * 86400000).toISOString().slice(0, 10)
  const retail = (() => {
    const f: EpsFact[] = []
    let start = '2019-09-01'
    for (let y = 0; y < 4; y++) {
      const yStart = start, lens = [84, 84, 84, 112]
      lens.slice(0, 3).forEach((n, i) => {
        const end = addD(start, n - 1)
        f.push({ start, end, val: 1, filed: addD(end, 35) })
        start = addD(end, 1)
      })
      const yEnd = addD(start, 111)
      f.push({ start: yStart, end: yEnd, val: 4, filed: addD(yEnd, 25) })
      start = addD(yEnd, 1)
    }
    return f
  })()
  it('derives the 16-week Q4 and still builds a TTM', () => {
    const q = buildQuarters(retail, [])
    expect(q).toHaveLength(16)
    expect(q.filter(x => Math.abs(x.val - 1) < 1e-9)).toHaveLength(16)
    const t = ttmSeries(q)
    expect(t.length).toBeGreaterThanOrEqual(10)
    expect(t.every(x => Math.abs(x.eps - 4) < 1e-9)).toBe(true)
  })
})

describe('splits', () => {
  it('values from before a later split are divided by it; values filed after it are left alone', () => {
    const splits = [{ date: '2022-06-01', ratio: 2 }]
    expect(splitFactor(splits, '2022-02-20')).toBe(2)
    expect(splitFactor(splits, '2022-08-05')).toBe(1)
    const q = buildQuarters(facts, splits)
    expect(q.find(x => x.end === '2020-03-31')!.val).toBeCloseTo(0.5, 10)   // 1.00 / 2
    expect(q.find(x => x.end === '2023-09-30')!.val).toBeCloseTo(1.75, 10)  // filed after the split
  })
  it('uses the newest restated value for a period but keeps the first filing date as availability', () => {
    const f = [...facts, { start: '2020-01-01', end: '2020-03-31', val: 0.4, filed: '2021-05-05' }]   // restated later on the post-split basis
    const q = buildQuarters(f, [{ date: '2021-01-01', ratio: 2 }]).find(x => x.end === '2020-03-31')!
    expect(q.val).toBeCloseTo(0.4, 10); expect(q.available).toBe('2020-05-05')
  })
})

describe('P/E series and summary', () => {
  const t = ttmSeries(buildQuarters(facts, []))
  const prices = [
    { date: '2021-06-30', close: 40 }, { date: '2021-12-31', close: 60 }, { date: '2022-06-30', close: 50 },
    { date: '2022-12-31', close: 80 }, { date: '2023-06-30', close: 90 }, { date: '2023-12-31', close: 100 },
  ]
  it('one P/E per month, using the EPS known at the time', () => {
    const s = peSeries(prices, t)
    expect(s).toHaveLength(6)
    expect(s[0]).toBeCloseTo(40 / 4.25, 6)     // Jun-2021: Q2 not filed yet, so TTM through Mar-2021 = 1+1+1+1.25
  })
  it('skips months where EPS is zero or negative', () => {
    const loss = [{ start: '2021-01-01', end: '2021-03-31', val: -5, filed: '2021-05-05' }, ...facts.filter(f => !(f.end === '2021-03-31'))]
    const s = peSeries(prices, ttmSeries(buildQuarters(loss, [])))
    expect(s.length).toBeLessThan(6)
    expect(s.every(v => v > 0)).toBe(true)
  })
  it('summary needs enough history and reports where today sits', () => {
    expect(summarizePe([10, 20, 30], 15)).toBeNull()
    const series = Array.from({ length: 100 }, (_, i) => 10 + i * 0.2)     // 10.0 .. 29.8
    const s = summarizePe(series, 20)!
    expect(s.min).toBeCloseTo(10, 6); expect(s.max).toBeCloseTo(29.8, 6); expect(s.median).toBeCloseTo(19.9, 6)
    expect(s.percentile).toBe(51)
    expect(summarizePe(series, null)).toBeNull()
  })
  it('currentPe uses the latest price and the latest known TTM', () => {
    const c = currentPe(prices, t)!
    expect(c.eps).toBeCloseTo(6.75, 10)          // Dec-2023 quarter not filed yet: Q4-2022 (1.5) + three quarters of 1.75
    expect(c.pe).toBeCloseTo(100 / 6.75, 10)
  })
})
