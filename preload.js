const { contextBridge, ipcRenderer } = require('electron');

// 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('ttsAPI', {
  // 生成并播放语音
  generate: (text, sid, speed) => {
    return ipcRenderer.invoke('generate-tts', { text, sid, speed });
  },

  // 打开文件选择对话框
  openFile: () => {
    return ipcRenderer.invoke('open-file-dialog');
  },

  // 读取 Excel 文件
  readExcel: (filePath) => {
    return ipcRenderer.invoke('read-excel', filePath);
  },

  // 下载模板文件
  downloadTemplate: () => {
    return ipcRenderer.invoke('download-template');
  }
});
