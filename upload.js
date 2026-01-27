const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const archiver = require('archiver');

// 配置：路径和扩展名映射
const pathsExtensions = {
  './dist': ['zip', 'dmg', 'exe']
};

// 上传地址
const UPLOAD_URL = 'http://u.leping.fun/upload';

// 分片大小限制 (100MB)
const SPLIT_SIZE_MB = 20;
const SPLIT_SIZE = SPLIT_SIZE_MB * 1024 * 1024;

// 获取当前时间戳
function getTimestamp() {
  const now = new Date();
  return now.getFullYear().toString() +
    (now.getMonth() + 1).toString().padStart(2, '0') +
    now.getDate().toString().padStart(2, '0') +
    now.getHours().toString().padStart(2, '0') +
    now.getMinutes().toString().padStart(2, '0') +
    now.getSeconds().toString().padStart(2, '0');
}

// 查找匹配的文件
function findMatchingFiles(dir, extensions) {
  const files = [];
  if (!fs.existsSync(dir)) {
    console.warn(`警告: 目录 ${dir} 未找到`);
    return files;
  }

  const items = fs.readdirSync(dir);
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    if (stat.isFile()) {
      const ext = path.extname(item).slice(1).toLowerCase();
      if (extensions.includes(ext)) {
        files.push({
          path: fullPath,
          name: item,
          size: stat.size,
          ext: ext
        });
      }
    }
  }
  return files;
}

// 创建 zip 压缩文件
function createZip(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      resolve(archive.pointer());
    });

    archive.on('error', (err) => {
      reject(err);
    });

    archive.pipe(output);
    archive.file(inputPath, { name: path.basename(inputPath) });
    archive.finalize();
  });
}

// 分割文件为多个部分
function splitFile(filePath, chunkSize) {
  const fileName = path.basename(filePath);
  const fileSize = fs.statSync(filePath).size;
  const chunks = [];

  const fd = fs.openSync(filePath, 'r');
  let partNum = 1;
  let bytesRead = 0;

  while (bytesRead < fileSize) {
    const remaining = fileSize - bytesRead;
    const currentChunkSize = Math.min(chunkSize, remaining);
    const buffer = Buffer.alloc(currentChunkSize);

    fs.readSync(fd, buffer, 0, currentChunkSize, bytesRead);

    // 使用 .part001, .part002 格式
    const partFileName = `${fileName}.part${partNum.toString().padStart(3, '0')}`;
    fs.writeFileSync(partFileName, buffer);
    chunks.push(partFileName);

    bytesRead += currentChunkSize;
    console.log(`  分片 ${partNum}: ${partFileName} (${(currentChunkSize / 1024 / 1024).toFixed(2)} MB)`);
    partNum++;
  }

  fs.closeSync(fd);
  return chunks;
}

// 上传单个文件
function uploadFile(filePath) {
  return new Promise((resolve, reject) => {
    const fileName = path.basename(filePath);
    const fileContent = fs.readFileSync(filePath);

    const boundary = '----FormBoundary' + Math.random().toString(36).substring(2);

    const header = Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="fileToUpload"; filename="${fileName}"\r\n` +
      `Content-Type: application/octet-stream\r\n\r\n`
    );

    const footer = Buffer.from(`\r\n--${boundary}--\r\n`);

    const body = Buffer.concat([header, fileContent, footer]);

    const url = new URL(UPLOAD_URL);
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length
      }
    };

    const client = url.protocol === 'https:' ? https : http;

    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve({ success: true, statusCode: res.statusCode, data });
        } else {
          resolve({ success: false, statusCode: res.statusCode, data });
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.write(body);
    req.end();
  });
}

// 主函数
async function main() {
  const timestamp = getTimestamp();
  const filesToUpload = [];
  const tempFiles = []; // 记录临时文件，用于清理
  let needsMergeInfo = false;

  console.log('开始查找匹配的文件...\n');

  // 遍历所有配置的路径
  for (const [dir, extensions] of Object.entries(pathsExtensions)) {
    const matchedFiles = findMatchingFiles(dir, extensions);

    for (const file of matchedFiles) {
      console.log(`找到文件: ${file.path} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);

      // 基础名称（添加时间戳）
      const baseName = path.basename(file.name, `.${file.ext}`);
      const newBaseName = `${baseName}-${timestamp}`;

      // 检查是否需要分片
      if (file.size > SPLIT_SIZE) {
        console.log(`文件大于 ${SPLIT_SIZE_MB}MB，进行压缩和分片...`);

        // 先压缩
        const zipPath = `${newBaseName}.zip`;
        console.log(`  正在压缩...`);
        const zipSize = await createZip(file.path, zipPath);
        console.log(`  压缩完成: ${zipPath} (${(zipSize / 1024 / 1024).toFixed(2)} MB)`);
        tempFiles.push(zipPath);

        // 检查压缩后是否仍需要分片
        if (zipSize > SPLIT_SIZE) {
          console.log(`  压缩后仍大于 ${SPLIT_SIZE_MB}MB，进行分片...`);
          const chunks = splitFile(zipPath, SPLIT_SIZE);

          // 删除原 zip 文件
          fs.unlinkSync(zipPath);
          tempFiles.splice(tempFiles.indexOf(zipPath), 1);

          // 添加所有分片到上传列表
          for (const chunk of chunks) {
            filesToUpload.push(chunk);
            tempFiles.push(chunk);
          }
          needsMergeInfo = true;
        } else {
          // 压缩后小于限制，直接上传 zip
          filesToUpload.push(zipPath);
        }
      } else {
        // 文件小于限制，直接复制并重命名
        const newName = `${newBaseName}.${file.ext}`;
        fs.copyFileSync(file.path, newName);
        filesToUpload.push(newName);
        tempFiles.push(newName);
      }
    }
  }

  if (filesToUpload.length === 0) {
    console.error('错误: 未找到任何匹配的文件');
    process.exit(1);
  }

  console.log(`\n共 ${filesToUpload.length} 个文件待上传\n`);

  // 上传所有文件
  let successCount = 0;
  let failCount = 0;

  for (const file of filesToUpload) {
    console.log(`正在上传: ${file}`);
    try {
      const result = await uploadFile(file);
      if (result.success) {
        console.log(`  ✓ 上传成功`);
        successCount++;
      } else {
        console.log(`  ✗ 上传失败, HTTP状态码: ${result.statusCode}`);
        failCount++;
      }
    } catch (err) {
      console.log(`  ✗ 上传失败: ${err.message}`);
      failCount++;
    }
  }

  // // 清理临时文件
  console.log('\n清理临时文件...');
  for (const file of tempFiles) {
    try {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
    } catch (err) {
      console.warn(`清理文件 ${file} 失败: ${err.message}`);
    }
  }

  console.log(`\n上传完成！成功: ${successCount}, 失败: ${failCount}`);

  // 输出合并说明
  if (needsMergeInfo) {
    console.log('\n📦 下载后合并方法:');
    console.log('');
    console.log('   Windows (PowerShell):');
    console.log('   Get-Content *.part* -Encoding Byte -ReadCount 0 | Set-Content merged.zip -Encoding Byte');
    console.log('');
    console.log('   macOS / Linux:');
    console.log('   cat *.part* > merged.zip');
    console.log('');
    console.log('   然后解压 merged.zip 即可');
  }
}

main().catch(err => {
  console.error('执行出错:', err);
  process.exit(1);
});
