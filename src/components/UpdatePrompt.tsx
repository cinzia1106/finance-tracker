/* Service-worker lifecycle UI: offline-ready notice and update prompt.
   Uses the prompt-mode registration from vite-plugin-pwa. */

import { useRegisterSW } from 'virtual:pwa-register/react';

export default function UpdatePrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!offlineReady && !needRefresh) return null;

  const close = () => {
    setOfflineReady(false);
    setNeedRefresh(false);
  };

  return (
    <div className="update-prompt card" role="alert">
      <span className="update-prompt__text">
        {needRefresh ? '有新版本可以使用' : '已可離線使用'}
      </span>
      <span className="update-prompt__actions">
        {needRefresh && (
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => updateServiceWorker(true)}
          >
            更新
          </button>
        )}
        <button type="button" className="btn btn--secondary" onClick={close}>
          關閉
        </button>
      </span>
    </div>
  );
}
