/*
 * storage.js
 * ---------------------------------------------------------------
 * 永続化層(データ保存の窓口)。
 *
 * Phase1では localStorage を使っているが、将来サーバー側DBへ
 * 移行するときはこのファイルの中身(loadState / saveState の実装)
 * だけを差し替えれば良いように、画面描画ロジック(app.js)からは
 * 必ずこの Storage オブジェクト経由でのみ状態を読み書きする。
 *
 * 例: 将来的に fetch('/api/state') 等に置き換える場合、
 *     app.js 側の呼び出し方(Storage.loadState() / Storage.saveState(state))
 *     は変更不要。
 */
(function (global) {
  var STORAGE_KEY = 'voicelogi_attendance_dispatch_v1';

  var Storage = {
    /**
     * 保存済みの状態を読み込む。無ければ null を返す。
     */
    loadState: function () {
      try {
        var raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
      } catch (e) {
        console.error('状態の読み込みに失敗しました', e);
        return null;
      }
    },

    /**
     * 状態を保存する。呼び出し側は状態を変更するたびに毎回呼ぶ。
     */
    saveState: function (state) {
      try {
        state.updatedAt = new Date().toISOString();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        return true;
      } catch (e) {
        console.error('状態の保存に失敗しました', e);
        return false;
      }
    },

    /**
     * 保存データを完全に消去する(初期化用。通常の操作では呼ばない)。
     */
    clearState: function () {
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  global.Storage = Storage;
})(window);
