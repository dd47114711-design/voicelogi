# KoeHaisha（フェーズ1）

出欠札ボードのデジタル版。詳しい経緯・設計は `../docs/01-photo-analysis-report.md`・`../docs/02-phase1-design.md` を参照してください。

フェーズ1でやること：名札をタップして状態（出勤／現場／空車／休み／整備／その他）を切り替えるだけ。会社名・車両番号との連携や配車機能はフェーズ2以降です。

## セットアップ

```bash
npm install
cp .env.example .env
npx prisma migrate dev
npx prisma db seed
npm run dev
```

`http://localhost:3000` を開くと出欠札ボードが表示されます。縦型タッチパネルで使う場合は、ブラウザをキオスク（全画面）モードで開いてください。

## 主なコマンド

| コマンド | 内容 |
|---|---|
| `npm run dev` | 開発用サーバー起動 |
| `npm run build` / `npm start` | 本番ビルド／起動 |
| `npx prisma studio` | データベースの中身をブラウザで確認・編集 |
| `npx prisma migrate dev` | スキーマ変更をデータベースに反映 |
| `npx prisma db seed` | 初期データ（氏名・部門）を投入 |

## データについて

- `prisma/seed.ts` に写真から読み取った氏名・部門の初期データがあります。誤読の可能性があるため、実運用前に必ず名前を確認してください。
- 実データが入る `prisma/dev.db` はリポジトリに含めていません（`.gitignore` 済み）。
