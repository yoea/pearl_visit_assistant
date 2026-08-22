/** 掩码占位符 */
export const MASK = '[已隐藏]';

export type RuleCategory =
  | 'id-card' | 'mobile' | 'landline' | 'email' | 'qq' | 'wechat'
  | 'address' | 'pearl-id' | 'name';

export type RuleScope = 'text' | 'number' | 'both';

export interface Rule {
  category: RuleCategory;
  label: string; // 中文类别名
  pattern: RegExp; // 全局（g）
  scope: RuleScope;
}

/**
 * 规则集单一来源：TextScrubber（掩码）与 SecurityScanner（硬闸）共用。
 * 顺序有语义：id-card 在 mobile 之前（身份证号码含手机号样式的子串，先整体识别）。
 * 注意：所有 pattern 均为全局（g）正则；用 exec/test 消费前必须重置 lastIndex（replace/match 自动重置）。
 */
export const RULES: Rule[] = [
  { category: 'id-card', label: '身份证号', pattern: /\d{17}[\dXx]/g, scope: 'both' },
  { category: 'mobile', label: '手机号', pattern: /1[3-9]\d{9}/g, scope: 'both' },
  { category: 'landline', label: '固定电话', pattern: /0\d{2,3}-?\d{7,8}/g, scope: 'both' },
  { category: 'email', label: '邮箱', pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, scope: 'text' },
  { category: 'qq', label: 'QQ号', pattern: /qq[号]?[:：]?\s*[1-9]\d{4,10}/gi, scope: 'text' },
  { category: 'wechat', label: '微信号', pattern: /微信(号|id)?[:：]?\s*[a-zA-Z][a-zA-Z0-9_-]{5,19}/gi, scope: 'text' },
  { category: 'pearl-id', label: '珍珠号', pattern: /珍珠号[:：]?\s*[^\s，。；;,]*/g, scope: 'text' },
  {
    category: 'name',
    label: '姓名模式（姓氏+称呼）',
    // 复姓显式列出 + 单字姓氏 + 称呼（班已移除：班主任是角色词；{1,2} 贪婪量词会吞并相邻姓氏字，如「任张老师」，故弃用）
    pattern: /(?:欧阳|司马|上官|诸葛|夏侯|皇甫|尉迟|公孙|慕容|司徒|令狐|端木|轩辕|东方|西门|独孤|长孙|南宫|宇文|申屠|百里|呼延|第五|鲜于|闾丘|亓官|司寇|巫马|乐正|漆雕|公羊|公冶|宗政|濮阳|淳于|单于|太叔|公西|壤驷|宰父|谷梁|段干|拓跋|夹谷|东郭|羊舌|微生|梁丘|左丘|钟离|[赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜谢邹喻苏潘葛范彭鲁韦马苗方俞任袁柳鲍史唐费薛雷贺倪汤滕罗毕郝邬安常傅卞齐康伍余元顾孟平黄穆萧尹姚邵汪祁毛禹狄米贝明臧计成戴宋庞熊纪舒屈项祝董梁杜阮蓝闵席季贾路娄江童颜郭梅盛林刁钟徐邱骆高夏蔡田樊胡凌霍虞万支柯管卢莫经裘干解应宗丁宣邓郁单杭洪包诸左石崔吉钮龚程嵇邢滑裴陆荣翁荀惠甄曲封芮羿储靳汲邴糜松井段富巫乌焦巴弓车侯宓蓬全郗仰秋仲伊宫宁仇栾暴甘钭厉戎祖武符刘景詹束龙叶幸司韶郜黎蓟薄印宿白怀蒲邰鄂索籍赖卓蔺屠池乔阴胥苍双闻莘党翟谭贡劳逄姬申扶堵冉宰郦雍璩桑桂濮牛寿通边扈燕冀郏浦尚农温别庄晏柴瞿阎充慕连茹习宦艾鱼容向古易慎戈廖庾终暨居衡步都耿满弘匡国文寇广禄阙东欧殳沃利蔚越夔隆师巩厍聂晁勾敖融冷訾辛阚那简饶空曾毋沙乜养鞠须丰巢关蒯相查后荆红游竺权逯盖益桓公])(老师|校长|主任|同学)/g,
    scope: 'text',
  },
];

/** 地址子句掩码：同一子句（按标点切分）内出现 ≥2 个地址词 → 整句掩码 */
export const ADDRESS_TOKENS = /省|市|县|区|镇|乡|村|组|路|街道|街|巷|号|栋|单元|室|楼|小区|苑|花园/g;

/** 地址子句切分字符类（单一来源：切分与单字符判定共用，避免双源漂移） */
const CLAUSE_CHAR_CLASS = '[。，；;！？!?，、：]';

/** 地址子句切分符（带捕获组；清洗器与扫描器共用，禁止加 g 标志） */
export const CLAUSE_SPLIT = new RegExp(`(${CLAUSE_CHAR_CLASS})`);

/** 单字符切分符判定（锚定形式：与 CLAUSE_SPLIT 同源，防止长串因含分隔符被误判为分隔段） */
export const CLAUSE_SEP_CHAR = new RegExp(`^${CLAUSE_CHAR_CLASS}$`);

/** 结构化地区字段（省/市/县/籍贯）：不做地址规则扫描（区域级信息经用户确认保留） */
export const STRUCTURED_REGION_KEYS = new Set(['province', 'city', 'county', 'ancestralHome']);
