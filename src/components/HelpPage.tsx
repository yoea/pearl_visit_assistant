import Card from './ui/Card';
import Button from './ui/Button';

const STEPS = [
  {
    title: '第 1 步：导入 Excel',
    body: [
      '点击首页虚线框，选择学生名单 Excel（.xlsx / .xls），或直接把文件拖进来。',
      '文件打开后，脱敏和安全检查会在几秒内自动完成，无需其他操作。',
    ],
  },
  {
    title: '第 2 步：检查并确认分析',
    body: [
      '页面顶部会显示检查结果：绿色「可以开始分析」说明数据没问题；红色说明发现疑似敏感信息，已自动阻止发送，需检查源文件后重新导入。',
      '点击「确认并开始 AI 分析」后才会发送脱敏数据，系统绝不自动发送。',
      '分析期间会显示动画和预计耗时（通常几十秒到几分钟），请勿关闭页面。',
    ],
  },
  {
    title: '第 3 步：查看和下载报告',
    body: [
      '分析完成后自动进入报告页：先看「学校整体情况」，再按学生逐个查看面谈参考。',
      '报告标题显示学生姓名（本地匹配，绝不外传），也可在「本地查找」框输入姓名快速定位。',
      '可下载 Markdown 或单文件 HTML 两种格式，方便打印或转发。',
    ],
  },
];

const PRIVACY = [
  '原始学生数据（姓名/身份证/电话/QQ/微信/邮箱/详细地址/教师姓名等）只在您的浏览器内处理，不存储、不上传；关闭页面后全部消失。',
  '发送给 AI 的只有脱敏后的数据（学生显示为匿名编号），发送前还有三道强制安全检查，发现问题就阻止发送，不能绕过。',
  '报告中的「需要重点核实」和「面谈注意事项」仅供参考，最终判断由工作人员面谈后决定。',
];

const FAQ = [
  {
    q: '分析要等多久？',
    a: '取决于学生人数：10 人以内约 10-20 秒，50 人以内约 1 分钟，人数更多可能需要几分钟。请耐心等待，勿关闭页面。',
  },
  {
    q: '提示「发现疑似敏感信息，已阻止发送」怎么办？',
    a: '说明脱敏后的数据中仍检出了疑似身份证号、手机号、姓名等内容（常见原因：某个叙事字段里写了这些信息，或源文件格式异常）。请打开源 Excel 检查相关单元格，处理后重新导入。',
  },
  {
    q: '提示「AI 分析失败」怎么办？',
    a: '可点击「重新开始」后重试；连续失败请检查网络（浏览器需能访问外网），或联系管理员。',
  },
  {
    q: '报告页为什么显示 student-001 而不是姓名？',
    a: '说明导入的表格里没有「珍珠生姓名/姓名/学生姓名」列。重新导入包含姓名列的表格即可显示真实姓名。',
  },
  {
    q: '下载的报告里有学生姓名，安全吗？',
    a: '下载内容含姓名是为了走访时方便对应。文件请妥善保管，用完后建议删除，不要发到公共群或上传网盘。',
  },
];

export default function HelpPage({ onBack }: { onBack: () => void }) {
  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-800">使用帮助</h1>
            <p className="mt-1 text-sm text-slate-500">
              本工具把候选珍珠生的 Excel 名单在本地脱敏后交给 AI，生成走访面谈参考报告。
            </p>
          </div>
          <Button variant="secondary" onClick={onBack}>返回工具</Button>
        </div>
      </Card>

      <Card>
        <h2 className="text-base font-semibold text-slate-800">使用方法（共 3 步）</h2>
        <div className="mt-3 space-y-4">
          {STEPS.map((step) => (
            <div key={step.title} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-medium text-emerald-800">{step.title}</p>
              <ul className="mt-2 space-y-1 text-sm text-slate-600">
                {step.body.map((line) => <li key={line}>· {line}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h2 className="text-base font-semibold text-slate-800">数据安全说明</h2>
        <ul className="mt-3 space-y-2">
          {PRIVACY.map((p) => (
            <li key={p} className="flex gap-2 text-sm text-slate-600">
              <span className="text-emerald-700">✓</span> {p}
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <h2 className="text-base font-semibold text-slate-800">常见问题</h2>
        <div className="mt-3 space-y-3">
          {FAQ.map((f) => (
            <div key={f.q} className="rounded-lg border border-amber-100 bg-amber-50 p-3">
              <p className="text-sm font-medium text-slate-800">Q：{f.q}</p>
              <p className="mt-1 text-sm text-slate-600">{f.a}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
