const {
  pad2,
  formatDateStr,
  daysInMonth,
  weekdayOf,
  parseWeekday,
} = require('../../utils/date')
const { loadState, saveState, clearState } = require('../../utils/storage')
const {
  isStatutoryHoliday,
  getHolidayName,
  listStatutoryHolidaysForMonth,
} = require('../../utils/holidays')
const {
  buildSharePath,
  buildShareQuery,
  parseSharedOptions,
  replaceMonthSelection,
} = require('../../utils/share')

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']
const WEEKDAY_LABELS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']

function nowTimeText() {
  const d = new Date()
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
}

function clampInt(n, min, max) {
  if (!Number.isFinite(n)) return min
  const x = Math.floor(n)
  if (x < min) return min
  if (x > max) return max
  return x
}

function buildCalendar(year, monthIndex, selectedDatesMap) {
  const firstWeekday = new Date(year, monthIndex, 1).getDay()
  const days = daysInMonth(year, monthIndex)
  const cells = []

  for (let i = 0; i < 42; i += 1) {
    if (i < firstWeekday || i >= firstWeekday + days) {
      cells.push({
        empty: true,
        day: null,
        dateStr: null,
        weekdayIndex: i % 7,
        selected: false,
        isHoliday: false,
        holidayName: '',
        isHolidayWorked: false,
      })
      continue
    }

    const day = i - firstWeekday + 1
    const dateStr = formatDateStr(year, monthIndex, day)
    const selected = !!(selectedDatesMap && selectedDatesMap[dateStr])
    const isHoliday = isStatutoryHoliday(dateStr)
    const holidayName = isHoliday ? getHolidayName(dateStr) : ''
    cells.push({
      empty: false,
      day,
      dateStr,
      weekdayIndex: i % 7,
      selected,
      isHoliday,
      holidayName,
      isHolidayWorked: isHoliday && selected,
    })
  }

  return cells
}

function computeWeekdayColumnAllSelected(cells) {
  const res = []
  for (let weekday = 0; weekday < 7; weekday += 1) {
    let any = false
    let all = true
    for (let i = weekday; i < 42; i += 7) {
      const c = cells[i]
      if (!c || c.empty) continue
      any = true
      if (!c.selected) {
        all = false
        break
      }
    }
    res.push(any && all)
  }
  return res
}

function buildSelectedDatesDisplay(selectedDatesMap, year, monthIndex) {
  const prefix = `${year}-${pad2(monthIndex + 1)}-`
  const keys = Object.keys(selectedDatesMap || {})
    .filter((k) => selectedDatesMap[k])
    .filter((k) => k.startsWith(prefix))
  keys.sort()
  return keys.map((dateStr) => {
    const wd = parseWeekday(dateStr)
    const isHoliday = isStatutoryHoliday(dateStr)
    const holidayName = isHoliday ? getHolidayName(dateStr) : ''
    const tag = isHoliday ? '节假日加班' : '工作日上工'
    const holidayPart = holidayName ? ` ${holidayName}` : ''
    return {
      dateStr,
      weekdayLabel: wd == null ? '' : WEEKDAY_LABELS[wd],
      isHoliday,
      holidayName,
      tag,
      displayText: `${dateStr} ${wd == null ? '' : WEEKDAY_LABELS[wd]}${holidayPart}（${tag}）`,
    }
  })
}

function computeSalaryResult(workedCount, holidayPaidCount, holidayWorkedCount, monthlySalary, workDays) {
  const salary = Number(monthlySalary) || 0
  const workRaw = Number(workDays) || 0
  const work = clampInt(workRaw, 0, 31)
  const payUnits = (Number(workedCount) || 0) + (Number(holidayPaidCount) || 0) + 2 * (Number(holidayWorkedCount) || 0)
  const result = work > 0 ? (payUnits / work) * salary : 0
  const salaryResultText = Number.isFinite(result) ? result.toFixed(2) : '0.00'
  const resultText = `预估工资 = (工作日上工${workedCount}天 + 法定节假日带薪${holidayPaidCount}天 + 节假日加班${holidayWorkedCount}天×2) / 应出勤${work}天 × 月薪${salary} = ${salaryResultText}`
  return { salaryResult: result, salaryResultText, resultText, workDaysClamped: String(work) }
}

