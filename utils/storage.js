const { isValidDateStr } = require('./date')

const CURRENT_VERSION = 1

const STORAGE_KEYS = {
  selectedDates: 'ayi_calendar_salary_selectedDates',
  monthlySalary: 'ayi_calendar_salary_monthlySalary',
  workDays: 'ayi_calendar_salary_workDays',
  version: 'ayi_calendar_salary_version',
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
  let monthlySalary = ''
  let workDays = ''

  try {
    version = wx.getStorageSync(STORAGE_KEYS.version)
    selectedDatesRaw = wx.getStorageSync(STORAGE_KEYS.selectedDates)
    monthlySalary = normalizeNumberish(wx.getStorageSync(STORAGE_KEYS.monthlySalary))
    workDays = normalizeNumberish(wx.getStorageSync(STORAGE_KEYS.workDays))
  } catch (e) {
    return {
      version: null,
      versionMismatch: false,
      selectedDates: [],
      monthlySalary: '',
      workDays: '',
      droppedCount: 0,
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

  const versionMismatch =
    version != null && Number(version) !== Number(CURRENT_VERSION)

  return {
    version: version == null ? null : Number(version),
    versionMismatch,
    selectedDates,
    monthlySalary,
    workDays,
    droppedCount,
  }
}

function saveState(state) {
  const selectedDatesMap =
    (state && state.selectedDatesMap) || Object.create(null)
  const monthlySalary = normalizeNumberish(state && state.monthlySalary)
  const workDays = normalizeNumberish(state && state.workDays)

  const selectedDates = Object.keys(selectedDatesMap)
    .filter((k) => selectedDatesMap[k])
    .filter(isValidDateStr)
    .sort()

  wx.setStorageSync(STORAGE_KEYS.selectedDates, selectedDates)
  wx.setStorageSync(STORAGE_KEYS.monthlySalary, monthlySalary)
  wx.setStorageSync(STORAGE_KEYS.workDays, workDays)
  wx.setStorageSync(STORAGE_KEYS.version, CURRENT_VERSION)

  return { selectedDatesCount: selectedDates.length }
}

function clearState() {
  wx.removeStorageSync(STORAGE_KEYS.selectedDates)
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
}
