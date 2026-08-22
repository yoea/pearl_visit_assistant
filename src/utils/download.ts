/** 下载文本文件（仅本地 Blob，不上传） */
export function downloadTextFile(filename: string, content: string, mime = 'text/plain;charset=utf-8'): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  // 延迟回收：同步 revoke 在部分浏览器会取消下载（Task 11 复审）
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