Page({
  data: {
    weekdays: WEEKDAYS,
    year: 0,
    monthIndex: 0,
    monthIndexPlus1: 1,
    calendarCells: [],
    selectedDatesMap: {},
    monthlySalary: '8000',
    workDays: '26',
    workedCount: 0,
    holidayPaidCount: 0,
    holidayWorkedCount: 0,
    payUnits: 0,
    salaryResult: 0,
    salaryResultText: '0.00',
    resultText:
      '预估工资 = (工作日上工0天 + 法定节假日带薪0天 + 节假日加班0天×2) / 应出勤26天 × 月薪8000 = 0.00',
    weekdayColumnAllSelected: [false, false, false, false, false, false, false],
    storageStatus: '未保存',
    showSelectedList: false,
    selectedDatesDisplay: [],
  },

  _workDaysRawLast: null,
  _holidayWorkToastShown: false,

  onLoad(options) {
    try {
      wx.showShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] })
    } catch (e) {}

    const today = new Date()
    let initYear = today.getFullYear()
    let initMonthIndex = today.getMonth()

    const loaded = loadState()
    const map = Object.create(null)
    for (const d of loaded.selectedDates) map[d] = true

    if (loaded.droppedCount > 0) {
      wx.showToast({
        title: `已清理无效日期 ${loaded.droppedCount} 条`,
        icon: 'none',
        duration: 2000,
      })
    }

    if (loaded.versionMismatch) {
      wx.showToast({
        title: '检测到旧版本数据，已尝试兼容加载',
        icon: 'none',
        duration: 2000,
      })
    }

    const monthlySalary = loaded.monthlySalary !== '' ? loaded.monthlySalary : '8000'
    const workDays = loaded.workDays !== '' ? loaded.workDays : '26'

    const shared = parseSharedOptions(options)
    if (shared.ok) {
      initYear = shared.year
      initMonthIndex = shared.monthIndex
      const merged = replaceMonthSelection(map, shared.year, shared.monthIndex, shared.selectedDatesMap)
      const shareMonthlySalary = shared.monthlySalary !== '' ? shared.monthlySalary : monthlySalary
      const shareWorkDays = shared.workDays !== '' ? shared.workDays : workDays
      this._applyState(
        {
          year: initYear,
          monthIndex: initMonthIndex,
          selectedDatesMap: merged,
          monthlySalary: shareMonthlySalary,
          workDays: shareWorkDays,
        },
        { save: true }
      )
      this.setData({ storageStatus: `已从分享加载并保存 ${nowTimeText()}` })
      return
    }

    this._applyState(
      {
        year: initYear,
        monthIndex: initMonthIndex,
        selectedDatesMap: map,
        monthlySalary,
        workDays,
        storageStatus: loaded.selectedDates.length || loaded.monthlySalary || loaded.workDays
          ? `已加载 ${nowTimeText()}`
          : '未保存',
      },
      { save: false }
    )
  },

  _applyState(partial, opts) {
    const options = opts || {}
    const year = partial.year != null ? partial.year : this.data.year
    const monthIndex = partial.monthIndex != null ? partial.monthIndex : this.data.monthIndex
    const selectedDatesMap =
      partial.selectedDatesMap != null ? partial.selectedDatesMap : this.data.selectedDatesMap
    const monthlySalary =
      partial.monthlySalary != null ? partial.monthlySalary : this.data.monthlySalary
    const workDays = partial.workDays != null ? partial.workDays : this.data.workDays

    const calendarCells = buildCalendar(year, monthIndex, selectedDatesMap)
    const holidayList = listStatutoryHolidaysForMonth(year, monthIndex)
    const holidaySet = Object.create(null)
    for (const h of holidayList) holidaySet[h.dateStr] = true
    const holidayPaidCount = holidayList.length

    const monthPrefix = `${year}-${pad2(monthIndex + 1)}-`
    let holidayWorkedCount = 0
    let workedCount = 0
    for (const dateStr of Object.keys(selectedDatesMap || {})) {
      if (!selectedDatesMap[dateStr]) continue
      if (!dateStr.startsWith(monthPrefix)) continue
      if (holidaySet[dateStr]) holidayWorkedCount += 1
      else workedCount += 1
    }
    const payUnits = workedCount + holidayPaidCount + 2 * holidayWorkedCount

    const salaryComputed = computeSalaryResult(
      workedCount,
      holidayPaidCount,
      holidayWorkedCount,
      monthlySalary,
      workDays
    )
    const weekdayColumnAllSelected = computeWeekdayColumnAllSelected(calendarCells)
    const selectedDatesDisplay = buildSelectedDatesDisplay(selectedDatesMap, year, monthIndex)

    const patch = {
      ...partial,
      year,
      monthIndex,
      monthIndexPlus1: monthIndex + 1,
      monthlySalary,
      workDays: workDays === '' ? '' : salaryComputed.workDaysClamped,
      calendarCells,
      workedCount,
      holidayPaidCount,
      holidayWorkedCount,
      payUnits,
      salaryResult: salaryComputed.salaryResult,
      salaryResultText: salaryComputed.salaryResultText,
      resultText: salaryComputed.resultText,
      weekdayColumnAllSelected,
      selectedDatesDisplay,
    }

    if (options.save) {
      saveState({ selectedDatesMap, monthlySalary, workDays })
      patch.storageStatus = `已保存 ${nowTimeText()}`
    }

    this.setData(patch)
  },

  onPrevMonth() {
    let y = this.data.year
    let m = this.data.monthIndex - 1
    if (m < 0) {
      m = 11
      y -= 1
    }
    this._applyState({ year: y, monthIndex: m }, { save: false })
  },

  onNextMonth() {
    let y = this.data.year
    let m = this.data.monthIndex + 1
    if (m > 11) {
      m = 0
      y += 1
    }
    this._applyState({ year: y, monthIndex: m }, { save: false })
  },

  onToggleDay(e) {
    const dateStr = e.currentTarget.dataset.datestr
    if (!dateStr) return
    const wasSelected = !!(this.data.selectedDatesMap && this.data.selectedDatesMap[dateStr])
    const next = { ...(this.data.selectedDatesMap || {}) }
    if (next[dateStr]) delete next[dateStr]
    else next[dateStr] = true

    if (!wasSelected && isStatutoryHoliday(dateStr) && !this._holidayWorkToastShown) {
      this._holidayWorkToastShown = true
      wx.showToast({
        title: '已按节假日加班(额外×2)计入',
        icon: 'none',
        duration: 2000,
      })
    }

    this._applyState({ selectedDatesMap: next }, { save: true })
  },

  onToggleWeekdayColumn(e) {
    const weekdayIndex = Number(e.currentTarget.dataset.weekday)
    if (!Number.isFinite(weekdayIndex) || weekdayIndex < 0 || weekdayIndex > 6) return

    const y = this.data.year
    const m = this.data.monthIndex
    const days = daysInMonth(y, m)
    const next = { ...(this.data.selectedDatesMap || {}) }

    const isAllSelected = !!this.data.weekdayColumnAllSelected[weekdayIndex]

    for (let day = 1; day <= days; day += 1) {
      if (weekdayOf(y, m, day) !== weekdayIndex) continue
      const dateStr = formatDateStr(y, m, day)
      if (isAllSelected) delete next[dateStr]
      else next[dateStr] = true
    }

    this._applyState({ selectedDatesMap: next }, { save: true })
  },

  onSelectAllMonth() {
    const y = this.data.year
    const m = this.data.monthIndex
    const days = daysInMonth(y, m)
    const next = { ...(this.data.selectedDatesMap || {}) }
    for (let day = 1; day <= days; day += 1) {
      next[formatDateStr(y, m, day)] = true
    }
    this._applyState({ selectedDatesMap: next }, { save: true })
  },

  onDeselectAllMonth() {
    const y = this.data.year
    const m = this.data.monthIndex
    const days = daysInMonth(y, m)
    const next = { ...(this.data.selectedDatesMap || {}) }
    for (let day = 1; day <= days; day += 1) {
      delete next[formatDateStr(y, m, day)]
    }
    this._applyState({ selectedDatesMap: next }, { save: true })
  },

  onClearStorage() {
    wx.showModal({
      title: '重新选择？',
      content: '会清空已保存的选择日期、月薪和应出勤天数，并恢复默认值。',
      confirmText: '重新选择',
      confirmColor: '#e64646',
      success: (res) => {
        if (!res.confirm) return
        clearState()
        this._applyState(
          {
            selectedDatesMap: {},
            monthlySalary: '8000',
            workDays: '26',
            storageStatus: `已重置 ${nowTimeText()}`,
          },
          { save: false }
        )
        wx.showToast({ title: '已重置', icon: 'success' })
      },
    })
  },

  onSalaryInput(e) {
    const v = e.detail.value
    const next = v === undefined || v === null ? '' : String(v)
    this._applyState({ monthlySalary: next }, { save: true })
  },

  onWorkDaysInput(e) {
    const raw = e.detail.value
    const rawStr = raw === undefined || raw === null ? '' : String(raw)
    this._workDaysRawLast = rawStr

    if (rawStr === '') {
      this._applyState({ workDays: '' }, { save: true })
      return
    }

    const n = Number(rawStr)
    if (!Number.isFinite(n)) {
      this._applyState({ workDays: '' }, { save: true })
      return
    }

    const clamped = clampInt(n, 0, 31)
    this._applyState({ workDays: String(clamped) }, { save: true })
  },

  onWorkDaysBlur() {
    const rawStr = this._workDaysRawLast
    if (rawStr == null || rawStr === '') return
    const n = Number(rawStr)
    if (!Number.isFinite(n)) return
    if (n < 0 || n > 31) {
      wx.showToast({ title: '应出勤范围 0-31，已自动调整', icon: 'none', duration: 2000 })
    }
  },

  onToggleSelectedList() {
    this.setData({ showSelectedList: !this.data.showSelectedList })
  },

  onShareAppMessage() {
    const title = `${this.data.year}年${this.data.monthIndexPlus1}月工资单：￥${this.data.salaryResultText}`
    const path = buildSharePath({
      year: this.data.year,
      monthIndex: this.data.monthIndex,
      selectedDatesMap: this.data.selectedDatesMap,
      monthlySalary: this.data.monthlySalary,
      workDays: this.data.workDays,
    })
    return { title, path }
  },

  onShareTimeline() {
    const title = `${this.data.year}年${this.data.monthIndexPlus1}月工资单：￥${this.data.salaryResultText}`
    const query = buildShareQuery({
      year: this.data.year,
      monthIndex: this.data.monthIndex,
      selectedDatesMap: this.data.selectedDatesMap,
      monthlySalary: this.data.monthlySalary,
      workDays: this.data.workDays,
    })
    return { title, query }
  },
})
