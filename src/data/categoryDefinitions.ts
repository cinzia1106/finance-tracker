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
  { name: '工作', kind: 'expense', group: 'growth', budget: null },
  { name: '成長', kind: 'expense', group: 'growth', budget: null },
  { name: '薪資', kind: 'income', group: 'other', budget: null },
  { name: '接案', kind: 'income', group: 'other', budget: null },
  { name: '投資收益', kind: 'income', group: 'other', budget: null },
  { name: '其他收入', kind: 'income', group: 'other', budget: null },
  { name: '轉帳', kind: 'transfer', group: 'other', budget: null },
  { name: '投資', kind: 'transfer', group: 'other', budget: null },
];

export const TAGS_BY_CATEGORY: Record<string, string[]> = {
  生活: ['超商', '飲食', '採買', '日常消費', '日用品', '外食', '服飾', '水電', '電信網路', '電信'],
  交通: ['大眾運輸', '機車', '叫車', '加油', '高鐵', '停車'],
  娛樂: ['旅遊', '影音訂閱', '休閒', '聚餐', '咖啡'],
  健康: ['醫療保養', '健身', '健身教練', '健身用品', '營養諮詢', '保健品'],
  工作: ['數位工具', '軟體訂閱', '設備', '軟體工具', '素材', '自媒體'],
  成長: ['研究學習', '學費', '課程', '研究發表'],
  其他: ['待確認', '手續費', '退款調整'],
  薪資: ['學校工讀', '研究計畫', '校內剪輯'],
  接案: ['剪輯'],
  投資收益: ['股利', 'ETF配息', '利息', '回饋'],
  其他收入: ['待確認', '退款', '回饋', '家人或補助', '二手交易', '獎金'],
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

export function budgetedExpenseCategories(): Category[] {
  return CATEGORY_DEFINITIONS.filter(
    (category) => category.kind === 'expense' && category.budget != null,
  );
}

export function tagsForCategory(category: string) {
  return TAGS_BY_CATEGORY[category] ?? [];
}
