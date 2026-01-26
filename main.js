const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync } = require('child_process');

let mainWindow;
let tts;

// 获取模型路径（开发环境和打包后路径不同）
function getModelsPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'models');
  }
  return path.join(__dirname, 'models');
}

// 初始化 TTS 引擎
function initTTS() {
  const sherpa = require('sherpa-onnx-node');
  const modelsPath = getModelsPath();
  
  // 使用 VITS 中文模型 (aishell3)
  const vitsPath = path.join(modelsPath, 'vits-zh-aishell3');
  const config = {
    model: {
      vits: {
        model: path.join(vitsPath, 'vits-aishell3.onnx'),
        tokens: path.join(vitsPath, 'tokens.txt'),
        lexicon: path.join(vitsPath, 'lexicon.txt'),
      },
      numThreads: 2,
      debug: true,
      provider: 'cpu',
    },
    ruleFsts: [
      path.join(vitsPath, 'date.fst'),
      path.join(vitsPath, 'number.fst'),
      path.join(vitsPath, 'phone.fst'),
      path.join(vitsPath, 'new_heteronym.fst'),
    ].join(','),
    ruleFars: path.join(vitsPath, 'rule.far'),
    maxNumSentences: 1,
  };

  try {
    tts = new sherpa.OfflineTts(config);
    console.log('TTS 引擎初始化成功');
    return true;
  } catch (error) {
    console.error('TTS 引擎初始化失败:', error.message);
    return false;
  }
}

// 创建主窗口
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 500,
    height: 450,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile('index.html');
  
  // 开发时打开开发者工具
  // mainWindow.webContents.openDevTools();
}

// 保存 WAV 文件
function saveWav(filePath, samples, sampleRate) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * bitsPerSample / 8;
  const blockAlign = numChannels * bitsPerSample / 8;
  const dataSize = samples.length * 2;
  const fileSize = 36 + dataSize;

  const buffer = Buffer.alloc(44 + dataSize);
  let offset = 0;

  buffer.write('RIFF', offset); offset += 4;
  buffer.writeUInt32LE(fileSize, offset); offset += 4;
  buffer.write('WAVE', offset); offset += 4;
  buffer.write('fmt ', offset); offset += 4;
  buffer.writeUInt32LE(16, offset); offset += 4;
  buffer.writeUInt16LE(1, offset); offset += 2;
  buffer.writeUInt16LE(numChannels, offset); offset += 2;
  buffer.writeUInt32LE(sampleRate, offset); offset += 4;
  buffer.writeUInt32LE(byteRate, offset); offset += 4;
  buffer.writeUInt16LE(blockAlign, offset); offset += 2;
  buffer.writeUInt16LE(bitsPerSample, offset); offset += 2;
  buffer.write('data', offset); offset += 4;
  buffer.writeUInt32LE(dataSize, offset); offset += 4;

  for (let i = 0; i < samples.length; i++) {
    let sample = Math.max(-1, Math.min(1, samples[i]));
    sample = sample < 0 ? sample * 32768 : sample * 32767;
    buffer.writeInt16LE(Math.round(sample), offset);
    offset += 2;
  }

  fs.writeFileSync(filePath, buffer);
}

// 处理 TTS 生成请求 - 返回音频数据给渲染进程播放
ipcMain.handle('generate-tts', async (event, { text, sid, speed }) => {
  if (!tts) {
    return { success: false, error: 'TTS 引擎未初始化' };
  }

  try {
    // enableExternalBuffer: false 避免 Electron 中的 "External buffers are not allowed" 错误
    const audio = tts.generate({
      text: text,
      sid: sid,
      speed: speed,
      enableExternalBuffer: false,
    });

    // 将 Float32Array 转换为普通数组，以便通过 IPC 传输
    const samples = Array.from(audio.samples);
    
    return {
      success: true,
      samples: samples,
      sampleRate: audio.sampleRate
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 应用准备就绪
app.whenReady().then(() => {
  initTTS();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// 关闭所有窗口时退出应用（macOS 除外）
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
