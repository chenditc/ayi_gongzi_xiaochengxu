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
  replaceMonthSwapPairs,
  extractSwapPairsForMonth,
} = require('../../utils/share')

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']
const WEEKDAY_LABELS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']

const GUIDE_SEEN_KEY = 'ayi_calendar_salary_guide_seen'
const GUIDE_STEPS = [
  { selector: '#calendarArea', text: '点击选择上工的日期，自动计算工资' },
  { selector: '#weekHeader', text: '点击这里，批量选择或取消' },
  { selector: '#pairBtn', text: '协商调休：把节假日上班和工作日休息配成一对，抵消双倍工资' },
  { selector: '#shareBtn', text: '点击这里，发送本页内容给其他人' },
]

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

function buildCalendar(year, monthIndex, selectedDatesMap, swapPartnerMap, swapHolidaySet, pairingFirstDate) {
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
        isSwapHoliday: false,
        isSwapSwap: false,
        swapPartnerDay: '',
        pairingFirstSelected: false,
      })
      continue
    }

    const day = i - firstWeekday + 1
    const dateStr = formatDateStr(year, monthIndex, day)
    const selected = !!(selectedDatesMap && selectedDatesMap[dateStr])
    const isHoliday = isStatutoryHoliday(dateStr)
    const holidayName = isHoliday ? getHolidayName(dateStr) : ''
    const partner = swapPartnerMap && swapPartnerMap[dateStr]
    const isSwapHoliday = !!(swapHolidaySet && swapHolidaySet[dateStr])
    const isSwapSwap = !!partner && !isSwapHoliday
    let swapPartnerDay = ''
    if (partner) {
      const pday = Number(partner.slice(8, 10))
      if (Number.isFinite(pday)) swapPartnerDay = String(pday)
    }
    cells.push({
      empty: false,
      day,
      dateStr,
      weekdayIndex: i % 7,
      selected,
      isHoliday,
      holidayName,
      isHolidayWorked: isHoliday && selected && !isSwapHoliday,
      isSwapHoliday,
      isSwapSwap,
      swapPartnerDay,
      pairingFirstSelected: !!(pairingFirstDate && pairingFirstDate === dateStr),
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
      if (c.isSwapSwap) continue
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

function buildSelectedDatesDisplay(selectedDatesMap, year, monthIndex, swapHolidaySet) {
  const prefix = `${year}-${pad2(monthIndex + 1)}-`
  const keys = Object.keys(selectedDatesMap || {})
    .filter((k) => selectedDatesMap[k])
    .filter((k) => k.startsWith(prefix))
  keys.sort()
  return keys.map((dateStr) => {
    const wd = parseWeekday(dateStr)
    const isHoliday = isStatutoryHoliday(dateStr)
    const isSwapHoliday = !!(swapHolidaySet && swapHolidaySet[dateStr])
    const holidayName = isHoliday ? getHolidayName(dateStr) : ''
    let tag
    if (isHoliday && isSwapHoliday) tag = '调休上工'
    else if (isHoliday) tag = '节假日加班'
    else tag = '工作日上工'
    const holidayPart = holidayName ? ` ${holidayName}` : ''
    return {
      dateStr,
      weekdayLabel: wd == null ? '' : WEEKDAY_LABELS[wd],
      isHoliday,
      isSwapHoliday,
      holidayName,
      tag,
      displayText: `${dateStr} ${wd == null ? '' : WEEKDAY_LABELS[wd]}${holidayPart}（${tag}）`,
    }
  })
}

function buildSwapPairsDisplay(swapPairsForMonth) {
  return (swapPairsForMonth || []).map((p) => {
    const hWd = parseWeekday(p.holiday)
    const sWd = parseWeekday(p.swap)
    const holidayName = getHolidayName(p.holiday) || ''
    const hLabel = `${p.holiday.slice(5)}${hWd == null ? '' : ' ' + WEEKDAY_LABELS[hWd]}${holidayName ? ' ' + holidayName : ''}`
    const sLabel = `${p.swap.slice(5)}${sWd == null ? '' : ' ' + WEEKDAY_LABELS[sWd]}`
    return {
      holiday: p.holiday,
      swap: p.swap,
      displayText: `${hLabel}  ↔  ${sLabel}`,
    }
  })
}

function buildSwapMaps(swapPairsForMonth) {
  const swapHolidaySet = Object.create(null)
  const swapSwapSet = Object.create(null)
  const swapPartnerMap = Object.create(null)
  for (const p of swapPairsForMonth || []) {
    swapHolidaySet[p.holiday] = true
    swapSwapSet[p.swap] = true
    swapPartnerMap[p.holiday] = p.swap
    swapPartnerMap[p.swap] = p.holiday
  }
  return { swapHolidaySet, swapSwapSet, swapPartnerMap }
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
    swapPairs: [],
    swapPairsDisplay: [],
    monthlySalary: '8000',
    workDays: '26',
    workedCount: 0,
    holidayPaidCount: 0,
    holidayWorkedCount: 0,
    swapPairsCount: 0,
    payUnits: 0,
    salaryResult: 0,
    salaryResultText: '0.00',
    resultText:
      '预估工资 = (工作日上工0天 + 法定节假日带薪0天 + 节假日加班0天×2) / 应出勤26天 × 月薪8000 = 0.00',
    weekdayColumnAllSelected: [false, false, false, false, false, false, false],
    storageStatus: '未保存',
    showSelectedList: false,
    selectedDatesDisplay: [],

    // Pairing mode state
    pairingMode: false,
    pairingFirstDate: '',
    pairingHint: '',
    showSwapList: false,

    // First-time guide (coach marks)
    guideVisible: false,
    guideStep: 0,
    guideText: '',
    guideButtonText: '',
    guideRect: { left: 0, top: 0, width: 0, height: 0 }, // px
    guideMask: { top: '', left: '', right: '', bottom: '' }, // style strings
    guideTipStyle: '',
    guideViewport: { w: 0, h: 0 },
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
    const swapPairs = loaded.swapPairs || []

    const shared = parseSharedOptions(options)
    if (shared.ok) {
      initYear = shared.year
      initMonthIndex = shared.monthIndex
      const merged = replaceMonthSelection(map, shared.year, shared.monthIndex, shared.selectedDatesMap)
      const mergedSwap = replaceMonthSwapPairs(
        swapPairs,
        shared.year,
        shared.monthIndex,
        shared.swapPairs
      )
      // Strip selection on swap targets (defensive: swap targets must remain unselected)
      for (const p of mergedSwap) {
        if (merged[p.swap]) delete merged[p.swap]
      }
      const shareMonthlySalary = shared.monthlySalary !== '' ? shared.monthlySalary : monthlySalary
      const shareWorkDays = shared.workDays !== '' ? shared.workDays : workDays
      this._applyState(
        {
          year: initYear,
          monthIndex: initMonthIndex,
          selectedDatesMap: merged,
          swapPairs: mergedSwap,
          monthlySalary: shareMonthlySalary,
          workDays: shareWorkDays,
        },
        { save: true }
      )
      this.setData({ storageStatus: `已从分享加载并保存 ${nowTimeText()}` })
      wx.nextTick(() => this._maybeShowGuide())
      return
    }

    this._applyState(
      {
        year: initYear,
        monthIndex: initMonthIndex,
        selectedDatesMap: map,
        swapPairs,
        monthlySalary,
        workDays,
        storageStatus:
          loaded.selectedDates.length || loaded.monthlySalary || loaded.workDays || swapPairs.length
            ? `已加载 ${nowTimeText()}`
            : '未保存',
      },
      { save: false }
    )
    wx.nextTick(() => this._maybeShowGuide())
  },

  _getViewport() {
    let info = null
    try {
      info = wx.getSystemInfoSync()
    } catch (e) {}
    const w = (info && Number(info.windowWidth)) || 375
    const h = (info && Number(info.windowHeight)) || 667
    const viewport = { w, h }
    this.setData({ guideViewport: viewport })
    return viewport
  },

  _measureTargetRect(targetSelector) {
    return new Promise((resolve) => {
      try {
        wx.createSelectorQuery()
          .in(this)
          .select(targetSelector)
          .boundingClientRect()
          .exec((res) => resolve((res && res[0]) || null))
      } catch (e) {
        resolve(null)
      }
    })
  },

  _computeGuideLayout(rect, viewport) {
    const vw = viewport && Number(viewport.w) ? viewport.w : 375
    const vh = viewport && Number(viewport.h) ? viewport.h : 667

    const r =
      rect && Number.isFinite(rect.left) && Number.isFinite(rect.top) && Number.isFinite(rect.width)
        ? rect
        : {
            left: Math.max(12, Math.floor((vw - 200) / 2)),
            top: Math.max(12, Math.floor((vh - 80) / 2)),
            width: Math.min(200, vw - 24),
            height: 80,
          }

    const pad = 6
    const left = Math.max(0, Math.floor(r.left - pad))
    const top = Math.max(0, Math.floor(r.top - pad))
    const right = Math.min(vw, Math.ceil(r.left + r.width + pad))
    const bottom = Math.min(vh, Math.ceil(r.top + r.height + pad))
    const width = Math.max(0, right - left)
    const height = Math.max(0, bottom - top)

    const spot = { left, top, width, height }

    const maskTopH = Math.max(0, top)
    const maskBottomTop = Math.max(0, top + height)
    const maskBottomH = Math.max(0, vh - maskBottomTop)
    const maskLeftW = Math.max(0, left)
    const maskRightLeft = Math.max(0, left + width)
    const maskRightW = Math.max(0, vw - maskRightLeft)

    const guideMask = {
      top: `left:0px;top:0px;width:${vw}px;height:${maskTopH}px;`,
      left: `left:0px;top:${top}px;width:${maskLeftW}px;height:${height}px;`,
      right: `left:${maskRightLeft}px;top:${top}px;width:${maskRightW}px;height:${height}px;`,
      bottom: `left:0px;top:${maskBottomTop}px;width:${vw}px;height:${maskBottomH}px;`,
    }

    // Tip positioning (simple estimate, px)
    const tipWidth = Math.max(0, Math.min(320, vw - 24))
    const tipHeightEst = 130
    const preferBelowTop = bottom + 12
    let tipTop = preferBelowTop
    if (preferBelowTop + tipHeightEst > vh) {
      tipTop = Math.max(12, top - tipHeightEst - 12)
    }
    tipTop = Math.min(Math.max(12, tipTop), Math.max(12, vh - tipHeightEst - 12))

    const centerX = left + width / 2
    let tipLeft = Math.floor(centerX - tipWidth / 2)
    tipLeft = Math.min(Math.max(12, tipLeft), Math.max(12, vw - tipWidth - 12))

    const guideTipStyle = `left:${tipLeft}px;top:${tipTop}px;width:${tipWidth}px;`

    return { guideRect: spot, guideMask, guideTipStyle }
  },

  _renderGuideStep(stepIndex) {
    const idx = Number(stepIndex)
    if (!Number.isFinite(idx) || idx < 0 || idx >= GUIDE_STEPS.length) return

    const step = GUIDE_STEPS[idx]
    this.setData({
      guideStep: idx,
      guideText: step.text,
      guideButtonText: idx === GUIDE_STEPS.length - 1 ? '知道了' : '下一步',
    })

    wx.nextTick(() => {
      if (!this.data.guideVisible) return
      const viewport =
        this.data.guideViewport && this.data.guideViewport.w
          ? this.data.guideViewport
          : this._getViewport()

      this._measureTargetRect(step.selector).then((rect) => {
        const layout = this._computeGuideLayout(rect, viewport)
        this.setData(layout)
      })
    })
  },

  _maybeShowGuide() {
    let seen = false
    try {
      seen = !!wx.getStorageSync(GUIDE_SEEN_KEY)
    } catch (e) {}
    if (seen) return
    if (this.data.guideVisible) return

    this._getViewport()
    this.setData({ guideVisible: true })
    this._renderGuideStep(0)
  },

  onGuideCatch() {},

  onGuideNext() {
    const cur = Number(this.data.guideStep) || 0
    if (cur < GUIDE_STEPS.length - 1) {
      this._renderGuideStep(cur + 1)
      return
    }
    try {
      wx.setStorageSync(GUIDE_SEEN_KEY, '1')
    } catch (e) {}
    this.setData({ guideVisible: false })
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
    const swapPairs = partial.swapPairs != null ? partial.swapPairs : this.data.swapPairs
    const pairingFirstDate =
      partial.pairingFirstDate != null ? partial.pairingFirstDate : this.data.pairingFirstDate

    const swapPairsForMonth = extractSwapPairsForMonth(swapPairs, year, monthIndex)
    const { swapHolidaySet, swapSwapSet, swapPartnerMap } = buildSwapMaps(swapPairsForMonth)

    const calendarCells = buildCalendar(
      year,
      monthIndex,
      selectedDatesMap,
      swapPartnerMap,
      swapHolidaySet,
      pairingFirstDate
    )
    const holidayList = listStatutoryHolidaysForMonth(year, monthIndex)
    const holidaySet = Object.create(null)
    for (const h of holidayList) holidaySet[h.dateStr] = true

    // holidayPaidCount: untouched holidays + swap targets (acting as paid rest)
    let holidayPaidCount = 0
    for (const h of holidayList) {
      if (!swapHolidaySet[h.dateStr]) holidayPaidCount += 1
    }
    holidayPaidCount += swapPairsForMonth.length

    const monthPrefix = `${year}-${pad2(monthIndex + 1)}-`
    let holidayWorkedCount = 0
    let workedCount = 0
    for (const dateStr of Object.keys(selectedDatesMap || {})) {
      if (!selectedDatesMap[dateStr]) continue
      if (!dateStr.startsWith(monthPrefix)) continue
      if (swapSwapSet[dateStr]) continue // defensive: swap targets aren't selectable
      if (holidaySet[dateStr]) {
        if (swapHolidaySet[dateStr]) workedCount += 1
        else holidayWorkedCount += 1
      } else {
        workedCount += 1
      }
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
    const selectedDatesDisplay = buildSelectedDatesDisplay(
      selectedDatesMap,
      year,
      monthIndex,
      swapHolidaySet
    )
    const swapPairsDisplay = buildSwapPairsDisplay(swapPairsForMonth)

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
      swapPairs,
      swapPairsCount: swapPairsForMonth.length,
      swapPairsDisplay,
      payUnits,
      salaryResult: salaryComputed.salaryResult,
      salaryResultText: salaryComputed.salaryResultText,
      resultText: salaryComputed.resultText,
      weekdayColumnAllSelected,
      selectedDatesDisplay,
      pairingFirstDate,
    }

    if (options.save) {
      saveState({ selectedDatesMap, swapPairs, monthlySalary, workDays })
      patch.storageStatus = `已保存 ${nowTimeText()}`
    }

    this.setData(patch)
  },

  _exitPairingModeIfActive() {
    if (this.data.pairingMode || this.data.pairingFirstDate) {
      this.setData({ pairingMode: false, pairingFirstDate: '' })
    }
  },

  _swapPartnerOf(dateStr) {
    for (const p of this.data.swapPairs || []) {
      if (p.holiday === dateStr) return p
      if (p.swap === dateStr) return p
    }
    return null
  },

  onPrevMonth() {
    let y = this.data.year
    let m = this.data.monthIndex - 1
    if (m < 0) {
      m = 11
      y -= 1
    }
    this._exitPairingModeIfActive()
    this._applyState({ year: y, monthIndex: m, pairingFirstDate: '' }, { save: false })
  },

  onNextMonth() {
    let y = this.data.year
    let m = this.data.monthIndex + 1
    if (m > 11) {
      m = 0
      y += 1
    }
    this._exitPairingModeIfActive()
    this._applyState({ year: y, monthIndex: m, pairingFirstDate: '' }, { save: false })
  },

  onTogglePairingMode() {
    if (this.data.pairingMode) {
      this.setData({ pairingMode: false, pairingFirstDate: '' })
      this._applyState({ pairingFirstDate: '' }, { save: false })
      return
    }
    const monthHasHoliday = listStatutoryHolidaysForMonth(this.data.year, this.data.monthIndex).length > 0
    if (!monthHasHoliday) {
      wx.showToast({ title: '本月无法定节假日', icon: 'none' })
      return
    }
    this.setData({ pairingMode: true, pairingFirstDate: '' })
  },

  _handlePairingTap(dateStr) {
    const monthPrefix = `${this.data.year}-${pad2(this.data.monthIndex + 1)}-`
    if (!dateStr.startsWith(monthPrefix)) {
      wx.showToast({ title: '只能配对当前月份', icon: 'none' })
      return
    }

    const inPair = this._swapPartnerOf(dateStr)
    if (inPair) {
      wx.showToast({ title: '该日期已在调休中，请先解除', icon: 'none' })
      return
    }

    const isHoliday = isStatutoryHoliday(dateStr)
    const first = this.data.pairingFirstDate

    if (!first) {
      if (!isHoliday) {
        wx.showToast({ title: '请先选一个法定节假日', icon: 'none' })
        return
      }
      this._applyState({ pairingFirstDate: dateStr }, { save: false })
      return
    }

    if (dateStr === first) {
      this._applyState({ pairingFirstDate: '' }, { save: false })
      return
    }

    if (isHoliday) {
      wx.showToast({ title: '请选一个非节假日来调休', icon: 'none' })
      return
    }

    const newPair = { holiday: first, swap: dateStr }
    const nextSwapPairs = [...(this.data.swapPairs || []), newPair]
    nextSwapPairs.sort((a, b) => (a.holiday < b.holiday ? -1 : a.holiday > b.holiday ? 1 : 0))

    const nextSelected = { ...(this.data.selectedDatesMap || {}) }
    if (nextSelected[dateStr]) delete nextSelected[dateStr]

    this.setData({ pairingMode: false })
    this._applyState(
      {
        swapPairs: nextSwapPairs,
        selectedDatesMap: nextSelected,
        pairingFirstDate: '',
      },
      { save: true }
    )
    wx.showToast({
      title: `已配对：${first.slice(5)} ↔ ${dateStr.slice(5)}`,
      icon: 'none',
      duration: 2000,
    })
  },

  onRemoveSwapPair(e) {
    const holiday = e.currentTarget.dataset.holiday
    if (!holiday) return
    const target = (this.data.swapPairs || []).find((p) => p.holiday === holiday)
    if (!target) return
    const summary = `${target.holiday.slice(5)} ↔ ${target.swap.slice(5)}`
    wx.showModal({
      title: '解除调休？',
      content: `解除「${summary}」后，这两天将恢复为原始状态。`,
      confirmText: '解除',
      confirmColor: '#862e9c',
      success: (res) => {
        if (!res.confirm) return
        const next = (this.data.swapPairs || []).filter((p) => p.holiday !== holiday)
        this._applyState({ swapPairs: next }, { save: true })
      },
    })
  },

  onToggleSwapList() {
    this.setData({ showSwapList: !this.data.showSwapList })
  },

  onToggleDay(e) {
    const dateStr = e.currentTarget.dataset.datestr
    if (!dateStr) return

    if (this.data.pairingMode) {
      this._handlePairingTap(dateStr)
      return
    }

    const partner = this._swapPartnerOf(dateStr)
    if (partner && partner.swap === dateStr) {
      wx.showToast({ title: '调休休息日不可上工', icon: 'none' })
      return
    }

    const wasSelected = !!(this.data.selectedDatesMap && this.data.selectedDatesMap[dateStr])
    const next = { ...(this.data.selectedDatesMap || {}) }
    if (next[dateStr]) delete next[dateStr]
    else next[dateStr] = true

    const isSwapHoliday = !!(partner && partner.holiday === dateStr)
    if (!wasSelected && isStatutoryHoliday(dateStr) && !isSwapHoliday && !this._holidayWorkToastShown) {
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
    if (this.data.pairingMode) return

    const y = this.data.year
    const m = this.data.monthIndex
    const days = daysInMonth(y, m)
    const next = { ...(this.data.selectedDatesMap || {}) }

    const isAllSelected = !!this.data.weekdayColumnAllSelected[weekdayIndex]
    const swapTargets = Object.create(null)
    for (const p of this.data.swapPairs || []) swapTargets[p.swap] = true

    for (let day = 1; day <= days; day += 1) {
      if (weekdayOf(y, m, day) !== weekdayIndex) continue
      const dateStr = formatDateStr(y, m, day)
      if (swapTargets[dateStr]) continue
      if (isAllSelected) delete next[dateStr]
      else next[dateStr] = true
    }

    this._applyState({ selectedDatesMap: next }, { save: true })
  },

  onSelectAllMonth() {
    if (this.data.pairingMode) return
    const y = this.data.year
    const m = this.data.monthIndex
    const days = daysInMonth(y, m)
    const next = { ...(this.data.selectedDatesMap || {}) }
    const swapTargets = Object.create(null)
    for (const p of this.data.swapPairs || []) swapTargets[p.swap] = true
    for (let day = 1; day <= days; day += 1) {
      const dateStr = formatDateStr(y, m, day)
      if (swapTargets[dateStr]) continue
      next[dateStr] = true
    }
    this._applyState({ selectedDatesMap: next }, { save: true })
  },

  onDeselectAllMonth() {
    if (this.data.pairingMode) return
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
      content: '会清空已保存的选择日期、月薪、应出勤天数和调休配对，并恢复默认值。',
      confirmText: '重新选择',
      confirmColor: '#e64646',
      success: (res) => {
        if (!res.confirm) return
        clearState()
        this.setData({ pairingMode: false, pairingFirstDate: '' })
        this._applyState(
          {
            selectedDatesMap: {},
            swapPairs: [],
            monthlySalary: '8000',
            workDays: '26',
            storageStatus: `已重置 ${nowTimeText()}`,
            pairingFirstDate: '',
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
      swapPairs: this.data.swapPairs,
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
      swapPairs: this.data.swapPairs,
      monthlySalary: this.data.monthlySalary,
      workDays: this.data.workDays,
    })
    return { title, query }
  },
})
