const { contextBridge, ipcRenderer } = require('electron');

// 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('ttsAPI', {
  // 生成并播放语音
  generate: (text, sid, speed) => {
    return ipcRenderer.invoke('generate-tts', { text, sid, speed });
  }
});
