function pad2(n) {
  const s = String(n)
  return s.length >= 2 ? s : '0' + s
}

function formatDateStr(year, monthIndex, day) {
  return `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`
}

function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate()
}

function weekdayOf(year, monthIndex, day) {
  return new Date(year, monthIndex, day).getDay()
}

function isValidDateStr(dateStr) {
  if (typeof dateStr !== 'string') return false
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false
  const y = Number(dateStr.slice(0, 4))
  const m = Number(dateStr.slice(5, 7))
  const d = Number(dateStr.slice(8, 10))
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return false
  const dt = new Date(y, m - 1, d)
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d
}

function parseWeekday(dateStr) {
  if (!isValidDateStr(dateStr)) return null
  const y = Number(dateStr.slice(0, 4))
  const m = Number(dateStr.slice(5, 7))
  const d = Number(dateStr.slice(8, 10))
  return new Date(y, m - 1, d).getDay()
}

module.exports = {
  pad2,
  formatDateStr,
  daysInMonth,
  weekdayOf,
  parseWeekday,
  isValidDateStr,
}
