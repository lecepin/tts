const { app, BrowserWindow, ipcMain, Menu, dialog } = require('electron');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync } = require('child_process');
const Module = require('module');

Menu.setApplicationMenu(null);


let mainWindow;
let tts;

// 获取平台对应的原生模块名称
function getPlatformModuleName() {
  const platform = process.platform;
  const arch = process.arch;
  
  if (platform === 'win32' && arch === 'x64') {
    return 'sherpa-onnx-win-x64';
  } else if (platform === 'darwin' && arch === 'arm64') {
    return 'sherpa-onnx-darwin-arm64';
  } else if (platform === 'darwin' && arch === 'x64') {
    return 'sherpa-onnx-darwin-x64';
  } else if (platform === 'linux' && arch === 'x64') {
    return 'sherpa-onnx-linux-x64';
  }
  throw new Error(`Unsupported platform: ${platform}-${arch}`);
}

// 在打包环境中设置原生模块加载路径
function setupNativeModuleLoader() {
  if (!app.isPackaged) return;
  
  const moduleName = getPlatformModuleName();
  const unpackedBase = path.join(
    process.resourcesPath,
    'app.asar.unpacked',
    'node_modules'
  );
  
  // 原生模块的完整路径
  const nativeModulePath = path.join(unpackedBase, moduleName, 'sherpa-onnx.node');
  const nativeModuleDir = path.join(unpackedBase, moduleName);
  
  console.log('Looking for native module at:', nativeModulePath);
  
  if (!fs.existsSync(nativeModulePath)) {
    console.error('Native module not found!');
    console.log('Available files in unpacked:', fs.existsSync(unpackedBase) ? fs.readdirSync(unpackedBase) : 'dir not found');
    return;
  }
  
  console.log('Native module found');
  
  // 拦截 require 调用，重定向 sherpa-onnx.node 的加载
  const originalResolveFilename = Module._resolveFilename;
  Module._resolveFilename = function(request, parent, isMain, options) {
    // 拦截对 sherpa-onnx.node 的请求
    if (request.includes('sherpa-onnx') && request.endsWith('.node')) {
      console.log('Redirecting native module request:', request, '->', nativeModulePath);
      return nativeModulePath;
    }
    // 拦截对平台特定模块目录的请求
    if (request.includes(moduleName) && request.includes('sherpa-onnx.node')) {
      return nativeModulePath;
    }
    return originalResolveFilename.call(this, request, parent, isMain, options);
  };
  
  // Windows 需要设置 DLL 搜索路径
  if (process.platform === 'win32') {
    // 将原生模块目录添加到 PATH，以便加载依赖的 DLL
    process.env.PATH = nativeModuleDir + path.delimiter + process.env.PATH;
  }
}

// 获取模型路径（开发环境和打包后路径不同）
function getModelsPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'models');
  }
  return path.join(__dirname, 'models');
}

// 初始化 TTS 引擎
function initTTS() {
  // 设置原生模块加载器
  setupNativeModuleLoader();
  
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
    width: 650,
    height: 650,
    resizable: true,
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

// 打开文件选择对话框
ipcMain.handle('open-file-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Excel 文件', extensions: ['xls', 'xlsx'] }
    ]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { success: false, canceled: true };
  }

  const filePath = result.filePaths[0];
  
  // 读取并解析 Excel 文件
  try {
    const data = readExcelFile(filePath);
    return { success: true, filePath, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 读取 Excel 文件
ipcMain.handle('read-excel', async (event, filePath) => {
  try {
    if (!fs.existsSync(filePath)) {
      return { success: false, error: '文件不存在' };
    }
    const data = readExcelFile(filePath);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 解析 Excel 文件
function readExcelFile(filePath) {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  
  // 跳过表头，解析数据
  const data = [];
  for (let i = 1; i < jsonData.length; i++) {
    const row = jsonData[i];
    if (row && row.length >= 2) {
      data.push({
        name: String(row[0] || '').trim(),
        answer: String(row[1] || '').trim()
      });
    }
  }
  
  return data;
}

// 下载模板文件
ipcMain.handle('download-template', async () => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '保存模板文件',
    defaultPath: '直播话术模板.xlsx',
    filters: [
      { name: 'Excel 文件', extensions: ['xlsx'] }
    ]
  });

  if (result.canceled || !result.filePath) {
    return { success: false, canceled: true };
  }

  try {
    // 创建模板数据
    const templateData = [
      ['名称', '回答'],
      ['来人了', '欢迎来到直播间。我们的鞋子大家都很喜欢'],
      ['没货了', '最后十双了，家人们快下单吧，我们今天要停播了'],
      ['欢迎语', '欢迎新来的宝宝们，点点关注不迷路'],
      ['感谢关注', '感谢家人们的关注，有什么问题随时问我'],
      ['促销语', '今天的价格是全网最低价，错过就没有了'],
      ['催单语', '库存不多了，喜欢的家人们抓紧下单'],
      ['福利预告', '等会儿还有福利款，家人们不要走开'],
      ['互动语', '喜欢的家人们扣个1，让我看看有多少人'],
      ['感谢下单', '感谢家人们的支持，我们会尽快发货'],
      ['结束语', '今天的直播就到这里了，感谢家人们的陪伴，明天见']
    ];

    // 创建工作簿
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(templateData);
    
    // 设置列宽
    worksheet['!cols'] = [
      { wch: 12 },  // 名称列宽度
      { wch: 50 }   // 回答列宽度
    ];
    
    XLSX.utils.book_append_sheet(workbook, worksheet, '直播话术');
    XLSX.writeFile(workbook, result.filePath);

    return { success: true, filePath: result.filePath };
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
