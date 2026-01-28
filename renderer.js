// ==================== Tab 切换 ====================
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const tabId = btn.dataset.tab;
    
    // 切换按钮状态
    tabBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    // 切换内容
    tabContents.forEach(content => {
      content.classList.remove('active');
      if (content.id === `${tabId}-tab`) {
        content.classList.add('active');
      }
    });
  });
});

// ==================== 常规 Tab - Excel 数据管理 ====================
const openFileBtn = document.getElementById('openFileBtn');
const refreshBtn = document.getElementById('refreshBtn');
const downloadTemplateBtn = document.getElementById('downloadTemplateBtn');
const filePathDiv = document.getElementById('filePath');
const emptyState = document.getElementById('emptyState');
const dataTable = document.getElementById('dataTable');
const dataBody = document.getElementById('dataBody');

// localStorage 键名
const STORAGE_KEYS = {
  TEXT: 'tts_text',
  VOICE: 'tts_voice',
  SPEED: 'tts_speed',
  EXCEL_PATH: 'tts_excel_path',
  CAPTURE_INTERVAL: 'tts_capture_interval'
};

// 当前播放状态
let currentPlayingIndex = -1;
let currentAudioContext = null;
let currentSource = null;
let isPlaying = false;
let excelData = [];

// 初始化时加载已保存的 Excel 文件
async function initExcelData() {
  const savedPath = localStorage.getItem(STORAGE_KEYS.EXCEL_PATH);
  if (savedPath) {
    filePathDiv.textContent = savedPath;
    await loadExcelFromPath(savedPath);
  }
}

// 从路径加载 Excel 文件
async function loadExcelFromPath(filePath) {
  try {
    const result = await window.ttsAPI.readExcel(filePath);
    if (result.success) {
      excelData = result.data;
      renderDataTable();
    } else {
      console.error('加载 Excel 失败:', result.error);
      showEmptyState('文件加载失败: ' + result.error);
    }
  } catch (error) {
    console.error('加载 Excel 出错:', error);
    showEmptyState('文件加载出错');
  }
}

// 显示空状态
function showEmptyState(message) {
  emptyState.style.display = 'block';
  dataTable.style.display = 'none';
  if (message) {
    emptyState.querySelector('p').textContent = message;
  }
}

