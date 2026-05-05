const { formatDateStr, pad2, isValidDateStr } = require('./date')

const SHARE_VERSION = 1

function safeDecode(v) {
  const s = v == null ? '' : String(v)
  try {
    return decodeURIComponent(s)
  } catch (e) {
    return s
  }
}

function clampInt(n, min, max) {
  if (!Number.isFinite(n)) return min
  const x = Math.floor(n)
  if (x < min) return min
  if (x > max) return max
  return x
}

function getMonthPrefix(year, monthIndex) {
  return `${year}-${pad2(monthIndex + 1)}-`
}

function extractSelectedDaysForMonth(selectedDatesMap, year, monthIndex) {
  const prefix = getMonthPrefix(year, monthIndex)
  const seen = Object.create(null)
  const days = []

  for (const dateStr of Object.keys(selectedDatesMap || {})) {
    if (!selectedDatesMap[dateStr]) continue
    if (!dateStr.startsWith(prefix)) continue
    const day = Number(dateStr.slice(8, 10))
    if (!Number.isFinite(day) || day < 1 || day > 31) continue
    if (seen[day]) continue
    seen[day] = true
    days.push(day)
  }

  days.sort((a, b) => a - b)
  return days
}

function extractSwapPairsForMonth(swapPairs, year, monthIndex) {
  const prefix = getMonthPrefix(year, monthIndex)
  const out = []
  if (!Array.isArray(swapPairs)) return out
  for (const pair of swapPairs) {
    if (!pair || typeof pair !== 'object') continue
    const h = pair.holiday
    const s = pair.swap
    if (!isValidDateStr(h) || !isValidDateStr(s)) continue
    if (!h.startsWith(prefix) || !s.startsWith(prefix)) continue
    out.push({ holiday: h, swap: s })
  }
  out.sort((a, b) => (a.holiday < b.holiday ? -1 : a.holiday > b.holiday ? 1 : 0))
  return out
}

function encodeSwapPairsForMonth(swapPairs, year, monthIndex) {
  const pairs = extractSwapPairsForMonth(swapPairs, year, monthIndex)
  if (pairs.length === 0) return ''
  const parts = []
  for (const p of pairs) {
    const hDay = Number(p.holiday.slice(8, 10))
    const sDay = Number(p.swap.slice(8, 10))
    if (!Number.isFinite(hDay) || !Number.isFinite(sDay)) continue
    if (hDay < 1 || hDay > 31 || sDay < 1 || sDay > 31) continue
    if (hDay === sDay) continue
    parts.push(`${hDay}-${sDay}`)
  }
  return parts.join(',')
}

function decodeSwapPairsFromMonth(encoded, year, monthIndex) {
  const out = []
  const used = Object.create(null)
  if (typeof encoded !== 'string' || encoded === '') return out
  const parts = encoded.split(',')
  for (const piece of parts) {
    if (!piece) continue
    const halves = piece.split('-')
    if (halves.length !== 2) continue
    const hDay = Number(halves[0])
    const sDay = Number(halves[1])
    if (!Number.isInteger(hDay) || !Number.isInteger(sDay)) continue
    if (hDay < 1 || hDay > 31 || sDay < 1 || sDay > 31) continue
    if (hDay === sDay) continue
    const holiday = formatDateStr(year, monthIndex, hDay)
    const swap = formatDateStr(year, monthIndex, sDay)
    if (!isValidDateStr(holiday) || !isValidDateStr(swap)) continue
    if (used[holiday] || used[swap]) continue
    used[holiday] = true
    used[swap] = true
    out.push({ holiday, swap })
  }
  return out
}

function buildShareQuery({ year, monthIndex, selectedDatesMap, swapPairs, monthlySalary, workDays }) {
  const y = Number(year)
  const m1 = Number(monthIndex) + 1
  const m = clampInt(m1, 1, 12)

  const days = extractSelectedDaysForMonth(selectedDatesMap, y, m - 1)
  const d = days.join(',')
  const p = encodeSwapPairsForMonth(swapPairs, y, m - 1)

  const salary = monthlySalary == null ? '' : String(monthlySalary)
  const work = workDays == null ? '' : String(workDays)

  const params = [
    `s=1`,
    `v=${SHARE_VERSION}`,
    `y=${encodeURIComponent(String(y))}`,
    `m=${encodeURIComponent(String(m))}`,
    `d=${encodeURIComponent(d)}`,
    `p=${encodeURIComponent(p)}`,
    `salary=${encodeURIComponent(salary)}`,
    `work=${encodeURIComponent(work)}`,
  ]

  return params.join('&')
}

