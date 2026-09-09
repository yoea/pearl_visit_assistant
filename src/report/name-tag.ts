/** 报告文案中的匿名编号（student-003）→ 显示为「姓名（student-003）」（本地 nameIndex，绝不出站） */
export function decorateStudentIds(text: string, nameIndex?: ReadonlyMap<string, string>): string {
  if (!nameIndex || nameIndex.size === 0) return text;
  return text.replace(/student-\d{3}/g, (m) => {
    const name = nameIndex.get(m);
    return name ? `${name}（${m}）` : m;
  });
}
