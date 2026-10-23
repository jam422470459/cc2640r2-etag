/**
 * 蓝牙传图编辑器
 * 布局与绘图/待办/课表/事项功能移植自 EPD-nRF5；
 * 图像编码与上传继续使用本项目的 canvas2bytes / upload_image。
 */
var canvas = null;
var ctx = null;
var paintManager = null;
var cropManager = null;
var ditherSourceImageData = null;
var ditherPreviewActive = false;
var calendarStyleImageActive = false;

function getSelectedCanvasSize() {
  var select = document.getElementById('canvasSize');
  var parts = (select && select.value ? select.value : '296x128').split('x').map(Number);
  return {
    width: parts[0] || 296,
    height: parts[1] || 128
  };
}

function cloneImageData(imageData) {
  return new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height
  );
}

function resetDitherPreviewSource() {
  ditherSourceImageData = null;
  ditherPreviewActive = false;
  calendarStyleImageActive = false;
}

function fillCanvas(style) {
  resetDitherPreviewSource();
  ctx.fillStyle = style || '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (paintManager && paintManager.setBaseImageData) paintManager.setBaseImageData();
}

function updateCanvasDisplayClass() {
  if (!canvas || !canvas.parentNode) return;
  var landscapeSmall = canvas.width < 480 && canvas.width >= canvas.height;
  canvas.parentNode.classList.toggle('small-canvas', landscapeSmall);
}

function setCanvasTitle(title) {
  var canvasTitle = document.querySelector('.canvas-title');
  if (!canvasTitle) return;
  canvasTitle.innerText = title || '';
  canvasTitle.style.display = title ? 'block' : 'none';
}

function setStatusSafe(text) {
  if (typeof setStatus === 'function') {
    setStatus(text);
  }
}

function logSafe(text) {
  if (typeof addLog === 'function') addLog(text);
}

function resetPaintForImageLoad() {
  if (!paintManager) return;
  paintManager.setActiveTool(null, '');
  paintManager.clearElements();
  paintManager.clearHistory();
}

function renderTransformedImagePreview(sourceImageData, commitHistory) {
  if (!sourceImageData) return;
  ditherSourceImageData = cloneImageData(sourceImageData);
  ditherPreviewActive = true;
  calendarStyleImageActive = false;

  var settings = getDitherSettings();
  var processedData = processCanvasImageData();
  var finalImageData = decodeProcessedData(processedData, canvas.width, canvas.height, settings.mode);
  ctx.putImageData(finalImageData, 0, 0);

  if (paintManager && paintManager.setBaseImageData) paintManager.setBaseImageData();
  if (commitHistory && paintManager) {
    paintManager.clearHistory();
    paintManager.saveToHistory();
  }
  setStatusSafe('图片已加载，可旋转、缩放或继续绘制');
}

function updateImage(file) {
  var imageFile = document.getElementById('imageFile');
  var selectedFile = file || (imageFile && imageFile.files.length > 0 ? imageFile.files[0] : null);
  if (!selectedFile) {
    if (cropManager) cropManager.clearImage();
    fillCanvas('#ffffff');
    setStatusSafe('请选择图片或直接绘制');
    return;
  }

  resetDitherPreviewSource();
  resetPaintForImageLoad();
  setStatusSafe('正在加载图片…');
  logSafe('正在加载图片：' + selectedFile.name);

  if (!cropManager) {
    logSafe('图片编辑器未初始化。');
    return;
  }

  cropManager.loadFile(selectedFile).then(function () {
    setStatusSafe('图片已加载，可旋转、缩放或继续绘制');
  }).catch(function (error) {
    cropManager.clearImage();
    fillCanvas('#ffffff');
    logSafe('图片读取失败：' + (error && error.message ? error.message : error));
    alert('图片文件无法读取，请重新选择。');
  });
}

function updateCanvasSize() {
  resetDitherPreviewSource();
  var size = getSelectedCanvasSize();
  canvas.width = size.width;
  canvas.height = size.height;
  updateCanvasDisplayClass();
  updateImage();
  setStatusSafe('画布尺寸：' + size.width + '×' + size.height);
}

function clearCanvas() {
  if (!confirm('清除画布内容?')) return false;
  if (cropManager) cropManager.clearImage();
  var imageFile = document.getElementById('imageFile');
  if (imageFile) imageFile.value = '';
  fillCanvas('#ffffff');
  if (paintManager) {
    paintManager.clearElements();
    if (paintManager.setBaseImageData) paintManager.setBaseImageData();
    if (paintManager.clearScheduleCache) paintManager.clearScheduleCache();
    paintManager.clearHistory();
    paintManager.saveToHistory();
  }
  setStatusSafe('画布已清空');
  return true;
}