function buildSharePath(state) {
  return `/pages/index/index?${buildShareQuery(state)}`
}

function parseSharedOptions(options) {
  if (!options || typeof options !== 'object') return { ok: false }
  if (safeDecode(options.s || '') !== '1') return { ok: false }

  const vRaw = safeDecode(options.v)
  const v = vRaw == null || vRaw === '' ? SHARE_VERSION : Number(vRaw)
  if (!Number.isFinite(v) || v !== SHARE_VERSION) return { ok: false }

  const y = Number(safeDecode(options.y))
  const m = Number(safeDecode(options.m))
  if (!Number.isFinite(y) || !Number.isFinite(m)) return { ok: false }
  if (m < 1 || m > 12) return { ok: false }

  const dRaw = options.d == null ? '' : safeDecode(options.d)
  const parts = dRaw ? dRaw.split(',') : []
  const daySeen = Object.create(null)
  const dayList = []
  for (const p of parts) {
    const n = Number(p)
    if (!Number.isFinite(n) || !Number.isInteger(n)) continue
    if (n < 1 || n > 31) continue
    const day = n
    if (daySeen[day]) continue
    daySeen[day] = true
    dayList.push(day)
  }
  dayList.sort((a, b) => a - b)

  const monthIndex = m - 1
  const selectedDatesMap = Object.create(null)
  for (const day of dayList) {
    selectedDatesMap[formatDateStr(y, monthIndex, day)] = true
  }

  const pRaw = options.p == null ? '' : safeDecode(options.p)
  const swapPairs = decodeSwapPairsFromMonth(pRaw, y, monthIndex)

  const monthlySalary = options.salary == null ? '' : safeDecode(options.salary)
  const workDays = options.work == null ? '' : safeDecode(options.work)

  return {
    ok: true,
    year: y,
    monthIndex,
    selectedDatesMap,
    swapPairs,
    monthlySalary,
    workDays,
    version: v,
  }
}

function replaceMonthSelection(baseSelectedDatesMap, year, monthIndex, monthSelectedDatesMap) {
  const prefix = getMonthPrefix(year, monthIndex)
  const next = Object.create(null)

  for (const k of Object.keys(baseSelectedDatesMap || {})) {
    if (!baseSelectedDatesMap[k]) continue
    if (k.startsWith(prefix)) continue
    next[k] = true
  }

  for (const k of Object.keys(monthSelectedDatesMap || {})) {
    if (!monthSelectedDatesMap[k]) continue
    next[k] = true
  }

  return next
}

function replaceMonthSwapPairs(baseSwapPairs, year, monthIndex, monthSwapPairs) {
  const prefix = getMonthPrefix(year, monthIndex)
  const next = []
  const used = Object.create(null)

  if (Array.isArray(baseSwapPairs)) {
    for (const p of baseSwapPairs) {
      if (!p || typeof p !== 'object') continue
      if (!isValidDateStr(p.holiday) || !isValidDateStr(p.swap)) continue
      if (p.holiday.startsWith(prefix) || p.swap.startsWith(prefix)) continue
      if (used[p.holiday] || used[p.swap]) continue
      used[p.holiday] = true
      used[p.swap] = true
      next.push({ holiday: p.holiday, swap: p.swap })
    }
  }

  if (Array.isArray(monthSwapPairs)) {
    for (const p of monthSwapPairs) {
      if (!p || typeof p !== 'object') continue
      if (!isValidDateStr(p.holiday) || !isValidDateStr(p.swap)) continue
      if (used[p.holiday] || used[p.swap]) continue
      used[p.holiday] = true
      used[p.swap] = true
      next.push({ holiday: p.holiday, swap: p.swap })
    }
  }

  next.sort((a, b) => (a.holiday < b.holiday ? -1 : a.holiday > b.holiday ? 1 : 0))
  return next
}

module.exports = {
  SHARE_VERSION,
  getMonthPrefix,
  extractSelectedDaysForMonth,
  extractSwapPairsForMonth,
  encodeSwapPairsForMonth,
  decodeSwapPairsFromMonth,
  buildShareQuery,
  buildSharePath,
  parseSharedOptions,
  replaceMonthSelection,
  replaceMonthSwapPairs,
}

