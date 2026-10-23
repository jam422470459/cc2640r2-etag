/**
 * 日历图生成器
 * 移植自 EPD-nRF5 的日历风格功能，适配 TLSR8359 价签的 BWR 取色方式。
 * 只负责绘制日历并写入现有画布，上传仍走原有的 upload_image()。
 */
(function () {
  'use strict';

  var COLORS = { white: '#ffffff', black: '#000000', red: '#ff0000' };
  var FONT_DEFAULTS = { mainDay: 170, title: 28, weekday: 28, cellDay: 24, cellLunar: 13 };
  var LUNAR_DAY_NAMES = [
    '', '初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
    '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
    '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十'
  ];
  var ZODIAC_NAMES = ['鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪'];
  var FESTIVALS = {
    '1-1': '元旦', '2-14': '情人节', '3-8': '妇女节', '5-1': '劳动节', '6-1': '儿童节',
    '10-1': '国庆节', '12-25': '圣诞节'
  };
  var SOLAR_TERMS = [
    [0, 5, '小寒'], [0, 20, '大寒'], [1, 4, '立春'], [1, 19, '雨水'], [2, 5, '惊蛰'], [2, 20, '春分'],
    [3, 4, '清明'], [3, 20, '谷雨'], [4, 5, '立夏'], [4, 21, '小满'], [5, 5, '芒种'], [5, 21, '夏至'],
    [6, 7, '小暑'], [6, 23, '大暑'], [7, 7, '立秋'], [7, 23, '处暑'], [8, 7, '白露'], [8, 23, '秋分'],
    [9, 8, '寒露'], [9, 23, '霜降'], [10, 7, '立冬'], [10, 22, '小雪'], [11, 7, '大雪'], [11, 21, '冬至']
  ];

  var previewTimer = null;
  var lunarFormatter = null;

  function $(id) {
    return document.getElementById(id);
  }

  function getElements() {
    return {
      panel: $('calendar-panel'),
      toggle: $('calendarToggle'),
      preview: $('calendarPreview'),
      layout: $('calendarLayout'),
      fontPreset: $('calendarFontPreset'),
      date: $('calendarDate'),
      weekStart: $('calendarWeekStart'),
      title: $('calendarTitle'),
      accent: $('calendarAccent'),
      lunar: $('calendarLunar'),
      reset: $('calendarFontReset'),
      render: $('calendarRender'),
      send: $('calendarSend'),
      sizes: {
        mainDay: $('calendarFontMainDay'),
        title: $('calendarFontTitle'),
        weekday: $('calendarFontWeekday'),
        cellDay: $('calendarFontCellDay'),
        cellLunar: $('calendarFontCellLunar')
      }
    };
  }

  function getCanvas() {
    return $('canvas');
  }

  function getProfile() {
    var canvas = getCanvas();
    return {
      width: canvas && canvas.width ? canvas.width : 296,
      height: canvas && canvas.height ? canvas.height : 128
    };
  }

  function formatDateInput(date) {
    var month = String(date.getMonth() + 1).padStart(2, '0');
    var day = String(date.getDate()).padStart(2, '0');
    return date.getFullYear() + '-' + month + '-' + day;
  }

  function getSelectedDate() {
    var input = $('calendarDate');
    var value = input && input.value ? input.value : '';
    if (!value) return new Date();
    var parts = value.split('-').map(Number);
    if (!parts[0] || !parts[1] || !parts[2]) return new Date();
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  function getSettings() {
    var elements = getElements();
    var sizes = {};
    Object.keys(FONT_DEFAULTS).forEach(function (role) {
      var input = elements.sizes[role];
      var value = Number(input && input.value);
      sizes[role] = Number.isFinite(value) ? value : FONT_DEFAULTS[role];
    });
    return {
      layout: (elements.layout && elements.layout.value) || 'day',
      fontFamily: (elements.fontPreset && elements.fontPreset.value) || 'Microsoft YaHei, SimHei, sans-serif',
      title: ((elements.title && elements.title.value) || '').trim(),
      accent: (elements.accent && elements.accent.value) || 'red',
      showLunar: !elements.lunar || elements.lunar.checked !== false,
      weekStart: elements.weekStart ? Number(elements.weekStart.value) || 0 : 1,
      sizes: sizes
    };
  }

  function getColors(settings) {
    return {
      white: COLORS.white,
      black: COLORS.black,
      accent: settings.accent === 'black' ? COLORS.black : COLORS.red
    };
  }

  function getScale(profile) {
    return Math.max(0.16, Math.min(profile.width / 768, profile.height / 552));
  }

  function fontSize(settings, role, profile, multiplier) {
    var base = settings.sizes[role] || FONT_DEFAULTS[role];
    return Math.max(6, Math.round(base * getScale(profile) * (multiplier || 1)));
  }

  function getLunarInfo(date) {
    try {
      if (!lunarFormatter) {
        lunarFormatter = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', {
          year: 'numeric', month: 'long', day: 'numeric'
        });
      }
      var parts = lunarFormatter.formatToParts(date);
      var valueOf = function (type) {
        var found = parts.find(function (part) { return part.type === type; });
        return found ? found.value : '';
      };
      var dayNumber = parseInt(valueOf('day'), 10) || 1;
      var relatedYear = parseInt(valueOf('relatedYear'), 10) || date.getFullYear();
      var month = valueOf('month');
      var day = LUNAR_DAY_NAMES[dayNumber] || String(dayNumber);
      var zodiac = ZODIAC_NAMES[((relatedYear - 4) % 12 + 12) % 12];
      return {
        month: month,
        day: day,
        dayNumber: dayNumber,
        dateText: month + day,
        yearText: valueOf('yearName') + zodiac + '年'
      };
    } catch (error) {
      return { month: '', day: '', dayNumber: 0, dateText: '', yearText: '' };
    }
  }

  function getNextSolarTerm(date) {
    var today = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    for (var i = 0; i < SOLAR_TERMS.length; i++) {
      var term = SOLAR_TERMS[i];
      var target = new Date(date.getFullYear(), term[0], term[1]);
      if (target >= today) {
        return { name: term[2], days: Math.round((target - today) / 86400000) };
      }
    }
    var first = SOLAR_TERMS[0];
    var next = new Date(date.getFullYear() + 1, first[0], first[1]);
    return { name: first[2], days: Math.round((next - today) / 86400000) };
  }

  function getIsoWeek(date) {
    var target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    var day = target.getUTCDay() || 7;
    target.setUTCDate(target.getUTCDate() + 4 - day);
    var yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
    return Math.ceil((((target - yearStart) / 86400000) + 1) / 7);
  }

  function getCalendarCellLabel(date) {
    var festival = FESTIVALS[(date.getMonth() + 1) + '-' + date.getDate()];
    if (festival) return { text: festival, festival: true };
    var lunar = getLunarInfo(date);
    return { text: lunar.dayNumber === 1 ? lunar.month : lunar.day, festival: false };
  }

  function getCalendarWeekdays(weekStart) {
    var names = ['日', '一', '二', '三', '四', '五', '六'];
    var result = [];
    for (var i = 0; i < 7; i++) {
      var day = (weekStart + i) % 7;
      result.push({ day: day, text: names[day], weekend: day === 0 || day === 6 });
    }
    return result;
  }

  function roundRect(ctx, x, y, width, height, radius) {
    var r = Math.max(0, Math.min(radius, width / 2, height / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function drawText(ctx, text, x, y, settings, options) {
    var value = String(text == null ? '' : text);
    if (!value) return;
    options = options || {};
    var size = Math.max(1, Math.round(options.size || 12));
    ctx.save();
    ctx.fillStyle = options.color || COLORS.black;
    ctx.font = (options.weight || 600) + ' ' + size + 'px ' + settings.fontFamily;
    ctx.textAlign = options.align || 'left';
    ctx.textBaseline = options.baseline || 'alphabetic';
    ctx.fillText(value, x, y);
    ctx.restore();
  }

  function fitTextSize(ctx, text, size, maxWidth, settings, weight) {
    var current = Math.max(6, Math.round(size));
    if (!maxWidth || maxWidth <= 0) return current;
    while (current > 6) {
      ctx.save();
      ctx.font = (weight || 700) + ' ' + current + 'px ' + settings.fontFamily;
      var width = ctx.measureText(String(text)).width;
      ctx.restore();
      if (width <= maxWidth) break;
      current -= 1;
    }
    return current;
  }

  function drawMonthGrid(ctx, date, profile, settings, colors, bounds, options) {
    options = options || {};
    var scale = getScale(profile);
    var weekStart = settings.weekStart;
    var year = date.getFullYear();
    var month = date.getMonth();
    var firstOffset = (new Date(year, month, 1).getDay() - weekStart + 7) % 7;
    var daysInMonth = new Date(year, month + 1, 0).getDate();
    var rows = Math.ceil((firstOffset + daysInMonth) / 7);
    var compact = !!options.compact;
    var weekHeight = Math.max(compact ? 10 : 16, Math.floor(bounds.height * (compact ? 0.15 : 0.12)));
    var gap = compact ? 2 : 4;
    var gridTop = bounds.y + weekHeight + gap;
    var cellWidth = bounds.width / 7;
    var cellHeight = Math.max(9, Math.floor((bounds.height - weekHeight - gap) / rows));
    var numberSize = Math.max(compact ? 8 : 6, Math.round((settings.sizes.cellDay || FONT_DEFAULTS.cellDay) * scale));
    var labelSize = Math.max(6, Math.round((settings.sizes.cellLunar || FONT_DEFAULTS.cellLunar) * scale));
    var weekLabelSize = Math.max(7, Math.round((settings.sizes.weekday || FONT_DEFAULTS.weekday) * scale * 0.62));
    var weekdays = getCalendarWeekdays(weekStart);

    weekdays.forEach(function (weekday, index) {
      var x = bounds.x + index * cellWidth;
      ctx.fillStyle = weekday.weekend ? colors.accent : colors.white;
      if (options.squareHeader) {
        ctx.fillRect(x + 1, bounds.y, cellWidth - 2, weekHeight);
      } else {
        roundRect(ctx, x + 2, bounds.y, cellWidth - 4, weekHeight, Math.min(8, weekHeight / 3));
        ctx.fill();
      }
      drawText(ctx, weekday.text, x + cellWidth / 2, bounds.y + weekHeight / 2, settings, {
        size: weekLabelSize,
        weight: 800,
        color: weekday.weekend ? colors.white : colors.accent,
        align: 'center',
        baseline: 'middle'
      });
    });

    ctx.save();
    ctx.strokeStyle = colors.black;
    ctx.lineWidth = options.lineWidth || 1;
    for (var row = 0; row <= rows; row++) {
      var lineY = Math.round(gridTop + row * cellHeight);
      ctx.beginPath();
      ctx.moveTo(bounds.x, lineY);
      ctx.lineTo(bounds.x + bounds.width, lineY);
      ctx.stroke();
    }
    for (var col = 0; col <= 7; col++) {
      var lineX = bounds.x + col * cellWidth;
      ctx.beginPath();
      ctx.moveTo(lineX, gridTop);
      ctx.lineTo(lineX, gridTop + rows * cellHeight);
      ctx.stroke();
    }
    ctx.restore();

    var showLunar = settings.showLunar && !compact && cellHeight >= 22;
    for (var day = 1; day <= daysInMonth; day++) {
      var position = firstOffset + day - 1;
      var cellCol = position % 7;
      var cellRow = Math.floor(position / 7);
      var cellX = bounds.x + cellCol * cellWidth;
      var cellY = gridTop + cellRow * cellHeight;
      var actualWeekday = new Date(year, month, day).getDay();
      var isSelected = day === date.getDate();

      if (isSelected) {
        ctx.fillStyle = colors.white;
        roundRect(ctx, cellX + 2, cellY + 2, Math.max(6, cellWidth - 4), Math.max(6, cellHeight - 4), Math.min(8, cellHeight / 4));
        ctx.fill();
        ctx.strokeStyle = colors.accent;
        ctx.lineWidth = compact ? 1.5 : 2;
        ctx.stroke();
      }

      var numberY = showLunar ? cellY + cellHeight * 0.44 : cellY + cellHeight * 0.52;
      drawText(ctx, day, cellX + cellWidth / 2, numberY, settings, {
        size: numberSize,
        weight: isSelected ? 900 : 800,
        color: (isSelected || actualWeekday === 0 || actualWeekday === 6) ? colors.accent : colors.black,
        align: 'center',
        baseline: 'middle'
      });

      if (showLunar) {
        var label = getCalendarCellLabel(new Date(year, month, day));
        drawText(ctx, label.text, cellX + cellWidth / 2, cellY + cellHeight * 0.79, settings, {
          size: labelSize,
          weight: 600,
          color: label.festival ? colors.accent : colors.black,
          align: 'center',
          baseline: 'middle'
        });
      }
    }
  }

  function drawFramedGrid(ctx, date, profile, settings, colors, bounds, options) {
    options = options || {};
    var scale = getScale(profile);
    var padding = options.padding || Math.max(6, Math.round(12 * scale));
    ctx.fillStyle = colors.white;
    roundRect(ctx, bounds.x, bounds.y, bounds.width, bounds.height, options.radius || 10);
    ctx.fill();
    ctx.strokeStyle = options.stroke || colors.accent;
    ctx.lineWidth = options.lineWidth || 2;
    ctx.stroke();
    drawMonthGrid(ctx, date, profile, settings, colors, {
      x: bounds.x + padding,
      y: bounds.y + padding,
      width: bounds.width - padding * 2,
      height: bounds.height - padding * 2
    }, options);
  }

  function drawLandscapeDay(ctx, date, profile, settings, colors) {
    var width = profile.width;
    var height = profile.height;
    var pad = Math.max(6, Math.round(height * 0.07));
    var panelWidth = Math.round(width * 0.44) - pad;
    var panelHeight = height - pad * 2;
    var radius = Math.max(6, Math.round(height * 0.07));
    var lunar = getLunarInfo(date);
    var term = getNextSolarTerm(date);
    var weekdayText = '星期' + getCalendarWeekdays(0)[date.getDay()].text;
    var year = date.getFullYear();
    var month = date.getMonth() + 1;

    ctx.fillStyle = colors.accent;
    roundRect(ctx, pad, pad, panelWidth, panelHeight, radius);
    ctx.fill();
    var daySize = Math.max(16, Math.min(Math.round(panelHeight * 0.62), Math.round(panelWidth * 0.72)));
    drawText(ctx, date.getDate(), pad + panelWidth / 2, pad + panelHeight * 0.5, settings, {
      size: daySize, weight: 900, color: colors.white, align: 'center', baseline: 'middle'
    });
    drawText(ctx, weekdayText, pad + panelWidth / 2, pad + panelHeight * 0.84, settings, {
      size: Math.max(7, Math.round(daySize * 0.22)), weight: 800, color: colors.white, align: 'center', baseline: 'middle'
    });

    var x = Math.round(width * 0.44) + pad;
    var rightWidth = width - x - pad;
    var title = settings.title || (year + '年' + month + '月');
    var titleSize = fitTextSize(ctx, title, Math.max(10, Math.round(height * 0.16)), rightWidth, settings, 800);
    var baseline = pad + titleSize;
    drawText(ctx, title, x, baseline, settings, { size: titleSize, weight: 800, color: colors.black });

    var subSize = Math.max(7, Math.round(height * 0.095));
    baseline += subSize * 1.9;
    drawText(ctx, settings.title ? (year + '年' + month + '月 · ' + weekdayText) : weekdayText, x, baseline, settings, {
      size: subSize, weight: 600, color: colors.black
    });

    if (settings.showLunar) {
      var lunarText = '农历 ' + lunar.dateText;
      var lunarSize = fitTextSize(ctx, lunarText, Math.max(7, Math.round(height * 0.1)), rightWidth, settings, 600);
      baseline += lunarSize * 1.6;
      drawText(ctx, lunarText, x, baseline, settings, { size: lunarSize, weight: 600, color: colors.black });
    }

    var smallSize = Math.max(7, Math.round(height * 0.085));
    baseline += smallSize * 1.7;
    if (settings.showLunar) {
      var termText = term.days === 0 ? term.name : (term.name + ' ' + term.days + '天');
      drawText(ctx, termText, x, baseline, settings, { size: smallSize, weight: 700, color: colors.accent });
      baseline += smallSize * 1.6;
    }
    drawText(ctx, '第' + getIsoWeek(date) + '周', x, baseline, settings, {
      size: smallSize, weight: 600, color: colors.black
    });
  }

  function drawPortraitDay(ctx, date, profile, settings, colors) {
    var width = profile.width;
    var height = profile.height;
    var pad = Math.max(8, Math.round(width * 0.055));
    var headerHeight = Math.round(height * 0.34);
    var radius = Math.max(8, Math.round(width * 0.035));
    var lunar = getLunarInfo(date);
    var term = getNextSolarTerm(date);
    var weekdayText = '星期' + getCalendarWeekdays(0)[date.getDay()].text;
    var year = date.getFullYear();
    var month = date.getMonth() + 1;

    ctx.fillStyle = colors.accent;
    roundRect(ctx, pad, pad, width - pad * 2, headerHeight, radius);
    ctx.fill();
    var daySize = Math.max(24, Math.min(Math.round(headerHeight * 0.62), Math.round((width - pad * 2) * 0.5)));
    drawText(ctx, date.getDate(), width / 2, pad + headerHeight * 0.5, settings, {
      size: daySize, weight: 900, color: colors.white, align: 'center', baseline: 'middle'
    });
    drawText(ctx, weekdayText, width / 2, pad + headerHeight * 0.84, settings, {
      size: Math.max(8, Math.round(daySize * 0.2)), weight: 800, color: colors.white, align: 'center', baseline: 'middle'
    });

    var left = pad * 2;
    var contentWidth = width - pad * 4;
    var title = settings.title || (year + '年' + month + '月');
    var titleSize = fitTextSize(ctx, title, Math.max(12, Math.round(width * 0.07)), contentWidth, settings, 800);
    var baseline = pad + headerHeight + pad * 1.2 + titleSize;
    drawText(ctx, title, left, baseline, settings, { size: titleSize, weight: 800, color: colors.black });

    var subSize = Math.max(8, Math.round(width * 0.038));
    baseline += subSize * 1.8;
    drawText(ctx, settings.title ? (year + '年' + month + '月 · ' + weekdayText) : weekdayText, left, baseline, settings, {
      size: subSize, weight: 600, color: colors.black
    });

    if (settings.showLunar) {
      var lunarSize = Math.max(8, Math.round(width * 0.038));
      baseline += lunarSize * 1.8;
      drawText(ctx, '农历 ' + lunar.dateText, left, baseline, settings, {
        size: lunarSize, weight: 600, color: colors.black
      });
    }

    var smallSize = Math.max(8, Math.round(width * 0.034));
    baseline += smallSize * 1.8;
    if (settings.showLunar) {
      var termText = term.days === 0 ? term.name : (term.name + ' ' + term.days + '天');
      drawText(ctx, termText + ' · 第' + getIsoWeek(date) + '周', left, baseline, settings, {
        size: smallSize, weight: 700, color: colors.accent
      });
    } else {
      drawText(ctx, '第' + getIsoWeek(date) + '周', left, baseline, settings, {
        size: smallSize, weight: 600, color: colors.black
      });
    }

    var gridTop = baseline + pad * 1.4;
    var gridHeight = height - gridTop - pad;
    if (gridHeight >= 90) {
      drawMonthGrid(ctx, date, profile, settings, colors, {
        x: left, y: gridTop, width: contentWidth, height: gridHeight
      });
    }
  }

  function drawDayLayout(ctx, date, profile, settings, colors) {
    if (profile.width >= profile.height) {
      drawLandscapeDay(ctx, date, profile, settings, colors);
    } else {
      drawPortraitDay(ctx, date, profile, settings, colors);
    }
  }

  function drawCompactGridLayout(ctx, date, profile, settings, colors) {
    var width = profile.width;
    var height = profile.height;
    var pad = Math.max(5, Math.round(Math.min(width, height) * 0.06));
    var headerSize = Math.max(8, Math.round(height * 0.11));
    var year = date.getFullYear();
    var month = date.getMonth() + 1;
    var monthText = year + '.' + String(month).padStart(2, '0');
    var weekdayText = '星期' + getCalendarWeekdays(0)[date.getDay()].text;

    drawText(ctx, monthText, pad, pad + headerSize * 0.85, settings, {
      size: headerSize, weight: 800, color: colors.black
    });
    drawText(ctx, weekdayText, width - pad, pad + headerSize * 0.85, settings, {
      size: Math.max(7, Math.round(height * 0.075)), weight: 700, color: colors.accent, align: 'right'
    });

    var top = pad + headerSize + Math.max(3, Math.round(height * 0.03));
    drawMonthGrid(ctx, date, profile, settings, colors, {
      x: pad, y: top, width: width - pad * 2, height: height - top - pad
    }, { compact: true });
  }

  function drawGridLayout(ctx, date, profile, settings, colors) {
    if (profile.width < 380 || profile.height < 240) {
      drawCompactGridLayout(ctx, date, profile, settings, colors);
      return;
    }
    var width = profile.width;
    var height = profile.height;
    var scale = getScale(profile);
    var pad = Math.max(10, Math.round(width * 0.035));
    var headerHeight = Math.max(Math.round(104 * scale), Math.round(height * 0.2));
    var radius = Math.round(18 * scale);
    var lunar = getLunarInfo(date);
    var year = date.getFullYear();
    var month = date.getMonth() + 1;

    ctx.fillStyle = colors.white;
    roundRect(ctx, pad, pad, width - pad * 2, headerHeight, radius);
    ctx.fill();
    ctx.strokeStyle = colors.accent;
    ctx.lineWidth = 2;
    ctx.stroke();

    var inset = Math.round(14 * scale);
    var dayWidth = Math.max(Math.round(98 * scale), Math.round(width * 0.17));
    var dayHeight = headerHeight - inset * 2;
    ctx.fillStyle = colors.accent;
    roundRect(ctx, pad + inset, pad + inset, dayWidth, dayHeight, Math.round(14 * scale));
    ctx.fill();
    var daySize = Math.max(12, Math.min(
      Math.round(dayHeight * 0.62),
      Math.round(dayWidth * 0.6),
      Math.round((settings.sizes.mainDay || FONT_DEFAULTS.mainDay) * scale * 0.38)
    ));
    drawText(ctx, date.getDate(), pad + inset + dayWidth / 2, pad + inset + dayHeight * 0.56, settings, {
      size: daySize, weight: 950, color: colors.white, align: 'center', baseline: 'middle'
    });

    var textX = pad + inset * 2 + dayWidth;
    var textWidth = width - textX - pad - inset;
    var title = settings.title || (year + '年' + month + '月');
    var titleSize = fitTextSize(ctx, title, Math.max(10, Math.round((settings.sizes.title || FONT_DEFAULTS.title) * scale)), textWidth, settings, 800);
    drawText(ctx, title, textX, pad + headerHeight * 0.58, settings, {
      size: titleSize, weight: 800, color: colors.black
    });
    if (settings.showLunar) {
      var lunarSize = Math.max(7, Math.round((settings.sizes.cellLunar || FONT_DEFAULTS.cellLunar) * scale));
      drawText(ctx, '农历 ' + lunar.dateText, textX, pad + headerHeight * 0.82, settings, {
        size: lunarSize, weight: 600, color: colors.accent
      });
    }

    var gridTop = pad + headerHeight + Math.round(18 * scale);
    drawFramedGrid(ctx, date, profile, settings, colors, {
      x: pad,
      y: gridTop,
      width: width - pad * 2,
      height: height - gridTop - pad
    }, { stroke: colors.black, lineWidth: 2 });
  }

  function drawSplitLayout(ctx, date, profile, settings, colors) {
    var width = profile.width;
    var height = profile.height;
    var scale = getScale(profile);
    var pad = Math.max(8, Math.round(width * 0.035));
    var leftWidth = Math.round(width * 0.36);
    var lunar = getLunarInfo(date);
    var year = date.getFullYear();
    var month = date.getMonth() + 1;
    var monthText = year + '.' + String(month).padStart(2, '0');
    var weekdayText = '星期' + getCalendarWeekdays(0)[date.getDay()].text;
    var accentBar = Math.max(4, Math.round(6 * scale));

    ctx.fillStyle = colors.white;
    ctx.fillRect(0, 0, leftWidth, height);
    ctx.fillStyle = colors.accent;
    ctx.fillRect(leftWidth - accentBar, 0, accentBar, height);

    drawText(ctx, settings.title || '', pad, Math.round(48 * scale), settings, {
      size: Math.max(7, Math.round((settings.sizes.title || FONT_DEFAULTS.title) * scale)), weight: 800, color: colors.black
    });
    drawText(ctx, date.getDate(), leftWidth / 2, height * 0.48, settings, {
      size: Math.max(12, Math.round((settings.sizes.mainDay || FONT_DEFAULTS.mainDay) * scale * 0.82)),
      weight: 950, color: colors.accent, align: 'center', baseline: 'middle'
    });
    drawText(ctx, weekdayText, leftWidth / 2, height * 0.62, settings, {
      size: Math.max(7, Math.round((settings.sizes.weekday || FONT_DEFAULTS.weekday) * scale)),
      weight: 800, color: colors.black, align: 'center', baseline: 'middle'
    });
    if (settings.showLunar) {
      drawText(ctx, lunar.dateText, leftWidth / 2, height * 0.72, settings, {
        size: Math.max(6, Math.round(22 * scale)), weight: 700, color: colors.accent, align: 'center', baseline: 'middle'
      });
    }
    drawText(ctx, monthText, width - pad, Math.round(50 * scale), settings, {
      size: Math.max(8, Math.round(24 * scale)), weight: 850, color: colors.accent, align: 'right'
    });

    drawMonthGrid(ctx, date, profile, settings, colors, {
      x: leftWidth + pad,
      y: Math.round(78 * scale),
      width: width - leftWidth - pad * 2,
      height: height - Math.round(100 * scale)
    });
  }

  function drawClassicLayout(ctx, date, profile, settings, colors) {
    var width = profile.width;
    var height = profile.height;
    var scale = getScale(profile);
    var pad = Math.max(8, Math.round(width * 0.035));
    var binderHeight = Math.round(72 * scale);
    var year = date.getFullYear();
    var month = date.getMonth() + 1;

    ctx.fillStyle = colors.accent;
    ctx.fillRect(0, 0, width, binderHeight);
    ctx.fillStyle = colors.accent === COLORS.red ? colors.black : colors.white;
    for (var index = 0; index < 6; index++) {
      var x = pad + Math.round(38 * scale) + index * ((width - pad * 2 - Math.round(76 * scale)) / 5);
      ctx.beginPath();
      ctx.arc(x, Math.round(18 * scale), Math.max(2, Math.round(6 * scale)), 0, Math.PI * 2);
      ctx.fill();
    }
    drawText(ctx, settings.title || '', pad, Math.round(46 * scale), settings, {
      size: Math.max(7, Math.round((settings.sizes.title || FONT_DEFAULTS.title) * scale)), weight: 850, color: colors.white
    });
    drawText(ctx, year + ' 年 ' + month + ' 月', width - pad, Math.round(46 * scale), settings, {
      size: Math.max(8, Math.round(24 * scale)), weight: 850, color: colors.white, align: 'right'
    });

    ctx.fillStyle = colors.white;
    ctx.fillRect(0, binderHeight, width, Math.max(4, Math.round(12 * scale)));

    drawFramedGrid(ctx, date, profile, settings, colors, {
      x: pad,
      y: binderHeight + Math.round(24 * scale),
      width: width - pad * 2,
      height: height - binderHeight - Math.round(54 * scale)
    }, { squareHeader: true, lineWidth: 2, stroke: colors.black });
  }

  function drawDuoLayout(ctx, date, profile, settings, colors) {
    var width = profile.width;
    var height = profile.height;
    var scale = getScale(profile);
    var pad = Math.max(8, Math.round(width * 0.035));
    var leftWidth = Math.round(width * 0.34);
    var accentBar = Math.max(5, Math.round(8 * scale));
    var lunar = getLunarInfo(date);
    var year = date.getFullYear();
    var month = date.getMonth() + 1;
    var monthText = year + '.' + String(month).padStart(2, '0');
    var weekdayText = '星期' + getCalendarWeekdays(0)[date.getDay()].text;

    ctx.fillStyle = colors.white;
    ctx.fillRect(0, 0, leftWidth, height);
    ctx.fillStyle = colors.accent;
    ctx.fillRect(leftWidth - accentBar, 0, accentBar, height);

    drawText(ctx, monthText, leftWidth / 2, pad + Math.round(36 * scale), settings, {
      size: Math.max(8, Math.round(24 * scale)), weight: 850, color: colors.accent, align: 'center'
    });
    drawText(ctx, date.getDate(), leftWidth / 2, height * 0.52, settings, {
      size: Math.max(12, Math.round((settings.sizes.mainDay || FONT_DEFAULTS.mainDay) * scale * 0.72)),
      weight: 950, color: colors.black, align: 'center', baseline: 'middle'
    });
    drawText(ctx, weekdayText, leftWidth / 2, height * 0.66, settings, {
      size: Math.max(7, Math.round((settings.sizes.weekday || FONT_DEFAULTS.weekday) * scale)),
      weight: 850, color: colors.accent, align: 'center', baseline: 'middle'
    });
    if (settings.showLunar) {
      drawText(ctx, lunar.dateText, leftWidth / 2, height * 0.76, settings, {
        size: Math.max(6, Math.round(22 * scale)), weight: 750, color: colors.black, align: 'center', baseline: 'middle'
      });
    }
    drawFramedGrid(ctx, date, profile, settings, colors, {
      x: leftWidth + pad,
      y: pad,
      width: width - leftWidth - pad * 2,
      height: height - pad * 2
    }, { stroke: colors.black });
  }

  function drawCalendar(ctx, date, profile, settings) {
    var colors = getColors(settings);
    ctx.save();
    ctx.clearRect(0, 0, profile.width, profile.height);
    ctx.fillStyle = colors.white;
    ctx.fillRect(0, 0, profile.width, profile.height);

    switch (settings.layout) {
      case 'grid':
        drawGridLayout(ctx, date, profile, settings, colors);
        break;
      case 'split':
        drawSplitLayout(ctx, date, profile, settings, colors);
        break;
      case 'classic':
        drawClassicLayout(ctx, date, profile, settings, colors);
        break;
      case 'duo':
        drawDuoLayout(ctx, date, profile, settings, colors);
        break;
      case 'day':
      default:
        drawDayLayout(ctx, date, profile, settings, colors);
        break;
    }
    ctx.restore();
  }

  function renderPreview() {
    var preview = $('calendarPreview');
    if (!preview) return false;
    var profile = getProfile();
    if (preview.width !== profile.width) preview.width = profile.width;
    if (preview.height !== profile.height) preview.height = profile.height;
    preview.style.aspectRatio = profile.width + ' / ' + profile.height;
    preview.classList.toggle('portrait', profile.height > profile.width);
    drawCalendar(preview.getContext('2d'), getSelectedDate(), profile, getSettings());
    return true;
  }

  function schedulePreview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(renderPreview, 30);
  }

  function togglePanel(force) {
    var elements = getElements();
    if (!elements.panel || !elements.toggle) return;
    var open = typeof force === 'boolean' ? force : elements.panel.hidden;
    elements.panel.hidden = !open;
    elements.toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    elements.toggle.classList.toggle('primary', open);
    elements.toggle.classList.toggle('secondary', !open);
    if (open) {
      renderPreview();
      elements.panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function updateOutput(input) {
    if (!input) return;
    var output = document.querySelector('[data-size-value-for="' + input.id + '"]');
    if (output) output.textContent = input.value + 'px';
  }

  function updateFill(input) {
    if (!input) return;
    var min = Number(input.min) || 0;
    var max = Number(input.max) || 100;
    var value = Number(input.value) || 0;
    var percent = max > min ? ((value - min) / (max - min)) * 100 : 0;
    input.style.setProperty('--range-fill', percent.toFixed(2) + '%');
  }

  function resetSizes() {
    var elements = getElements();
    Object.keys(FONT_DEFAULTS).forEach(function (role) {
      var input = elements.sizes[role];
      if (!input) return;
      input.value = FONT_DEFAULTS[role];
      updateOutput(input);
      updateFill(input);
    });
    renderPreview();
  }

  function quantizeCanvas(canvas, allowRed) {
    var ctx = canvas.getContext('2d');
    var imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    var data = imageData.data;
    var palette = allowRed
      ? [[0, 0, 0], [255, 255, 255], [255, 0, 0]]
      : [[0, 0, 0], [255, 255, 255]];
    for (var i = 0; i < data.length; i += 4) {
      var r = data[i];
      var g = data[i + 1];
      var b = data[i + 2];
      var best = palette[0];
      var bestDistance = Infinity;
      for (var p = 0; p < palette.length; p++) {
        var dr = r - palette[p][0];
        var dg = g - palette[p][1];
        var db = b - palette[p][2];
        var distance = dr * dr + dg * dg + db * db;
        if (distance < bestDistance) {
          bestDistance = distance;
          best = palette[p];
        }
      }
      data[i] = best[0];
      data[i + 1] = best[1];
      data[i + 2] = best[2];
      data[i + 3] = 255;
    }
    ctx.putImageData(imageData, 0, 0);
  }

  function log(message) {
    if (typeof addLog === 'function') addLog(message);
  }

  function applyToCanvas(send) {
    var canvas = getCanvas();
    var preview = $('calendarPreview');
    if (!canvas || !preview) return;
    var settings = getSettings();
    renderPreview();

    if (window.cropManager) window.cropManager.clearImage();
    if (window.paintManager) {
      paintManager.setActiveTool(null, '');
      paintManager.clearElements();
    }

    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(preview, 0, 0, canvas.width, canvas.height);
    quantizeCanvas(canvas, settings.accent === 'red');

    if (window.paintManager) {
      if (paintManager.setBaseImageData) paintManager.setBaseImageData();
      paintManager.clearHistory();
      paintManager.saveToHistory();
    }
    if (typeof resetDitherPreviewSource === 'function') resetDitherPreviewSource();
    if (typeof calendarStyleImageActive !== 'undefined') calendarStyleImageActive = true;

    log('日历图已生成到画布：' + canvas.width + '×' + canvas.height +
      '（' + (settings.accent === 'red' ? '黑白红' : '黑白') + '）');
    if (typeof setStatus === 'function') setStatus('日历图已生成，可继续编辑或立即上传');

    if (send) {
      if (typeof upload_image === 'function') {
        log('开始上传日历图…');
        upload_image();
      } else {
        log('上传函数不可用，请点击“立即上传到屏幕”。');
      }
    } else {
      var imagePanel = $('image-panel');
      if (imagePanel) imagePanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function bind() {
    var elements = getElements();
    if (!elements.panel || !elements.preview) return;

    if (elements.date && !elements.date.value) {
      elements.date.value = formatDateInput(new Date());
    }
    elements.toggle && elements.toggle.addEventListener('click', function () {
      togglePanel();
    });

    var controls = [
      elements.layout, elements.fontPreset, elements.date, elements.weekStart,
      elements.title, elements.accent, elements.lunar,
      elements.sizes.mainDay, elements.sizes.title, elements.sizes.weekday,
      elements.sizes.cellDay, elements.sizes.cellLunar
    ];
    controls.forEach(function (control) {
      if (!control) return;
      var eventName = (control.tagName === 'SELECT' || control.type === 'checkbox' || control.type === 'date')
        ? 'change' : 'input';
      control.addEventListener(eventName, function () {
        if (control.type === 'range') {
          updateOutput(control);
          updateFill(control);
        }
        schedulePreview();
      });
    });

    elements.reset && elements.reset.addEventListener('click', resetSizes);
    elements.render && elements.render.addEventListener('click', function () {
      applyToCanvas(false);
    });
    elements.send && elements.send.addEventListener('click', function () {
      applyToCanvas(true);
    });

    var canvasSize = $('canvasSize');
    if (canvasSize) {
      canvasSize.addEventListener('change', schedulePreview);
    }

    Object.keys(elements.sizes).forEach(function (role) {
      var input = elements.sizes[role];
      if (!input) return;
      updateOutput(input);
      updateFill(input);
    });

    window.addEventListener('load', function () {
      setTimeout(renderPreview, 0);
    });

    renderPreview();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
})();