function getDitherSettings() {
  var strength = document.getElementById('ditherStrength');
  var contrast = document.getElementById('ditherContrast');
  var brightness = document.getElementById('ditherBrightness');
  var saturation = document.getElementById('ditherSaturation');
  var alg = document.getElementById('ditherAlg');
  var mode = document.getElementById('ditherMode');
  return {
    contrast: contrast ? parseFloat(contrast.value) : 1.2,
    brightness: brightness ? parseFloat(brightness.value) : 0,
    saturation: saturation ? parseFloat(saturation.value) : 1.2,
    alg: alg ? alg.value : 'floydSteinberg',
    strength: strength ? parseFloat(strength.value) : 1,
    mode: mode ? mode.value : 'threeColor'
  };
}

function prepareDitherImageData(sourceImageData, settings) {
  var imageData = new ImageData(
    new Uint8ClampedArray(sourceImageData.data),
    sourceImageData.width,
    sourceImageData.height
  );
  adjustBrightnessSaturation(imageData, settings.brightness, settings.saturation);
  adjustContrast(imageData, settings.contrast);
  return imageData;
}

function processCanvasImageData() {
  var settings = getDitherSettings();
  if (!ditherPreviewActive || !ditherSourceImageData) {
    ditherSourceImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  }
  var sourceImageData = cloneImageData(ditherSourceImageData);
  if (calendarStyleImageActive) {
    return processImageData(sourceImageData, settings.mode);
  }
  var adjusted = prepareDitherImageData(sourceImageData, settings);
  return processImageData(
    ditherImage(adjusted, settings.alg, settings.strength, settings.mode),
    settings.mode
  );
}

function convertDithering() {
  if (!canvas || !ctx) return;
  if (paintManager) {
    if (paintManager.redrawTextElements) paintManager.redrawTextElements();
    if (paintManager.redrawLineSegments) paintManager.redrawLineSegments();
    if (paintManager.redrawTodoItems) paintManager.redrawTodoItems();
    if (paintManager.drawSchedule) paintManager.drawSchedule();
  }

  var settings = getDitherSettings();
  var processedData = processCanvasImageData();
  var finalImageData = decodeProcessedData(processedData, canvas.width, canvas.height, settings.mode);
  ctx.putImageData(finalImageData, 0, 0);
  ditherPreviewActive = true;

  if (paintManager) paintManager.saveToHistory();
  setStatusSafe('已应用抖动，可继续绘制或立即上传');
}

function applyDither() {
  convertDithering();
}

function updateRangeFill(range) {
  if (!range) return;
  var min = parseFloat(range.min || '0');
  var max = parseFloat(range.max || '100');
  var value = parseFloat(range.value || '0');
  var percent = max === min ? 0 : ((value - min) / (max - min)) * 100;
  range.style.setProperty('--range-fill', Math.max(0, Math.min(100, percent)) + '%');
}

function initRangeFill() {
  document.querySelectorAll('input[type="range"]').forEach(function (range) {
    updateRangeFill(range);
    range.addEventListener('input', function () {
      updateRangeFill(range);
    });
  });
}

function setDitherAdjustment(id, value, digits) {
  var input = document.getElementById(id);
  var label = document.getElementById(id + 'Value');
  if (!input) return;
  input.value = value;
  if (label) label.innerText = parseFloat(value).toFixed(digits);
  updateRangeFill(input);
}

function resetDitherAdjustments() {
  setDitherAdjustment('ditherStrength', 1.0, 1);
  setDitherAdjustment('ditherContrast', 1.2, 1);
  setDitherAdjustment('ditherBrightness', 0, 0);
  setDitherAdjustment('ditherSaturation', 1.2, 1);
  applyDither();
}

function bytesToCArray(bytes, name) {
  var lines = [];
  for (var i = 0; i < bytes.length; i += 16) {
    var chunk = [];
    for (var j = i; j < Math.min(i + 16, bytes.length); j++) {
      chunk.push('0x' + (bytes[j] & 0xff).toString(16).padStart(2, '0'));
    }
    lines.push('  ' + chunk.join(', '));
  }
  return 'const uint8_t ' + name + '[] PROGMEM = {\n' + lines.join(',\n') + '\n};\n';
}

