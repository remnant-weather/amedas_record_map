import argparse
import re
import subprocess
import sys
import time
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo
from pathlib import Path

import requests
from bs4 import BeautifulSoup

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_DIR = SCRIPT_DIR.parent

JMA_BASE_URL = (
    "https://www.data.jma.go.jp/"
    "stats/data/mdrr/rank_update/"
)

RECORD_TYPES = {
    "日最高気温の高い方から": "a",
    "日最低気温の高い方から": "b",
    "日最高気温の低い方から": "c",
    "日最低気温の低い方から": "d",
}


def parse_arguments():
    parser = argparse.ArgumentParser(
        description=(
            "気象庁「観測史上1位の値 更新状況」から、"
            "アメダス極値マップの更新対象を判定します。"
        )
    )

    parser.add_argument(
        "--date",
        help=(
            "判定対象日 YYYY-MM-DD。"
            "省略時は昨日。"
        ),
    )

    parser.add_argument(
        "--execute",
        action="store_true",
        help=(
            "検出した更新タスクについて "
            "fetch_records.py を実行します。"
        ),
    )

    return parser.parse_args()


def get_target_date(date_text):
    if date_text is None:
        return (
            datetime.now(
                ZoneInfo("Asia/Tokyo")
            ).date()
            - timedelta(days=1)
        )

    try:
        return datetime.strptime(
            date_text,
            "%Y-%m-%d",
        ).date()

    except ValueError as exc:
        raise ValueError(
            "--date は YYYY-MM-DD 形式で指定してください。"
        ) from exc


def make_jma_url(target_date):
    return (
        JMA_BASE_URL
        + f"d{target_date:%m%d}.html"
    )


def cell_has_update(text):
    """
    JMA集計表のセルに更新地点が存在するか判定する。

    例:
      "12地点" → True
      "1位の値を更新した地点はありません。" → False
    """

    text = re.sub(r"\s+", "", text)

    match = re.search(
        r"(\d+)地点",
        text,
    )

    if not match:
        return False

    return int(match.group(1)) > 0


def fetch_update_tasks(target_date):
    url = make_jma_url(target_date)

    session = requests.Session()

    session.headers.update(
        {
            "User-Agent": (
                "Mozilla/5.0 "
                "(compatible; "
                "AMeDASRecordMap/1.0; "
                "personal meteorological research)"
            )
        }
    )

    response = session.get(
        url,
        timeout=30,
    )
    response.raise_for_status()
    response.encoding = response.apparent_encoding

    soup = BeautifulSoup(
        response.text,
        "html.parser",
    )

    text = soup.get_text(
        "\n",
        strip=True,
    )

    # 表記を統一
    text = (
        text
        .replace("１", "1")
        .replace("（", "(")
        .replace("）", ")")
        .replace("\xa0", " ")
    )

    # -------------------------------------------------
    # 詳細欄の開始位置を特定
    # -------------------------------------------------

    annual_heading = "観測史上1位の値"

    monthly_heading = (
        f"{target_date.month}月の1位の値"
    )

    # 上部の集計表ではなく、
    # 詳細欄の「観測史上1位の値」を探す。
    annual_pattern = re.compile(
        re.escape(annual_heading)
        + r"\s*"
        + re.escape(
            "日最高気温の高い方から"
        )
        + r"\s*\("
    )

    annual_match = annual_pattern.search(
        text
    )

    if annual_match is None:
        raise RuntimeError(
            "JMAページから観測史上1位の"
            "詳細欄を確認できませんでした。"
        )

    annual_start = annual_match.start()

    monthly_start = text.find(
        monthly_heading,
        annual_match.end(),
    )

    if monthly_start == -1:
        raise RuntimeError(
            f"JMAページから"
            f"{monthly_heading}の詳細欄を"
            "確認できませんでした。"
        )

    annual_section = text[
        annual_start:monthly_start
    ]

    monthly_section = text[
        monthly_start:
    ]

    # -------------------------------------------------
    # a～d の4項目を確認
    # -------------------------------------------------

    results = {}

    for jma_name, record_key in RECORD_TYPES.items():

        pattern = re.compile(
            re.escape(jma_name)
            + r"\s*"
            + r"\(\s*(\d+)\s*地点\s*\)"
        )

        annual_match = pattern.search(
            annual_section
        )

        monthly_match = pattern.search(
            monthly_section
        )

        # 毎朝の実行時点で4項目すべて揃っていることを要求する。
        if (
            annual_match is None
            or monthly_match is None
        ):
            raise RuntimeError(
                f"JMAの前日分ページがまだ"
                f"更新途中の可能性があります。"
                f"「{jma_name}」を確認できませんでした。"
            )

        annual_count = int(
            annual_match.group(1)
        )

        monthly_count = int(
            monthly_match.group(1)
        )

        results[record_key] = {
            "annual": annual_count,
            "monthly": monthly_count,
        }

    # -------------------------------------------------
    # 必要な更新タスクを作成
    # -------------------------------------------------

    tasks = set()

    for record_key in sorted(results):

        annual_count = (
            results[record_key]["annual"]
        )

        monthly_count = (
            results[record_key]["monthly"]
        )

        print(
            f"{record_key}: "
            f"観測史上={annual_count}地点 / "
            f"{target_date.month}月="
            f"{monthly_count}地点"
        )

        if annual_count > 0:
            tasks.add(
                (record_key, 0)
            )

        if monthly_count > 0:
            tasks.add(
                (
                    record_key,
                    target_date.month,
                )
            )

    return url, sorted(
        tasks,
        key=lambda task: (
            task[0],
            task[1],
        ),
    )


