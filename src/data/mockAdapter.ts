/* Mock adapter — fictional seed numbers copied from the Claude Design
   handoff (1a screens). Replaced by the real local-first data layer later;
   no component may read these constants directly. */

import type {
  AssetOverview,
  DataAdapter,
  MonthOverview,
  SafelineSummary,
} from './adapter';

const safeline: SafelineSummary = {
  balance: 158_600,
  confirmedAt: '07/02',
  firstLine: 102_000,
  comfortLine: 170_000,
};

const investment = {
  netInvested: 186_000,
  marketValue: 214_500,
  snapshotDate: '07/01',
  unrealizedGain: 28_500,
  unrealizedGainPct: 15.3,
  monthlyBuy: 10_000,
  dividendTotal: 6_840,
};

const monthOverview: MonthOverview = {
  year: 2026,
  month: 7,
  phaseNote: '月結進行中',
  lastImportNote: '07/02 · 郵局＋國泰 CSV',
  needsReviewCount: 6,
  income: 52_300,
  expense: 31_240,
  transferCount: 4,
  incomeBySource: [
    { source: '學校薪資', amount: 12_000 },
    { source: '研究計畫費', amount: 20_000 },
    { source: '外包', amount: 18_500 },
    { source: '被動收入', amount: 1_800 },
  ],
  expenseGroups: [
    { key: 'fixed', label: '固定承諾', amount: 16_800 },
    { key: 'variable', label: '日常變動', amount: 9_940 },
    { key: 'growth', label: '投資自己', amount: 4_500 },
  ],
  budgets: [
    { category: '食', spent: 6_120, budget: 8_000 },
    { category: '生活', spent: 2_380, budget: 3_500 },
    { category: '交通', spent: 1_440, budget: 1_500 },
  ],
  creditCard: {
    charged: 14_860,
    due: 21_300,
    dueDate: '07/15',
    dueNote: '郵局扣繳',
    subscriptionCount: 5,
    subscriptionTotal: 2_480,
  },
  safeline,
  investment,
  inboxPreview: [
    { note: '金融卡購貨-網路', amount: 1_250, type: 'expense' },
    { note: 'LineBank 不明轉入', amount: 2_400, type: 'income' },
  ],
  recentTransactions: [
    {
      id: 't1',
      date: '07/06',
      category: '食',
      note: '全聯福利中心',
      account: '錢包',
      amount: -486,
      type: 'expense',
      status: 'confirmed',
    },
    {
      id: 't2',
      date: '07/05',
      category: '訂閱',
      note: 'Adobe Creative Cloud',
      tag: '自媒體',
      account: '國泰信用卡',
      amount: -1_680,
      type: 'expense',
      status: 'confirmed',
    },
    {
      id: 't3',
      date: '07/05',
      category: '轉帳',
      note: 'ATM 提款',
      account: '郵局 → 錢包',
      amount: 3_000,
      type: 'transfer',
      status: 'confirmed',
    },
    {
      id: 't4',
      date: '07/04',
      category: '外包',
      note: '剪輯案 · 第 2 期款',
      account: 'LineBank',
      amount: 18_500,
      type: 'income',
      status: 'confirmed',
    },
    {
      id: 't5',
      date: '07/03',
      category: '其他',
      note: '金融卡購貨-網路 · 用途不明',
      account: '中國信託',
      amount: -1_250,
      type: 'expense',
      status: 'needs_review',
    },
  ],
};

const assetOverview: AssetOverview = {
  netWorth: 415_400,
  netWorthDeltaFromLastMonth: 8_300,
  cashAndBank: 262_600,
  investmentValue: 214_500,
  investmentSnapshotDate: '07/01',
  liabilityTotal: 61_700,
  disposableCash: 41_300,
  netWorthHistory: [
    { label: '2月', value: 372_000 },
    { label: '3月', value: 382_500 },
    { label: '4月', value: 390_800 },
    { label: '5月', value: 399_600 },
    { label: '6月', value: 407_100 },
    { label: '7月', value: 415_400 },
  ],
  safeline,
  accounts: [
    {
      name: '郵局',
      detail: '薪轉 · 預備金',
      accountType: 'bank',
      typeLabel: '銀行',
      balance: 158_600,
      isLiability: false,
      confirmedAt: '07/02',
      sourceLabel: '對帳單',
      stale: false,
    },
    {
      name: '中國信託',
      accountType: 'bank',
      typeLabel: '銀行',
      balance: 42_300,
      isLiability: false,
      confirmedAt: '06/30',
      sourceLabel: '對帳單',
      stale: false,
    },
    {
      name: 'LineBank 口袋',
      detail: '旅遊＋設備',
      accountType: 'bank',
      typeLabel: '銀行',
      balance: 30_000,
      isLiability: false,
      confirmedAt: '07/04',
      sourceLabel: '手動',
      stale: false,
    },
    {
      name: 'LineBank',
      accountType: 'bank',
      typeLabel: '銀行',
      balance: 15_800,
      isLiability: false,
      confirmedAt: '07/04',
      sourceLabel: '手動',
      stale: false,
    },
    {
      name: '中國信託・交割',
      detail: '僅投資',
      accountType: 'bank',
      typeLabel: '銀行',
      balance: 12_800,
      isLiability: false,
      confirmedAt: '07/01',
      sourceLabel: '手動',
      stale: false,
    },
    {
      name: '錢包',
      accountType: 'cash',
      typeLabel: '現金',
      balance: 3_100,
      isLiability: false,
      confirmedAt: '07/06',
      sourceLabel: '手動',
      stale: false,
    },
    {
      name: '證券庫存',
      detail: '市值',
      accountType: 'virtual',
      typeLabel: '投資',
      balance: 214_500,
      isLiability: false,
      confirmedAt: '07/01',
      sourceLabel: '快照',
      stale: false,
    },
    {
      name: '國泰信用卡',
      accountType: 'credit_card',
      typeLabel: '信用卡',
      balance: 21_300,
      isLiability: true,
      confirmedAt: '07/02',
      sourceLabel: '帳單',
      stale: false,
    },
    {
      name: '國泰世華',
      accountType: 'bank',
      typeLabel: '銀行',
      balance: null,
      isLiability: false,
      confirmedAt: '2025/12',
      sourceLabel: '',
      stale: true,
    },
  ],
  liabilities: [
    { name: '國泰卡待繳', detail: '07/15 郵局自動扣繳', remaining: 21_300 },
    {
      name: '筆電分期',
      detail: '月付 2,200 · 下期 07/20 · 剩 12 期',
      remaining: 26_400,
    },
    {
      name: '機車分期',
      detail: '月付 1,750 · 下期 07/25 · 剩 8 期',
      remaining: 14_000,
    },
  ],
  investment,
};

export class MockDataAdapter implements DataAdapter {
  getMonthOverview(): Promise<MonthOverview> {
    return Promise.resolve(monthOverview);
  }

  getAssetOverview(): Promise<AssetOverview> {
    return Promise.resolve(assetOverview);
  }

  getNeedsReviewCount(): Promise<number> {
    return Promise.resolve(monthOverview.needsReviewCount);
  }
}
