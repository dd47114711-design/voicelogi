# -*- coding: utf-8 -*-
"""openpyxlで生成した.xlsxをLibreOffice headlessでPDF化するラッパー。

レビュー指摘の反映:
- 複数プロセスが同時に `soffice --headless` を実行するとユーザープロファイル
  ロックで衝突・ハングする既知の問題があるため、変換ごとに一時的な
  UserInstallation(プロファイル)ディレクトリを分離して使う。
- タイムアウト・0バイト出力の検証・1回のリトライを組み込む。
"""
import os
import subprocess
import tempfile
import uuid

CONVERT_TIMEOUT_SECONDS = 60


class PdfConversionError(Exception):
    pass


def convert_xlsx_to_pdf(xlsx_path, out_dir, retries=1):
    """xlsx_path を out_dir に同名の.pdfとして変換する。生成したPDFの絶対パスを返す。"""
    os.makedirs(out_dir, exist_ok=True)
    last_error = None

    for attempt in range(retries + 1):
        try:
            return _convert_once(xlsx_path, out_dir)
        except PdfConversionError as e:
            last_error = e

    raise PdfConversionError(f"PDF変換に{retries + 1}回失敗しました: {last_error}")


def _convert_once(xlsx_path, out_dir):
    with tempfile.TemporaryDirectory(prefix="voicelogi-soffice-") as profile_dir:
        cmd = [
            "soffice", "--headless", "--norestore",
            f"-env:UserInstallation=file://{profile_dir}",
            "--convert-to", "pdf", "--outdir", out_dir, xlsx_path,
        ]
        try:
            subprocess.run(
                cmd, check=True, timeout=CONVERT_TIMEOUT_SECONDS,
                capture_output=True,
            )
        except subprocess.TimeoutExpired as e:
            raise PdfConversionError(f"LibreOffice変換がタイムアウトしました: {e}") from e
        except subprocess.CalledProcessError as e:
            stderr = e.stderr.decode("utf-8", errors="replace") if e.stderr else ""
            raise PdfConversionError(f"LibreOffice変換が失敗しました: {stderr}") from e

    base = os.path.splitext(os.path.basename(xlsx_path))[0]
    pdf_path = os.path.join(out_dir, f"{base}.pdf")
    if not os.path.exists(pdf_path) or os.path.getsize(pdf_path) == 0:
        raise PdfConversionError(f"PDFが生成されませんでした(0バイトまたは不在): {pdf_path}")
    return pdf_path


def unique_output_basename(prefix):
    """同名ファイルの上書き事故を避けるため、常に一意なファイル名を返す。"""
    return f"{prefix}_{uuid.uuid4().hex[:8]}"