def update_data_date(target_date):
    script_path = (
        REPO_DIR
        / "script.js"
    )

    if not script_path.exists():
        raise FileNotFoundError(
            f"{script_path} が見つかりません。"
        )

    text = script_path.read_text(
        encoding="utf-8"
    )

    update_date = (
        target_date
        + timedelta(days=1)
    )

    new_date = (
        f"{update_date.year}年"
        f"{update_date.month}月"
        f"{update_date.day}日"
    )

    pattern = re.compile(
        r'const DATA_UPDATED_AT\s*=\s*'
        r'"\d{4}年\d{1,2}月\d{1,2}日";'
    )

    replacement = (
        'const DATA_UPDATED_AT =\n'
        f'  "{new_date}";'
    )

    new_text, count = pattern.subn(
        replacement,
        text,
        count=1,
    )

    if count != 1:
        raise RuntimeError(
            "script.js の DATA_UPDATED_AT を"
            "正しく1か所だけ特定できませんでした。"
        )

    script_path.write_text(
        new_text,
        encoding="utf-8",
    )

    print()
    print(
        f"データ更新日を {new_date} "
        "に変更しました。"
    )


def execute_update_tasks(tasks):
    if not tasks:
        print()
        print(
            "実行する更新タスクはありません。"
        )
        return

    print()
    print(
        "========================================"
    )
    print(
        "極値データの更新を開始します"
    )
    print(
        "========================================"
    )

    total = len(tasks)

    for index, (record_key, month) in enumerate(
        tasks,
        start=1,
    ):
        print()
        print(
            f"[{index}/{total}] "
            f"record={record_key}, "
            f"month={month}"
        )

        command = [
            sys.executable,
            str(
                SCRIPT_DIR
                / "fetch_records.py"
            ),
            "--record",
            record_key,
            "--month",
            str(month),
        ]

        print(
            "実行:",
            " ".join(command),
        )

        subprocess.run(
            command,
            check=True,
        )

        print(
            f"[{index}/{total}] "
            "完了"
        )

        # 最後のタスクの後には待たない
        if index < total:
            print()
            print(
                "JMAへの負荷を避けるため"
                "30秒待機します..."
            )

            time.sleep(30)

    print()
    print(
        "========================================"
    )
    print(
        "すべての極値データ更新が"
        "正常終了しました。"
    )
    print(
        "========================================"
    )


def main():
    args = parse_arguments()

    target_date = get_target_date(
        args.date
    )

    url, tasks = fetch_update_tasks(
        target_date
    )

    print()
    print(
        "========================================"
    )
    print(
        "アメダス極値 更新判定"
    )
    print(
        "========================================"
    )

    print(
        f"対象日: {target_date:%Y-%m-%d}"
    )
    print(
        f"JMA URL: {url}"
    )

    print()

    if not tasks:
        print(
            "更新対象はありません。"
        )

    else:
        print(
            "更新が必要なデータ:"
        )

        for record_key, month in tasks:
            period = (
                "通年"
                if month == 0
                else f"{month}月"
            )

            print(
                f"  {record_key}  {month}"
                f"  ({period})"
            )

    if args.execute:
        execute_update_tasks(
            tasks
        )

        update_data_date(
            target_date
        )

    else:
        print()
        print(
            "※判定のみです。"
            " fetch_records.py は"
            "実行していません。"
        )


if __name__ == "__main__":
    main()
