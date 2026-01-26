const sherpa = require('sherpa-onnx-node');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

/**
 * # 创建模型目录
mkdir -p models && cd models && curl -LO https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-zh-aishell3.tar.bz2 && tar xvf vits-zh-aishell3.tar.bz2
cd models

# 使用 curl 下载模型
curl -LO https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-zh-aishell3.tar.bz2

# 解压
tar xvf vits-zh-aishell3.tar.bz2
 */

// TTS 配置 - 使用中文 VITS 模型
// 需要先下载模型文件，可以从 https://github.com/k2-fsa/sherpa-onnx/releases 下载
const config = {
  model: {
    // VITS 模型配置
    vits: {
      model: './models/vits-zh-aishell3/vits-aishell3.onnx',  // 模型文件路径
      tokens: './models/vits-zh-aishell3/tokens.txt',          // tokens 文件路径
      lexicon: './models/vits-zh-aishell3/lexicon.txt',        // 词典文件路径（可选）
    },
    numThreads: 2,      // 使用的线程数
    debug: false,       // 是否开启调试模式
    provider: 'cpu',    // 使用 CPU 推理
  },
  maxNumSentences: 1,   // 每次处理的最大句子数
};

// 创建 TTS 实例
let tts;
try {
  tts = new sherpa.OfflineTts(config);
  console.log('TTS 引擎初始化成功！');
  console.log(`采样率: ${tts.sampleRate} Hz`);
} catch (error) {
  console.error('TTS 引擎初始化失败:', error.message);
  console.log('\n请确保已下载模型文件。下载方式：');
  console.log('1. 访问 https://github.com/k2-fsa/sherpa-onnx/releases');
  console.log('2. 下载 vits-zh-aishell3 模型');
  console.log('3. 解压到 ./models/ 目录下');
  process.exit(1);
}

// 要转换的文本
const text = '你好世界！欢迎使用语音合成技术。今天天气真不错。';

// 生成语音
console.log(`正在生成语音: "${text}"`);
const audio = tts.generate({
  text: text,
  sid: 1,       // 说话人 ID（多说话人模型时使用）
  speed: 1.0,   // 语速，1.0 为正常速度
});

console.log(`生成完成！音频长度: ${audio.samples.length} 采样点`);
console.log(`时长: ${(audio.samples.length / audio.sampleRate).toFixed(2)} 秒`);

// 保存到临时文件并播放
const tempFile = path.join(os.tmpdir(), `tts_${Date.now()}.wav`);
saveWav(tempFile, audio.samples, audio.sampleRate);

console.log('正在播放...');
try {
  // macOS 使用 afplay 播放音频
  execSync(`afplay "${tempFile}"`);
  console.log('播放完成！');
} catch (error) {
  console.error('播放失败:', error.message);
} finally {
  // 删除临时文件
  fs.unlinkSync(tempFile);
}

/**
 * 将音频数据保存为 WAV 文件
 * @param {string} filePath - 输出文件路径
 * @param {Float32Array} samples - 音频采样数据
 * @param {number} sampleRate - 采样率
 */
function saveWav(filePath, samples, sampleRate) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * bitsPerSample / 8;
  const blockAlign = numChannels * bitsPerSample / 8;
  const dataSize = samples.length * 2; // 16-bit = 2 bytes per sample
  const fileSize = 36 + dataSize;

  const buffer = Buffer.alloc(44 + dataSize);
  let offset = 0;

  // RIFF 头
  buffer.write('RIFF', offset); offset += 4;
  buffer.writeUInt32LE(fileSize, offset); offset += 4;
  buffer.write('WAVE', offset); offset += 4;

  // fmt 子块
  buffer.write('fmt ', offset); offset += 4;
  buffer.writeUInt32LE(16, offset); offset += 4;           // fmt 块大小
  buffer.writeUInt16LE(1, offset); offset += 2;            // 音频格式 (PCM = 1)
  buffer.writeUInt16LE(numChannels, offset); offset += 2;  // 声道数
  buffer.writeUInt32LE(sampleRate, offset); offset += 4;   // 采样率
  buffer.writeUInt32LE(byteRate, offset); offset += 4;     // 字节率
  buffer.writeUInt16LE(blockAlign, offset); offset += 2;   // 块对齐
  buffer.writeUInt16LE(bitsPerSample, offset); offset += 2; // 位深度

  // data 子块
  buffer.write('data', offset); offset += 4;
  buffer.writeUInt32LE(dataSize, offset); offset += 4;

  // 写入音频数据 (Float32 -> Int16)
  for (let i = 0; i < samples.length; i++) {
    let sample = Math.max(-1, Math.min(1, samples[i])); // 限制在 [-1, 1]
    sample = sample < 0 ? sample * 32768 : sample * 32767; // 转换为 16-bit
    buffer.writeInt16LE(Math.round(sample), offset);
    offset += 2;
  }

  fs.writeFileSync(filePath, buffer);
}
