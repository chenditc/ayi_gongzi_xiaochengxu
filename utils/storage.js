const { isValidDateStr } = require('./date')

const CURRENT_VERSION = 1

const STORAGE_KEYS = {
  selectedDates: 'ayi_calendar_salary_selectedDates',
  monthlySalary: 'ayi_calendar_salary_monthlySalary',
  workDays: 'ayi_calendar_salary_workDays',
  swapPairs: 'ayi_calendar_salary_swapPairs',
  version: 'ayi_calendar_salary_version',
}

function sameYearMonth(a, b) {
  return (
    typeof a === 'string' &&
    typeof b === 'string' &&
    a.length >= 7 &&
    b.length >= 7 &&
    a.slice(0, 7) === b.slice(0, 7)
  )
}

function sanitizeSwapPairs(rawPairs) {
  const out = []
  let dropped = 0
  if (!Array.isArray(rawPairs)) {
    if (rawPairs != null && rawPairs !== '') dropped += 1
    return { pairs: out, dropped }
  }
  const usedDates = Object.create(null)
  for (const item of rawPairs) {
    if (!item || typeof item !== 'object') {
      dropped += 1
      continue
    }
    const holiday = item.holiday
    const swap = item.swap
    if (!isValidDateStr(holiday) || !isValidDateStr(swap)) {
      dropped += 1
      continue
    }
    if (holiday === swap) {
      dropped += 1
      continue
    }
    if (!sameYearMonth(holiday, swap)) {
      dropped += 1
      continue
    }
    if (usedDates[holiday] || usedDates[swap]) {
      dropped += 1
      continue
    }
    usedDates[holiday] = true
    usedDates[swap] = true
    out.push({ holiday, swap })
  }
  out.sort((a, b) => (a.holiday < b.holiday ? -1 : a.holiday > b.holiday ? 1 : 0))
  return { pairs: out, dropped }
}

function normalizeNumberish(v) {
  if (v == null) return ''
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : ''
  if (typeof v === 'string') return v
  return ''
}

function loadState() {
  let version = null
  let selectedDatesRaw = null
  let swapPairsRaw = null
  let monthlySalary = ''
  let workDays = ''

  try {
    version = wx.getStorageSync(STORAGE_KEYS.version)
    selectedDatesRaw = wx.getStorageSync(STORAGE_KEYS.selectedDates)
    swapPairsRaw = wx.getStorageSync(STORAGE_KEYS.swapPairs)
    monthlySalary = normalizeNumberish(wx.getStorageSync(STORAGE_KEYS.monthlySalary))
    workDays = normalizeNumberish(wx.getStorageSync(STORAGE_KEYS.workDays))
  } catch (e) {
    return {
      version: null,
      versionMismatch: false,
      selectedDates: [],
      swapPairs: [],
      monthlySalary: '',
      workDays: '',
      droppedCount: 0,
      droppedSwapPairsCount: 0,
    }
  }

  const selectedDates = []
  const seen = Object.create(null)
  let droppedCount = 0

  if (Array.isArray(selectedDatesRaw)) {
    for (const d of selectedDatesRaw) {
      if (!isValidDateStr(d)) {
        droppedCount += 1
        continue
      }
      if (seen[d]) continue
      seen[d] = true
      selectedDates.push(d)
    }
  } else if (selectedDatesRaw != null && selectedDatesRaw !== '') {
    droppedCount += 1
  }

  selectedDates.sort()

  const swapResult = sanitizeSwapPairs(swapPairsRaw)

  const versionMismatch =
    version != null && Number(version) !== Number(CURRENT_VERSION)

  return {
    version: version == null ? null : Number(version),
    versionMismatch,
    selectedDates,
    swapPairs: swapResult.pairs,
    monthlySalary,
    workDays,
    droppedCount,
    droppedSwapPairsCount: swapResult.dropped,
  }
}

function saveState(state) {
  const selectedDatesMap =
    (state && state.selectedDatesMap) || Object.create(null)
  const monthlySalary = normalizeNumberish(state && state.monthlySalary)
  const workDays = normalizeNumberish(state && state.workDays)
  const swapPairsResult = sanitizeSwapPairs(state && state.swapPairs)

  const selectedDates = Object.keys(selectedDatesMap)
    .filter((k) => selectedDatesMap[k])
    .filter(isValidDateStr)
    .sort()

  wx.setStorageSync(STORAGE_KEYS.selectedDates, selectedDates)
  wx.setStorageSync(STORAGE_KEYS.swapPairs, swapPairsResult.pairs)
  wx.setStorageSync(STORAGE_KEYS.monthlySalary, monthlySalary)
  wx.setStorageSync(STORAGE_KEYS.workDays, workDays)
  wx.setStorageSync(STORAGE_KEYS.version, CURRENT_VERSION)

  return {
    selectedDatesCount: selectedDates.length,
    swapPairsCount: swapPairsResult.pairs.length,
  }
}

function clearState() {
  wx.removeStorageSync(STORAGE_KEYS.selectedDates)
  wx.removeStorageSync(STORAGE_KEYS.swapPairs)
  wx.removeStorageSync(STORAGE_KEYS.monthlySalary)
  wx.removeStorageSync(STORAGE_KEYS.workDays)
  wx.removeStorageSync(STORAGE_KEYS.version)
}

module.exports = {
  CURRENT_VERSION,
  STORAGE_KEYS,
  loadState,
  saveState,
  clearState,
  sanitizeSwapPairs,
}
