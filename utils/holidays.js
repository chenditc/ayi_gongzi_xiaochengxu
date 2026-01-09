const { pad2 } = require('./date')

// 仅收录：法定节假日（300%工资）日期（2026）
// 数据来源：2026_vacation.md
const HOLIDAY_NAME_BY_DATE = Object.freeze({
  '2026-01-01': '元旦',

  '2026-02-16': '春节',
  '2026-02-17': '春节',
  '2026-02-18': '春节',
  '2026-02-19': '春节',

  '2026-04-04': '清明节',

  '2026-05-01': '劳动节',
  '2026-05-02': '劳动节',

  '2026-06-19': '端午节',

  '2026-09-25': '中秋节',

  '2026-10-01': '国庆节',
  '2026-10-02': '国庆节',
  '2026-10-03': '国庆节',
})

function isStatutoryHoliday(dateStr) {
  return !!(dateStr && HOLIDAY_NAME_BY_DATE[dateStr])
}

function getHolidayName(dateStr) {
  return (dateStr && HOLIDAY_NAME_BY_DATE[dateStr]) || ''
}

function listStatutoryHolidaysForMonth(year, monthIndex) {
  if (!Number.isFinite(year) || !Number.isFinite(monthIndex)) return []
  if (monthIndex < 0 || monthIndex > 11) return []
  const prefix = `${year}-${pad2(monthIndex + 1)}-`
  const res = []
  for (const dateStr of Object.keys(HOLIDAY_NAME_BY_DATE)) {
    if (!dateStr.startsWith(prefix)) continue
    res.push({ dateStr, name: HOLIDAY_NAME_BY_DATE[dateStr] })
  }
  res.sort((a, b) => (a.dateStr < b.dateStr ? -1 : a.dateStr > b.dateStr ? 1 : 0))
  return res
}

module.exports = {
  isStatutoryHoliday,
  getHolidayName,
  listStatutoryHolidaysForMonth,
}

