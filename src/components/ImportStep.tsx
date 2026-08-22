import { useRef, useState, type DragEvent } from 'react';
import Card from './ui/Card';

export default function ImportStep({
  onFile, error,
}: {
  onFile: (buffer: ArrayBuffer) => void;
  error?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const readFile = async (file: File) => {
    if (!/\.(xlsx|xls)$/i.test(file.name)) {
      alert('请选择 .xlsx 或 .xls 文件');
      return;
    }
    const buffer = await file.arrayBuffer();
    onFile(buffer);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void readFile(file);
  };

  return (
    <Card>
      <h1 className="text-xl font-semibold text-slate-800">珍珠生走访智能面谈辅助工具</h1>
      <p className="mt-2 text-sm text-slate-500">
        隐私优先：Excel 仅在当前浏览器本地处理，原始学生信息不会上传到任何服务器。
      </p>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`mt-6 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-10 transition-colors ${
          dragging ? 'border-emerald-500 bg-emerald-50' : 'border-slate-300 bg-slate-50 hover:bg-slate-100'
        }`}
      >
        <p className="text-sm text-slate-600">点击选择，或将 Excel 拖拽到此处</p>
        <p className="mt-1 text-xs text-slate-400">支持 .xlsx / .xls（如「2026级珍珠生候选申请名单.xlsx」）</p>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void readFile(file);
            e.target.value = '';
          }}
        />
      </div>
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      <div className="mt-6 text-xs text-slate-500">
        <p className="font-medium">使用步骤</p>
        <ol className="mt-1 list-decimal pl-4 leading-6">
          <li>导入Excel</li><li>本地脱敏</li><li>安全检查</li><li>AI分析</li><li>查看报告</li><li>下载报告</li>
        </ol>
      </div>
    </Card>
  );
}