// 渲染数据表格
function renderDataTable() {
  if (excelData.length === 0) {
    showEmptyState('文件中没有数据');
    return;
  }

  emptyState.style.display = 'none';
  dataTable.style.display = 'table';
  
  dataBody.innerHTML = '';
  
  excelData.forEach((item, index) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="name-col">${escapeHtml(item.name)}</td>
      <td class="answer-col">${escapeHtml(item.answer)}</td>
      <td class="action-col">
        <button class="play-btn" data-index="${index}" title="播放">🔊</button>
      </td>
    `;
    dataBody.appendChild(tr);
  });

  // 绑定播放按钮事件
  dataBody.querySelectorAll('.play-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const index = parseInt(btn.dataset.index);
      playExcelItem(index);
    });
  });
}

// HTML 转义
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 播放 Excel 中的某一项
async function playExcelItem(index) {
  const item = excelData[index];
  if (!item) return;

  // 如果正在播放同一项，则停止
  if (currentPlayingIndex === index && isPlaying) {
    stopPlayback();
    return;
  }

  // 停止之前的播放
  if (isPlaying) {
    stopPlayback(false);
  }

  // 更新按钮状态
  updatePlayButtonState(index, 'loading');
  currentPlayingIndex = index;

  try {
    // 使用测试 Tab 中保存的音色和语速设置
    const sid = parseInt(localStorage.getItem(STORAGE_KEYS.VOICE) || '0');
    const speed = parseFloat(localStorage.getItem(STORAGE_KEYS.SPEED) || '1.0');

    const result = await window.ttsAPI.generate(item.answer, sid, speed);
    
    if (result.success) {
      isPlaying = true;
      updatePlayButtonState(index, 'playing');
      
      await playAudio(result.samples, result.sampleRate);
      
      // 播放完成
      if (currentPlayingIndex === index) {
        updatePlayButtonState(index, 'idle');
        currentPlayingIndex = -1;
        isPlaying = false;
      }
    } else {
      updatePlayButtonState(index, 'idle');
      currentPlayingIndex = -1;
      console.error('生成语音失败:', result.error);
    }
  } catch (error) {
    updatePlayButtonState(index, 'idle');
    currentPlayingIndex = -1;
    isPlaying = false;
    console.error('播放出错:', error);
  }
}

// 更新播放按钮状态
function updatePlayButtonState(index, state) {
  const btn = dataBody.querySelector(`.play-btn[data-index="${index}"]`);
  if (!btn) return;

  btn.classList.remove('playing');
  btn.disabled = false;

  switch (state) {
    case 'loading':
      btn.textContent = '⏳';
      btn.disabled = true;
      break;
    case 'playing':
      btn.textContent = '⏹️';
      btn.classList.add('playing');
      break;
    case 'idle':
    default:
      btn.textContent = '🔊';
      break;
  }
}

// 打开文件按钮
openFileBtn.addEventListener('click', async () => {
  const result = await window.ttsAPI.openFile();
  
  if (result.success) {
    localStorage.setItem(STORAGE_KEYS.EXCEL_PATH, result.filePath);
    filePathDiv.textContent = result.filePath;
    excelData = result.data;
    renderDataTable();
  } else if (!result.canceled) {
    alert('打开文件失败: ' + result.error);
  }
});

// 刷新按钮
refreshBtn.addEventListener('click', async () => {
  const savedPath = localStorage.getItem(STORAGE_KEYS.EXCEL_PATH);
  if (savedPath) {
    await loadExcelFromPath(savedPath);
  } else {
    alert('请先打开一个 Excel 文件');
  }
});

// 下载模板按钮
downloadTemplateBtn.addEventListener('click', async () => {
  const result = await window.ttsAPI.downloadTemplate();
  
  if (result.success) {
    alert('模板已保存到: ' + result.filePath);
  } else if (!result.canceled && result.error) {
    alert('保存模板失败: ' + result.error);
  }
});

// ==================== 测试 Tab ====================
const textInput = document.getElementById('text');
const voiceSelect = document.getElementById('voice');
const speedInput = document.getElementById('speed');
const speedDisplay = document.getElementById('speedDisplay');
const generateBtn = document.getElementById('generateBtn');
const statusDiv = document.getElementById('status');

// 初始化音色选择器（174 个说话人）
function initVoiceSelect() {
  for (let i = 0; i < 174; i++) {
    const option = document.createElement('option');
    option.value = i;
    option.textContent = `说话人 ${i}`;
    voiceSelect.appendChild(option);
  }
}

// 从 localStorage 加载设置
function loadSettings() {
  const savedText = localStorage.getItem(STORAGE_KEYS.TEXT);
  const savedVoice = localStorage.getItem(STORAGE_KEYS.VOICE);
  const savedSpeed = localStorage.getItem(STORAGE_KEYS.SPEED);

  if (savedText) {
    textInput.value = savedText;
  }
  if (savedVoice !== null) {
    voiceSelect.value = savedVoice;
  }
  if (savedSpeed !== null) {
    speedInput.value = savedSpeed;
    speedDisplay.textContent = `${savedSpeed}x`;
  }
}

// 保存设置到 localStorage
function saveSettings() {
  localStorage.setItem(STORAGE_KEYS.TEXT, textInput.value);
  localStorage.setItem(STORAGE_KEYS.VOICE, voiceSelect.value);
  localStorage.setItem(STORAGE_KEYS.SPEED, speedInput.value);
}

// 更新语速显示
speedInput.addEventListener('input', () => {
  speedDisplay.textContent = `${speedInput.value}x`;
  saveSettings();
});

// 文字和音色变化时保存
textInput.addEventListener('input', saveSettings);
voiceSelect.addEventListener('change', saveSettings);

// 设置状态
function setStatus(message, type = '') {
  statusDiv.textContent = message;
  statusDiv.className = 'status ' + type;
}

// ==================== 音频播放 ====================
// 使用 Web Audio API 播放音频
async function playAudio(samples, sampleRate) {
  currentAudioContext = new (window.AudioContext || window.webkitAudioContext)();
  
  // 创建音频缓冲区
  const audioBuffer = currentAudioContext.createBuffer(1, samples.length, sampleRate);
  const channelData = audioBuffer.getChannelData(0);
  
  // 复制采样数据
  for (let i = 0; i < samples.length; i++) {
    channelData[i] = samples[i];
  }
  
  // 创建音频源并播放
  currentSource = currentAudioContext.createBufferSource();
  currentSource.buffer = audioBuffer;
  currentSource.connect(currentAudioContext.destination);
  
  return new Promise((resolve) => {
    currentSource.onended = () => {
      if (currentAudioContext) {
        currentAudioContext.close();
        currentAudioContext = null;
        currentSource = null;
      }
      resolve();
    };
    currentSource.start(0);
  });
}

// 停止播放
function stopPlayback(resetButton = true) {
  if (currentSource) {
    currentSource.stop();
    currentSource = null;
  }
  if (currentAudioContext) {
    currentAudioContext.close();
    currentAudioContext = null;
  }
  
  // 重置常规 Tab 的播放按钮
  if (resetButton && currentPlayingIndex >= 0) {
    updatePlayButtonState(currentPlayingIndex, 'idle');
  }
  
  isPlaying = false;
  currentPlayingIndex = -1;
  
  // 重置测试 Tab 的按钮
  generateBtn.textContent = '🔊 生成并播放';
  setStatus('⏹️ 已停止播放', '');
}

// 生成按钮点击事件（测试 Tab）
generateBtn.addEventListener('click', async () => {
  // 如果正在播放，则停止
  if (isPlaying) {
    stopPlayback();
    return;
  }

  const text = textInput.value.trim();
  
  if (!text) {
    setStatus('请输入要转换的文字', 'error');
    return;
  }

  const sid = parseInt(voiceSelect.value);
  const speed = parseFloat(speedInput.value);

  // 禁用按钮（生成阶段）
  generateBtn.disabled = true;
  generateBtn.textContent = '⏳ 生成中...';
  setStatus('正在生成语音...');

  try {
    const result = await window.ttsAPI.generate(text, sid, speed);
    
    if (result.success) {
      // 开始播放，启用按钮并切换为停止模式
      isPlaying = true;
      generateBtn.disabled = false;
      generateBtn.textContent = '⏹️ 停止播放';
      setStatus('🔊 正在播放...', 'success');
      
      await playAudio(result.samples, result.sampleRate);
      
      // 播放完成后恢复状态
      if (isPlaying) {
        isPlaying = false;
        setStatus('✅ 播放完成', 'success');
      }
    } else {
      setStatus(`❌ ${result.error}`, 'error');
    }
  } catch (error) {
    setStatus(`❌ 发生错误: ${error.message}`, 'error');
  } finally {
    isPlaying = false;
    generateBtn.disabled = false;
    generateBtn.textContent = '🔊 生成并播放';
  }
});

// ==================== 捕捉 Tab ====================
const selectAreaBtn = document.getElementById('selectAreaBtn');
const startCaptureBtn = document.getElementById('startCaptureBtn');
const stopCaptureBtn = document.getElementById('stopCaptureBtn');
const captureIntervalInput = document.getElementById('captureInterval');
const captureAreaInfo = document.getElementById('captureAreaInfo');
const captureStatus = document.getElementById('captureStatus');
const captureCountSpan = document.getElementById('captureCount');
const consoleOutput = document.getElementById('consoleOutput');
const clearConsoleBtn = document.getElementById('clearConsoleBtn');
const screenshotBody = document.getElementById('screenshotBody');

// 捕捉状态
let captureArea = null;
let captureIntervalTimer = null;
let captureCount = 0;

// 获取识别间隔（毫秒）
function getCaptureIntervalMs() {
  const seconds = parseFloat(captureIntervalInput.value) || 2;
  return Math.max(500, seconds * 1000); // 最小 500ms
}

// 加载保存的识别频率
function loadCaptureInterval() {
  const savedInterval = localStorage.getItem(STORAGE_KEYS.CAPTURE_INTERVAL);
  if (savedInterval !== null) {
    captureIntervalInput.value = savedInterval;
  }
}

// 保存识别频率
function saveCaptureInterval() {
  localStorage.setItem(STORAGE_KEYS.CAPTURE_INTERVAL, captureIntervalInput.value);
}

// 监听频率输入变化
captureIntervalInput.addEventListener('change', saveCaptureInterval);
captureIntervalInput.addEventListener('input', saveCaptureInterval);

// 更新截图预览
function updateScreenshotPreview(base64Image) {
  screenshotBody.innerHTML = `<img src="data:image/png;base64,${base64Image}" alt="截图预览">`;
}

// 添加日志到控制台
function addLog(type, content) {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('zh-CN', { hour12: false });
  
  let logHtml = '';
  switch (type) {
    case 'info':
      logHtml = `<span class="log-time">[${timeStr}]</span> <span class="log-info">[信息]</span> ${escapeHtml(content)}\n`;
      break;
    case 'ocr':
      logHtml = `<span class="log-time">[${timeStr}]</span> <span class="log-info">[OCR]</span> <span class="log-content">${escapeHtml(content)}</span>\n`;
      break;
    case 'error':
      logHtml = `<span class="log-time">[${timeStr}]</span> <span class="log-error">[错误]</span> ${escapeHtml(content)}\n`;
      break;
    default:
      logHtml = `<span class="log-time">[${timeStr}]</span> ${escapeHtml(content)}\n`;
  }
  
  consoleOutput.innerHTML += logHtml;
  consoleOutput.scrollTop = consoleOutput.scrollHeight;
}

// 清空控制台
clearConsoleBtn.addEventListener('click', () => {
  consoleOutput.innerHTML = '';
  addLog('info', '控制台已清空');
});

// 选择区域按钮
selectAreaBtn.addEventListener('click', async () => {
  addLog('info', '正在选择捕捉区域...');
  
  const result = await window.ttsAPI.selectCaptureArea();
  
  if (result.success) {
    captureArea = result.bounds;
    const areaText = `${Math.round(captureArea.width)}x${Math.round(captureArea.height)} @ (${Math.round(captureArea.x)}, ${Math.round(captureArea.y)})`;
    captureAreaInfo.textContent = areaText;
    startCaptureBtn.disabled = false;
    addLog('info', `区域已选择: ${areaText}`);
    
    // 立即截图并显示预览
    addLog('info', '正在截取预览...');
    const captureResult = await window.ttsAPI.captureArea(captureArea);
    if (captureResult.success) {
      updateScreenshotPreview(captureResult.imageData);
      addLog('info', '预览已更新');
    } else {
      addLog('error', '截取预览失败: ' + captureResult.error);
    }
  } else if (!result.canceled) {
    addLog('error', '选择区域失败');
  } else {
    addLog('info', '已取消选择');
  }
});

// 开始识别按钮
startCaptureBtn.addEventListener('click', () => {
  if (!captureArea) {
    addLog('error', '请先选择捕捉区域');
    return;
  }
  
  startCapture();
});

// 停止识别按钮
stopCaptureBtn.addEventListener('click', () => {
  stopCapture();
});

// 开始捕捉
function startCapture() {
  if (captureIntervalTimer) return;
  
  const intervalMs = getCaptureIntervalMs();
  addLog('info', `开始识别，间隔 ${intervalMs / 1000} 秒`);
  
  // 更新 UI
  startCaptureBtn.style.display = 'none';
  stopCaptureBtn.style.display = 'inline-block';
  selectAreaBtn.disabled = true;
  captureIntervalInput.disabled = true;
  captureStatus.textContent = '运行中';
  captureStatus.classList.remove('inactive');
  captureStatus.classList.add('active');
  
  // 立即执行一次
  performCapture();
  
  // 定时执行
  captureIntervalTimer = setInterval(performCapture, intervalMs);
}

// 停止捕捉
function stopCapture() {
  if (captureIntervalTimer) {
    clearInterval(captureIntervalTimer);
    captureIntervalTimer = null;
  }
  
  addLog('info', '已停止识别');
  
  // 更新 UI
  startCaptureBtn.style.display = 'inline-block';
  stopCaptureBtn.style.display = 'none';
  selectAreaBtn.disabled = false;
  captureIntervalInput.disabled = false;
  captureStatus.textContent = '已停止';
  captureStatus.classList.remove('active');
  captureStatus.classList.add('inactive');
}

// 执行一次捕捉和 OCR
async function performCapture() {
  try {
    // 截图
    const captureResult = await window.ttsAPI.captureArea(captureArea);
    
    if (!captureResult.success) {
      addLog('error', `截图失败: ${captureResult.error}`);
      return;
    }
    
    captureCount++;
    captureCountSpan.textContent = captureCount;
    
    // 更新截图预览
    updateScreenshotPreview(captureResult.imageData);
    
    addLog('info', `第 ${captureCount} 次截图完成，正在识别...`);
    
    // 调用 OCR 接口
    const ocrResult = await callOCR(captureResult.imageData);
    
    if (ocrResult.success) {
      const words = ocrResult.words.join(' | ');
      addLog('ocr', words || '(无识别结果)');
    } else {
      addLog('error', `OCR 失败: ${ocrResult.error}`);
    }
    
  } catch (error) {
    addLog('error', `捕捉出错: ${error.message}`);
  }
}

// 调用 OCR 接口
async function callOCR(base64Image) {
  try {
    // 将 base64 转换为 Blob
    const byteCharacters = atob(base64Image);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: 'image/png' });
    
    // 创建 FormData
    const formData = new FormData();
    formData.append('img', blob, 'image.png');
    
    // 调用接口
    const response = await fetch('https://apis.leping.fun/ocr/?get=1&fn=basicAccurate', {
      method: 'POST',
      body: formData
    });
    
    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` };
    }
    
    const data = await response.json();
    
    if (data.words_result) {
      const words = data.words_result.map(item => item.words);
      return { success: true, words };
    } else {
      return { success: false, error: '无识别结果' };
    }
    
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ==================== 初始化 ====================
initVoiceSelect();
loadSettings();
initExcelData();
loadCaptureInterval();
