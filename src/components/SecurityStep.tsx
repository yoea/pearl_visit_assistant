import type { SecurityScanResult } from '../security/scanner';
import type { AnonymizationOutput } from '../types/student';
import Card from './ui/Card';
import Button from './ui/Button';
import CheckItem from './ui/CheckItem';

const CHECK_LABELS = [
  { key: 'id-card', label: '身份证号' },
  { key: 'mobile', label: '手机号' },
  { key: 'landline', label: '固定电话' },
  { key: 'name-blacklist', label: '姓名' },
  { key: 'name', label: '姓名模式' },
  { key: 'email', label: '邮箱' },
  { key: 'wechat', label: '微信' },
  { key: 'qq', label: 'QQ' },
  { key: 'address', label: '详细地址' },
  { key: 'pearl-id', label: '珍珠号' },
  { key: 'forbidden-field', label: '其他高风险个人身份信息' },
  { key: 'malformed-payload', label: '数据异常' },
] as const;

export default function SecurityStep({
  output, scan, onAnalyze, analyzing, error, onReset,
}: {
  output: AnonymizationOutput;
  /** scanned 阶段一定携带扫描结果（pipeline 判别联合保证），无「未扫描」态 */
  scan: SecurityScanResult;
  onAnalyze: () => void;
  analyzing: boolean;
  error?: string;
  onReset: () => void;
}) {
  const hitKeys = new Set(scan.findings.map((f) => f.category));

  return (
    <Card>
      <h2 className="text-lg font-semibold text-slate-800">AI 发送前安全检查</h2>
      <p className="mt-1 text-sm text-slate-500">
        在调用 AI 之前，对最终发送数据（共 {output.students.length} 名学生的匿名数据）再做一次敏感信息扫描。
        如发现疑似敏感信息将阻止发送，且不允许绕过。
      </p>

      <div className="mt-4">
        {scan.passed ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm font-medium text-emerald-800">✓ 未发现禁止发送的个人身份信息</p>
            <ul className="mt-3 space-y-1">
              {CHECK_LABELS.map((c) => (
                <CheckItem key={c.key} label={c.label} ok />
              ))}
            </ul>
            <div className="mt-4">
              <Button onClick={onAnalyze} disabled={analyzing}>
                {analyzing ? 'AI 分析中…' : '开始 AI 分析'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-medium text-red-800">
              ✗ 发现疑似敏感信息，已阻止发送。请重新导入并检查源文件后重试。
            </p>
            <ul className="mt-3 space-y-1">
              {CHECK_LABELS.map((c) => (
                <CheckItem
                  key={c.key}
                  label={c.label}
                  ok={!hitKeys.has(c.key)}
                  detail={
                    hitKeys.has(c.key)
                      ? scan.findings
                          .filter((f) => f.category === c.key)
                          .map((f) => `${f.field}: ${f.snippet}`)
                          .join('；')
                      : undefined
                  }
                />
              ))}
            </ul>
            <div className="mt-4">
              <Button variant="secondary" onClick={onReset}>重新开始</Button>
            </div>
          </div>
        )}
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>
    </Card>
  );
}
