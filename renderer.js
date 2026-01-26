// DOM 元素
const textInput = document.getElementById('text');
const voiceSelect = document.getElementById('voice');
const speedInput = document.getElementById('speed');
const speedDisplay = document.getElementById('speedDisplay');
const generateBtn = document.getElementById('generateBtn');
const statusDiv = document.getElementById('status');

// localStorage 键名
const STORAGE_KEYS = {
  TEXT: 'tts_text',
  VOICE: 'tts_voice',
  SPEED: 'tts_speed'
};

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

// 使用 Web Audio API 播放音频
async function playAudio(samples, sampleRate) {
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  
  // 创建音频缓冲区
  const audioBuffer = audioContext.createBuffer(1, samples.length, sampleRate);
  const channelData = audioBuffer.getChannelData(0);
  
  // 复制采样数据
  for (let i = 0; i < samples.length; i++) {
    channelData[i] = samples[i];
  }
  
  // 创建音频源并播放
  const source = audioContext.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(audioContext.destination);
  
  return new Promise((resolve) => {
    source.onended = () => {
      audioContext.close();
      resolve();
    };
    source.start(0);
  });
}

// 生成按钮点击事件
generateBtn.addEventListener('click', async () => {
  const text = textInput.value.trim();
  
  if (!text) {
    setStatus('请输入要转换的文字', 'error');
    return;
  }

  const sid = parseInt(voiceSelect.value);
  const speed = parseFloat(speedInput.value);

  // 禁用按钮
  generateBtn.disabled = true;
  generateBtn.textContent = '⏳ 生成中...';
  setStatus('正在生成语音...');

  try {
    const result = await window.ttsAPI.generate(text, sid, speed);
    
    if (result.success) {
      setStatus('🔊 正在播放...', 'success');
      await playAudio(result.samples, result.sampleRate);
      setStatus('✅ 播放完成', 'success');
    } else {
      setStatus(`❌ ${result.error}`, 'error');
    }
  } catch (error) {
    setStatus(`❌ 发生错误: ${error.message}`, 'error');
  } finally {
    generateBtn.disabled = false;
    generateBtn.textContent = '🔊 生成并播放';
  }
});

// 初始化
initVoiceSelect();
loadSettings();
