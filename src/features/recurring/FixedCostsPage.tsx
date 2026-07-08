/* 固定支出 Fixed Costs — visual shell only. The recurring_items data layer
   is not wired to the UI yet, so this renders the designed section
   structure with the 2g empty state. No data logic added. */

import { Link } from 'react-router-dom';
import { EmptyState } from '../../components/ui';

export default function FixedCostsPage() {
  return (
    <>
      <header className="page-header">
        <div className="page-header__lead">
          <Link to="/" className="back-header__btn mobile-only" aria-label="返回總覽">
            ‹
          </Link>
          <h1 className="h1">固定支出</h1>
          <span className="caption">月承諾、20 日訂閱與異常偵測</span>
        </div>
      </header>

      <div className="grid-12">
        <EmptyState title="尚未設定固定支出項目">
          固定支出清單建立後，這裡會顯示每月承諾合計、20 日訂閱群組，
          並偵測缺漏扣款與金額異常。年繳與半年繳項目以月當量計入承諾。
        </EmptyState>

        <section className="card span-12">
          <h2 className="h2">規則說明</h2>
          <div className="caption" style={{ lineHeight: 1.7 }}>
            數位訂閱統一於每月 20 日以信用卡扣款；月繳項目當月有對應交易即視為已扣款；
            年繳／半年繳顯示月當量與下次扣款月份；不定期項目僅保留成本提醒，不列入必然扣款。
          </div>
        </section>
      </div>
    </>
  );
}
