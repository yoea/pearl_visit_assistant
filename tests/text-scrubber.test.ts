import { describe, it, expect } from 'vitest';
import { scrubText } from '../src/anonymization/text-scrubber';
import { MASK } from '../src/security/rules';

const noBlacklist = new Set<string>();

describe('scrubText', () => {
  it('掩码内嵌手机号', () => {
    expect(scrubText('父亲在广东打工，电话13800138000联系', noBlacklist)).toBe(
      `父亲在广东打工，电话${MASK}联系`,
    );
  });

  it('掩码 18 位身份证号', () => {
    expect(scrubText('证件号110101200001011234已过期', noBlacklist)).toBe(`证件号${MASK}已过期`);
  });

  it('掩码邮箱', () => {
    expect(scrubText('邮箱abc@example.com可用', noBlacklist)).toBe(`邮箱${MASK}可用`);
  });

  it('QQ/微信按上下文绑定掩码', () => {
    expect(scrubText('QQ：123456789，微信：wxid_abc123', noBlacklist)).toBe(
      `${MASK}，${MASK}`,
    );
  });

  it('黑名单姓名精确掩码', () => {
    expect(scrubText('家访教师张磊曾来访', new Set(['张磊']))).toBe(`家访教师${MASK}曾来访`);
  });

  it('地址子句掩码（号楼单元室组合）', () => {
    // 整句掩码更保守，避免保留地名前缀（如“住在/南湖”）带来的泄漏风险
    expect(scrubText('住在南湖回迁一号楼六单元701室', noBlacklist)).toBe(MASK);
  });

  it('纯数字金额不误伤（30000 不是 QQ 号）', () => {
    expect(scrubText('年收入30000元', noBlacklist)).toBe('年收入30000元');
  });

  it('弱地址不误伤（仅一个地址词）', () => {
    expect(scrubText('家在县城，走读', noBlacklist)).toBe('家在县城，走读');
  });

  it('无敏感内容时原样返回', () => {
    expect(scrubText('家庭和睦，收入稳定', noBlacklist)).toBe('家庭和睦，收入稳定');
  });
});
