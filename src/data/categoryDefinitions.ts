import type { Category, CategoryGroup, TransactionType } from '../types/models';

export interface CategoryDefinition {
  name: string;
  kind: TransactionType;
  group: CategoryGroup;
  budget: number | null;
}

export const CATEGORY_DEFINITIONS: CategoryDefinition[] = [
  { name: '生活', kind: 'expense', group: 'variable', budget: null },
  { name: '交通', kind: 'expense', group: 'variable', budget: null },
  { name: '娛樂', kind: 'expense', group: 'variable', budget: null },
  { name: '其他', kind: 'expense', group: 'variable', budget: null },
  { name: '健康', kind: 'expense', group: 'growth', budget: null },
  { name: '工作', kind: 'expense', group: 'variable', budget: null },
  { name: '成長', kind: 'expense', group: 'growth', budget: null },
  { name: '薪資', kind: 'income', group: 'other', budget: null },
  { name: '接案', kind: 'income', group: 'other', budget: null },
  { name: '投資收益', kind: 'income', group: 'other', budget: null },
  { name: '其他收入', kind: 'income', group: 'other', budget: null },
  { name: '轉帳', kind: 'transfer', group: 'other', budget: null },
  { name: '投資', kind: 'transfer', group: 'other', budget: null },
];

export const DEFAULT_DASHBOARD_BUDGETS: Record<string, number> = {
  生活: 11500,
  交通: 1500,
  娛樂: 3000,
  其他: 1000,
};

export const FIXED_COMMITMENT_TAGS = ['水電', '電信', '影音訂閱', '軟體訂閱'];

export interface CategoryGroupInput {
  category: string;
  tags?: string[];
  note?: string;
}

export const TAGS_BY_CATEGORY: Record<string, string[]> = {
  生活: ['飲食', '日用品', '服飾', '水電', '電信'],
  交通: ['大眾運輸', '機車', '叫車', '加油', '停車'],
  娛樂: ['旅遊', '影音訂閱', '休閒', '聚餐'],
  健康: ['醫療保養', '健身', '健身教練', '營養諮詢', '保健品'],
  工作: ['軟體訂閱', '設備'],
  成長: ['學費', '課程', '研究發表'],
  其他: ['待確認', '手續費', '退款調整'],
  薪資: ['學校工讀', '研究計畫', '校內剪輯'],
  接案: ['產業研究室', '育群營養師', '一修美妝師', '剪輯'],
  投資收益: ['股利', 'ETF配息', '利息'],
  其他收入: ['待確認', '退款', '回饋', '家人', '補助', '自媒體'],
  轉帳: ['帳戶移轉'],
  投資: ['股票'],
};

export function getCategoryDefinition(
  name: string,
  kind: TransactionType = 'expense',
): CategoryDefinition | undefined {
  return CATEGORY_DEFINITIONS.find(
    (category) => category.name === name && category.kind === kind,
  );
}

export function categoryGroupFor(category: string): Exclude<CategoryGroup, 'other'> {
  const definition = getCategoryDefinition(category, 'expense');
  if (!definition || definition.group === 'other') return 'variable';
  return definition.group;
}

export function categoryGroupForTransaction(input: CategoryGroupInput): Exclude<CategoryGroup, 'other'> {
  const tags = input.tags ?? [];
  const tagText = tags.join(' ');
  const note = input.note ?? '';
  if (FIXED_COMMITMENT_TAGS.some((tag) => tagText.includes(tag))) return 'fixed';
  if (input.category === '工作' && tagText.includes('設備') && /分期|電腦|筆電/i.test(note)) {
    return 'fixed';
  }
  if (input.category === '交通' && tagText.includes('機車') && /分期|機車/i.test(note)) {
    return 'fixed';
  }
  return categoryGroupFor(input.category);
}

export function budgetedExpenseCategories(
  budgets: Record<string, number> = DEFAULT_DASHBOARD_BUDGETS,
): Category[] {
  return CATEGORY_DEFINITIONS.filter((category) => category.kind === 'expense').map((category) => ({
    ...category,
    budget: budgets[category.name] ?? category.budget ?? 0,
  }));
}

export function tagsForCategory(category: string) {
  return TAGS_BY_CATEGORY[category] ?? [];
}

export function canonicalExpenseCategoryForTransaction(input: CategoryGroupInput): string {
  if (getCategoryDefinition(input.category, 'expense')) return input.category;
  for (const [category, tags] of Object.entries(TAGS_BY_CATEGORY)) {
    if (!getCategoryDefinition(category, 'expense')) continue;
    if (tags.includes(input.category) || (input.tags ?? []).some((tag) => tags.includes(tag))) {
      return category;
    }
  }
  return input.category || 'Uncategorized';
}
