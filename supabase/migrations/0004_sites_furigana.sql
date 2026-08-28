-- 現場マスタ(sites)にふりがなを追加する。
-- 旧実装(legacy/webapp/seed.js)の furigana フィールドを引き継ぐための列。
-- カナ順ソート・検索に使う想定。既存データが無い間の追加なので default 不要。
alter table sites
  add column furigana text;
