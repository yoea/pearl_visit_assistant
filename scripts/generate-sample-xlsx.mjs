// 生成与真实表头结构一致的【虚构】示例数据（用于本地演示与手工验证）。
// 绝不读取真实 Excel；所有姓名/号码均为虚构。
import * as XLSX from 'xlsx';
import { writeFileSync, mkdirSync } from 'node:fs';

const HEADERS = [
  '序号', '学校名称', '学校编号', '珍珠班名称', '珍珠班编号', '珍珠号', '珍珠生姓名',
  '资助项目名称', '出资方类型', '结对捐方', '结对要求', '资金池名称', '拨款金额', '期数',
  '困难度', '状态', '就读状态', '就读状态变更时间', '就读状态变更原因', '户口', '民族',
  '身份证号', '性别', '身高', '体重', '健康情况', '电话', 'qq', '微信', '邮箱', '籍贯',
  '住址省', '州市', '县区', '详细地址', '距离高中路程', '初中就读学校', '中考满分',
  '中考成绩', '录取高中全校排名', '全年级人数', '家庭情况', '家访方式', '家访教师姓名',
  '家访总结', '获奖经历及兴趣爱好', '申请理由', '审批意见', '审批人', '住房状况',
  '交通工具', '年收入', '年收入说明', '人均年收入', '上学子女人数', '困难原因',
  '需赡养老人情况', '需赡养老人情况说明', '负债情况', '负债情况说明',
];

const ROWS = [
  { name: '测试学生甲', gender: '女', income: 24000, perCapita: 8000, house: '租房（年租金/元）/10000以下', distance: 8, rank: 160, children: 2, elderly: '4人', debt: '5万元', reason: '母亲患心脏病无法从事重体力劳动，父亲务农收入有限，家庭负担较重。', note: null },
  { name: '测试学生乙', gender: '男', income: 50000, perCapita: 16666, house: '自建房', distance: 1.4, rank: 46, children: 1, elderly: null, debt: '无负债', reason: '学习成绩优异，希望获得资助继续求学。', note: '父母务工，收入稳定。' },
  { name: '测试学生丙', gender: '女', income: 30000, perCapita: 10000, house: '租房（年租金/元）/10000-20000', distance: 12, rank: 300, children: 3, elderly: '2人', debt: '2万元', reason: '兄弟姐妹多，都在上学，家里只有母亲一人工作。', note: null },
  { name: '测试学生丁', gender: '男', income: 18000, perCapita: 6000, house: '自建房', distance: 3, rank: 600, children: 1, elderly: '2人', debt: '无负债', reason: '父亲残疾，家庭主要靠低保和母亲打零工。', note: '电话13800138000，住址某村一组8号（验证清洗功能）。' },
];

const matrix = [
  ['高中段珍珠生信息'],
  HEADERS,
  ...ROWS.map((r, i) => [
    i + 1, '某县第一中学（虚构）', 'X-1', '班名待定', 'X-01-00', null, r.name,
    '2026级捡回珍珠计划-高中段', '资金池', null, null, '资金池A', 30000, '2026级',
    null, '复审中', null, null, null, '农村', '汉族',
    `1101012000010112${String(i).padStart(2, '0')}`, r.gender, '165cm', '50kg', '健康',
    `1390000000${i}`, null, null, null, '某省某市某县', '某省', '某市', '某县',
    null, r.distance, '某县第二初级中学（虚构）', 820, 700 - i * 10, r.rank, 923,
    '正常', '入户家访', '王老师', `家访记录：${r.note ?? '家庭情况属实。'}`,
    '喜欢读书', `申请理由：${r.reason}`, null, '李老师', r.house, '无以上类型车辆',
    r.income, r.note, r.perCapita, r.children, r.reason, r.elderly, null, r.debt, null,
  ]),
];

const ws = XLSX.utils.aoa_to_sheet(matrix);
ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 7 } }];
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, '高中段珍珠生信息');
const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
mkdirSync('examples', { recursive: true }); // 【裁决】预授权偏离：计划代码缺 mkdir，examples/ 可能不存在
writeFileSync('examples/示例数据（虚构）.xlsx', Buffer.from(out));
console.log('已生成 examples/示例数据（虚构）.xlsx（全部为虚构数据）');