function downloadDataArray() {
  if (!canvas) return;
  if (cropManager && cropManager.commitPendingTransform) cropManager.commitPendingTransform(false);
  convertDithering();

  var bw = canvas2bytes(canvas, 'bw');
  var bwr = canvas2bytes(canvas, 'bwr');
  var content = '// ' + canvas.width + 'x' + canvas.height + ' 电子价签图像数组\n' +
    '// 由 web_tools 蓝牙传图生成\n\n' +
    'const uint16_t imageWidth = ' + canvas.width + ';\n' +
    'const uint16_t imageHeight = ' + canvas.height + ';\n\n' +
    bytesToCArray(bw, 'imageDataBW') + '\n' +
    bytesToCArray(bwr, 'imageDataBWR');

  var blob = new Blob([content], { type: 'text/plain' });
  var link = document.createElement('a');
  link.download = 'imagedata.h';
  link.href = URL.createObjectURL(blob);
  link.click();
  URL.revokeObjectURL(link.href);
  logSafe('图像数组已下载。');
}

async function sendimg() {
  if (!canvas) return;
  if (cropManager && cropManager.commitPendingTransform) cropManager.commitPendingTransform(false);
  convertDithering();
  setStatusSafe('正在发送图片…');
  if (typeof upload_image === 'function') {
    await upload_image();
  } else {
    logSafe('上传函数不可用。');
  }
}

function bindImageEditorEvents() {
  var clearButton = document.getElementById('clear-canvas');
  if (clearButton) clearButton.addEventListener('click', clearCanvas);

  var resetAdjustments = document.getElementById('resetDitherAdjustments');
  if (resetAdjustments) resetAdjustments.addEventListener('click', resetDitherAdjustments);

  var imageDropZone = document.getElementById('imageDropZone');
  var imageFile = document.getElementById('imageFile');
  if (imageDropZone && imageFile) {
    imageDropZone.addEventListener('dragover', function (event) {
      event.preventDefault();
      imageDropZone.classList.add('drag-over');
    });
    imageDropZone.addEventListener('dragleave', function () {
      imageDropZone.classList.remove('drag-over');
    });
    imageDropZone.addEventListener('drop', function (event) {
      event.preventDefault();
      imageDropZone.classList.remove('drag-over');
      var file = event.dataTransfer && event.dataTransfer.files ? event.dataTransfer.files[0] : null;
      if (!file || !file.type.startsWith('image/')) {
        logSafe('拖放失败：请选择有效的图片文件。');
        return;
      }
      try {
        var transfer = new DataTransfer();
        transfer.items.add(file);
        imageFile.files = transfer.files;
      } catch (error) {
        logSafe('浏览器无法同步拖放文件，请改用文件选择按钮。');
        return;
      }
      updateImage(file);
    });
  }

  var modeSelect = document.getElementById('ditherMode');
  if (modeSelect) {
    modeSelect.addEventListener('change', function () {
      if (paintManager && typeof paintManager.refreshMatterTemplatePalette === 'function') {
        paintManager.refreshMatterTemplatePalette();
      }
    });
  }

  var adjustBindings = [
    ['ditherStrength', 'ditherStrengthValue', 1],
    ['ditherContrast', 'ditherContrastValue', 1],
    ['ditherBrightness', 'ditherBrightnessValue', 0],
    ['ditherSaturation', 'ditherSaturationValue', 1]
  ];
  adjustBindings.forEach(function (binding) {
    var input = document.getElementById(binding[0]);
    var label = document.getElementById(binding[1]);
    if (!input) return;
    input.addEventListener('input', function (event) {
      if (label) label.innerText = parseFloat(event.target.value).toFixed(binding[2]);
      updateRangeFill(input);
      applyDither();
    });
  });
}

function initImageEditor() {
  canvas = document.getElementById('canvas');
  if (!canvas) return;
  ctx = canvas.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  paintManager = new PaintManager(canvas, ctx);
  cropManager = new CropManager(canvas, ctx, paintManager);
  cropManager.setRenderCallback(renderTransformedImagePreview);
  if (paintManager.setBaseImageData) paintManager.setBaseImageData();
  paintManager.initPaintTools();
  cropManager.initCropTools();
  updateCanvasDisplayClass();

  bindImageEditorEvents();
  initRangeFill();
  setCanvasTitle('');
  setStatusSafe('请选择图片，或使用画笔/文字直接编辑');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initImageEditor);
} else {
  initImageEditor();
}
