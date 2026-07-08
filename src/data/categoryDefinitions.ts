import type { Category, CategoryGroup, TransactionType } from '../types/models';

export interface CategoryDefinition {
  name: string;
  kind: TransactionType;
  group: CategoryGroup;
  budget: number | null;
}

export const CATEGORY_DEFINITIONS: CategoryDefinition[] = [
  { name: '食', kind: 'expense', group: 'variable', budget: 8000 },
  { name: '交通', kind: 'expense', group: 'variable', budget: 3500 },
  { name: '其他', kind: 'expense', group: 'variable', budget: 1500 },
  { name: '訂閱', kind: 'expense', group: 'fixed', budget: 7000 },
  { name: '生活', kind: 'expense', group: 'fixed', budget: 2500 },
  { name: '健身', kind: 'expense', group: 'growth', budget: null },
  { name: '工作', kind: 'expense', group: 'growth', budget: null },
  { name: '大額', kind: 'expense', group: 'other', budget: null },
  { name: '收入', kind: 'income', group: 'other', budget: null },
];

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
